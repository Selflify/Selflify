"use client";

import { useEffect, useState } from "react";
import { Box, Skeleton, Stack, Text } from "@chakra-ui/react";

import { SiteDeployCard } from "@/components/site-deploy-card";
import { formatSiteName } from "@/lib/utils/format";

type RecentDeployItem = {
  siteSlug: string;
  siteName: string;
  mainBranch: string;
  deploy: {
    name: string;
    dir: string;
    modifiedAt: string;
    sizeLabel: string;
    url: string;
  };
};

type RecentDeploysResponse = {
  items: RecentDeployItem[];
};

function RecentDeploysSkeleton() {
  return (
    <Stack gap="4">
      {[0, 1, 2].map((index) => (
        <Box
          key={index}
          rounded="xl"
          borderWidth="1px"
          borderColor="rgba(255,255,255,0.08)"
          bg="rgba(17,17,24,0.88)"
          px="4"
          py="4"
        >
          <Skeleton height="1.5rem" width={`${8 + index}rem`} opacity="0.18" />
          <Skeleton height="1rem" width={`${12 + index * 2}rem`} mt="3" opacity="0.14" />
          <Skeleton height="1rem" width={`${11 + index}rem`} mt="3" opacity="0.14" />
          <Skeleton height="1rem" width={`${10 + index}rem`} mt="3" opacity="0.12" />
        </Box>
      ))}
    </Stack>
  );
}

export function RecentDeploysSection() {
  const [items, setItems] = useState<RecentDeployItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/sites/recent-deploys", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Could not load recent deploys.");
        }

        const payload = (await response.json()) as RecentDeploysResponse;

        if (!cancelled) {
          setItems(payload.items);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error ? fetchError.message : "Could not load recent deploys.",
          );
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Stack gap="4">
      <Box>
        <Text fontWeight="700" fontSize="2xl">
          Last deploys
        </Text>
        <Text color="muted" mt="2">
          The five most recently changed deploy directories across all sites.
        </Text>
      </Box>

      {items === null && !error ? <RecentDeploysSkeleton /> : null}

      {error ? (
        <Box rounded="xl" borderWidth="1px" borderColor="rgba(161,33,65,0.28)" px="4" py="4">
          <Text color="red.200" fontSize="sm">
            {error}
          </Text>
        </Box>
      ) : null}

      {items?.length === 0 ? (
        <Box rounded="xl" borderWidth="1px" borderColor="rgba(255,255,255,0.08)" px="4" py="4">
          <Text fontWeight="700">No deploys found</Text>
          <Text color="muted" mt="2" fontSize="sm">
            Selflify will show the latest stable and preview directories here as soon as they
            appear under the configured site roots.
          </Text>
        </Box>
      ) : null}

      <Stack gap="4">
        {items?.map((item) => (
          <SiteDeployCard
            key={`${item.siteSlug}:${item.deploy.name}`}
            siteSlug={item.siteSlug}
            configRevision={0}
            deploy={item.deploy}
            title={item.deploy.name}
            metaText={formatSiteName(item.siteName)}
          />
        ))}
      </Stack>
    </Stack>
  );
}
