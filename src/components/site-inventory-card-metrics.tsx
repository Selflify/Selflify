"use client";

import { useEffect, useState } from "react";
import { Skeleton, Text } from "@chakra-ui/react";

type SiteInventoryCardMetricsData = {
  deployCount: number;
  totalSizeLabel: string;
};

type SiteInventoryCardMetricsProps = {
  siteSlug: string;
};

export function SiteInventoryCardMetrics({ siteSlug }: SiteInventoryCardMetricsProps) {
  const [data, setData] = useState<SiteInventoryCardMetricsData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/sites/${encodeURIComponent(siteSlug)}/summary`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Could not load site inventory metrics.");
        }

        const payload = (await response.json()) as SiteInventoryCardMetricsData;

        if (!cancelled) {
          setData(payload);
        }
      } catch {
        if (!cancelled) {
          setError(true);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [siteSlug]);

  if (!data && !error) {
    return <Skeleton mt="2" height="1rem" width="10rem" opacity="0.18" />;
  }

  return (
    <Text color="muted" mt="2" fontSize="sm">
      {data ? `${data.deployCount} deploys · ${data.totalSizeLabel}` : "Metrics unavailable"}
    </Text>
  );
}
