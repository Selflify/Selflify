import { afterEach, describe, expect, it, vi } from "vitest";

import {
  redirectIfAuthenticated,
  requireAdminSession,
  requireConfiguredAdmin,
} from "@/lib/auth/guards";
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

describe("auth guards", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to setup when admin is not configured", async () => {
    vi.mocked(readSelflifyConfig).mockResolvedValue(createDefaultConfig());
    vi.mocked(isAdminConfigured).mockReturnValue(false);

    await expect(requireConfiguredAdmin()).rejects.toThrow("REDIRECT:/setup");
    expect(redirectMock).toHaveBeenCalledWith("/setup");
  });

  it("returns config when admin is configured", async () => {
    const config = createDefaultConfig();
    config.admin.login = "owner";
    config.admin.passwordHash = "hashed";

    vi.mocked(readSelflifyConfig).mockResolvedValue(config);
    vi.mocked(isAdminConfigured).mockReturnValue(true);

    await expect(requireConfiguredAdmin()).resolves.toBe(config);
  });

  it("redirects to login when session is missing", async () => {
    const config = createDefaultConfig();
    config.admin.login = "owner";
    config.admin.passwordHash = "hashed";
    config.admin.configuredAt = "2026-03-28T00:00:00.000Z";

    vi.mocked(readSelflifyConfig).mockResolvedValue(config);
    vi.mocked(isAdminConfigured).mockReturnValue(true);
    vi.mocked(readOptionalSession).mockResolvedValue(null);

    await expect(requireAdminSession()).rejects.toThrow("REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("returns config and session for authenticated admins", async () => {
    const config = createDefaultConfig();
    const session = {
      user: { name: "owner", adminConfiguredAt: "2026-03-28T00:00:00.000Z" },
      expires: "2026-03-28T00:00:00.000Z",
    };
    config.admin.login = "owner";
    config.admin.passwordHash = "hashed";
    config.admin.configuredAt = "2026-03-28T00:00:00.000Z";

    vi.mocked(readSelflifyConfig).mockResolvedValue(config);
    vi.mocked(isAdminConfigured).mockReturnValue(true);
    vi.mocked(readOptionalSession).mockResolvedValue(session);

    await expect(requireAdminSession()).resolves.toEqual({ config, session });
  });

  it("redirects authenticated users away from the auth screen", async () => {
    const config = createDefaultConfig();
    config.admin.login = "owner";
    config.admin.passwordHash = "hashed";
    config.admin.configuredAt = "2026-03-28T00:00:00.000Z";

    vi.mocked(readSelflifyConfig).mockResolvedValue(config);
    vi.mocked(isAdminConfigured).mockReturnValue(true);
    vi.mocked(readOptionalSession).mockResolvedValue({
      user: { name: "owner", adminConfiguredAt: "2026-03-28T00:00:00.000Z" },
      expires: "2026-03-28T00:00:00.000Z",
    });

    await expect(redirectIfAuthenticated()).rejects.toThrow("REDIRECT:/sites");
    expect(redirectMock).toHaveBeenCalledWith("/sites");
  });

  it("returns config for guests when admin is configured", async () => {
    const config = createDefaultConfig();
    config.admin.login = "owner";
    config.admin.passwordHash = "hashed";

    vi.mocked(readSelflifyConfig).mockResolvedValue(config);
    vi.mocked(isAdminConfigured).mockReturnValue(true);
    vi.mocked(readOptionalSession).mockResolvedValue(null);

    await expect(redirectIfAuthenticated()).resolves.toBe(config);
  });

  it("treats stale admin sessions as signed out", async () => {
    const config = createDefaultConfig();
    config.admin.login = "owner";
    config.admin.passwordHash = "hashed";
    config.admin.configuredAt = "2026-03-28T00:00:00.000Z";

    vi.mocked(readSelflifyConfig).mockResolvedValue(config);
    vi.mocked(isAdminConfigured).mockReturnValue(true);
    vi.mocked(readOptionalSession).mockResolvedValue({
      user: { name: "owner", adminConfiguredAt: "2026-03-27T00:00:00.000Z" },
      expires: "2026-03-28T00:00:00.000Z",
    });

    await expect(requireAdminSession()).rejects.toThrow("REDIRECT:/login");
    await expect(redirectIfAuthenticated()).resolves.toBe(config);
  });
});
