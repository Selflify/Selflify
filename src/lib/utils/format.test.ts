import { describe, expect, it } from "vitest";

import { formatBytes, formatDateTime, slugToLabel } from "@/lib/utils/format";

describe("format helpers", () => {
  it("formats byte counts across units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(15 * 1024 * 1024)).toBe("15 MB");
  });

  it("formats dates and falls back for empty values", () => {
    expect(formatDateTime(null)).toBe("Not available");
    expect(formatDateTime("2026-03-27T09:20:00.000Z")).not.toBe("Not available");
  });

  it("turns slugs into labels", () => {
    expect(slugToLabel("my-app")).toBe("My App");
    expect(slugToLabel("preview-control")).toBe("Preview Control");
  });
});
