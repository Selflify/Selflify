import { createHash } from "node:crypto";

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_BLOCK_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const MAX_BUCKETS = 10_000;

type AttemptBucket = {
  failedAttempts: number;
  windowStartedAt: number;
  blockedUntil: number;
};

const clientBuckets = new Map<string, AttemptBucket>();
// Selflify has one configured admin. Client identities cannot consume this state.
let account: { login: string; failures: AttemptBucket } | undefined;
let inFlight = 0;
let nextPruneAt = 0;

export class LoginRateLimitError extends Error {
  retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super("Too many failed login attempts. Try again later.");
    this.name = "LoginRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function getWindowMs(): number {
  return readPositiveInteger(process.env.SELFLIFY_LOGIN_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS);
}

function getBlockMs(): number {
  return readPositiveInteger(process.env.SELFLIFY_LOGIN_RATE_LIMIT_BLOCK_MS, DEFAULT_BLOCK_MS);
}

function getMaxAttempts(): number {
  return readPositiveInteger(
    process.env.SELFLIFY_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS,
  );
}

function normalizeFingerprint(fingerprint: string | null | undefined): string {
  const primary = fingerprint?.split(",")[0]?.trim().toLowerCase();
  return primary || "global";
}

function freshBucket(now: number): AttemptBucket {
  return { failedAttempts: 0, windowStartedAt: now, blockedUntil: 0 };
}

function expired(bucket: AttemptBucket, now: number, windowMs: number): boolean {
  return bucket.blockedUntil
    ? bucket.blockedUntil <= now
    : bucket.windowStartedAt + windowMs <= now;
}

function fingerprintKey(fingerprint: string): string {
  return createHash("sha256").update(normalizeFingerprint(fingerprint)).digest("hex");
}

function getClientBucket(key: string, now: number): AttemptBucket | undefined {
  const windowMs = getWindowMs();
  if (now >= nextPruneAt) {
    for (const [storedKey, bucket] of clientBuckets) {
      if (expired(bucket, now, windowMs)) clientBuckets.delete(storedKey);
    }
    nextPruneAt = now + 30_000;
  }

  const current = clientBuckets.get(key);
  if (current && !expired(current, now, windowMs)) return current;
  if (!current && clientBuckets.size >= MAX_BUCKETS) return undefined;
  const fresh = freshBucket(now);
  clientBuckets.set(key, fresh);
  return fresh;
}

function assertAllowed(bucket: AttemptBucket | undefined, now: number): void {
  if (bucket && bucket.blockedUntil > now) {
    throw new LoginRateLimitError(bucket.blockedUntil - now);
  }
}

function recordFailure(bucket: AttemptBucket | undefined, now: number): void {
  if (!bucket || bucket.blockedUntil > now) return;
  bucket.failedAttempts += 1;
  if (bucket.failedAttempts >= getMaxAttempts()) bucket.blockedUntil = now + getBlockMs();
}

function accountFailures(current: NonNullable<typeof account>, now: number): AttemptBucket {
  if (expired(current.failures, now, getWindowMs())) current.failures = freshBucket(now);
  return current.failures;
}

export function resolveLoginAttemptFingerprint(
  request: Pick<Request, "headers"> | null | undefined,
): string {
  if (!request) {
    return "global";
  }

  return normalizeFingerprint(
    request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip"),
  );
}

export function assertLoginClientAllowed(fingerprint: string, now = Date.now()): void {
  assertAllowed(clientBuckets.get(fingerprintKey(fingerprint)), now);
}

export function recordUnknownLoginAttempt(fingerprint: string, now = Date.now()): void {
  recordFailure(getClientBucket(fingerprintKey(fingerprint), now), now);
}

// Call only after matching the configured login. Reservations span both resets and windows.
export function reserveLoginAttempt(login: string, fingerprint: string, now = Date.now()) {
  if (account?.login !== login) account = { login, failures: freshBucket(now) };
  const current = account;
  assertAllowed(accountFailures(current, now), now);
  const clientKey = fingerprintKey(fingerprint);
  assertAllowed(clientBuckets.get(clientKey), now);
  if (inFlight >= getMaxAttempts()) throw new LoginRateLimitError(1000);
  inFlight += 1;

  let released = false;
  return {
    fail(at = Date.now()) {
      recordFailure(accountFailures(current, at), at);
      recordFailure(getClientBucket(clientKey, at), at);
    },
    succeed(at = Date.now()) {
      current.failures = freshBucket(at);
      clientBuckets.delete(clientKey);
    },
    release() {
      if (released) return;
      released = true;
      inFlight -= 1;
    },
  };
}

export function resetLoginRateLimitStore(): void {
  clientBuckets.clear();
  account = undefined;
  inFlight = 0;
  nextPruneAt = 0;
}
