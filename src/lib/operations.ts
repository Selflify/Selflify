import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { writeOperationBackups } from "@/lib/config/backups";
import type { SelflifyConfig } from "@/lib/config/schema";
import { readSelflifyConfig, writeSelflifyConfig } from "@/lib/config/service";
import { caddyGateway } from "@/lib/system/caddy";

const LOCK_PATH =
  process.env.SELFLIFY_LOCK_PATH ?? path.join(os.tmpdir(), "selflify.operation.lock");
const RETRY_DELAY_MS = 120;
const RETRY_ATTEMPTS = 80;

let operationQueue = Promise.resolve();

export class ConfigConflictError extends Error {
  constructor() {
    super("The configuration has changed. Reload the page and retry.");
    this.name = "ConfigConflictError";
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withFileLock<T>(task: () => Promise<T>): Promise<T> {
  let handle: fs.FileHandle | null = null;

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt += 1) {
    try {
      handle = await fs.open(LOCK_PATH, "wx");
      break;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code !== "EEXIST" || attempt === RETRY_ATTEMPTS - 1) {
        throw error;
      }

      await sleep(RETRY_DELAY_MS);
    }
  }

  if (!handle) {
    throw new Error("Could not acquire operation lock.");
  }

  try {
    return await task();
  } finally {
    await handle.close();
    await fs.rm(LOCK_PATH, { force: true });
  }
}

async function serializeOperation<T>(task: () => Promise<T>): Promise<T> {
  const previous = operationQueue;
  let release = () => {};

  operationQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    return await task();
  } finally {
    release();
  }
}

type OperationOptions<T> = {
  label: string;
  expectedRevision?: number;
  mutate: (draft: SelflifyConfig) => Promise<{ config: SelflifyConfig; result: T }>;
  beforePersist?: (config: SelflifyConfig) => Promise<void>;
  rollbackBeforePersist?: (
    previousConfig: SelflifyConfig,
    nextConfig: SelflifyConfig,
  ) => Promise<void>;
  afterApply?: (config: SelflifyConfig) => Promise<void>;
};

type TrackedSideEffectOptions<T> = {
  label: string;
  expectedRevision?: number;
  task: (config: SelflifyConfig) => Promise<T>;
};

function buildOperationSnapshot(
  config: SelflifyConfig,
  {
    operationId,
    label,
    status,
    message,
  }: {
    operationId: string;
    label: string;
    status: "success" | "partial" | "failed";
    message: string | null;
  },
): SelflifyConfig {
  return {
    ...config,
    updatedAt: new Date().toISOString(),
    operations: {
      lastOperationId: operationId,
      lastOperationLabel: label,
      lastStatus: status,
      lastMessage: message,
      lastAppliedAt: new Date().toISOString(),
    },
  };
}

async function persistOperationSnapshot(config: SelflifyConfig): Promise<void> {
  try {
    await writeSelflifyConfig(config);
  } catch {
    // Status persistence is best-effort for rollback and side-effect operations.
  }
}

function withRollbackContext(error: unknown, rollbackError: unknown): Error {
  const baseMessage = error instanceof Error ? error.message : "Operation failed.";
  const rollbackMessage =
    rollbackError instanceof Error ? rollbackError.message : "Rollback failed.";

  const merged = new Error(`${baseMessage} Rollback failed: ${rollbackMessage}`);

  if (error instanceof Error) {
    merged.name = error.name;
    merged.stack = error.stack;
  }

  return merged;
}

export async function runSerializedTask<T>(task: () => Promise<T>): Promise<T> {
  return serializeOperation(() => withFileLock(task));
}

