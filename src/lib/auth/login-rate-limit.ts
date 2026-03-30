const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_BLOCK_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;

type AttemptBucket = {
  failedAttempts: number;
  windowStartedAt: number;
  blockedUntil: number;
};

const buckets = new Map<string, AttemptBucket>();

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

function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

function normalizeFingerprint(fingerprint: string | null | undefined): string {
  const primary = fingerprint?.split(",")[0]?.trim().toLowerCase();
  return primary || "global";
}

function buildPerLoginKey(login: string, fingerprint: string): string {
  return `login:${fingerprint}:${normalizeLogin(login)}`;
}

function buildFingerprintKey(fingerprint: string): string {
  return `fingerprint:${fingerprint}`;
}

function getFreshBucket(now: number): AttemptBucket {
  return {
    failedAttempts: 0,
    windowStartedAt: now,
    blockedUntil: 0,
  };
}

function getBucket(key: string, now: number): AttemptBucket {
  const bucket = buckets.get(key);

  if (!bucket) {
    const fresh = getFreshBucket(now);
    buckets.set(key, fresh);
    return fresh;
  }

  if (bucket.blockedUntil && bucket.blockedUntil <= now) {
    const fresh = getFreshBucket(now);
    buckets.set(key, fresh);
    return fresh;
  }

  if (bucket.windowStartedAt + getWindowMs() <= now && bucket.blockedUntil <= now) {
    const fresh = getFreshBucket(now);
    buckets.set(key, fresh);
    return fresh;
  }

  return bucket;
}

function assertBucketAllowed(key: string, now: number): void {
  const bucket = getBucket(key, now);

  if (bucket.blockedUntil > now) {
    throw new LoginRateLimitError(bucket.blockedUntil - now);
  }
}

function recordBucketFailure(key: string, now: number): void {
  const bucket = getBucket(key, now);

  bucket.failedAttempts += 1;

  if (bucket.failedAttempts >= getMaxAttempts()) {
    bucket.blockedUntil = now + getBlockMs();
  }

  buckets.set(key, bucket);
}

function clearBucket(key: string): void {
  buckets.delete(key);
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

export function assertLoginAllowed(
  login: string,
  fingerprint: string | null | undefined,
  now = Date.now(),
): void {
  const normalizedFingerprint = normalizeFingerprint(fingerprint);
  assertBucketAllowed(buildFingerprintKey(normalizedFingerprint), now);
  assertBucketAllowed(buildPerLoginKey(login, normalizedFingerprint), now);
}

export function recordFailedLoginAttempt(
  login: string,
  fingerprint: string | null | undefined,
  now = Date.now(),
): void {
  const normalizedFingerprint = normalizeFingerprint(fingerprint);
  recordBucketFailure(buildFingerprintKey(normalizedFingerprint), now);
  recordBucketFailure(buildPerLoginKey(login, normalizedFingerprint), now);
}

export function clearLoginRateLimit(
  login: string,
  fingerprint: string | null | undefined,
): void {
  const normalizedFingerprint = normalizeFingerprint(fingerprint);
  clearBucket(buildFingerprintKey(normalizedFingerprint));
  clearBucket(buildPerLoginKey(login, normalizedFingerprint));
}

export function resetLoginRateLimitStore(): void {
  buckets.clear();
}
