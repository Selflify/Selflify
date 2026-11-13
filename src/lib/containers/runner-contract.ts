import { z } from "zod";

import { containerReleaseSchema, containerSecretsSchema, releaseIdSchema } from "./schema";

export const prepareSchema = z.object({
  release: containerReleaseSchema,
  secrets: containerSecretsSchema,
});
export const pruneSchema = z.object({ keep: z.array(releaseIdSchema).max(10_000) });

export class ContainerError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
