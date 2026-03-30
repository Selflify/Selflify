import { afterEach, describe, expect, it, vi } from "vitest";

import SitesPage from "@/app/(admin)/sites/page";
import { requireAdminSession } from "@/lib/auth/guards";
import { createDefaultConfig } from "@/lib/config/service";
import { renderWithProviders } from "@/test/render-with-providers";

vi.mock("@/components/create-site-dialog", () => ({
  CreateSiteDialog: ({ configRevision, domain }: { configRevision: number; domain: string }) => (
    <div>{`CREATE_SITE:${configRevision}:${domain}`}</div>
  ),
}));

vi.mock("@/components/action-feedback-toast", () => ({
  ActionFeedbackToast: () => null,
}));

vi.mock("@/components/recent-deploys-section", () => ({
  RecentDeploysSection: () => <div>RECENT_DEPLOYS</div>,
}));

vi.mock("@/components/site-inventory-card-metrics", () => ({
  SiteInventoryCardMetrics: ({ siteSlug }: { siteSlug: string }) => <div>{`SITE_METRICS:${siteSlug}`}</div>,
}));

vi.mock("@/components/sites-overview-metrics", () => ({
  SitesOverviewMetrics: ({ siteCount, previewRootDir }: { siteCount: number; previewRootDir: string }) => (
    <div>{`OVERVIEW:${siteCount}:${previewRootDir}`}</div>
  ),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAdminSession: vi.fn(),
}));

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
    config.sites = [
      {
        slug: "app",
        name: "app",
        mainBranch: "stable",
        previewAuth: {
          enabled: true,
          login: "preview-user",
          passwordHash: "hashed",
        },
        createdAt: "2026-03-27T09:00:00.000Z",
        updatedAt: "2026-03-27T09:00:00.000Z",
      },
    ];

    const page = await SitesPage({
      searchParams: Promise.resolve({
        notice: "Site created.",
      }),
    });
    const html = renderWithProviders(page);

    expect(html).toContain("Dashboard");
    expect(html).toContain("Sites");
    expect(html).toContain("App");
    expect(html).not.toContain(">app<");
    expect(html).toContain("RECENT_DEPLOYS");
    expect(html).toContain(`OVERVIEW:1:${config.server.previewRootDir}`);
    expect(html).toContain("SITE_METRICS:app");
    expect(html).toContain("app.preview.example.com");
    expect(html).not.toContain(">https://app.preview.example.com<");
    expect(html).toContain('href="https://app.preview.example.com"');
    expect(html).toContain("/var/www/app");
    expect(html).toContain('href="/sites/app"');
    expect(html).toContain(`CREATE_SITE:3:${config.server.domain}`);
  });
});
