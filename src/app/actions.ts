"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth/guards";
import { deployNamePattern, siteSlugPattern } from "@/lib/config/schema";
import { saveAdminAccess, saveCloudflareToken, saveServerSettings } from "@/lib/use-cases/settings";
import {
  ConfigConflictError,
  createSite,
  deleteSite,
  deleteSiteDeploy,
  resetSitePreviewAccess,
  updateSite,
  updateSitePreviewAccess,
} from "@/lib/use-cases/sites";
import { runInitialSetup } from "@/lib/use-cases/setup";

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function getQueryValue(formData: FormData, key: string): string {
  return asString(formData.get(key));
}

function toRevision(formData: FormData): number | undefined {
  const raw = getQueryValue(formData, "configRevision");

  if (!raw) {
    return undefined;
  }

  return Number(raw);
}

function redirectWith(pathname: string, kind: "notice" | "error", message: string): never {
  const [basePath, search = ""] = pathname.split("?");
  const params = new URLSearchParams(search);
  params.set(kind, message);

  redirect(`${basePath}?${params.toString()}`);
}

function rethrowIfRedirectError(error: unknown): void | never {
  if (isRedirectError(error)) {
    throw error;
  }
}

const domainFieldSchema = z.string().trim().min(3, "Enter the primary domain.");
const serverIpFieldSchema = z
  .string()
  .trim()
  .min(1, "Enter the server IP address.");
const caddyContactEmailFieldSchema = z
  .string()
  .trim()
  .min(1, "Enter the Caddy contact email.")
  .email("Enter a valid contact email.");
const cloudflareTokenFieldSchema = z
  .string()
  .trim()
  .min(1, "Paste a Cloudflare API token.");

const setupSchema = z
  .object({
    login: z.string().trim().min(3).max(128),
    password: z.string().min(8).max(128),
    passwordConfirm: z.string().min(8).max(128),
    domain: domainFieldSchema,
    serverIp: serverIpFieldSchema,
    caddyContactEmail: caddyContactEmailFieldSchema,
    cloudflareApiToken: cloudflareTokenFieldSchema,
  })
  .superRefine((value, context) => {
    if (value.password !== value.passwordConfirm) {
      context.addIssue({
        code: "custom",
        message: "Password confirmation does not match the new password.",
        path: ["passwordConfirm"],
      });
    }
  });

export async function setupAction(formData: FormData) {
  try {
    const payload = setupSchema.parse({
      login: getQueryValue(formData, "login"),
      password: getQueryValue(formData, "password"),
      passwordConfirm: getQueryValue(formData, "passwordConfirm"),
      domain: getQueryValue(formData, "domain"),
      serverIp: getQueryValue(formData, "serverIp"),
      caddyContactEmail: getQueryValue(formData, "caddyContactEmail"),
      cloudflareApiToken: getQueryValue(formData, "cloudflareApiToken"),
    });

    await runInitialSetup(payload);

    redirectWith("/login", "notice", "Admin account created. Sign in to continue.");
  } catch (error) {
    rethrowIfRedirectError(error);

    const message = error instanceof Error ? error.message : "Setup failed.";
    redirectWith("/setup", "error", message);
  }
}

const createSiteSchema = z.object({
  slug: z.string().trim().regex(siteSlugPattern),
  name: z.string().trim().min(2).max(120),
  mainBranch: z.string().trim().regex(deployNamePattern),
});

export async function createSiteAction(formData: FormData) {
  await requireAdminSession();
  const expectedRevision = toRevision(formData);

  try {
    const payload = createSiteSchema.parse({
      slug: getQueryValue(formData, "slug"),
      name: getQueryValue(formData, "name"),
      mainBranch: getQueryValue(formData, "mainBranch"),
    });

    await createSite(payload, expectedRevision);

    redirectWith("/sites", "notice", `Site ${payload.slug} created.`);
  } catch (error) {
    rethrowIfRedirectError(error);

    const message =
      error instanceof ConfigConflictError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not create site.";

    redirectWith("/sites", "error", message);
  }
}

const updateSiteSchema = z.object({
  slug: z.string().trim().regex(siteSlugPattern),
  name: z.string().trim().min(2).max(120),
  mainBranch: z.string().trim().regex(deployNamePattern),
});

const updateSitePreviewAccessSchema = z
  .object({
    previewLogin: z.string().trim().max(128).default(""),
    previewPassword: z.string().max(128).default(""),
    previewPasswordConfirm: z.string().max(128).default(""),
  })
  .superRefine((value, context) => {
    if (value.previewPassword !== value.previewPasswordConfirm) {
      context.addIssue({
        code: "custom",
        message: "Password confirmation does not match the new password.",
        path: ["previewPasswordConfirm"],
      });
    }
  });

export async function updateSiteAction(siteSlug: string, formData: FormData) {
  await requireAdminSession();
  const expectedRevision = toRevision(formData);

  try {
    const payload = updateSiteSchema.parse({
      slug: siteSlug,
      name: getQueryValue(formData, "name"),
      mainBranch: getQueryValue(formData, "mainBranch"),
    });

    await updateSite(siteSlug, payload, expectedRevision);

    redirectWith(`/sites/${siteSlug}?view=configuration`, "notice", `Updated ${siteSlug}.`);
  } catch (error) {
    rethrowIfRedirectError(error);

    const message =
      error instanceof ConfigConflictError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not update site.";

    redirectWith(`/sites/${siteSlug}?view=configuration`, "error", message);
  }
}

