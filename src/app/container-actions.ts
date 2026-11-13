"use server";

import { ZodError } from "zod";
import { redirect } from "next/navigation";

import { requireAdminSession } from "@/lib/auth/guards";
import { ContainerError } from "@/lib/containers/runner-contract";
import { containerSettingsSchema, imageReferenceSchema } from "@/lib/containers/schema";
import { configureContainer, publishContainer } from "@/lib/containers/service";
import { ConfigConflictError } from "@/lib/operations";

function errorMessage(error: unknown) {
  if (error instanceof ZodError) return error.issues[0].message;
  return error instanceof ContainerError || error instanceof ConfigConflictError
    ? error.message
    : "Could not apply the container operation. Check the operation status.";
}

export async function saveContainerAction(site: string, form: FormData) {
  await requireAdminSession();
  const query = new URLSearchParams({ view: "configuration" });
  const settings = containerSettingsSchema.safeParse({
    repository: String(form.get("repository") ?? "").trim(),
    port: Number(form.get("port")),
    healthPath: String(form.get("healthPath") ?? "").trim(),
  });
  if (!settings.success) {
    query.set("error", settings.error.issues[0].message);
  } else {
    try {
      await configureContainer(
        site,
        settings.data,
        {
          registryUsername: String(form.get("registryUsername") ?? "").trim(),
          registryPassword: String(form.get("registryPassword") ?? ""),
          clearRegistry: form.get("clearRegistry") === "on",
          env: String(form.get("env") ?? ""),
          clearEnv: form.get("clearEnv") === "on",
        },
        Number(form.get("configRevision")),
      );
      query.set("notice", "Container settings saved.");
    } catch (error) {
      query.set("error", errorMessage(error));
    }
  }
  redirect(`/sites/${site}?${query}`);
}

export async function publishContainerAction(site: string, rollback: boolean, form: FormData) {
  await requireAdminSession();
  const query = new URLSearchParams();
  try {
    const input = rollback
      ? { rollback: true as const }
      : {
          image: imageReferenceSchema.parse(String(form.get("image") ?? "").trim()),
        };
    await publishContainer(site, input, {
      expectedRevision: Number(form.get("configRevision")),
    });
    query.set("notice", rollback ? "Previous container release restored." : "Container published.");
  } catch (error) {
    query.set("error", errorMessage(error));
  }
  redirect(`/sites/${site}?${query}`);
}
