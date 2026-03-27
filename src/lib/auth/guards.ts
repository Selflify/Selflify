import { redirect } from "next/navigation";

import { readOptionalSession } from "@/lib/auth/session";
import { isAdminConfigured, readSelflifyConfig } from "@/lib/config/service";

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

  if (!session?.user) {
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

  if (session?.user) {
    redirect("/sites");
  }

  return config;
}
