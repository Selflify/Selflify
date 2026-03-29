import { afterEach, describe, expect, it, vi } from "vitest";

import SettingsPage from "@/app/(admin)/settings/page";
import { requireAdminSession } from "@/lib/auth/guards";
import { createDefaultConfig } from "@/lib/config/service";
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

vi.mock("@/components/operation-status-card", () => ({
  OperationStatusCard: () => <div>OPERATION_STATUS</div>,
}));

vi.mock("@/components/settings-dns-records-card", () => ({
  SettingsDnsRecordsCard: () => <div>DNS_RECORDS_CARD</div>,
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAdminSession: vi.fn(),
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
    expect(html).toContain("OPERATION_STATUS");
    expect(html).toContain("Confirm password");
    expect(html).toContain("Repeat the new password to avoid saving a typo.");
    expect(html).toContain("CF_TOKEN:********1234:7");
    expect(html).toContain("DNS_RECORDS_CARD");
  });

  it("renders dns card alongside runtime paths", async () => {
    const config = createDefaultConfig();

    vi.mocked(requireAdminSession).mockResolvedValue({
      config,
      session: { user: { name: "owner" }, expires: "2026-03-28T00:00:00.000Z" },
    });

    const page = await SettingsPage({
      searchParams: Promise.resolve({}),
    });
    const html = renderWithProviders(page);

    expect(html).toContain("DNS_RECORDS_CARD");
    expect(html).toContain("Runtime paths");
    expect(html).toContain(config.server.previewRootDir);
  });
});
