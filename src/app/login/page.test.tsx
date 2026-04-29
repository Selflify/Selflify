import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from "@/app/login/page";
import { redirectIfAuthenticated } from "@/lib/auth/guards";
import { createDefaultConfig } from "@/lib/config/service";
import { renderWithProviders } from "@/test/render-with-providers";

vi.mock("@/components/action-feedback-toast", () => ({
  ActionFeedbackToast: () => null,
}));

vi.mock("@/components/login-form", () => ({
  LoginForm: () => <div data-testid="login-form">LOGIN_FORM</div>,
}));

vi.mock("@/lib/auth/guards", () => ({
  redirectIfAuthenticated: vi.fn(),
}));

describe("login page", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to setup when admin is not configured", async () => {
    vi.mocked(redirectIfAuthenticated).mockRejectedValue(new Error("REDIRECT:/setup"));

    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/setup",
    );
  });

  it("redirects authenticated users to sites", async () => {
    vi.mocked(redirectIfAuthenticated).mockRejectedValue(new Error("REDIRECT:/sites"));

    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/sites",
    );
  });

  it("renders notice, error and the login form for guests", async () => {
    const config = createDefaultConfig();
    config.admin.login = "owner";
    config.admin.passwordHash = "hash";

    vi.mocked(redirectIfAuthenticated).mockResolvedValue(config);

    const page = await LoginPage({
      searchParams: Promise.resolve({
        notice: "Signed out.",
        error: "Invalid credentials.",
      }),
    });
    const html = renderWithProviders(page);

    expect(html).toContain("Sign in");
    expect(html).toContain(`Access the deployment control panel for ${config.server.domain}.`);
    expect(html).toContain("LOGIN_FORM");
  });

  it("renders the login form for stale sessions that should not pass admin auth", async () => {
    const config = createDefaultConfig();
    config.admin.login = "owner";
    config.admin.passwordHash = "hash";

    vi.mocked(redirectIfAuthenticated).mockResolvedValue(config);

    const page = await LoginPage({ searchParams: Promise.resolve({}) });
    const html = renderWithProviders(page);

    expect(html).toContain("Sign in");
    expect(html).toContain("LOGIN_FORM");
  });
});
