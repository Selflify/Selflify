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

const volumeSchema = z.object({
  name: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9_-]{0,39}$/,
      "Use 1–40 lowercase letters, digits, dashes or underscores for a volume name.",
    ),
  path: z
    .string()
    .max(256)
    .regex(/^(?:\/[A-Za-z0-9_.-]+)+$/, "Enter an absolute container path such as /var/lib/app.")
    .refine(
      (path) => !path.split("/").some((part) => part === "." || part === ".."),
      "Volume paths cannot contain . or .. segments.",
    ),
});

const volumesSchema = z
  .array(volumeSchema)
  .max(8)
  .superRefine((volumes, ctx) => {
    const names = volumes.map(({ name }) => name);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: "custom", message: "Volume names must be unique." });
    }
    if (
      volumes.some(({ path }, index) =>
        volumes.some(
          (other, otherIndex) =>
            index !== otherIndex && (other.path === path || other.path.startsWith(path + "/")),
        ),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Volume paths must be unique and cannot be nested.",
      });
    }
  });

export const containerSettingsSchema = z.object({
  repository: imageRepositorySchema,
  port: portSchema,
  healthPath: healthPathSchema,
  volumes: volumesSchema.optional(),
});

export const releaseIdSchema = z.string().uuid();
export const storageSiteIdSchema = z.union([releaseIdSchema, z.string().regex(/^[a-f0-9]{64}$/)]);

export const containerReleaseSchema = z.object({
  id: releaseIdSchema,
  image: imageReferenceSchema,
  port: portSchema,
  healthPath: healthPathSchema,
  publishedAt: z.string().datetime(),
  storage: z
    .object({
      siteId: storageSiteIdSchema,
      volumes: volumesSchema.min(1),
    })
    .optional(),
});

export const containerConfigSchema = containerSettingsSchema.extend({
  secretsId: releaseIdSchema.optional(),
  active: containerReleaseSchema.optional(),
  previous: containerReleaseSchema.optional(),
});

const envNameSchema = z
  .string()
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const envValueSchema = z
  .string()
  .max(8192)
  .refine((value) => !value.includes("\0"));

export const environmentRowsSchema = z
  .array(
    z.object({
      name: envNameSchema,
      value: envValueSchema.nullable(),
      secret: z.boolean(),
    }),
  )
  .max(64);

export const containerSecretsSchema = z.object({
  registry: z
    .object({
      host: z.string().regex(new RegExp(`^${registry}$`)),
      username: z.string().min(1).max(256),
      password: z.string().min(1).max(4096),
    })
    .optional(),
  env: z.record(envNameSchema, envValueSchema).refine((env) => Object.keys(env).length <= 64),
  publicEnvNames: z.array(envNameSchema).max(64).optional(),
});

export type ContainerSettings = z.infer<typeof containerSettingsSchema>;
export type ContainerVolume = z.infer<typeof volumeSchema>;
export type ContainerRelease = z.infer<typeof containerReleaseSchema>;
export type ContainerSecrets = z.infer<typeof containerSecretsSchema>;

export function containerHostname(id: string): string {
  return `selflify-release-${id}`;
}
