import { redirect } from "next/navigation";

import { readOptionalSession } from "@/lib/auth/session";
import { isAdminConfigured, readSelflifyConfig } from "@/lib/config/service";

function isActiveAdminSession(
  session: Awaited<ReturnType<typeof readOptionalSession>>,
  config: Awaited<ReturnType<typeof readSelflifyConfig>>,
): boolean {
  return Boolean(
    session?.user &&
      session.user.name === config.admin.login &&
      session.user.adminConfiguredAt === config.admin.configuredAt,
  );
}

export async function requireConfiguredAdmin() {
  const config = await readSelflifyConfig();

  if (!isAdminConfigured(config)) {
    redirect("/setup");
  }

  return config;
}

export async function requireAdminSession() {
  const config = await requireConfiguredAdmin();
  const session = await readOptionalSession();

  if (!isActiveAdminSession(session, config)) {
    redirect("/login");
  }

  return { config, session };
}

export async function redirectIfAuthenticated() {
  const config = await readSelflifyConfig();
  const session = await readOptionalSession();

  if (!isAdminConfigured(config)) {
    redirect("/setup");
  }

  if (isActiveAdminSession(session, config)) {
    redirect("/sites");
  }

  return config;
}
