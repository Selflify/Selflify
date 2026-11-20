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

function readEnvironment(form: FormData) {
  const names = form.getAll("envName");
  const values = form.getAll("envValue");
  const modes = form.getAll("envMode");
  if (names.length !== values.length || names.length !== modes.length || names.length > 64) {
    throw new ContainerError(400, "Invalid environment variables.");
  }
  return names.map((name, index) => {
    const mode = modes[index];
    const value = String(values[index]);
    if (mode !== "variable" && mode !== "secret" && mode !== "stored") {
      throw new ContainerError(400, "Invalid environment variable type.");
    }
    return {
      name: String(name).trim(),
      value: mode === "stored" && value === "" ? null : value,
      secret: mode !== "variable",
    };
  });
}

export async function saveContainerAction(site: string, form: FormData) {
  await requireAdminSession();
  const query = new URLSearchParams({ view: "configuration" });
  const volumeNames = form.getAll("volumeName");
  const volumePaths = form.getAll("volumePath");
  const settings = containerSettingsSchema.safeParse({
    repository: String(form.get("repository") ?? "").trim(),
    port: Number(form.get("port")),
    healthPath: String(form.get("healthPath") ?? "").trim(),
    volumes: volumeNames.map((name, index) => ({
      name: String(name).trim(),
      path: String(volumePaths[index] ?? "").trim(),
    })),
  });
  if (volumeNames.length !== volumePaths.length) {
    query.set("error", "Invalid persistent volume mounts.");
  } else if (!settings.success) {
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
          environment: form.has("editEnvironment") ? readEnvironment(form) : undefined,
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
