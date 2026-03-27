import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from "@/app/login/page";
import { readOptionalSession } from "@/lib/auth/session";
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

vi.mock("@/components/login-form", () => ({
  LoginForm: () => <div data-testid="login-form">LOGIN_FORM</div>,
}));

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
    isAdminConfigured: vi.fn(),
  };
});

describe("login page", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to setup when admin is not configured", async () => {
    vi.mocked(readSelflifyConfig).mockResolvedValue(createDefaultConfig());
    vi.mocked(isAdminConfigured).mockReturnValue(false);

    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/setup",
    );
  });

  it("redirects authenticated users to sites", async () => {
    const config = createDefaultConfig();
    config.admin.login = "owner";
    config.admin.passwordHash = "hash";

    vi.mocked(readSelflifyConfig).mockResolvedValue(config);
    vi.mocked(isAdminConfigured).mockReturnValue(true);
    vi.mocked(readOptionalSession).mockResolvedValue({
      user: { name: "owner" },
      expires: "2026-03-28T00:00:00.000Z",
    });

    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/sites",
    );
  });

  it("renders notice, error and the login form for guests", async () => {
    const config = createDefaultConfig();
    config.admin.login = "owner";
    config.admin.passwordHash = "hash";

    vi.mocked(readSelflifyConfig).mockResolvedValue(config);
    vi.mocked(isAdminConfigured).mockReturnValue(true);
    vi.mocked(readOptionalSession).mockResolvedValue(null);

    const page = await LoginPage({
      searchParams: Promise.resolve({
        notice: "Signed out.",
        error: "Invalid credentials.",
      }),
    });
    const html = renderWithProviders(page);

    expect(html).toContain("Sign in");
    expect(html).toContain("Access the deployment control panel for sendsay.dev.");
    expect(html).toContain("Signed out.");
    expect(html).toContain("Invalid credentials.");
    expect(html).toContain("LOGIN_FORM");
  });
});
