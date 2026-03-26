import { redirect } from "next/navigation";

import { auth } from "@/auth";
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
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return { config, session };
}

export async function redirectIfAuthenticated() {
  const config = await readSelflifyConfig();
  const session = await auth();

  if (!isAdminConfigured(config)) {
    redirect("/setup");
  }

  if (session?.user) {
    redirect("/dashboard");
  }

  return config;
}
