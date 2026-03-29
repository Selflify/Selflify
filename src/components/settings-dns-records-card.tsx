"use client";

import { useEffect, useState } from "react";
import { Badge, Box, Skeleton, Stack, Text } from "@chakra-ui/react";

import type { SettingsDnsRecordsPayload } from "@/app/api/settings/dns-records/route";

function DnsRecordsTable({ records }: { records: SettingsDnsRecordsPayload["records"] }) {
  return (
    <Box rounded="xl" borderWidth="1px" borderColor="rgba(255,255,255,0.08)" overflowX="auto">
      <Box as="table" width="full" minW="720px" borderCollapse="collapse">
        <Box as="thead" bg="rgba(255,255,255,0.02)">
          <Box as="tr">
            <Box
              as="th"
              px="4"
              py="3"
              textAlign="left"
              fontSize="xs"
              letterSpacing="0.08em"
              textTransform="uppercase"
              color="whiteAlpha.600"
              fontWeight="600"
            >
              Host
            </Box>
            <Box
              as="th"
              px="4"
              py="3"
              textAlign="left"
              fontSize="xs"
              letterSpacing="0.08em"
              textTransform="uppercase"
              color="whiteAlpha.600"
              fontWeight="600"
            >
              Type
            </Box>
            <Box
              as="th"
              px="4"
              py="3"
              textAlign="left"
              fontSize="xs"
              letterSpacing="0.08em"
              textTransform="uppercase"
              color="whiteAlpha.600"
              fontWeight="600"
            >
              Value
            </Box>
            <Box
              as="th"
              px="4"
              py="3"
              textAlign="left"
              fontSize="xs"
              letterSpacing="0.08em"
              textTransform="uppercase"
              color="whiteAlpha.600"
              fontWeight="600"
            >
              Proxy
            </Box>
            <Box
              as="th"
              px="4"
              py="3"
              textAlign="left"
              fontSize="xs"
              letterSpacing="0.08em"
              textTransform="uppercase"
              color="whiteAlpha.600"
              fontWeight="600"
            >
              TTL
            </Box>
          </Box>
        </Box>
        <Box as="tbody">
          {records.map((record, index) => (
            <Box
              as="tr"
              key={record.id}
              borderTopWidth={index === 0 ? "0" : "1px"}
              borderColor="rgba(255,255,255,0.08)"
            >
              <Box as="td" px="4" py="3.5" fontWeight="700">
                {record.name}
              </Box>
              <Box as="td" px="4" py="3.5" verticalAlign="middle">
                <Badge variant="outline">{record.type}</Badge>
              </Box>
              <Box
                as="td"
                px="4"
                py="3.5"
                color="whiteAlpha.700"
                fontSize="sm"
                fontFamily="mono"
              >
                {record.content}
              </Box>
              <Box as="td" px="4" py="3.5" color="whiteAlpha.700" fontSize="sm">
                {record.proxied ? "Proxied" : "DNS only"}
              </Box>
              <Box as="td" px="4" py="3.5" color="whiteAlpha.700" fontSize="sm">
                {record.ttl}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function DnsRecordsSkeleton() {
  return (
    <Box rounded="xl" borderWidth="1px" borderColor="rgba(255,255,255,0.08)" overflow="hidden">
      <Box px="4" py="3" bg="rgba(255,255,255,0.02)">
        <Skeleton height="0.9rem" width="14rem" opacity="0.18" />
      </Box>
      <Stack gap="0" p="0">
        {[0, 1, 2].map((row) => (
          <Box key={row} px="4" py="3.5" borderTopWidth={row === 0 ? "0" : "1px"} borderColor="rgba(255,255,255,0.08)">
            <Skeleton height="1rem" width={`${10 + row * 3}rem`} opacity="0.16" />
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

export function SettingsDnsRecordsCard() {
  const [data, setData] = useState<SettingsDnsRecordsPayload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/settings/dns-records", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Could not load Cloudflare DNS records.");
        }

        const payload = (await response.json()) as SettingsDnsRecordsPayload;

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

  return (
    <Box
      rounded="2xl"
      borderWidth="1px"
      borderColor="rgba(255,255,255,0.08)"
      bg="rgba(17,17,24,0.88)"
      p={{ base: "5", md: "6" }}
      boxShadow="panel"
    >
      <Text fontWeight="700">Cloudflare DNS records</Text>
      <Text color="muted" mt="2" fontSize="sm">
        Read-only view of the A records Selflify manages for configured sites.
      </Text>

      <Stack gap="3" mt="4">
        {!data && !error ? <DnsRecordsSkeleton /> : null}

        {error ? (
          <Text color="red.200" fontSize="sm">
            Could not load Cloudflare DNS records.
          </Text>
        ) : null}

        {data?.message ? (
          <Text color="muted" fontSize="sm">
            {data.message}
          </Text>
        ) : null}

        {data?.error ? (
          <Text color="red.200" fontSize="sm">
            {data.error}
          </Text>
        ) : null}

        {data && !data.error && data.records.length > 0 ? <DnsRecordsTable records={data.records} /> : null}
      </Stack>
    </Box>
  );
}