export async function runConfigOperation<T>({
  label,
  expectedRevision,
  mutate,
  beforePersist,
  rollbackBeforePersist,
  afterApply,
}: OperationOptions<T>): Promise<T> {
  return runSerializedTask(async () => {
    const current = await readSelflifyConfig();

    if (expectedRevision !== undefined && expectedRevision !== current.configRevision) {
      throw new ConfigConflictError();
    }

    const { config: mutatedConfig, result } = await mutate(structuredClone(current));
    const operationId = crypto.randomUUID();
    const nextConfig = buildOperationSnapshot(
      {
        ...mutatedConfig,
        configRevision: current.configRevision + 1,
      },
      {
        operationId,
        label,
        status: "success",
        message: null,
      },
    );
    const previousCaddyPath = nextConfig.server.caddyConfigPath;
    let previousCaddyContents: string | null = null;

    try {
      previousCaddyContents = await fs.readFile(previousCaddyPath, "utf8");
    } catch {
      previousCaddyContents = null;
    }

    try {
      if (beforePersist) {
        await beforePersist(nextConfig);
      }
    } catch (error) {
      let operationError: unknown = error;

      if (rollbackBeforePersist) {
        try {
          await rollbackBeforePersist(current, nextConfig);
        } catch (rollbackError) {
          operationError = withRollbackContext(error, rollbackError);
        }
      }

      await persistOperationSnapshot(
        buildOperationSnapshot(current, {
          operationId,
          label,
          status: "failed",
          message: operationError instanceof Error ? operationError.message : "Operation failed.",
        }),
      );

      throw operationError;
    }

    let configWritten = false;

    try {
      await writeOperationBackups({
        label,
        previousConfig: current,
        previousCaddyContents,
      });
      await caddyGateway.writeGeneratedConfig(nextConfig);
      await caddyGateway.validateConfig(nextConfig);
      await writeSelflifyConfig(nextConfig);
      configWritten = true;
      await caddyGateway.reload(nextConfig);
    } catch (error) {
      if (configWritten) {
        await writeSelflifyConfig(current);
      }

      if (previousCaddyContents !== null) {
        await fs.writeFile(previousCaddyPath, previousCaddyContents, "utf8");
      } else {
        await fs.rm(previousCaddyPath, { force: true });
      }

      if (configWritten) {
        try {
          await caddyGateway.reload(current);
        } catch {
          // Ignore secondary rollback errors here. The original error is more actionable.
        }
      }

      if (rollbackBeforePersist) {
        try {
          await rollbackBeforePersist(current, nextConfig);
        } catch (rollbackError) {
          error = withRollbackContext(error, rollbackError);
        }
      }

      await persistOperationSnapshot(
        buildOperationSnapshot(current, {
          operationId,
          label,
          status: "failed",
          message: error instanceof Error ? error.message : "Operation failed.",
        }),
      );

      throw error;
    }

    let partialMessage: string | null = null;

    if (afterApply) {
      try {
        await afterApply(nextConfig);
      } catch (error) {
        partialMessage = error instanceof Error ? error.message : "Post-apply step failed.";
      }
    }

    if (partialMessage) {
      await writeSelflifyConfig(
        buildOperationSnapshot(nextConfig, {
          operationId,
          label,
          status: "partial",
          message: partialMessage,
        }),
      );
    }

    return result;
  });
}

export async function runTrackedSideEffectOperation<T>({
  label,
  expectedRevision,
  task,
}: TrackedSideEffectOptions<T>): Promise<T> {
  return runSerializedTask(async () => {
    const current = await readSelflifyConfig();

    if (expectedRevision !== undefined && expectedRevision !== current.configRevision) {
      throw new ConfigConflictError();
    }

    const operationId = crypto.randomUUID();

    try {
      const result = await task(structuredClone(current));

      await persistOperationSnapshot(
        buildOperationSnapshot(current, {
          operationId,
          label,
          status: "success",
          message: null,
        }),
      );

      return result;
    } catch (error) {
      await persistOperationSnapshot(
        buildOperationSnapshot(current, {
          operationId,
          label,
          status: "failed",
          message: error instanceof Error ? error.message : "Operation failed.",
        }),
      );

      throw error;
    }
  });
}
