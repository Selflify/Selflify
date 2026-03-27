import { afterEach, describe, expect, it, vi } from "vitest";

import AdminLayout from "@/app/(admin)/layout";
import { requireAdminSession } from "@/lib/auth/guards";
import { createDefaultConfig } from "@/lib/config/service";
import { renderWithProviders } from "@/test/render-with-providers";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, domain }: { children: React.ReactNode; domain: string }) => (
    <div data-domain={domain}>{children}</div>
  ),
}));

vi.mock("@/components/operation-status-card", () => ({
  OperationStatusCard: () => <div>OPERATION_STATUS</div>,
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAdminSession: vi.fn(),
}));

describe("admin layout", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders shell content for authenticated admins", async () => {
    const config = createDefaultConfig();
    config.server.domain = "sendsay.dev";

    vi.mocked(requireAdminSession).mockResolvedValue({
      config,
      session: { user: { name: "owner" }, expires: "2026-03-28T00:00:00.000Z" },
    });

    const layout = await AdminLayout({
      children: <div>CHILD_CONTENT</div>,
    });
    const html = renderWithProviders(layout);

    expect(html).toContain("Selflify");
    expect(html).toContain("CHILD_CONTENT");
    expect(html).toContain("OPERATION_STATUS");
    expect(html).toContain('data-domain="sendsay.dev"');
  });
});
