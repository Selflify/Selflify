const hostnameLabelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeHostname(value: string): string {
  return value.trim().replace(/\.+$/, "").toLowerCase();
}

export function isValidHostname(value: string): boolean {
  const hostname = normalizeHostname(value);

  if (!hostname || hostname.length > 253) {
    return false;
  }

  const labels = hostname.split(".");

  if (labels.length < 2) {
    return false;
  }

  return labels.every((label) => hostnameLabelPattern.test(label));
}
