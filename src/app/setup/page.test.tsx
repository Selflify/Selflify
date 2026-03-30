import { afterEach, describe, expect, it, vi } from "vitest";

import SetupPage from "@/app/setup/page";
import { createDefaultConfig, isAdminConfigured, readSelflifyConfig } from "@/lib/config/service";
import { renderWithProviders } from "@/test/render-with-providers";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/components/action-feedback-toast", () => ({
  ActionFeedbackToast: () => null,
}));

vi.mock("@/app/actions", () => ({
  setupAction: vi.fn(),
}));

vi.mock("@/lib/config/service", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/config/service")>("@/lib/config/service");

  return {
    ...actual,
    readSelflifyConfig: vi.fn(),
    isAdminConfigured: vi.fn(),
  };
});

describe("setup page", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login when admin is already configured", async () => {
    const config = createDefaultConfig();
    config.admin.login = "owner";
    config.admin.passwordHash = "hash";

    vi.mocked(readSelflifyConfig).mockResolvedValue(config);
    vi.mocked(isAdminConfigured).mockReturnValue(true);

    await expect(SetupPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/login",
    );
  });

  it("renders the setup form when setup is pending", async () => {
    const config = createDefaultConfig();
    config.server.cloudflareApiToken = "top-secret-token";

    vi.mocked(readSelflifyConfig).mockResolvedValue(config);
    vi.mocked(isAdminConfigured).mockReturnValue(false);

    const page = await SetupPage({
      searchParams: Promise.resolve({
        error: "Setup failed.",
      }),
    });
    const html = renderWithProviders(page);

    expect(html).toContain("Step 1 of 2");
    expect(html).toContain("Create account");
    expect(html).toContain("Confirm password");
    expect(html).toContain("Continue");
    expect(html).not.toContain("top-secret-token");
  });
});
