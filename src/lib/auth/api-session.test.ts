import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { readOptionalSession } from "./session";
import { createDefaultConfig, readSelflifyConfig } from "@/lib/config/service";
import { GET as summary } from "@/app/api/sites/summary/route";
import { GET as recent } from "@/app/api/sites/recent-deploys/route";
import { GET as site } from "@/app/api/sites/[site]/summary/route";
import { GET as deploys } from "@/app/api/sites/[site]/deploys/route";
import { GET as dns } from "@/app/api/settings/dns-records/route";
vi.mock("./session", () => ({ readOptionalSession: vi.fn() }));
vi.mock("@/lib/config/service", async (original) => ({
  ...(await original<typeof import("@/lib/config/service")>()),
  readSelflifyConfig: vi.fn(),
}));
describe("read API session revocation", () => {
  it.each(["login", "password", "unconfigured"])(
    "rejects all five routes after %s changes",
    async (change) => {
      const config = createDefaultConfig();
      config.admin = { login: "owner", passwordHash: "hash", configuredAt: "new" };
      vi.mocked(readOptionalSession).mockResolvedValue({
        user: {
          name: change === "login" ? "old-owner" : "owner",
          adminConfiguredAt: change === "password" ? "old" : "new",
        },
        expires: "2099-01-01",
      });
      if (change === "unconfigured") config.admin.passwordHash = "";
      vi.mocked(readSelflifyConfig).mockResolvedValue(config);
      const responses = await Promise.all([
        summary(),
        recent(),
        dns(),
        site(new NextRequest("http://localhost/api/sites/demo/summary"), {
          params: Promise.resolve({ site: "demo" }),
        }),
        deploys(new NextRequest("http://localhost/api/sites/demo/deploys"), {
          params: Promise.resolve({ site: "demo" }),
        }),
      ]);
      expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401]);
    },
  );
});
