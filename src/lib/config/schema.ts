import { z } from "zod";

import { isValidHostname, normalizeHostname } from "@/lib/utils/hostname";

export const siteSlugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const deployNamePattern = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;

const previewAuthSchema = z
  .object({
    enabled: z.boolean().default(false),
    login: z.string().trim().max(128).nullable().default(null),
    passwordHash: z.string().trim().max(256).nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.enabled && (!value.login || !value.passwordHash)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enabled preview auth requires both login and passwordHash.",
      });
    }
  });

export const siteConfigSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(siteSlugPattern, "Subdomain must be lowercase letters, numbers or dashes."),
  name: z.string().trim().min(1).max(120),
  mainBranch: z
    .string()
    .trim()
    .regex(deployNamePattern, "Main branch must use normalized deploy naming."),
  stableAlias: z
    .string()
    .trim()
    .transform((value) => normalizeHostname(value))
    .nullable()
    .default(null)
    .superRefine((value, ctx) => {
      if (value && !isValidHostname(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Stable alias must be a valid hostname.",
        });
      }
    }),
  stableAliasAutoTls: z.boolean().default(false),
  stableAliasUseCloudflare: z.boolean().default(true),
  previewAuth: previewAuthSchema.default({
    enabled: false,
    login: null,
    passwordHash: null,
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const operationStatusSchema = z.enum(["idle", "success", "partial", "failed"]);

export const selflifyConfigSchema = z.object({
  version: z.literal(1),
  configRevision: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  sessionSecret: z.string().trim().min(16),
  admin: z.object({
    login: z.string().trim().max(128),
    passwordHash: z.string().trim().max(256),
    configuredAt: z.string().datetime().nullable().default(null),
  }),
  server: z.object({
    domain: z.string().trim().min(1),
    serverIp: z.string().trim().default(""),
    cloudflareApiToken: z.string().trim().default(""),
    previewRootDir: z.string().trim().min(1),
    orphanedRootDir: z.string().trim().min(1),
    caddyConfigPath: z.string().trim().min(1),
    caddyBinaryPath: z.string().trim().min(1),
    caddyAdminAddress: z.string().trim().min(1),
    selflifyUpstream: z.string().trim().min(1),
    caddyContactEmail: z.string().trim().default("dev@example.com"),
  }),
  operations: z.object({
    lastOperationId: z.string().trim().nullable().default(null),
    lastOperationLabel: z.string().trim().nullable().default(null),
    lastStatus: operationStatusSchema.default("idle"),
    lastMessage: z.string().trim().nullable().default(null),
    lastAppliedAt: z.string().datetime().nullable().default(null),
  }),
  sites: z.array(siteConfigSchema),
});

export type PreviewAuthConfig = z.infer<typeof previewAuthSchema>;
export type SiteConfig = z.infer<typeof siteConfigSchema>;
export type SelflifyConfig = z.infer<typeof selflifyConfigSchema>;
