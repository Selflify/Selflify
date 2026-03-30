"use client";

import { useEffect, useState } from "react";
import { Box, Text } from "@chakra-ui/react";

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

  const content = data ? `${data.deployCount} deploys · ${data.totalSizeLabel}` : "Metrics unavailable";

  const lineProps = {
    mt: "2",
    minH: "1.25rem",
    display: "flex",
    alignItems: "center",
  } as const;

  if (!data && !error) {
    return (
      <Box {...lineProps}>
        <Box h="1rem" w="10rem" rounded="md" bg="whiteAlpha.100" />
      </Box>
    );
  }

  return (
    <Box {...lineProps}>
      <Text color="muted" fontSize="sm">
        {content}
      </Text>
    </Box>
  );
}
