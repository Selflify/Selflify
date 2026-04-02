import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultConfig } from "@/lib/config/service";
import { runInitialSetup } from "@/lib/use-cases/setup";

vi.mock("@/lib/config/service", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/config/service")>("@/lib/config/service");

  return {
    ...actual,
    ensureConfigOnDisk: vi.fn(),
  };
});

vi.mock("@/lib/auth/passwords", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/passwords")>("@/lib/auth/passwords");

  return {
    ...actual,
    hashAdminPassword: vi.fn(),
  };
});

vi.mock("@/lib/operations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/operations")>("@/lib/operations");

  return {
    ...actual,
    runConfigOperation: vi.fn(),
  };
});

describe("runInitialSetup", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rechecks admin configuration inside the serialized mutate step", async () => {
const { ensureConfigOnDisk } = await import("@/lib/config/service");
    const { hashAdminPassword } = await import("@/lib/auth/passwords");
    const { runConfigOperation } = await import("@/lib/operations");
    const existing = createDefaultConfig();

    vi.mocked(ensureConfigOnDisk).mockResolvedValue(existing);
    vi.mocked(hashAdminPassword).mockResolvedValue("hashed-admin-secret");
    vi.mocked(runConfigOperation).mockImplementation(async ({ mutate }) => {
      const alreadyConfigured = createDefaultConfig();
      alreadyConfigured.admin.login = "owner";
      alreadyConfigured.admin.passwordHash = "hash";

      await mutate(alreadyConfigured);
      return undefined as never;
    });

    await expect(
      runInitialSetup({
        login: "owner",
        password: "super-secret",
        domain: "example.dev",
        serverIp: "203.0.113.10",
        caddyContactEmail: "ops@example.dev",
        cloudflareApiToken: "cfut_12345678901234567890123456789012",
      }),
    ).rejects.toThrow("Admin account is already configured.");
  });
});
