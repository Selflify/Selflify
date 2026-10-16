"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/guards";
import { createDeployToken, revokeDeployToken } from "@/lib/deploy/tokens";

export type DeployTokenActionState = { token?: string; error?: string; revision?: number };

export async function createDeployTokenAction(
  siteSlug: string,
  _previous: DeployTokenActionState,
  form: FormData,
): Promise<DeployTokenActionState> {
  await requireAdminSession();
  const revision = Number(form.get("configRevision"));
  try {
    const token = await createDeployToken(siteSlug, {
      name: String(form.get("name") ?? ""),
      expiresAt: `${String(form.get("expiresAt") ?? "")}T23:59:59.000Z`,
      stable: form.get("stable") === "on",
      preview: form.get("preview") === "on",
      mcpRead: form.get("mcpRead") === "on",
      mcpWrite: form.get("mcpWrite") === "on",
      revision,
    });
    revalidatePath(`/sites/${siteSlug}`);
    return { token, revision: revision + 1 };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create deploy token." };
  }
}

export async function revokeDeployTokenAction(
  siteSlug: string,
  id: string,
  form: FormData,
): Promise<void> {
  await requireAdminSession();
  let error: string | undefined;
  try {
    await revokeDeployToken(siteSlug, id, Number(form.get("configRevision")));
    revalidatePath(`/sites/${siteSlug}`);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Could not revoke deploy token.";
  }
  redirect(
    `/sites/${siteSlug}?view=configuration&${error ? `error=${encodeURIComponent(error)}` : "notice=Deploy+token+revoked."}`,
  );
}
