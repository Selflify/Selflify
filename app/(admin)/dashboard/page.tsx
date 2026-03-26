import { Box, Flex, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react";

import { MetricCard } from "@/components/metric-card";
import { requireAdminSession } from "@/lib/auth/guards";
import { getAllSiteSummaries, getDiskUsage } from "@/lib/sites/service";
import { formatBytes } from "@/lib/utils/format";

export default async function DashboardPage() {
  const { config } = await requireAdminSession();
  const [siteSummaries, diskUsage] = await Promise.all([
    getAllSiteSummaries(config),
    getDiskUsage(config),
  ]);
  const totalDeploys = siteSummaries.reduce((count, site) => count + site.deployCount, 0);

  return (
    <Stack gap="8">
      <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap="4">
        <MetricCard label="Sites" value={String(siteSummaries.length)} hint="Configured preview groups" />
        <MetricCard label="Deploys" value={String(totalDeploys)} hint="Stable + preview directories detected" />
        <MetricCard
          label="Used disk"
          value={formatBytes(diskUsage.usedBytes)}
          hint={`Available ${formatBytes(diskUsage.availableBytes)}`}
        />
        <MetricCard label="Total disk" value={formatBytes(diskUsage.totalBytes)} hint={config.server.previewRootDir} />
      </SimpleGrid>

      <Box
        rounded="2xl"
        borderWidth="1px"
        borderColor="rgba(255,255,255,0.08)"
        bg="rgba(17,17,24,0.88)"
        p={{ base: "5", md: "6" }}
        boxShadow="panel"
      >
        <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap="4" mb="5" wrap="wrap">
          <Box>
            <Heading size="lg">Site inventory</Heading>
            <Text color="muted" mt="2">
              Disk-heavy sites appear first. Cached size values refresh automatically after changes.
            </Text>
          </Box>
        </Flex>

        <Stack gap="4">
          {siteSummaries.length === 0 ? (
            <Box rounded="xl" borderWidth="1px" borderColor="rgba(255,255,255,0.08)" px="4" py="4">
              <Heading size="sm">No sites configured</Heading>
              <Text color="muted" mt="2" fontSize="sm">
                Add the first site from the Sites page to start routing stable and preview environments through Caddy.
              </Text>
            </Box>
          ) : null}
          {siteSummaries.map((site) => (
            <Flex
              key={site.slug}
              justify="space-between"
              align={{ base: "flex-start", md: "center" }}
              gap="4"
              wrap="wrap"
              rounded="xl"
              borderWidth="1px"
              borderColor="rgba(255,255,255,0.08)"
              px="4"
              py="4"
            >
              <Box>
                <Heading size="md">{site.name}</Heading>
                <Text color="whiteAlpha.700" mt="1">
                  {site.slug}.{config.server.domain}
                </Text>
                <Text color="muted" mt="2" fontSize="sm">
                  {site.deployCount} deploys · {site.totalSizeLabel}
                </Text>
              </Box>
              <Text color="whiteAlpha.700" fontSize="sm">
                {site.dir}
              </Text>
            </Flex>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
