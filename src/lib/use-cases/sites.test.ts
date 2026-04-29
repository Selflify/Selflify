import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultConfig } from "@/lib/config/service";
import { runConfigOperation } from "@/lib/operations";
import { deleteSite } from "@/lib/use-cases/sites";

const { dnsGatewayMock, sitesServiceMock } = vi.hoisted(() => ({
  dnsGatewayMock: {
    syncSiteRecords: vi.fn(),
    deleteSiteRecords: vi.fn(),
  },
  sitesServiceMock: {
    moveSiteToOrphanStorage: vi.fn(),
    removeOrphanedSiteDirectory: vi.fn(),
    restoreSiteFromOrphanStorage: vi.fn(),
  },
}));

vi.mock("@/lib/operations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/operations")>("@/lib/operations");

  return {
    ...actual,
    runConfigOperation: vi.fn(),
  };
});

vi.mock("@/lib/sites/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sites/service")>(
    "@/lib/sites/service",
  );

  return {
    ...actual,
    moveSiteToOrphanStorage: sitesServiceMock.moveSiteToOrphanStorage,
    removeOrphanedSiteDirectory: sitesServiceMock.removeOrphanedSiteDirectory,
    restoreSiteFromOrphanStorage: sitesServiceMock.restoreSiteFromOrphanStorage,
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

describe("deleteSite", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps files in orphan storage and leaves dns intact when no extra cleanup is requested", async () => {
    sitesServiceMock.moveSiteToOrphanStorage.mockResolvedValue("/var/www/.orphaned-sites/app-1");
    vi.mocked(runConfigOperation).mockImplementation(async ({ mutate, beforePersist, afterApply }) => {
      const config = createDefaultConfig();
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

      const outcome = await mutate(config);
      await beforePersist?.(outcome.config);
      await afterApply?.(outcome.config);
      return undefined as never;
    });

    await deleteSite(
      "app",
      {
        removeFilesFromServer: false,
        removeDnsRecords: false,
      },
      4,
    );

    expect(sitesServiceMock.moveSiteToOrphanStorage).toHaveBeenCalledTimes(1);
    expect(sitesServiceMock.removeOrphanedSiteDirectory).not.toHaveBeenCalled();
    expect(dnsGatewayMock.deleteSiteRecords).not.toHaveBeenCalled();
  });

  it("removes dns and orphaned files when both cleanup options are requested", async () => {
    sitesServiceMock.moveSiteToOrphanStorage.mockResolvedValue("/var/www/.orphaned-sites/app-2");
    vi.mocked(runConfigOperation).mockImplementation(async ({ mutate, beforePersist, afterApply }) => {
      const config = createDefaultConfig();
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

      const outcome = await mutate(config);
      await beforePersist?.(outcome.config);
      await afterApply?.(outcome.config);
      return undefined as never;
    });

    await deleteSite(
      "app",
      {
        removeFilesFromServer: true,
        removeDnsRecords: true,
      },
      5,
    );

    expect(dnsGatewayMock.deleteSiteRecords).toHaveBeenCalledTimes(1);
    expect(dnsGatewayMock.deleteSiteRecords).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ slug: "app" }),
    );
    expect(sitesServiceMock.removeOrphanedSiteDirectory).toHaveBeenCalledWith(
      "/var/www/.orphaned-sites/app-2",
    );
  });
});
