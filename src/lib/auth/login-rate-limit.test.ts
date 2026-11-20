import { afterEach, describe, expect, it } from "vitest";

import {
  LoginRateLimitError,
  recordUnknownLoginAttempt,
  reserveLoginAttempt,
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

  it("keeps the configured account blocked when the client identity changes", () => {
    for (let index = 0; index < 5; index += 1) {
      const attempt = reserveLoginAttempt("owner", `client-${index}`, 1000 + index);
      attempt.fail(1000 + index);
      attempt.release();
    }
    expect(() => reserveLoginAttempt("owner", "new-client", 1010)).toThrow(LoginRateLimitError);
    reserveLoginAttempt("owner", "new-client", 20 * 60 * 1000).release();
  });

  it("shares the per-client limit between unknown and configured logins", () => {
    for (let index = 0; index < 5; index += 1) {
      recordUnknownLoginAttempt("same-client", 1000 + index);
    }
    expect(() => reserveLoginAttempt("owner", "same-client", 1010)).toThrow(LoginRateLimitError);
    reserveLoginAttempt("owner", "new-client", 1010).release();
  });

  it("keeps the account limiter available when the auxiliary client table is full", () => {
    for (let index = 0; index < 10_000; index += 1) {
      recordUnknownLoginAttempt(`client-${index}`, 1000);
    }
    const valid = reserveLoginAttempt("owner", "another-client", 1001);
    valid.succeed(1001);
    valid.release();

    for (let index = 0; index < 5; index += 1) {
      const attempt = reserveLoginAttempt("owner", `new-${index}`, 1002);
      attempt.fail(1002);
      attempt.release();
    }
    expect(() => reserveLoginAttempt("owner", "another-client", 1003)).toThrow(LoginRateLimitError);
    reserveLoginAttempt("owner", "another-client", 20 * 60 * 1000).release();
  });

  it("keeps the password check limit through success and window rollover", () => {
    const attempts = Array.from({ length: 5 }, (_, index) =>
      reserveLoginAttempt("owner", `client-${index}`, 1000),
    );
    attempts[0].succeed(1001);
    expect(() => reserveLoginAttempt("owner", "client-new", 1001)).toThrow(LoginRateLimitError);
    expect(() => reserveLoginAttempt("owner", "client-new", 20 * 60 * 1000)).toThrow(
      LoginRateLimitError,
    );

    attempts[0].release();
    attempts[0].release();
    const next = reserveLoginAttempt("owner", "client-new", 20 * 60 * 1000);
    expect(() => reserveLoginAttempt("owner", "client-new", 20 * 60 * 1000)).toThrow(
      LoginRateLimitError,
    );
    next.release();
    attempts.forEach((attempt) => attempt.release());
  });
});
