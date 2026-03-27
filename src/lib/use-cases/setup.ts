import { hashAdminPassword } from "@/lib/auth/passwords";
import { ensureConfigOnDisk, isAdminConfigured } from "@/lib/config/service";
import { runConfigOperation } from "@/lib/operations";

export type SetupInput = {
  login: string;
  password: string;
  domain: string;
  serverIp: string;
  caddyContactEmail: string;
  cloudflareApiToken: string;
};

export async function runInitialSetup(payload: SetupInput): Promise<void> {
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
        result: undefined,
      };
    },
  });
}
