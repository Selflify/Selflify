export const CLOUDFLARE_API_TOKEN_MESSAGE =
  "Cloudflare API token looks invalid. Paste the raw token value without quotes or braces.";

export const CLOUDFLARE_API_TOKEN_HTML_PATTERN = "[A-Za-z0-9_\\-]{20,}";

const CLOUDFLARE_API_TOKEN_REGEX = /^[A-Za-z0-9_\-]{20,}$/;

export function looksLikeCloudflareApiToken(value: string): boolean {
  const token = value.trim();

  if (!token) {
    return false;
  }

  if (/^['"{[]/.test(token) || /['"}\]]$/.test(token)) {
    return false;
  }

  return CLOUDFLARE_API_TOKEN_REGEX.test(token);
}

export function normalizeCloudflareTokenErrorMessage(message: string): string {
  if (
    message.includes("loading DNS provider module") &&
    message.includes("API token") &&
    message.includes("appears invalid")
  ) {
    return CLOUDFLARE_API_TOKEN_MESSAGE;
  }

  return message;
}
