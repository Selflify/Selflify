"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/guards";
import { ensureConfigOnDisk, isAdminConfigured } from "@/lib/config/service";
import { siteSlugPattern, deployNamePattern, type SiteConfig } from "@/lib/config/schema";
import { hashAdminPassword } from "@/lib/auth/passwords";
import {
  deleteSiteDnsRecords,
  syncAllSiteDnsRecords,
  syncSiteDnsRecords,
} from "@/lib/system/cloudflare";
import { hashPasswordWithCaddy } from "@/lib/system/caddy";
import {
  ConfigConflictError,
  runConfigOperation,
  runTrackedSideEffectOperation,
} from "@/lib/operations";
import {
  deleteDeploy,
  deployDirectoryExists,
  ensureSiteDirectories,
  moveSiteToOrphanStorage,
  removeDeployDirectory,
  removeSiteDirectory,
  restoreSiteFromOrphanStorage,
} from "@/lib/sites/service";

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function getQueryValue(formData: FormData, key: string): string {
  return asString(formData.get(key));
}

function toRevision(formData: FormData): number | undefined {
  const raw = getQueryValue(formData, "configRevision");

  if (!raw) {
    return undefined;
  }

  return Number(raw);
}

function redirectWith(pathname: string, kind: "notice" | "error", message: string): never {
  const [basePath, search = ""] = pathname.split("?");
  const params = new URLSearchParams(search);
  params.set(kind, message);

  redirect(`${basePath}?${params.toString()}`);
}

function createPreviewAuth(
  site: SiteConfig | null,
  login: string,
  password: string,
  hash: string | null,
) {
  if (!login) {
    return {
      enabled: false,
      login: null,
      passwordHash: null,
    };
  }

  if (!hash && !password && !site?.previewAuth.passwordHash) {
    throw new Error("Preview password is required when enabling auth for the first time.");
  }

  return {
    enabled: true,
    login,
    passwordHash: hash ?? site?.previewAuth.passwordHash ?? null,
  };
}

const domainFieldSchema = z.string().trim().min(3, "Enter the primary domain.");
const serverIpFieldSchema = z
  .string()
  .trim()
  .min(1, "Enter the server IP address.");
const caddyContactEmailFieldSchema = z
  .string()
  .trim()
  .min(1, "Enter the Caddy contact email.")
  .email("Enter a valid contact email.");
const cloudflareTokenFieldSchema = z
  .string()
  .trim()
  .min(1, "Paste a Cloudflare API token.");

const setupSchema = z
  .object({
    login: z.string().trim().min(3).max(128),
    password: z.string().min(8).max(128),
    passwordConfirm: z.string().min(8).max(128),
    domain: domainFieldSchema,
    serverIp: serverIpFieldSchema,
    caddyContactEmail: caddyContactEmailFieldSchema,
    cloudflareApiToken: cloudflareTokenFieldSchema,
  })
  .superRefine((value, context) => {
    if (value.password !== value.passwordConfirm) {
      context.addIssue({
        code: "custom",
        message: "Password confirmation does not match the new password.",
        path: ["passwordConfirm"],
      });
    }
  });

