import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSiteAction,
  deleteSiteAction,
  deleteDeployAction,
  resetSitePreviewAccessAction,
  saveAdminAccessAction,
  saveCloudflareTokenAction,
  saveServerSettingsAction,
  setupAction,
  unlockSetupAccessAction,
  updateSiteAction,
  updateSiteStableAliasAction,
  updateSitePreviewAccessAction,
} from "@/app/actions";
import { requireAdminSession } from "@/lib/auth/guards";
import {
  assertSetupAccessGranted,
  clearSetupAccess,
  grantSetupAccess,
} from "@/lib/auth/setup-access";
import { runConfigOperation, runTrackedSideEffectOperation } from "@/lib/operations";
import { hashAdminPassword } from "@/lib/auth/passwords";
import { ensureConfigOnDisk, isAdminConfigured } from "@/lib/config/service";
import { createDefaultConfig } from "@/lib/config/service";
import { ensureSiteDirectories } from "@/lib/sites/service";
import { syncAllSiteDnsRecords, syncSiteDnsRecords } from "@/lib/system/cloudflare";
import * as sitesUseCases from "@/lib/use-cases/sites";

const validCloudflareToken = "cfut_12345678901234567890123456789012";

const { redirectMock, dnsGatewayMock, caddyGatewayMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  dnsGatewayMock: {
    syncAllSiteRecords: vi.fn(),
    syncSiteRecords: vi.fn(),
    deleteSiteRecords: vi.fn(),
  },
  caddyGatewayMock: {
    writeGeneratedConfig: vi.fn(),
    validateConfig: vi.fn(),
    reload: vi.fn(),
    hashPassword: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAdminSession: vi.fn(),
}));

vi.mock("@/lib/auth/setup-access", () => ({
  assertSetupAccessGranted: vi.fn(),
  clearSetupAccess: vi.fn(),
  grantSetupAccess: vi.fn(),
}));

vi.mock("@/lib/auth/passwords", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/passwords")>(
    "@/lib/auth/passwords",
  );

  return {
    ...actual,
    hashAdminPassword: vi.fn(),
  };
});

vi.mock("@/lib/config/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/service")>(
    "@/lib/config/service",
  );

  return {
    ...actual,
    ensureConfigOnDisk: vi.fn(),
    isAdminConfigured: vi.fn(),
  };
});

vi.mock("@/lib/operations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/operations")>("@/lib/operations");

  return {
    ...actual,
    runConfigOperation: vi.fn(),
    runTrackedSideEffectOperation: vi.fn(),
  };
});

vi.mock("@/lib/sites/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sites/service")>(
    "@/lib/sites/service",
  );

  return {
    ...actual,
    ensureSiteDirectories: vi.fn(),
  };
});

vi.mock("@/lib/system/cloudflare", async () => {
  const actual = await vi.importActual<typeof import("@/lib/system/cloudflare")>(
    "@/lib/system/cloudflare",
  );

  return {
    ...actual,
    dnsGateway: dnsGatewayMock,
    syncAllSiteDnsRecords: dnsGatewayMock.syncAllSiteRecords,
    syncSiteDnsRecords: dnsGatewayMock.syncSiteRecords,
    deleteSiteDnsRecords: dnsGatewayMock.deleteSiteRecords,
  };
});

vi.mock("@/lib/system/caddy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/system/caddy")>(
    "@/lib/system/caddy",
  );

  return {
    ...actual,
    caddyGateway: caddyGatewayMock,
    hashPasswordWithCaddy: caddyGatewayMock.hashPassword,
  };
});

