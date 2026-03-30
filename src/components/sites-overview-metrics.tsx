"use client";

import { useEffect, useState } from "react";
import { Box, SimpleGrid, Skeleton } from "@chakra-ui/react";

import { MetricCard } from "@/components/metric-card";
import { formatBytes } from "@/lib/utils/format";

type SitesOverviewMetricsData = {
  siteCount: number;
  totalDeploys: number;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
};

type SitesOverviewMetricsProps = {
  siteCount: number;
  previewRootDir: string;
};

function MetricCardSkeleton() {
  return (
    <Box
      rounded="2xl"
      borderWidth="1px"
      borderColor="rgba(255,255,255,0.08)"
      bg="rgba(17,17,24,0.88)"
      px="5"
      py="5"
      boxShadow="panel"
      minH="11.5rem"
    >
      <Skeleton height="0.75rem" width="4rem" opacity="0.18" />
      <Box mt="3" minH="3.5rem" display="flex" alignItems="flex-end">
        <Skeleton height="2.75rem" width="6rem" opacity="0.18" />
      </Box>
      <Box mt="2" minH="2.75rem">
        <Skeleton height="1rem" width="9rem" opacity="0.14" />
      </Box>
    </Box>
  );
}

export function SitesOverviewMetrics({ siteCount, previewRootDir }: SitesOverviewMetricsProps) {
  const [data, setData] = useState<SitesOverviewMetricsData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/sites/summary", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Could not load site metrics.");
        }

        const payload = (await response.json()) as SitesOverviewMetricsData;

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
  }, []);

  if (!data && !error) {
    return (
      <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap="4">
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
      </SimpleGrid>
    );
  }

  return (
    <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap="4">
      <MetricCard label="Sites" value={String(siteCount)} hint="Configured preview groups" />
      <MetricCard
        label="Deploys"
        value={data ? String(data.totalDeploys) : "—"}
        hint={data ? "Stable + preview directories detected" : "Metrics unavailable"}
      />
      <MetricCard
        label="Used disk"
        value={data ? formatBytes(data.usedBytes) : "—"}
        hint={data ? `Available ${formatBytes(data.availableBytes)}` : "Metrics unavailable"}
      />
      <MetricCard
        label="Total disk"
        value={data ? formatBytes(data.totalBytes) : "—"}
        hint={previewRootDir}
      />
    </SimpleGrid>
  );
}
