import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/settings/dns-records/route";
import { readOptionalSession } from "@/lib/auth/session";
import { createDefaultConfig } from "@/lib/config/service";
import { readSelflifyConfig } from "@/lib/config/service";
import { dnsGateway } from "@/lib/system/cloudflare";
import { shouldMockCloudflare } from "@/lib/system/runtime";

vi.mock("@/lib/auth/session", () => ({
  readOptionalSession: vi.fn(),
}));

vi.mock("@/lib/config/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/service")>(
    "@/lib/config/service",
  );

  return {
    ...actual,
    readSelflifyConfig: vi.fn(),
  };
});

vi.mock("@/lib/system/cloudflare", () => ({
  dnsGateway: {
    listManagedRecords: vi.fn(),
  },
}));

vi.mock("@/lib/system/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/system/runtime")>(
    "@/lib/system/runtime",
  );

  return {
    ...actual,
    shouldMockCloudflare: vi.fn(),
  };
});

describe("GET /api/settings/dns-records", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns expected mocked dns records without calling Cloudflare", async () => {
    const config = createDefaultConfig();
    config.server.domain = "example.dev";
    config.server.serverIp = "1.1.1.1";
    config.sites = [
      {
        slug: "app",
        name: "App",
        mainBranch: "stable",
        stableAlias: null,
        stableAliasAutoTls: false,
        previewAuth: {
          enabled: false,
          login: null,
          passwordHash: null,
        },
        createdAt: "2026-03-27T09:00:00.000Z",
        updatedAt: "2026-03-27T09:00:00.000Z",
      },
    ];

    vi.mocked(readOptionalSession).mockResolvedValue({
      user: { name: "owner" },
      expires: "2026-03-30T00:00:00.000Z",
    });
    vi.mocked(readSelflifyConfig).mockResolvedValue(config);
    vi.mocked(shouldMockCloudflare).mockReturnValue(true);

    const response = await GET();
    const payload = (await response.json()) as {
      records: Array<{ name: string; content: string }>;
      message: string | null;
      error: string | null;
    };

    expect(response.status).toBe(200);
    expect(dnsGateway.listManagedRecords).not.toHaveBeenCalled();
    expect(payload.error).toBeNull();
    expect(payload.records.map((record) => record.name)).toEqual([
      "app.example.dev",
      "*.app.example.dev",
    ]);
    expect(payload.records.every((record) => record.content === "1.1.1.1")).toBe(true);
  });

  it("returns missing-token message when Cloudflare is not configured", async () => {
    const config = createDefaultConfig();
    config.server.cloudflareApiToken = "";

    vi.mocked(readOptionalSession).mockResolvedValue({
      user: { name: "owner" },
      expires: "2026-03-30T00:00:00.000Z",
    });
    vi.mocked(readSelflifyConfig).mockResolvedValue(config);
    vi.mocked(shouldMockCloudflare).mockReturnValue(false);

    const response = await GET();
    const payload = (await response.json()) as {
      records: unknown[];
      message: string | null;
      error: string | null;
    };

    expect(response.status).toBe(200);
    expect(payload.records).toEqual([]);
    expect(payload.message).toBe("Add a Cloudflare API token to load managed DNS records.");
    expect(payload.error).toBeNull();
  });

  it("surfaces Cloudflare errors without failing the request", async () => {
    const config = createDefaultConfig();
    config.server.cloudflareApiToken = "cf-token";

    vi.mocked(readOptionalSession).mockResolvedValue({
      user: { name: "owner" },
      expires: "2026-03-30T00:00:00.000Z",
    });
    vi.mocked(readSelflifyConfig).mockResolvedValue(config);
    vi.mocked(shouldMockCloudflare).mockReturnValue(false);
    vi.mocked(dnsGateway.listManagedRecords).mockRejectedValue(new Error("Authentication error"));

    const response = await GET();
    const payload = (await response.json()) as {
      records: unknown[];
      message: string | null;
      error: string | null;
    };

    expect(response.status).toBe(200);
    expect(payload.records).toEqual([]);
    expect(payload.message).toBeNull();
    expect(payload.error).toBe("Authentication error");
  });
});
