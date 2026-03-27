import { redirect } from "next/navigation";

import { readOptionalSession } from "@/lib/auth/session";
import { isAdminConfigured, readSelflifyConfig } from "@/lib/config/service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const config = await readSelflifyConfig();

  if (!isAdminConfigured(config)) {
    redirect("/setup");
  }

  const session = await readOptionalSession();
  redirect(session?.user ? "/sites" : "/login");
}
