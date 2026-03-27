import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { readOptionalSession } from "@/lib/auth/session";
import { createDefaultConfig, isAdminConfigured, readSelflifyConfig } from "@/lib/config/service";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
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

describe("home page", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to setup when admin is not configured", async () => {
    vi.mocked(readSelflifyConfig).mockResolvedValue(createDefaultConfig());
    vi.mocked(isAdminConfigured).mockReturnValue(false);

    await expect(HomePage()).rejects.toThrow("REDIRECT:/setup");
  });

  it("redirects authenticated admins to sites", async () => {
    const config = createDefaultConfig();
    config.admin.login = "owner";
    config.admin.passwordHash = "hash";

    vi.mocked(readSelflifyConfig).mockResolvedValue(config);
    vi.mocked(isAdminConfigured).mockReturnValue(true);
    vi.mocked(readOptionalSession).mockResolvedValue({
      user: { name: "owner" },
      expires: "2026-03-28T00:00:00.000Z",
    });

    await expect(HomePage()).rejects.toThrow("REDIRECT:/sites");
  });

  it("redirects guests to login when setup is complete", async () => {
    const config = createDefaultConfig();
    config.admin.login = "owner";
    config.admin.passwordHash = "hash";

    vi.mocked(readSelflifyConfig).mockResolvedValue(config);
    vi.mocked(isAdminConfigured).mockReturnValue(true);
    vi.mocked(readOptionalSession).mockResolvedValue(null);

    await expect(HomePage()).rejects.toThrow("REDIRECT:/login");
  });
});
