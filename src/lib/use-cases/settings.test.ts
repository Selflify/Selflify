import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultConfig } from "@/lib/config/service";
import { runConfigOperation } from "@/lib/operations";
import { saveCloudflareToken, saveServerSettings } from "@/lib/use-cases/settings";

const { dnsGatewayMock } = vi.hoisted(() => ({
  dnsGatewayMock: {
    syncAllSiteRecords: vi.fn(),
    deleteSiteRecords: vi.fn(),
  },
}));

vi.mock("@/lib/operations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/operations")>("@/lib/operations");

  return {
    ...actual,
    runConfigOperation: vi.fn(),
  };
});

vi.mock("@/lib/system/cloudflare", async () => {
  const actual = await vi.importActual<typeof import("@/lib/system/cloudflare")>(
    "@/lib/system/cloudflare",
  );

  return {
    ...actual,
    dnsGateway: dnsGatewayMock,
  };
});

describe("saveServerSettings", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("syncs all current DNS records after infrastructure changes", async () => {
    vi.mocked(runConfigOperation).mockImplementation(async ({ mutate, afterApply }) => {
      const config = createDefaultConfig();
      const outcome = await mutate(config);

      await afterApply?.(outcome.config);
      return undefined as never;
    });

    await saveServerSettings(
      {
        domain: "example.dev",
        serverIp: "203.0.113.10",
        caddyContactEmail: "ops@example.dev",
      },
      3,
    );

    expect(dnsGatewayMock.syncAllSiteRecords).toHaveBeenCalledTimes(1);
    expect(dnsGatewayMock.deleteSiteRecords).not.toHaveBeenCalled();
  });

  it("deletes old site records after a domain change", async () => {
    vi.mocked(runConfigOperation).mockImplementation(async ({ mutate, afterApply }) => {
      const config = createDefaultConfig();
      config.server.domain = "old.example.dev";
      config.sites = [
        {
          slug: "app",
          name: "App",
          mainBranch: "stable",
          stableAlias: null,
          previewAuth: {
            enabled: false,
            login: null,
            passwordHash: null,
          },
          createdAt: "2026-03-27T09:00:00.000Z",
          updatedAt: "2026-03-27T09:00:00.000Z",
        },
        {
          slug: "forms",
          name: "Forms",
          mainBranch: "stable",
          stableAlias: null,
          previewAuth: {
            enabled: false,
            login: null,
            passwordHash: null,
          },
          createdAt: "2026-03-27T09:00:00.000Z",
          updatedAt: "2026-03-27T09:00:00.000Z",
        },
      ];

      const outcome = await mutate(config);
      await afterApply?.(outcome.config);
      return undefined as never;
    });

    await saveServerSettings(
      {
        domain: "new.example.dev",
        serverIp: "203.0.113.10",
        caddyContactEmail: "ops@example.dev",
      },
      4,
    );

    expect(dnsGatewayMock.syncAllSiteRecords).toHaveBeenCalledTimes(1);
    expect(dnsGatewayMock.deleteSiteRecords).toHaveBeenCalledTimes(2);
    expect(dnsGatewayMock.deleteSiteRecords).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        server: expect.objectContaining({
          domain: "old.example.dev",
        }),
      }),
      expect.objectContaining({ slug: "app" }),
    );
    expect(dnsGatewayMock.deleteSiteRecords).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        server: expect.objectContaining({
          domain: "old.example.dev",
        }),
      }),
      expect.objectContaining({ slug: "forms" }),
    );
  });
});

describe("saveCloudflareToken", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("updates the token without syncing site DNS records", async () => {
    vi.mocked(runConfigOperation).mockImplementation(async ({ mutate, afterApply }) => {
      const config = createDefaultConfig();
      const outcome = await mutate(config);

      await afterApply?.(outcome.config);
      expect(outcome.config.server.cloudflareApiToken).toBe("cfut_updatedToken123456789012345678901234567890");
      return undefined as never;
    });

    await saveCloudflareToken("cfut_updatedToken123456789012345678901234567890", 8);

    expect(dnsGatewayMock.syncAllSiteRecords).not.toHaveBeenCalled();
    expect(dnsGatewayMock.deleteSiteRecords).not.toHaveBeenCalled();
  });
});
