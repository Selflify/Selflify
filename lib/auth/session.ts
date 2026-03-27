import { AuthError } from "@auth/core/errors";
import type { Session } from "@auth/core/types";

import { auth } from "@/auth";

function extractCauseError(error: unknown): Error | null {
  if (typeof error !== "object" || error === null || !("cause" in error)) {
    return null;
  }

  const cause = (error as { cause?: unknown }).cause;

  if (typeof cause !== "object" || cause === null || !("err" in cause)) {
    return null;
  }

  const nested = (cause as { err?: unknown }).err;
  return nested instanceof Error ? nested : null;
}

export function isRecoverableSessionError(error: unknown): boolean {
  if (error instanceof AuthError) {
    if (error.type === "JWTSessionError" || error.type === "SessionTokenError") {
      return true;
    }

    const nested = extractCauseError(error);
    return nested?.message.includes("no matching decryption secret") ?? false;
  }

  return error instanceof Error && error.message.includes("no matching decryption secret");
}

export async function readOptionalSession(): Promise<Session | null> {
  try {
    return await auth();
  } catch (error) {
    if (isRecoverableSessionError(error)) {
      console.warn("Ignoring invalid auth session and treating the user as signed out.");
      return null;
    }

    throw error;
  }
}
