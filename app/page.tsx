import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isAdminConfigured, readSelflifyConfig } from "@/lib/config/service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const config = await readSelflifyConfig();

  if (!isAdminConfigured(config)) {
    redirect("/setup");
  }

  const session = await auth();
  redirect(session?.user ? "/dashboard" : "/login");
}