describe("server actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("stores the first admin account during setup", async () => {
    const config = createDefaultConfig();

    vi.mocked(ensureConfigOnDisk).mockResolvedValue(config);
    vi.mocked(isAdminConfigured).mockReturnValue(false);
    vi.mocked(hashAdminPassword).mockResolvedValue("hashed-admin-secret");
    vi.mocked(assertSetupAccessGranted).mockResolvedValue(undefined);
    vi.mocked(clearSetupAccess).mockResolvedValue(undefined);
    vi.mocked(runConfigOperation).mockImplementation(async ({ mutate }) => {
      await mutate(createDefaultConfig());
      return undefined as never;
    });

    const formData = new FormData();
    formData.set("login", "owner");
    formData.set("password", "super-secret");
    formData.set("passwordConfirm", "super-secret");
    formData.set("domain", "example.com");
    formData.set("serverIp", "203.0.113.10");
    formData.set("caddyContactEmail", "ops@example.com");
    formData.set("cloudflareApiToken", validCloudflareToken);

    await setupAction(formData);

    expect(hashAdminPassword).toHaveBeenCalledWith("super-secret");
    expect(assertSetupAccessGranted).toHaveBeenCalledTimes(1);
    expect(clearSetupAccess).toHaveBeenCalledTimes(1);
    expect(runConfigOperation).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith(
      "/login?notice=Admin+account+created.+Sign+in+to+continue.",
    );
  });

  it("redirects setup back with an error when admin already exists", async () => {
    const config = createDefaultConfig();
    config.admin.login = "owner";
    config.admin.passwordHash = "hash";

    vi.mocked(ensureConfigOnDisk).mockResolvedValue(config);
    vi.mocked(isAdminConfigured).mockReturnValue(true);
    vi.mocked(assertSetupAccessGranted).mockResolvedValue(undefined);

    const formData = new FormData();
    formData.set("login", "owner");
    formData.set("password", "super-secret");
    formData.set("passwordConfirm", "super-secret");
    formData.set("domain", "example.com");
    formData.set("serverIp", "203.0.113.10");
    formData.set("caddyContactEmail", "ops@example.com");
    formData.set("cloudflareApiToken", validCloudflareToken);

    await setupAction(formData);

    expect(redirectMock).toHaveBeenCalledWith(
      "/setup?error=Admin+account+is+already+configured.",
    );
  });

  it("rejects mismatched setup password confirmation", async () => {
    vi.mocked(ensureConfigOnDisk).mockResolvedValue(createDefaultConfig());
    vi.mocked(isAdminConfigured).mockReturnValue(false);
    vi.mocked(assertSetupAccessGranted).mockResolvedValue(undefined);

    const formData = new FormData();
    formData.set("login", "owner");
    formData.set("password", "super-secret");
    formData.set("passwordConfirm", "different-secret");
    formData.set("domain", "example.com");
    formData.set("serverIp", "203.0.113.10");
    formData.set("caddyContactEmail", "ops@example.com");
    formData.set("cloudflareApiToken", validCloudflareToken);

    await setupAction(formData);

    const target = redirectMock.mock.calls.at(-1)?.[0] as string;
    const error = new URL(target, "http://selflify.test").searchParams.get("error");

    expect(target).toContain("/setup?error=");
    expect(error).toContain("Password confirmation does not match the new password.");
  });

  it("rejects invalid cloudflare token formats during setup before runtime apply", async () => {
    vi.mocked(ensureConfigOnDisk).mockResolvedValue(createDefaultConfig());
    vi.mocked(isAdminConfigured).mockReturnValue(false);
    vi.mocked(assertSetupAccessGranted).mockResolvedValue(undefined);

    const formData = new FormData();
    formData.set("login", "owner");
    formData.set("password", "super-secret");
    formData.set("passwordConfirm", "super-secret");
    formData.set("domain", "example.com");
    formData.set("serverIp", "203.0.113.10");
    formData.set("caddyContactEmail", "ops@example.com");
    formData.set("cloudflareApiToken", "123123");

    await setupAction(formData);

    const target = redirectMock.mock.calls.at(-1)?.[0] as string;
    const error = new URL(target, "http://selflify.test").searchParams.get("error");

    expect(runConfigOperation).not.toHaveBeenCalled();
    expect(target).toContain("/setup?error=");
    expect(error).toContain("Cloudflare API token looks invalid.");
  });

  it("blocks setup when first-launch access has not been unlocked", async () => {
    vi.mocked(assertSetupAccessGranted).mockRejectedValue(
      new Error("Enter the setup token from the server environment to continue."),
    );

    const formData = new FormData();
    formData.set("login", "owner");
    formData.set("password", "super-secret");
    formData.set("passwordConfirm", "super-secret");
    formData.set("domain", "example.com");
    formData.set("serverIp", "203.0.113.10");
    formData.set("caddyContactEmail", "ops@example.com");
    formData.set("cloudflareApiToken", validCloudflareToken);

    await setupAction(formData);

    expect(runConfigOperation).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith(
      "/setup?error=Enter+the+setup+token+from+the+server+environment+to+continue.",
    );
  });

  it("unlocks setup when the correct setup token is submitted", async () => {
    vi.mocked(grantSetupAccess).mockResolvedValue(undefined);

    const formData = new FormData();
    formData.set("setupToken", "setup-token");

    await unlockSetupAccessAction(formData);

    expect(grantSetupAccess).toHaveBeenCalledWith("setup-token");
    expect(redirectMock).toHaveBeenCalledWith("/setup");
  });

  it("redirects setup access unlock back with an error for invalid tokens", async () => {
    vi.mocked(grantSetupAccess).mockRejectedValue(new Error("Setup token is invalid."));

    const formData = new FormData();
    formData.set("setupToken", "wrong-token");

    await unlockSetupAccessAction(formData);

    expect(redirectMock).toHaveBeenCalledWith("/setup?error=Setup+token+is+invalid.");
  });

  it("rejects mismatched admin password confirmation", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({
      config: { configRevision: 1 },
      session: { user: { name: "owner" } },
    } as never);

    const formData = new FormData();
    formData.set("configRevision", "1");
    formData.set("adminLogin", "owner");
    formData.set("adminPassword", "new-secret");
    formData.set("adminPasswordConfirm", "different-secret");

    await saveAdminAccessAction(formData);
    expect(runConfigOperation).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock.mock.calls[0]?.[0]).toContain("/settings?error=");

    const target = redirectMock.mock.calls[0]?.[0] as string;
    const error = new URL(target, "http://selflify.test").searchParams.get("error");

    expect(error).toContain("Password confirmation does not match the new password.");
    expect(error).toContain("adminPasswordConfirm");
  });

  it("applies infrastructure settings and resyncs DNS", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({
      config: { configRevision: 3 },
      session: { user: { name: "owner" } },
    } as never);
    vi.mocked(runConfigOperation).mockImplementation(async ({ mutate, afterApply }) => {
      const config = createDefaultConfig();
      const outcome = await mutate(config);

      await afterApply?.(outcome.config);
      return undefined as never;
    });

    const formData = new FormData();
    formData.set("configRevision", "3");
    formData.set("domain", "example.com");
    formData.set("serverIp", "203.0.113.10");
    formData.set("caddyContactEmail", "ops@example.com");

    await saveServerSettingsAction(formData);

    expect(syncAllSiteDnsRecords).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith(
      "/settings?notice=Infrastructure+settings+applied.",
    );
  });

  it("does not convert redirect control flow into an error toast during infrastructure save", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({
      config: { configRevision: 3 },
      session: { user: { name: "owner" } },
    } as never);
    vi.mocked(runConfigOperation).mockResolvedValue(undefined as never);

    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/settings?notice=Infrastructure+settings+applied.;307;",
    });

    vi.mocked(redirectMock).mockImplementationOnce(() => {
      throw redirectError;
    });

    const formData = new FormData();
    formData.set("configRevision", "3");
    formData.set("domain", "example.com");
    formData.set("serverIp", "203.0.113.10");
    formData.set("caddyContactEmail", "ops@example.com");

    await expect(saveServerSettingsAction(formData)).rejects.toBe(redirectError);
    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/settings?notice=Infrastructure+settings+applied.");
  });

  it("rejects empty infrastructure values in settings", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({
      config: { configRevision: 3 },
      session: { user: { name: "owner" } },
    } as never);

    const formData = new FormData();
    formData.set("configRevision", "3");
    formData.set("domain", "example.com");
    formData.set("serverIp", "");
    formData.set("caddyContactEmail", "ops@example.com");

    await saveServerSettingsAction(formData);

    const target = redirectMock.mock.calls.at(-1)?.[0] as string;
    const error = new URL(target, "http://selflify.test").searchParams.get("error");

    expect(runConfigOperation).not.toHaveBeenCalled();
    expect(target).toContain("/settings?error=");
    expect(error).toContain("Enter the server IP address.");
  });

  it("saves a cloudflare token without syncing DNS records", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({
      config: { configRevision: 5 },
      session: { user: { name: "owner" } },
    } as never);
    vi.mocked(runConfigOperation).mockImplementation(async ({ mutate, afterApply }) => {
      const config = createDefaultConfig();
      const outcome = await mutate(config);

      await afterApply?.(outcome.config);
      return undefined as never;
    });

    const formData = new FormData();
    formData.set("configRevision", "5");
    formData.set("cloudflareApiToken", validCloudflareToken);

    await saveCloudflareTokenAction(formData);

    expect(syncAllSiteDnsRecords).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith("/settings?notice=Cloudflare+token+saved.");
  });

  it("rejects empty cloudflare tokens in settings", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({
      config: { configRevision: 5 },
      session: { user: { name: "owner" } },
    } as never);

    const formData = new FormData();
    formData.set("configRevision", "5");
    formData.set("cloudflareApiToken", "");

    await saveCloudflareTokenAction(formData);

    const target = redirectMock.mock.calls.at(-1)?.[0] as string;
    const error = new URL(target, "http://selflify.test").searchParams.get("error");

    expect(runConfigOperation).not.toHaveBeenCalled();
    expect(target).toContain("/settings?error=");
    expect(error).toContain("Paste a Cloudflare API token.");
  });

  it("rejects invalid cloudflare token formats before caddy validation runs", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({
      config: { configRevision: 5 },
      session: { user: { name: "owner" } },
    } as never);

    const formData = new FormData();
    formData.set("configRevision", "5");
    formData.set("cloudflareApiToken", "123123");

    await saveCloudflareTokenAction(formData);

    const target = redirectMock.mock.calls.at(-1)?.[0] as string;
    const error = new URL(target, "http://selflify.test").searchParams.get("error");

    expect(runConfigOperation).not.toHaveBeenCalled();
    expect(target).toContain("/settings?error=");
    expect(error).toContain("Cloudflare API token looks invalid.");
  });

  it("creates a site and keeps side effects in the success path", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({
      config: { configRevision: 2 },
      session: { user: { name: "owner" } },
    } as never);
    vi.mocked(runConfigOperation).mockImplementation(
      async ({ mutate, beforePersist, afterApply, expectedRevision }) => {
        expect(expectedRevision).toBe(2);

        const config = createDefaultConfig();
        const outcome = await mutate(config);
        expect(outcome.config.sites.at(-1)?.name).toBe("App");

        await beforePersist?.(outcome.config);
        await afterApply?.(outcome.config);
        return undefined as never;
      },
    );

    const formData = new FormData();
    formData.set("configRevision", "2");
    formData.set("slug", "app");
    formData.set("name", "app");
    formData.set("mainBranch", "stable");

    await createSiteAction(formData);

    expect(caddyGatewayMock.hashPassword).not.toHaveBeenCalled();
    expect(ensureSiteDirectories).toHaveBeenCalledTimes(1);
    expect(syncSiteDnsRecords).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/sites?notice=Site+app+created.");
  });

  it("keeps the configuration tab on successful site updates", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({
      config: { configRevision: 2 },
      session: { user: { name: "owner" } },
    } as never);
    vi.mocked(runConfigOperation).mockImplementation(async ({ mutate }) => {
      const config = createDefaultConfig();
      config.sites = [
        {
          slug: "app",
          name: "app",
          mainBranch: "stable",
          stableAlias: null,
          stableAliasAutoTls: false,
          previewAuth: {
            enabled: false,
            login: null,
            passwordHash: null,
          },
          createdAt: "2026-03-27T09:00:00.000Z",
          updatedAt: "2026-03-27T09:00:00.000Z",
        },
      ];

      const outcome = await mutate(config);
      expect(outcome.config.sites[0]?.name).toBe("App");

      return undefined as never;
    });

    const formData = new FormData();
    formData.set("configRevision", "2");
    formData.set("name", "app");
    formData.set("mainBranch", "stable");

    await updateSiteAction("app", formData);

    expect(redirectMock).toHaveBeenCalledWith(
      "/sites/app?view=configuration&notice=Updated+app.",
    );
  });

  it("deletes a site with optional cleanup flags", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({
      config: { configRevision: 7 },
      session: { user: { name: "owner" } },
    } as never);
    const deleteSiteSpy = vi.spyOn(sitesUseCases, "deleteSite").mockResolvedValue();

    const formData = new FormData();
    formData.set("configRevision", "7");
    formData.set("removeFilesFromServer", "1");
    formData.set("removeDnsRecords", "0");

    await deleteSiteAction("app", formData);

    expect(deleteSiteSpy).toHaveBeenCalledWith(
      "app",
      {
        removeFilesFromServer: true,
        removeDnsRecords: false,
      },
      7,
    );
    expect(redirectMock).toHaveBeenCalledWith(
      "/sites?notice=Site+app+removed+from+configuration.",
    );
  });

  it("saves a stable alias and keeps the configuration tab selected", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({
      config: { configRevision: 2 },
      session: { user: { name: "owner" } },
    } as never);
    vi.mocked(runConfigOperation).mockImplementation(async ({ mutate }) => {
      const config = createDefaultConfig();
      config.sites = [
        {
          slug: "app",
          name: "app",
          mainBranch: "stable",
          stableAlias: null,
          stableAliasAutoTls: false,
          previewAuth: {
            enabled: false,
            login: null,
            passwordHash: null,
          },
          createdAt: "2026-03-27T09:00:00.000Z",
          updatedAt: "2026-03-27T09:00:00.000Z",
        },
      ];

      const outcome = await mutate(config);
      expect(outcome.config.sites[0]?.stableAlias).toBe("www.example.com");
      expect(outcome.config.sites[0]?.stableAliasAutoTls).toBe(true);

      return undefined as never;
    });

    const formData = new FormData();
    formData.set("configRevision", "2");
    formData.set("stableAlias", "WWW.EXAMPLE.COM");
    formData.set("stableAliasAutoTls", "1");

    await updateSiteStableAliasAction("app", formData);

    expect(redirectMock).toHaveBeenCalledWith(
      "/sites/app?view=configuration&notice=Stable+alias+saved+for+app.",
    );
  });

  it("removes a stable alias when the value is saved empty", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({
      config: { configRevision: 2 },
      session: { user: { name: "owner" } },
    } as never);
    vi.mocked(runConfigOperation).mockResolvedValue(undefined as never);

    const formData = new FormData();
    formData.set("configRevision", "2");
    formData.set("stableAlias", "");
    formData.set("stableAliasAutoTls", "1");

    await updateSiteStableAliasAction("app", formData);

    expect(redirectMock).toHaveBeenCalledWith(
      "/sites/app?view=configuration&notice=Stable+alias+removed+for+app.",
    );
  });

  it("rejects mismatched preview password confirmation", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({
      config: { configRevision: 2 },
      session: { user: { name: "owner" } },
    } as never);

    const formData = new FormData();
    formData.set("configRevision", "2");
    formData.set("previewLogin", "preview-user");
    formData.set("previewPassword", "preview-secret");
    formData.set("previewPasswordConfirm", "different-secret");

    await updateSitePreviewAccessAction("app", formData);

    expect(runConfigOperation).not.toHaveBeenCalled();

    const target = redirectMock.mock.calls.at(-1)?.[0] as string;
    const error = new URL(target, "http://selflify.test").searchParams.get("error");

    expect(target).toContain("/sites/app?view=configuration&error=");
    expect(error).toContain("Password confirmation does not match the new password.");
    expect(error).toContain("previewPasswordConfirm");
  });

  it("resets preview access and keeps the configuration tab selected", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({
      config: { configRevision: 6 },
      session: { user: { name: "owner" } },
    } as never);
    vi.mocked(runConfigOperation).mockResolvedValue(undefined as never);

    const formData = new FormData();
    formData.set("configRevision", "6");

    await resetSitePreviewAccessAction("app", formData);

    expect(redirectMock).toHaveBeenCalledWith(
      "/sites/app?view=configuration&notice=Preview+access+reset+for+app.",
    );
  });

  it("redirects back to the site after deleting a deploy", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({
      config: { configRevision: 9 },
      session: { user: { name: "owner" } },
    } as never);
    vi.mocked(runTrackedSideEffectOperation).mockResolvedValue(undefined as never);

    const formData = new FormData();
    formData.set("configRevision", "9");

    await deleteDeployAction("app", "pr-42", formData);

    expect(runTrackedSideEffectOperation).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/sites/app?notice=Deploy+pr-42+deleted.");
  });
});
