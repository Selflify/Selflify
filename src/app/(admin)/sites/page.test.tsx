import { afterEach, describe, expect, it, vi } from "vitest";

import SitesPage from "@/app/(admin)/sites/page";
import { requireAdminSession } from "@/lib/auth/guards";
import { createDefaultConfig } from "@/lib/config/service";
import { getAllSiteSummaries, getDiskUsage } from "@/lib/sites/service";
import { renderWithProviders } from "@/test/render-with-providers";

vi.mock("@/components/create-site-dialog", () => ({
  CreateSiteDialog: ({ configRevision }: { configRevision: number }) => (
    <div>{`CREATE_SITE:${configRevision}`}</div>
  ),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAdminSession: vi.fn(),
}));

vi.mock("@/lib/sites/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sites/service")>(
    "@/lib/sites/service",
  );

  return {
    ...actual,
    getAllSiteSummaries: vi.fn(),
    getDiskUsage: vi.fn(),
  };
});

describe("sites page", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders metrics and site inventory", async () => {
    const config = createDefaultConfig();
    config.configRevision = 3;

    vi.mocked(requireAdminSession).mockResolvedValue({
      config,
      session: { user: { name: "owner" }, expires: "2026-03-28T00:00:00.000Z" },
    });
    vi.mocked(getAllSiteSummaries).mockResolvedValue([
      {
        slug: "app",
        name: "App",
        mainBranch: "stable",
        dir: "/var/www/app",
        totalSizeBytes: 2048,
        totalSizeLabel: "2.0 KB",
        deployCount: 2,
        stableUrl: "https://app.example.dev",
        previewAuthEnabled: true,
      },
    ]);
    vi.mocked(getDiskUsage).mockResolvedValue({
      totalBytes: 10 * 1024 * 1024,
      usedBytes: 5 * 1024 * 1024,
      availableBytes: 5 * 1024 * 1024,
    });

    const page = await SitesPage({
      searchParams: Promise.resolve({
        notice: "Site created.",
      }),
    });
    const html = renderWithProviders(page);

    expect(html).toContain("Sites");
    expect(html).toContain("Site inventory");
    expect(html).toContain("Site created.");
    expect(html).toContain("App");
    expect(html).toContain("app.example.dev");
    expect(html).toContain("/var/www/app");
    expect(html).toContain('href="/sites/app"');
    expect(html).toContain("CREATE_SITE:3");
  });
});
