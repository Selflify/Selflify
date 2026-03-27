import { afterEach, describe, expect, it, vi } from "vitest";

import SiteDetailsPage from "@/app/(admin)/sites/[site]/page";
import { requireAdminSession } from "@/lib/auth/guards";
import { createDefaultConfig } from "@/lib/config/service";
import { listDeploys } from "@/lib/sites/service";
import { renderWithProviders } from "@/test/render-with-providers";

vi.mock("@/app/actions", () => ({
  deleteDeployAction: vi.fn(),
  deleteSiteAction: vi.fn(),
  updateSiteAction: vi.fn(),
}));

vi.mock("@/components/form-submit-button", () => ({
  FormSubmitButton: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
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
    listDeploys: vi.fn(),
  };
});

describe("site details page", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows deploy inventory by default", async () => {
    const config = createDefaultConfig();
    config.sites = [
      {
        slug: "app",
        name: "App",
        mainBranch: "stable",
        previewAuth: {
          enabled: false,
          login: null,
          passwordHash: null,
        },
        createdAt: "2026-03-27T09:00:00.000Z",
        updatedAt: "2026-03-27T09:00:00.000Z",
      },
    ];

    vi.mocked(requireAdminSession).mockResolvedValue({
      config,
      session: { user: { name: "owner" }, expires: "2026-03-28T00:00:00.000Z" },
    });
    vi.mocked(listDeploys).mockResolvedValue([
      {
        name: "stable",
        isMainBranch: true,
        sizeBytes: 1024,
        sizeLabel: "1.0 KB",
        modifiedAt: "2026-03-27T09:20:00.000Z",
        url: "https://app.sendsay.dev",
      },
      {
        name: "pr-42",
        isMainBranch: false,
        sizeBytes: 512,
        sizeLabel: "512 B",
        modifiedAt: "2026-03-27T09:25:00.000Z",
        url: "https://pr-42.app.sendsay.dev",
      },
    ]);

    const page = await SiteDetailsPage({
      params: Promise.resolve({ site: "app" }),
      searchParams: Promise.resolve({}),
    });
    const html = renderWithProviders(page);

    expect(html).toContain("Deploy inventory");
    expect(html).toContain("pr-42");
    expect(html).toContain("https://pr-42.app.sendsay.dev");
    expect(html).not.toContain("Danger zone");
  });

  it("renders site configuration when requested explicitly", async () => {
    const config = createDefaultConfig();
    config.sites = [
      {
        slug: "app",
        name: "App",
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

    vi.mocked(requireAdminSession).mockResolvedValue({
      config,
      session: { user: { name: "owner" }, expires: "2026-03-28T00:00:00.000Z" },
    });
    vi.mocked(listDeploys).mockResolvedValue([]);

    const page = await SiteDetailsPage({
      params: Promise.resolve({ site: "app" }),
      searchParams: Promise.resolve({
        view: "configuration",
        notice: "Updated app.",
      }),
    });
    const html = renderWithProviders(page);

    expect(html).toContain("Configuration");
    expect(html).toContain("Preview login");
    expect(html).toContain("Danger zone");
    expect(html).toContain("Updated app.");
    expect(html).not.toContain("Deploy inventory");
  });
});