export async function updateSitePreviewAccessAction(siteSlug: string, formData: FormData) {
  await requireAdminSession();
  const expectedRevision = toRevision(formData);

  try {
    const payload = updateSitePreviewAccessSchema.parse({
      previewLogin: getQueryValue(formData, "previewLogin"),
      previewPassword: getQueryValue(formData, "previewPassword"),
      previewPasswordConfirm: getQueryValue(formData, "previewPasswordConfirm"),
    });

    await updateSitePreviewAccess(siteSlug, payload, expectedRevision);

    redirectWith(
      `/sites/${siteSlug}?view=configuration`,
      "notice",
      `Preview access updated for ${siteSlug}.`,
    );
  } catch (error) {
    rethrowIfRedirectError(error);

    const message =
      error instanceof ConfigConflictError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not update preview access.";

    redirectWith(`/sites/${siteSlug}?view=configuration`, "error", message);
  }
}

export async function resetSitePreviewAccessAction(siteSlug: string, formData: FormData) {
  await requireAdminSession();
  const expectedRevision = toRevision(formData);

  try {
    await resetSitePreviewAccess(siteSlug, expectedRevision);

    redirectWith(
      `/sites/${siteSlug}?view=configuration`,
      "notice",
      `Preview access reset for ${siteSlug}.`,
    );
  } catch (error) {
    rethrowIfRedirectError(error);

    const message =
      error instanceof ConfigConflictError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not reset preview access.";

    redirectWith(`/sites/${siteSlug}?view=configuration`, "error", message);
  }
}

export async function deleteSiteAction(siteSlug: string, formData: FormData) {
  await requireAdminSession();
  const expectedRevision = toRevision(formData);

  try {
    await deleteSite(siteSlug, expectedRevision);

    redirectWith("/sites", "notice", `Site ${siteSlug} moved to orphan storage.`);
  } catch (error) {
    rethrowIfRedirectError(error);

    const message =
      error instanceof ConfigConflictError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not delete site.";

    redirectWith(`/sites/${siteSlug}?view=configuration`, "error", message);
  }
}

const serverSettingsSchema = z.object({
  domain: domainFieldSchema,
  serverIp: serverIpFieldSchema,
  caddyContactEmail: caddyContactEmailFieldSchema,
});

const adminSettingsSchema = z
  .object({
    adminLogin: z.string().trim().min(3).max(128),
    adminPassword: z.string().max(128).default(""),
    adminPasswordConfirm: z.string().max(128).default(""),
  })
  .superRefine((value, context) => {
    if (value.adminPassword && value.adminPassword !== value.adminPasswordConfirm) {
      context.addIssue({
        code: "custom",
        message: "Password confirmation does not match the new password.",
        path: ["adminPasswordConfirm"],
      });
    }
  });

async function handleSettingsFailure(error: unknown, fallbackMessage: string): Promise<never> {
  rethrowIfRedirectError(error);

  const message =
    error instanceof ConfigConflictError
      ? error.message
      : error instanceof Error
        ? error.message
        : fallbackMessage;

  redirectWith("/settings", "error", message);
}

export async function saveServerSettingsAction(formData: FormData) {
  await requireAdminSession();
  const expectedRevision = toRevision(formData);

  try {
    const payload = serverSettingsSchema.parse({
      domain: getQueryValue(formData, "domain"),
      serverIp: getQueryValue(formData, "serverIp"),
      caddyContactEmail: getQueryValue(formData, "caddyContactEmail"),
    });

    await saveServerSettings(payload, expectedRevision);

    redirectWith("/settings", "notice", "Infrastructure settings applied.");
  } catch (error) {
    await handleSettingsFailure(error, "Could not save infrastructure settings.");
  }
}

export async function saveAdminAccessAction(formData: FormData) {
  await requireAdminSession();
  const expectedRevision = toRevision(formData);

  try {
    const payload = adminSettingsSchema.parse({
      adminLogin: getQueryValue(formData, "adminLogin"),
      adminPassword: getQueryValue(formData, "adminPassword"),
      adminPasswordConfirm: getQueryValue(formData, "adminPasswordConfirm"),
    });

    await saveAdminAccess(payload, expectedRevision);

    redirectWith("/settings", "notice", "Admin access updated.");
  } catch (error) {
    await handleSettingsFailure(error, "Could not save admin access.");
  }
}

const cloudflareTokenSchema = z.object({
  cloudflareApiToken: cloudflareTokenFieldSchema,
});

export async function saveCloudflareTokenAction(formData: FormData) {
  await requireAdminSession();
  const expectedRevision = toRevision(formData);

  try {
    const payload = cloudflareTokenSchema.parse({
      cloudflareApiToken: getQueryValue(formData, "cloudflareApiToken"),
    });

    await saveCloudflareToken(payload.cloudflareApiToken, expectedRevision);

    redirectWith("/settings", "notice", "Cloudflare token saved.");
  } catch (error) {
    await handleSettingsFailure(error, "Could not update the Cloudflare token.");
  }
}

export async function deleteDeployAction(siteSlug: string, deployName: string, formData: FormData) {
  await requireAdminSession();
  const expectedRevision = toRevision(formData);

  try {
    await deleteSiteDeploy(siteSlug, deployName, expectedRevision);

    redirectWith(`/sites/${siteSlug}`, "notice", `Deploy ${deployName} deleted.`);
  } catch (error) {
    rethrowIfRedirectError(error);

    const message =
      error instanceof ConfigConflictError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not delete deploy.";

    redirectWith(`/sites/${siteSlug}`, "error", message);
  }
}
