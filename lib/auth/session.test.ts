import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError, JWTSessionError } from "@auth/core/errors";

import { auth } from "@/auth";
import { isRecoverableSessionError, readOptionalSession } from "@/lib/auth/session";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

describe("auth session helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("treats jwt session errors as recoverable", () => {
    const error = new JWTSessionError("Session decode failed", {
      cause: { err: new Error("no matching decryption secret") },
    });

    expect(isRecoverableSessionError(error)).toBe(true);
  });

  it("treats direct decryption secret errors as recoverable", () => {
    const error = new Error("no matching decryption secret");

    expect(isRecoverableSessionError(error)).toBe(true);
  });

  it("returns null when auth rejects with a stale session error", async () => {
    const authMock = vi.mocked(auth);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    authMock.mockRejectedValue(
      new JWTSessionError("Session decode failed", {
        cause: { err: new Error("no matching decryption secret") },
      }),
    );

    await expect(readOptionalSession()).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("rethrows non-session auth errors", async () => {
    const authMock = vi.mocked(auth);
    authMock.mockRejectedValue(new AuthError("Unexpected auth failure"));

    await expect(readOptionalSession()).rejects.toThrow("Unexpected auth failure");
  });
});
