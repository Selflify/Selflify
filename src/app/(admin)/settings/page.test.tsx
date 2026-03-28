import { afterEach, describe, expect, it, vi } from "vitest";

import SettingsPage from "@/app/(admin)/settings/page";
import { requireAdminSession } from "@/lib/auth/guards";
import { createDefaultConfig } from "@/lib/config/service";
import { dnsGateway } from "@/lib/system/cloudflare";
import { renderWithProviders } from "@/test/render-with-providers";

vi.mock("@/app/actions", () => ({
  saveAdminAccessAction: vi.fn(),
  saveServerSettingsAction: vi.fn(),
}));

vi.mock("@/components/action-feedback-toast", () => ({
  ActionFeedbackToast: () => null,
}));

vi.mock("@/components/cloudflare-token-section", () => ({
  CloudflareTokenSection: ({
    maskedToken,
    configRevision,
  }: {
    maskedToken: string | null;
    configRevision: number;
  }) => <div>{`CF_TOKEN:${maskedToken ?? "none"}:${configRevision}`}</div>,
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAdminSession: vi.fn(),
}));

vi.mock("@/lib/system/cloudflare", () => ({
  dnsGateway: {
    listManagedRecords: vi.fn(),
  },
}));

describe("settings page", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders admin confirm password and masked cloudflare token", async () => {
    const config = createDefaultConfig();
    config.configRevision = 7;
    config.admin.login = "owner";
    config.admin.passwordHash = "hash";
    config.server.cloudflareApiToken = "token-1234";
    vi.mocked(dnsGateway.listManagedRecords).mockResolvedValue([
      {
        id: "record-1",
        type: "A",
        name: "app.example.dev",
        content: "203.0.113.10",
        proxied: false,
        ttl: 1,
      },
    ]);

    vi.mocked(requireAdminSession).mockResolvedValue({
      config,
      session: { user: { name: "owner" }, expires: "2026-03-28T00:00:00.000Z" },
    });

    const page = await SettingsPage({
      searchParams: Promise.resolve({
        notice: "Saved settings.",
      }),
    });
    const html = renderWithProviders(page);

    expect(html).toContain("Global settings");
    expect(html).toContain("Confirm password");
    expect(html).toContain("Repeat the new password to avoid saving a typo.");
    expect(html).toContain("CF_TOKEN:********1234:7");
    expect(html).toContain("Cloudflare DNS records");
    expect(html).toContain("app.example.dev");
    expect(html).toContain("203.0.113.10");
  });
});
