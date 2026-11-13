import { z } from "zod";

const host = "[a-z0-9]+(?:-[a-z0-9]+)*";
const registry = `(?:localhost(?::[0-9]{1,5})?|${host}:[0-9]{1,5}|${host}(?:\\.${host})+(?::[0-9]{1,5})?)`;
const segment = "[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*";
const repository = `${registry}/${segment}(?:/${segment})*`;

export const imageRepositorySchema = z
  .string()
  .max(255)
  .regex(new RegExp(`^${repository}$`), "Enter a registry and repository without a tag or digest.");
export const imageReferenceSchema = z
  .string()
  .max(327)
  .regex(
    new RegExp(`^${repository}@sha256:[a-f0-9]{64}$`),
    "Enter a full image reference ending in @sha256:<digest>.",
  );

const portSchema = z.number().int().min(1).max(65535);
const healthPathSchema = z
  .string()
  .max(256)
  .regex(/^\/(?!\/)[a-zA-Z0-9/_~.-]*$/, "Enter an absolute HTTP path such as /healthz.");

export const containerSettingsSchema = z.object({
  repository: imageRepositorySchema,
  port: portSchema,
  healthPath: healthPathSchema,
});

export const releaseIdSchema = z.string().uuid();

export const containerReleaseSchema = z.object({
  id: releaseIdSchema,
  image: imageReferenceSchema,
  port: portSchema,
  healthPath: healthPathSchema,
  publishedAt: z.string().datetime(),
});

export const containerConfigSchema = containerSettingsSchema.extend({
  secretsId: releaseIdSchema.optional(),
  active: containerReleaseSchema.optional(),
  previous: containerReleaseSchema.optional(),
});

export const containerSecretsSchema = z.object({
  registry: z
    .object({
      host: z.string().regex(new RegExp(`^${registry}$`)),
      username: z.string().min(1).max(256),
      password: z.string().min(1).max(4096),
    })
    .optional(),
  env: z
    .record(
      z
        .string()
        .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
        .max(128),
      z.string().max(8192),
    )
    .refine(
      (env) =>
        Object.keys(env).length <= 64 && !Object.values(env).some((value) => value.includes("\0")),
    ),
});

export type ContainerSettings = z.infer<typeof containerSettingsSchema>;
export type ContainerRelease = z.infer<typeof containerReleaseSchema>;
export type ContainerSecrets = z.infer<typeof containerSecretsSchema>;

export function containerHostname(id: string): string {
  return `selflify-release-${id}`;
}
