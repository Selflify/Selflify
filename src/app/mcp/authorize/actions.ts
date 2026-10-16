"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/guards";
import {
  approveMcpAccess,
  createManualMcpAccess,
  denyMcpAccess,
  OAuthError,
  revokeMcpAccess,
  type ConsentRequest,
} from "@/lib/mcp/oauth";

export type McpConsentState = { error?: string; token?: string };

export async function grantMcpAccessAction(
  request: ConsentRequest | null,
  _previous: McpConsentState,
  form: FormData,
): Promise<McpConsentState> {
  const { config } = await requireAdminSession("/mcp/authorize");
  let target: string | undefined;
  try {
    if (request && form.get("decision") === "deny") target = denyMcpAccess(config, request);
    else {
      const selection = {
        allSites: form.get("siteMode") === "all",
        siteIds: form
          .getAll("siteIds")
          .filter((entry): entry is string => typeof entry === "string"),
        scopes: form.getAll("scopes").filter((entry): entry is string => typeof entry === "string"),
      };
      if (request) target = await approveMcpAccess(request, selection);
      else {
        const token = await createManualMcpAccess({
          ...selection,
          name: String(form.get("name") ?? ""),
          days: Number(form.get("days")),
        });
        revalidatePath("/mcp/authorize");
        return { token };
      }
    }
  } catch (error) {
    return {
      error:
        error instanceof OAuthError ? error.message : "Access could not be granted. Try again.",
    };
  }
  redirect(target!);
}

export async function revokeMcpAccessAction(id: string) {
  await requireAdminSession("/mcp/authorize");
  await revokeMcpAccess(id);
  revalidatePath("/mcp/authorize");
}
