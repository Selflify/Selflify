"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { Box, Input, Spinner, Stack, Text } from "@chakra-ui/react";

import { SiteDeployCard } from "@/components/site-deploy-card";

type DeployInventoryItem = {
  name: string;
  dir: string;
  modifiedAt: string;
  sizeLabel: string;
  url: string;
};

type DeployInventoryResponse = {
  items: DeployInventoryItem[];
  totalCount: number;
  nextOffset: number | null;
};

type SiteDeployInventoryProps = {
  siteSlug: string;
  configRevision: number;
  initialItems: DeployInventoryItem[];
  initialTotalCount: number;
  initialNextOffset: number | null;
};

const PAGE_SIZE = 20;

async function fetchDeployPage(
  siteSlug: string,
  query: string,
  offset: number,
): Promise<DeployInventoryResponse> {
  const params = new URLSearchParams({
    q: query,
    offset: String(offset),
    limit: String(PAGE_SIZE),
  });
  const response = await fetch(`/api/sites/${encodeURIComponent(siteSlug)}/deploys?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Could not load deploys.");
  }

  return (await response.json()) as DeployInventoryResponse;
}

export function SiteDeployInventory({
  siteSlug,
  configRevision,
  initialItems,
  initialTotalCount,
  initialNextOffset,
}: SiteDeployInventoryProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [items, setItems] = useState(initialItems);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);
  const didMountRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadPage = useEffectEvent(async (options: { query: string; offset: number; replace: boolean }) => {
    const requestId = ++requestIdRef.current;

    if (options.replace) {
      setLoadingSearch(true);
    } else {
      setLoadingMore(true);
    }

    setError("");

    try {
      const page = await fetchDeployPage(siteSlug, options.query, options.offset);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setItems((current) => (options.replace ? page.items : [...current, ...page.items]));
      setTotalCount(page.totalCount);
      setNextOffset(page.nextOffset);
    } catch (fetchError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      const message = fetchError instanceof Error ? fetchError.message : "Could not load deploys.";

      setError(message);

      if (options.replace) {
        setItems([]);
        setTotalCount(0);
        setNextOffset(null);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingSearch(false);
        setLoadingMore(false);
      }
    }
  });

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    void loadPage({
      query: deferredQuery,
      offset: 0,
      replace: true,
    });
  }, [deferredQuery]);

  const handleIntersect = useEffectEvent((entries: IntersectionObserverEntry[]) => {
    if (!entries[0]?.isIntersecting || nextOffset === null || loadingSearch || loadingMore || error) {
      return;
    }

    void loadPage({
      query: deferredQuery,
      offset: nextOffset,
      replace: false,
    });
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver((entries) => handleIntersect(entries), {
      rootMargin: "320px 0px",
    });

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, []);

  const hasSearch = deferredQuery.trim().length > 0;

  return (
    <Stack gap="4">
      <Box>
        <Text fontWeight="700" fontSize="2xl">
          Deploy inventory
        </Text>
        <Text color="muted" mt="2">
          Preview deploys are sorted by latest modification time.
        </Text>
      </Box>

      <Stack gap="2" maxW="26rem">
        <Input
          value={query}
          onChange={(event) => {
            startTransition(() => {
              setQuery(event.target.value);
            });
          }}
          placeholder="Search deploys by name or hostname"
          bg="rgba(255,255,255,0.04)"
        />
        <Text color="muted" fontSize="sm">
          {loadingSearch
            ? "Searching deploys..."
            : totalCount === 0
              ? hasSearch
                ? "No preview deploys match the current search."
                : "No preview deploys found yet."
              : `Loaded ${items.length} of ${totalCount} preview deploys.`}
        </Text>
      </Stack>

      {error ? (
        <Box rounded="xl" borderWidth="1px" borderColor="rgba(161,33,65,0.28)" px="4" py="4">
          <Text color="red.200" fontSize="sm">
            {error}
          </Text>
        </Box>
      ) : null}

      <Stack gap="4">
        {items.map((deploy) => (
          <SiteDeployCard
            key={deploy.name}
            siteSlug={siteSlug}
            configRevision={configRevision}
            deploy={deploy}
            title={deploy.name}
            showDelete
          />
        ))}

        {!loadingSearch && !error && items.length === 0 ? (
          <Box rounded="xl" borderWidth="1px" borderColor="rgba(255,255,255,0.08)" px="4" py="4">
            <Text fontWeight="700">{hasSearch ? "No matching deploys" : "No preview deploys found"}</Text>
            <Text color="muted" mt="2" fontSize="sm">
              {hasSearch
                ? "Try another deploy name or hostname fragment."
                : "Selflify will show preview deploys here as soon as directories appear under the site root."}
            </Text>
          </Box>
        ) : null}

        <Box ref={sentinelRef} minH="1px" />

        {loadingMore ? (
          <Stack direction="row" align="center" gap="3" py="2">
            <Spinner size="sm" color="whiteAlpha.700" />
            <Text color="muted" fontSize="sm">
              Loading more deploys...
            </Text>
          </Stack>
        ) : null}
      </Stack>
    </Stack>
  );
}
