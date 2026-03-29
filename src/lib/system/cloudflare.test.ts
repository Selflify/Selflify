import { describe, expect, it, vi } from "vitest";

import { createDefaultConfig } from "@/lib/config/service";
import { createDnsGateway } from "@/lib/system/cloudflare";

describe("createDnsGateway", () => {
  it("reads managed records from successful Cloudflare API responses", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, result: [{ id: "zone-1" }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: [
              {
                id: "dns-1",
                type: "A",
                name: "app.example.dev",
                content: "203.0.113.10",
                proxied: false,
                ttl: 1,
              },
              {
                id: "dns-2",
                type: "A",
                name: "*.app.example.dev",
                content: "203.0.113.10",
                proxied: false,
                ttl: 1,
              },
              {
                id: "dns-3",
                type: "A",
                name: "unrelated.example.dev",
                content: "203.0.113.11",
                proxied: false,
                ttl: 1,
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const config = createDefaultConfig();
    config.server.domain = "example.dev";
    config.server.cloudflareApiToken = "cf-token";
    config.server.serverIp = "203.0.113.10";
    config.sites = [
      {
        slug: "app",
        name: "App",
        mainBranch: "stable",
        previewAuth: { enabled: false, login: null, passwordHash: null },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const gateway = createDnsGateway(fetchMock);
    const records = await gateway.listManagedRecords(config);

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.name)).toEqual([
      "app.example.dev",
      "*.app.example.dev",
    ]);
  });

  it("surfaces Cloudflare API messages when the request is not successful", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ message: "Authentication error" }],
          result: null,
        }),
        { status: 200 },
      ),
    );

    const config = createDefaultConfig();
    config.server.domain = "example.dev";
    config.server.cloudflareApiToken = "bad-token";

    const gateway = createDnsGateway(fetchMock);

    await expect(gateway.listManagedRecords(config)).rejects.toThrow("Authentication error");
  });
});
