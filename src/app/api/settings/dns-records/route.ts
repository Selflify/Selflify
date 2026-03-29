import { NextResponse } from "next/server";

import { readOptionalSession } from "@/lib/auth/session";
import { readSelflifyConfig } from "@/lib/config/service";
import { dnsGateway } from "@/lib/system/cloudflare";
import type { ManagedDnsRecord } from "@/lib/system/ports";
import { shouldMockCloudflare } from "@/lib/system/runtime";

export type SettingsDnsRecordsPayload = {
  records: ManagedDnsRecord[];
  message: string | null;
  error: string | null;
};

function buildExpectedDnsRecords(
  domain: string,
  serverIp: string,
  siteSlugs: string[],
): ManagedDnsRecord[] {
  return siteSlugs.flatMap((slug) => [
    {
      id: `${slug}:stable`,
      type: "A",
      name: `${slug}.${domain}`,
      content: serverIp,
      proxied: false,
      ttl: 1,
    },
    {
      id: `${slug}:wildcard`,
      type: "A",
      name: `*.${slug}.${domain}`,
      content: serverIp,
      proxied: false,
      ttl: 1,
    },
  ]);
}

export async function GET() {
  const session = await readOptionalSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const config = await readSelflifyConfig();

  if (shouldMockCloudflare()) {
    const records = buildExpectedDnsRecords(
      config.server.domain,
      config.server.serverIp,
      config.sites.map((site) => site.slug),
    );

    return NextResponse.json<SettingsDnsRecordsPayload>(
      {
        records,
        message:
          records.length > 0
            ? "Cloudflare DNS is mocked in this runtime. These are the records Selflify expects to manage."
            : "No sites are configured yet, so no managed DNS records are expected.",
        error: null,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (!config.server.cloudflareApiToken) {
    return NextResponse.json<SettingsDnsRecordsPayload>(
      {
        records: [],
        message: "Add a Cloudflare API token to load managed DNS records.",
        error: null,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const records = await dnsGateway.listManagedRecords(config);

    return NextResponse.json<SettingsDnsRecordsPayload>(
      {
        records,
        message:
          records.length === 0
            ? "No managed A records were found in Cloudflare for the current zone."
            : null,
        error: null,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json<SettingsDnsRecordsPayload>(
      {
        records: [],
        message: null,
        error:
          error instanceof Error ? error.message : "Could not load Cloudflare DNS records.",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
