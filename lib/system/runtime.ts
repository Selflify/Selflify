function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function isDevelopmentRuntime(): boolean {
  if (process.env.SELFLIFY_DEV_MODE !== undefined) {
    return isTruthy(process.env.SELFLIFY_DEV_MODE);
  }

  return process.env.NODE_ENV === "development";
}

export function shouldMockCloudflare(): boolean {
  if (process.env.SELFLIFY_MOCK_CLOUDFLARE !== undefined) {
    return isTruthy(process.env.SELFLIFY_MOCK_CLOUDFLARE);
  }

  return isDevelopmentRuntime();
}

export function shouldSkipCaddyReload(): boolean {
  if (process.env.SELFLIFY_SKIP_CADDY_RELOAD !== undefined) {
    return isTruthy(process.env.SELFLIFY_SKIP_CADDY_RELOAD);
  }

  return isDevelopmentRuntime();
}

export function getRuntimeModeLabel(): "development" | "production" {
  return isDevelopmentRuntime() ? "development" : "production";
}
