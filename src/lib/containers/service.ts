import crypto from "node:crypto";

import type { SelflifyConfig, SiteConfig } from "@/lib/config/schema";
import { isAdminConfigured } from "@/lib/config/service";
import { getDeploymentSiteId, hashDeploySecret } from "@/lib/deploy/permissions";
import { runConfigOperation } from "@/lib/operations";
import { containerRunner, containerRunnerEnabled } from "./client";
import { ContainerError } from "./runner-contract";
import {
  clearContainerPublication,
  markContainerPublication,
  recoverContainerPublication,
} from "./recovery";
import {
  containerSecretsSchema,
  imageReferenceSchema,
  environmentRowsSchema,
  containerSettingsSchema,
  type ContainerRelease,
  type ContainerSecrets,
  type ContainerSettings,
} from "./schema";
import { readContainerSecrets, removeContainerSecrets, writeContainerSecrets } from "./secrets";

function getSite(config: SelflifyConfig, slug: string): SiteConfig {
  const site = config.sites.find((entry) => entry.slug === slug);
  if (!site) throw new ContainerError(404, "Site not found.");
  return site;
}

export function authorizeContainerDeploy(
  config: SelflifyConfig,
  slug: string,
  authorization: string | null,
) {
  const match = /^Bearer slf_([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(authorization ?? "");
  if (!match) throw new ContainerError(401, "Invalid deploy token.");
  const token = config.deployTokens.find((entry) => entry.id === match[1]);
  const supplied = Buffer.from(hashDeploySecret(match[2]), "hex");
  const expected = Buffer.from(token?.secretHash ?? "0".repeat(64), "hex");
  if (
    !crypto.timingSafeEqual(supplied, expected) ||
    !token ||
    token.revokedAt ||
    token.oauth ||
    Date.parse(token.expiresAt) <= Date.now() ||
    !isAdminConfigured(config)
  ) {
    throw new ContainerError(401, "Invalid deploy token.");
  }
  const site = config.sites.find((entry) => entry.slug === slug);
  if (
    !site ||
    token.siteId !== getDeploymentSiteId(site) ||
    !token.scopes.includes("container:write")
  ) {
    throw new ContainerError(403, "Token cannot deploy containers to this site.");
  }
}

export async function configureContainer(
  slug: string,
  settings: ContainerSettings,
  changes: {
    registryUsername: string;
    registryPassword: string;
    clearRegistry: boolean;
    environment?: Array<{ name: string; value: string | null; secret: boolean }>;
  },
  expectedRevision: number,
) {
  if (!containerRunnerEnabled())
    throw new ContainerError(503, "Enable the Selflify container runner first.");
  const validated = containerSettingsSchema.parse(settings);
  let newSecretsId: string | undefined;
  let pendingSecrets: ContainerSecrets;
  await runConfigOperation({
    label: `configure-container:${slug}`,
    expectedRevision,
    async mutate(config) {
      const site = getSite(config, slug);
      const host = validated.repository.split("/")[0];
      const previous = await readContainerSecrets(site.container?.secretsId);
      let env = previous.env;
      let publicEnvNames = previous.publicEnvNames;
      if (changes.environment) {
        const rows = environmentRowsSchema.safeParse(changes.environment);
        if (!rows.success) {
          throw new ContainerError(
            400,
            "Enter valid environment variable names and values (up to 64 entries).",
          );
        }
        const entries = new Map<string, string>();
        publicEnvNames = [];
        for (const { name, value, secret } of rows.data) {
          if (entries.has(name)) {
            throw new ContainerError(400, "Environment variable names must be unique.");
          }
          if (value === null && (!secret || !Object.hasOwn(previous.env, name))) {
            throw new ContainerError(400, "Enter a value for each new secret.");
          }
          entries.set(name, value ?? previous.env[name]);
          if (!secret) publicEnvNames.push(name);
        }
        env = Object.fromEntries(entries);
        if (!publicEnvNames.length) publicEnvNames = undefined;
      }

      let registry = previous.registry?.host === host ? previous.registry : undefined;
      if (changes.clearRegistry) {
        registry = undefined;
      } else if (changes.registryUsername || changes.registryPassword) {
        if (!changes.registryUsername || !changes.registryPassword) {
          throw new ContainerError(400, "Enter both the registry username and password.");
        }
        registry = { host, username: changes.registryUsername, password: changes.registryPassword };
      }

      const secrets = containerSecretsSchema.safeParse({ env, registry, publicEnvNames });
      if (!secrets.success)
        throw new ContainerError(400, "Registry credentials or environment variables are invalid.");
      let secretsId = site.container?.secretsId;
      if (JSON.stringify(secrets.data) !== JSON.stringify(previous)) {
        secretsId = undefined;
        if (secrets.data.registry || Object.keys(secrets.data.env).length) {
          newSecretsId = crypto.randomUUID();
          secretsId = newSecretsId;
        }
      }
      site.container = { ...site.container, ...validated, secretsId };
      site.updatedAt = new Date().toISOString();
      pendingSecrets = secrets.data;
      return { config, result: undefined };
    },
    async beforePersist() {
      // The new config refers to a new, immutable secret file. The previous
      // file remains available when restoring a config backup.
      if (newSecretsId) {
        await writeContainerSecrets(newSecretsId, pendingSecrets);
      }
    },
    async rollbackBeforePersist() {
      if (newSecretsId) await removeContainerSecrets(newSecretsId);
    },
  });
}

export function collectContainerReleases(config: SelflifyConfig): string[] {
  return config.sites.flatMap(({ container }) =>
    [container?.active?.id, container?.previous?.id].filter((id): id is string => Boolean(id)),
  );
}

let deploying = false;

export async function publishContainer(
  slug: string,
  input: { image: string } | { rollback: true },
  options: { authorization?: string | null; expectedRevision?: number } = {},
): Promise<ContainerRelease> {
  if (!containerRunnerEnabled())
    throw new ContainerError(503, "Enable the Selflify container runner first.");
  if (deploying) throw new ContainerError(409, "Another container deployment is in progress.");
  deploying = true;
  try {
    await recoverContainerPublication();
    let candidate: ContainerRelease;
    let existing = false;
    let rollback = false;
    const authorize = (config: SelflifyConfig) => {
      if (options.authorization !== undefined)
        authorizeContainerDeploy(config, slug, options.authorization);
    };
    return await runConfigOperation({
      label: `publish-container:${slug}`,
      expectedRevision: options.expectedRevision,
      authorize,
      async mutate(config) {
        const site = getSite(config, slug);
        const container = site.container;
        if (!container) throw new ContainerError(409, "Configure the container repository first.");
        if ("rollback" in input) {
          if (!container.previous)
            throw new ContainerError(409, "There is no previous container release.");
          candidate = container.previous;
          rollback = true;
        } else {
          const image = imageReferenceSchema.parse(input.image);
          if (image.split("@")[0] !== container.repository) {
            throw new ContainerError(400, "The image must match the configured repository.");
          }
          candidate = {
            id: crypto.randomUUID(),
            image,
            port: container.port,
            healthPath: container.healthPath,
            publishedAt: new Date().toISOString(),
          };
          if (container.active?.image === image) {
            // A CI retry returns the existing release. The panel can redeploy
            // the same image after changing its runtime settings.
            existing = options.authorization !== undefined;
            if (existing) candidate = container.active;
          }
        }
        if (!existing) {
          container.previous = container.active;
          container.active = candidate;
          site.updatedAt = new Date().toISOString();
        }
        return { config, result: candidate };
      },
      async beforePersist(config) {
        if (rollback || existing) {
          await containerRunner.check(candidate);
        } else {
          const secrets = await readContainerSecrets(getSite(config, slug).container?.secretsId);
          await containerRunner.prepare(candidate, {
            env: secrets.env,
            registry: secrets.registry,
          });
        }
        authorize(config);
        await markContainerPublication();
      },
      afterApply: clearContainerPublication,
    });
  } finally {
    deploying = false;
  }
}