export async function setupAction(formData: FormData) {
  try {
    const payload = setupSchema.parse({
      login: getQueryValue(formData, "login"),
      password: getQueryValue(formData, "password"),
      passwordConfirm: getQueryValue(formData, "passwordConfirm"),
      domain: getQueryValue(formData, "domain"),
      serverIp: getQueryValue(formData, "serverIp"),
      caddyContactEmail: getQueryValue(formData, "caddyContactEmail"),
      cloudflareApiToken: getQueryValue(formData, "cloudflareApiToken"),
    });

    const config = await ensureConfigOnDisk();

    if (isAdminConfigured(config)) {
      throw new Error("Admin account is already configured.");
    }

    const passwordHash = await hashAdminPassword(payload.password);

    await runConfigOperation({
      label: "setup-admin",
      mutate: async (draft) => {
        draft.admin.login = payload.login;
        draft.admin.passwordHash = passwordHash;
        draft.admin.configuredAt = new Date().toISOString();
        draft.sessionSecret = draft.sessionSecret || config.sessionSecret;
        draft.server.domain = payload.domain;
        draft.server.serverIp = payload.serverIp;
        draft.server.caddyContactEmail = payload.caddyContactEmail;
        draft.server.cloudflareApiToken = payload.cloudflareApiToken;

        return {
          config: draft,
          result: null,
        };
      },
    });

    redirectWith("/login", "notice", "Admin account created. Sign in to continue.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Setup failed.";
    redirectWith("/setup", "error", message);
  }
}

const createSiteSchema = z.object({
  slug: z.string().trim().regex(siteSlugPattern),
  name: z.string().trim().min(2).max(120),
  mainBranch: z.string().trim().regex(deployNamePattern),
  previewLogin: z.string().trim().max(128).default(""),
  previewPassword: z.string().max(128).default(""),
});

export async function createSiteAction(formData: FormData) {
  await requireAdminSession();
  const expectedRevision = toRevision(formData);

  try {
    const payload = createSiteSchema.parse({
      slug: getQueryValue(formData, "slug"),
      name: getQueryValue(formData, "name"),
      mainBranch: getQueryValue(formData, "mainBranch"),
      previewLogin: getQueryValue(formData, "previewLogin"),
      previewPassword: getQueryValue(formData, "previewPassword"),
    });

    let createdSite: SiteConfig | null = null;

    await runConfigOperation({
      label: `create-site:${payload.slug}`,
      expectedRevision,
      mutate: async (draft) => {
        if (payload.slug === "root") {
          throw new Error("The slug root is reserved.");
        }

        if (draft.sites.some((site) => site.slug === payload.slug)) {
          throw new Error("A site with this slug already exists.");
        }

        if (!payload.previewLogin && payload.previewPassword) {
          throw new Error("Preview password requires a preview login.");
        }

        const previewHash =
          payload.previewLogin && payload.previewPassword
            ? await hashPasswordWithCaddy(draft, payload.previewPassword)
            : null;
        const site: SiteConfig = {
          slug: payload.slug,
          name: payload.name,
          mainBranch: payload.mainBranch,
          previewAuth: createPreviewAuth(
            null,
            payload.previewLogin,
            payload.previewPassword,
            previewHash,
          ),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        draft.sites.push(site);
        createdSite = site;

        return {
          config: draft,
          result: site.slug,
        };
      },
      beforePersist: async (config) => {
        if (!createdSite) return;
        await ensureSiteDirectories(config, createdSite);
      },
      rollbackBeforePersist: async (config) => {
        if (!createdSite) return;
        await removeSiteDirectory(config, createdSite);
      },
      afterApply: async (config) => {
        if (!createdSite) return;
        await syncSiteDnsRecords(config, createdSite);
      },
    });

    redirectWith("/sites", "notice", `Site ${payload.slug} created.`);
  } catch (error) {
    const message =
      error instanceof ConfigConflictError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not create site.";

    redirectWith("/sites", "error", message);
  }
}

const updateSiteSchema = z.object({
  slug: z.string().trim().regex(siteSlugPattern),
  name: z.string().trim().min(2).max(120),
  mainBranch: z.string().trim().regex(deployNamePattern),
  previewLogin: z.string().trim().max(128).default(""),
  previewPassword: z.string().max(128).default(""),
});

export async function updateSiteAction(siteSlug: string, formData: FormData) {
  await requireAdminSession();
  const expectedRevision = toRevision(formData);

  try {
    const payload = updateSiteSchema.parse({
      slug: siteSlug,
      name: getQueryValue(formData, "name"),
      mainBranch: getQueryValue(formData, "mainBranch"),
      previewLogin: getQueryValue(formData, "previewLogin"),
      previewPassword: getQueryValue(formData, "previewPassword"),
    });

    let updatedSite: SiteConfig | null = null;
    let previousMainBranch: string | null = null;
    let shouldRemoveCreatedMainDeploy = false;

    await runConfigOperation({
      label: `update-site:${payload.slug}`,
      expectedRevision,
      mutate: async (draft) => {
        const site = draft.sites.find((entry) => entry.slug === payload.slug);

        if (!site) {
          throw new Error("Site not found.");
        }

        previousMainBranch = site.mainBranch;

        const previewHash =
          payload.previewLogin && payload.previewPassword
            ? await hashPasswordWithCaddy(draft, payload.previewPassword)
            : null;

        site.name = payload.name;
        site.mainBranch = payload.mainBranch;
        site.previewAuth = createPreviewAuth(
          site,
          payload.previewLogin,
          payload.previewPassword,
          previewHash,
        );
        site.updatedAt = new Date().toISOString();
        updatedSite = { ...site };

        return {
          config: draft,
          result: site.slug,
        };
      },
      beforePersist: async (config) => {
        if (!updatedSite || !previousMainBranch) return;

        if (updatedSite.mainBranch !== previousMainBranch) {
          shouldRemoveCreatedMainDeploy = !(await deployDirectoryExists(
            config,
            updatedSite,
            updatedSite.mainBranch,
          ));
        }

        await ensureSiteDirectories(config, updatedSite);
      },
      rollbackBeforePersist: async (config) => {
        if (!updatedSite || !shouldRemoveCreatedMainDeploy) return;
        await removeDeployDirectory(config, updatedSite, updatedSite.mainBranch);
      },
      afterApply: async (config) => {
        if (!updatedSite) return;
        await syncSiteDnsRecords(config, updatedSite);
      },
    });

    redirectWith(`/sites/${siteSlug}?view=configuration`, "notice", `Updated ${siteSlug}.`);
  } catch (error) {
    const message =
      error instanceof ConfigConflictError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not update site.";

    redirectWith(`/sites/${siteSlug}?view=configuration`, "error", message);
  }
}

export async function deleteSiteAction(siteSlug: string, formData: FormData) {
  await requireAdminSession();
  const expectedRevision = toRevision(formData);

  try {
    let removedSite: SiteConfig | null = null;
    let orphanPath: string | null = null;

    await runConfigOperation({
      label: `delete-site:${siteSlug}`,
      expectedRevision,
      mutate: async (draft) => {
        const site = draft.sites.find((entry) => entry.slug === siteSlug);

        if (!site) {
          throw new Error("Site not found.");
        }

        removedSite = { ...site };
        draft.sites = draft.sites.filter((entry) => entry.slug !== siteSlug);

        return {
          config: draft,
          result: null,
        };
      },
      beforePersist: async (config) => {
        if (!removedSite) return;
        orphanPath = await moveSiteToOrphanStorage(config, removedSite);
      },
      rollbackBeforePersist: async (config) => {
        if (!removedSite || !orphanPath) return;
        await restoreSiteFromOrphanStorage(config, removedSite, orphanPath);
      },
      afterApply: async (config) => {
        if (!removedSite) return;
        await deleteSiteDnsRecords(config, removedSite);
      },
    });

    redirectWith("/sites", "notice", `Site ${siteSlug} moved to orphan storage.`);
  } catch (error) {
    const message =
      error instanceof ConfigConflictError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not delete site.";

    redirectWith(`/sites/${siteSlug}?view=configuration`, "error", message);
  }
}

const serverSettingsSchema = z.object({
  domain: domainFieldSchema,
  serverIp: serverIpFieldSchema,
  caddyContactEmail: caddyContactEmailFieldSchema,
});

const adminSettingsSchema = z
  .object({
    adminLogin: z.string().trim().min(3).max(128),
    adminPassword: z.string().max(128).default(""),
    adminPasswordConfirm: z.string().max(128).default(""),
  })
  .superRefine((value, context) => {
    if (value.adminPassword && value.adminPassword !== value.adminPasswordConfirm) {
      context.addIssue({
        code: "custom",
        message: "Password confirmation does not match the new password.",
        path: ["adminPasswordConfirm"],
      });
    }
  });

async function handleSettingsFailure(error: unknown, fallbackMessage: string): Promise<never> {
  const message =
    error instanceof ConfigConflictError
      ? error.message
      : error instanceof Error
        ? error.message
        : fallbackMessage;

  redirectWith("/settings", "error", message);
}

export async function saveServerSettingsAction(formData: FormData) {
  await requireAdminSession();
  const expectedRevision = toRevision(formData);

  try {
    const payload = serverSettingsSchema.parse({
      domain: getQueryValue(formData, "domain"),
      serverIp: getQueryValue(formData, "serverIp"),
      caddyContactEmail: getQueryValue(formData, "caddyContactEmail"),
    });

    await runConfigOperation({
      label: "save-settings:server",
      expectedRevision,
      mutate: async (draft) => {
        draft.server.domain = payload.domain;
        draft.server.serverIp = payload.serverIp;
        draft.server.caddyContactEmail = payload.caddyContactEmail;

        return {
          config: draft,
          result: null,
        };
      },
      afterApply: async (config) => {
        await syncAllSiteDnsRecords(config);
      },
    });

    redirectWith("/settings", "notice", "Infrastructure settings applied.");
  } catch (error) {
    await handleSettingsFailure(error, "Could not save infrastructure settings.");
  }
}

export async function saveAdminAccessAction(formData: FormData) {
  await requireAdminSession();
  const expectedRevision = toRevision(formData);

  try {
    const payload = adminSettingsSchema.parse({
      adminLogin: getQueryValue(formData, "adminLogin"),
      adminPassword: getQueryValue(formData, "adminPassword"),
      adminPasswordConfirm: getQueryValue(formData, "adminPasswordConfirm"),
    });

    await runConfigOperation({
      label: "save-settings:admin",
      expectedRevision,
      mutate: async (draft) => {
        draft.admin.login = payload.adminLogin;

        if (payload.adminPassword) {
          draft.admin.passwordHash = await hashAdminPassword(payload.adminPassword);
        }

        return {
          config: draft,
          result: null,
        };
      },
    });

    redirectWith("/settings", "notice", "Admin access updated.");
  } catch (error) {
    await handleSettingsFailure(error, "Could not save admin access.");
  }
}

const cloudflareTokenSchema = z.object({
  cloudflareApiToken: cloudflareTokenFieldSchema,
});

export async function saveCloudflareTokenAction(formData: FormData) {
  await requireAdminSession();
  const expectedRevision = toRevision(formData);

  try {
    const payload = cloudflareTokenSchema.parse({
      cloudflareApiToken: getQueryValue(formData, "cloudflareApiToken"),
    });

    await runConfigOperation({
      label: "save-settings:cloudflare",
      expectedRevision,
      mutate: async (draft) => {
        draft.server.cloudflareApiToken = payload.cloudflareApiToken;

        return {
          config: draft,
          result: null,
        };
      },
      afterApply: async (config) => {
        await syncAllSiteDnsRecords(config);
      },
    });

    redirectWith("/settings", "notice", "Cloudflare token saved.");
  } catch (error) {
    await handleSettingsFailure(error, "Could not update the Cloudflare token.");
  }
}

export async function deleteDeployAction(siteSlug: string, deployName: string, formData: FormData) {
  await requireAdminSession();
  const expectedRevision = toRevision(formData);

  try {
    await runTrackedSideEffectOperation({
      label: `delete-deploy:${siteSlug}:${deployName}`,
      expectedRevision,
      task: async (config) => {
        const site = config.sites.find((entry) => entry.slug === siteSlug);

        if (!site) {
          throw new Error("Site not found.");
        }

        await deleteDeploy(config, site, deployName);
      },
    });

    redirectWith(`/sites/${siteSlug}`, "notice", `Deploy ${deployName} deleted.`);
  } catch (error) {
    const message =
      error instanceof ConfigConflictError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not delete deploy.";

    redirectWith(`/sites/${siteSlug}`, "error", message);
  }
}
