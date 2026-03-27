import { type SiteConfig } from "@/lib/config/schema";
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
import { dnsGateway } from "@/lib/system/cloudflare";
import { caddyGateway } from "@/lib/system/caddy";

export { ConfigConflictError };

type PreviewAuthInput = {
  previewLogin: string;
  previewPassword: string;
};

export type CreateSiteInput = {
  slug: string;
  name: string;
  mainBranch: string;
} & PreviewAuthInput;

export type UpdateSiteInput = {
  name: string;
  mainBranch: string;
};

export type UpdateSitePreviewAccessInput = PreviewAuthInput;

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

export async function createSite(
  payload: CreateSiteInput,
  expectedRevision?: number,
): Promise<string> {
  let createdSite: SiteConfig | null = null;

  return runConfigOperation({
    label: `create-site:${payload.slug}`,
    expectedRevision,
    mutate: async (draft) => {
      if (payload.slug === "root") {
        throw new Error("The subdomain root is reserved.");
      }

      if (draft.sites.some((site) => site.slug === payload.slug)) {
        throw new Error("A site with this subdomain already exists.");
      }

      if (!payload.previewLogin && payload.previewPassword) {
        throw new Error("Preview password requires a preview login.");
      }

      const previewHash =
        payload.previewLogin && payload.previewPassword
          ? await caddyGateway.hashPassword(draft, payload.previewPassword)
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
      await dnsGateway.syncSiteRecords(config, createdSite);
    },
  });
}

export async function updateSite(
  siteSlug: string,
  payload: UpdateSiteInput,
  expectedRevision?: number,
): Promise<string> {
  let updatedSite: SiteConfig | null = null;
  let previousMainBranch: string | null = null;
  let shouldRemoveCreatedMainDeploy = false;

  return runConfigOperation({
    label: `update-site:${siteSlug}`,
    expectedRevision,
    mutate: async (draft) => {
      const site = draft.sites.find((entry) => entry.slug === siteSlug);

      if (!site) {
        throw new Error("Site not found.");
      }

      previousMainBranch = site.mainBranch;

      site.name = payload.name;
      site.mainBranch = payload.mainBranch;
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
      await dnsGateway.syncSiteRecords(config, updatedSite);
    },
  });
}

export async function updateSitePreviewAccess(
  siteSlug: string,
  payload: UpdateSitePreviewAccessInput,
  expectedRevision?: number,
): Promise<string> {
  return runConfigOperation({
    label: `update-site-preview-access:${siteSlug}`,
    expectedRevision,
    mutate: async (draft) => {
      const site = draft.sites.find((entry) => entry.slug === siteSlug);

      if (!site) {
        throw new Error("Site not found.");
      }

      if (!payload.previewLogin && payload.previewPassword) {
        throw new Error("Preview password requires a preview login.");
      }

      if (site.previewAuth.enabled && !payload.previewLogin && !payload.previewPassword) {
        throw new Error("Use Reset to clear preview access.");
      }

      const previewHash =
        payload.previewLogin && payload.previewPassword
          ? await caddyGateway.hashPassword(draft, payload.previewPassword)
          : null;

      site.previewAuth = createPreviewAuth(
        site,
        payload.previewLogin,
        payload.previewPassword,
        previewHash,
      );
      site.updatedAt = new Date().toISOString();

      return {
        config: draft,
        result: site.slug,
      };
    },
  });
}

export async function resetSitePreviewAccess(
  siteSlug: string,
  expectedRevision?: number,
): Promise<string> {
  return runConfigOperation({
    label: `reset-site-preview-access:${siteSlug}`,
    expectedRevision,
    mutate: async (draft) => {
      const site = draft.sites.find((entry) => entry.slug === siteSlug);

      if (!site) {
        throw new Error("Site not found.");
      }

      site.previewAuth = {
        enabled: false,
        login: null,
        passwordHash: null,
      };
      site.updatedAt = new Date().toISOString();

      return {
        config: draft,
        result: site.slug,
      };
    },
  });
}

export async function deleteSite(siteSlug: string, expectedRevision?: number): Promise<void> {
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
        result: undefined,
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
      await dnsGateway.deleteSiteRecords(config, removedSite);
    },
  });
}

export async function deleteSiteDeploy(
  siteSlug: string,
  deployName: string,
  expectedRevision?: number,
): Promise<void> {
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
}
