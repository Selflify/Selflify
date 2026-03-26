import type { SelflifyConfig, SiteConfig } from "@/lib/config/schema";
import { shouldMockCloudflare } from "@/lib/system/runtime";

type CloudflareResult = {
  ok: boolean;
  errors?: Array<{ message?: string }>;
  result?: unknown;
};

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";

async function callCloudflare<T>(
  token: string,
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${CLOUDFLARE_API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Cloudflare request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as CloudflareResult;

  if (!payload.ok) {
    const details = payload.errors?.map((entry) => entry.message).filter(Boolean).join("; ");
    throw new Error(details || "Cloudflare request failed.");
  }

  return payload.result as T;
}

async function resolveZoneId(config: SelflifyConfig): Promise<string> {
  const zones = await callCloudflare<Array<{ id: string }>>(
    config.server.cloudflareApiToken,
    `/zones?name=${encodeURIComponent(config.server.domain)}`,
  );

  if (zones.length === 0) {
    throw new Error(`Cloudflare zone for ${config.server.domain} was not found.`);
  }

  return zones[0].id;
}

async function listDnsRecords(
  config: SelflifyConfig,
  zoneId: string,
  name: string,
): Promise<Array<{ id: string; name: string; content: string }>> {
  return callCloudflare(
    config.server.cloudflareApiToken,
    `/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(name)}`,
  );
}

async function upsertARecord(
  config: SelflifyConfig,
  zoneId: string,
  name: string,
  content: string,
): Promise<void> {
  const records = await listDnsRecords(config, zoneId, name);
  const payload = JSON.stringify({
    type: "A",
    name,
    content,
    ttl: 1,
    proxied: false,
  });

  if (records.length === 0) {
    await callCloudflare(config.server.cloudflareApiToken, `/zones/${zoneId}/dns_records`, {
      method: "POST",
      body: payload,
    });
    return;
  }

  await callCloudflare(
    config.server.cloudflareApiToken,
    `/zones/${zoneId}/dns_records/${records[0].id}`,
    {
      method: "PUT",
      body: payload,
    },
  );
}

async function deleteARecord(config: SelflifyConfig, zoneId: string, name: string): Promise<void> {
  const records = await listDnsRecords(config, zoneId, name);

  await Promise.all(
    records.map((record) =>
      callCloudflare(config.server.cloudflareApiToken, `/zones/${zoneId}/dns_records/${record.id}`, {
        method: "DELETE",
      }),
    ),
  );
}

export async function syncSiteDnsRecords(config: SelflifyConfig, site: SiteConfig): Promise<void> {
  if (shouldMockCloudflare()) {
    return;
  }

  if (!config.server.cloudflareApiToken || !config.server.serverIp) {
    return;
  }

  const zoneId = await resolveZoneId(config);
  const stableHost = `${site.slug}.${config.server.domain}`;
  const wildcardHost = `*.${site.slug}.${config.server.domain}`;

  await upsertARecord(config, zoneId, stableHost, config.server.serverIp);
  await upsertARecord(config, zoneId, wildcardHost, config.server.serverIp);
}

export async function deleteSiteDnsRecords(config: SelflifyConfig, site: SiteConfig): Promise<void> {
  if (shouldMockCloudflare()) {
    return;
  }

  if (!config.server.cloudflareApiToken) {
    return;
  }

  const zoneId = await resolveZoneId(config);
  const stableHost = `${site.slug}.${config.server.domain}`;
  const wildcardHost = `*.${site.slug}.${config.server.domain}`;

  await deleteARecord(config, zoneId, stableHost);
  await deleteARecord(config, zoneId, wildcardHost);
}

export async function syncAllSiteDnsRecords(config: SelflifyConfig): Promise<void> {
  if (shouldMockCloudflare()) {
    return;
  }

  for (const site of config.sites) {
    await syncSiteDnsRecords(config, site);
  }
}
