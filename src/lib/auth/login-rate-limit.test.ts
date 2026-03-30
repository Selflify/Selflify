import { afterEach, describe, expect, it } from "vitest";

import {
  assertLoginAllowed,
  clearLoginRateLimit,
  LoginRateLimitError,
  recordFailedLoginAttempt,
  resetLoginRateLimitStore,
  resolveLoginAttemptFingerprint,
} from "@/lib/auth/login-rate-limit";

describe("login rate limit", () => {
  afterEach(() => {
    resetLoginRateLimitStore();
  });

  it("extracts the primary client ip from forwarded headers", () => {
    const fingerprint = resolveLoginAttemptFingerprint({
      headers: new Headers({
        "x-forwarded-for": "203.0.113.10, 10.0.0.7",
      }),
    });

    expect(fingerprint).toBe("203.0.113.10");
  });

  it("blocks the same login after repeated failures", () => {
    const now = 1_000;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      recordFailedLoginAttempt("owner", "203.0.113.10", now + attempt);
    }

    expect(() => assertLoginAllowed("owner", "203.0.113.10", now + 10)).toThrow(
      LoginRateLimitError,
    );
  });

  it("clears the limiter after a successful login", () => {
    recordFailedLoginAttempt("owner", "203.0.113.10", 2_000);
    clearLoginRateLimit("owner", "203.0.113.10");

    expect(() => assertLoginAllowed("owner", "203.0.113.10", 2_001)).not.toThrow();
  });
});
