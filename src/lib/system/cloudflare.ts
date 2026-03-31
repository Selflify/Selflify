import type { SelflifyConfig, SiteConfig } from "@/lib/config/schema";
import type { DnsGateway, ManagedDnsRecord } from "@/lib/system/ports";
import { shouldMockCloudflare } from "@/lib/system/runtime";

type CloudflareResult = {
  success?: boolean;
  ok?: boolean;
  errors?: Array<{ message?: string }>;
  result?: unknown;
};

function getCloudflareApiBaseUrl(): string {
  return process.env.SELFLIFY_CLOUDFLARE_API_BASE_URL?.trim() || "https://api.cloudflare.com/client/v4";
}

export function createDnsGateway(fetchImpl: typeof fetch = fetch): DnsGateway {
  async function callCloudflare<T>(token: string, pathname: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(`${getCloudflareApiBaseUrl()}${pathname}`, {
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

    const isSuccess = payload.success ?? payload.ok ?? false;

    if (!isSuccess) {
      const details = payload.errors
        ?.map((entry) => entry.message)
        .filter(Boolean)
        .join("; ");
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

  async function listZoneDnsRecords(
    config: SelflifyConfig,
    zoneId: string,
  ): Promise<ManagedDnsRecord[]> {
    return callCloudflare(
      config.server.cloudflareApiToken,
      `/zones/${zoneId}/dns_records?type=A&per_page=500`,
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

  async function deleteARecord(
    config: SelflifyConfig,
    zoneId: string,
    name: string,
  ): Promise<void> {
    const records = await listDnsRecords(config, zoneId, name);

    await Promise.all(
      records.map((record) =>
        callCloudflare(
          config.server.cloudflareApiToken,
          `/zones/${zoneId}/dns_records/${record.id}`,
          {
            method: "DELETE",
          },
        ),
      ),
    );
  }

  return {
    async syncSiteRecords(config, site) {
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
    },
    async deleteSiteRecords(config, site) {
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
    },
    async syncAllSiteRecords(config) {
      if (shouldMockCloudflare()) {
        return;
      }

      for (const site of config.sites) {
        await this.syncSiteRecords(config, site);
      }
    },
    async listManagedRecords(config) {
      if (shouldMockCloudflare()) {
        return [];
      }

      if (!config.server.cloudflareApiToken) {
        return [];
      }

      const zoneId = await resolveZoneId(config);
      const records = await listZoneDnsRecords(config, zoneId);
      const expectedNames = config.sites.flatMap((site) => [
        `${site.slug}.${config.server.domain}`,
        `*.${site.slug}.${config.server.domain}`,
      ]);
      const order = new Map(expectedNames.map((name, index) => [name, index]));

      return records
        .filter((record) => order.has(record.name))
        .sort((left, right) => {
          const leftIndex = order.get(left.name) ?? Number.MAX_SAFE_INTEGER;
          const rightIndex = order.get(right.name) ?? Number.MAX_SAFE_INTEGER;
          return leftIndex - rightIndex;
        });
    },
  };
}

export const dnsGateway = createDnsGateway();

export async function syncSiteDnsRecords(config: SelflifyConfig, site: SiteConfig): Promise<void> {
  await dnsGateway.syncSiteRecords(config, site);
}

export async function deleteSiteDnsRecords(config: SelflifyConfig, site: SiteConfig): Promise<void> {
  await dnsGateway.deleteSiteRecords(config, site);
}

export async function syncAllSiteDnsRecords(config: SelflifyConfig): Promise<void> {
  await dnsGateway.syncAllSiteRecords(config);
}
