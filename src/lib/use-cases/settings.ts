import { hashAdminPassword } from "@/lib/auth/passwords";
import { runConfigOperation } from "@/lib/operations";
import { syncAllSiteDnsRecords } from "@/lib/system/cloudflare";

export type SaveServerSettingsInput = {
  domain: string;
  serverIp: string;
  caddyContactEmail: string;
};

export async function saveServerSettings(
  payload: SaveServerSettingsInput,
  expectedRevision?: number,
): Promise<void> {
  await runConfigOperation({
    label: "save-settings:server",
    expectedRevision,
    mutate: async (draft) => {
      draft.server.domain = payload.domain;
      draft.server.serverIp = payload.serverIp;
      draft.server.caddyContactEmail = payload.caddyContactEmail;

      return {
        config: draft,
        result: undefined,
      };
    },
    afterApply: async (config) => {
      await syncAllSiteDnsRecords(config);
    },
  });
}

export type SaveAdminAccessInput = {
  adminLogin: string;
  adminPassword: string;
};

export async function saveAdminAccess(
  payload: SaveAdminAccessInput,
  expectedRevision?: number,
): Promise<void> {
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
        result: undefined,
      };
    },
  });
}

export async function saveCloudflareToken(
  cloudflareApiToken: string,
  expectedRevision?: number,
): Promise<void> {
  await runConfigOperation({
    label: "save-settings:cloudflare",
    expectedRevision,
    mutate: async (draft) => {
      draft.server.cloudflareApiToken = cloudflareApiToken;

      return {
        config: draft,
        result: undefined,
      };
    },
    afterApply: async (config) => {
      await syncAllSiteDnsRecords(config);
    },
  });
}
