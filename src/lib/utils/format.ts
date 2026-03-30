export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatDateTime(value: string | number | Date | null): string {
  if (!value) {
    return "Not available";
  }

  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatRelativeTime(
  value: string | number | Date | null,
  referenceTime = Date.now(),
): string {
  if (!value) {
    return "Not available";
  }

  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Not available";
  }

  const diffSeconds = Math.max(0, Math.floor((referenceTime - timestamp) / 1000));

  if (diffSeconds < 60) {
    return "just now";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)}w ago`;
  }

  if (diffDays < 365) {
    return `${Math.floor(diffDays / 30)}mo ago`;
  }

  return `${Math.floor(diffDays / 365)}y ago`;
}

export function slugToLabel(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatSiteName(name: string): string {
  if (!name) {
    return "";
  }

  return name.slice(0, 1).toUpperCase() + name.slice(1);
}
