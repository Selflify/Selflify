import Link from "next/link";
import { Box, Button, Flex, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react";

import { ActionFeedbackToast } from "@/components/action-feedback-toast";
import { CreateSiteDialog } from "@/components/create-site-dialog";
import { MetricCard } from "@/components/metric-card";
import { requireAdminSession } from "@/lib/auth/guards";
import { getAllSiteSummaries, getDiskUsage } from "@/lib/sites/service";
import { formatBytes } from "@/lib/utils/format";

type SitesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SitesPage({ searchParams }: SitesPageProps) {
  const { config } = await requireAdminSession();
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? params.notice : "";
  const error = typeof params.error === "string" ? params.error : "";
  const [sites, diskUsage] = await Promise.all([getAllSiteSummaries(config), getDiskUsage(config)]);
  const totalDeploys = sites.reduce((count, site) => count + site.deployCount, 0);

  return (
    <Stack gap="8">
      <ActionFeedbackToast notice={notice} error={error} />

      <Flex
        justify="space-between"
        align={{ base: "flex-start", md: "center" }}
        gap="4"
        wrap="wrap"
      >
        <Box>
          <Heading size="xl">Sites</Heading>
          <Text color="muted" mt="2">
            All site routing, preview auth and deploy inventory live here now.
          </Text>
        </Box>
        <CreateSiteDialog configRevision={config.configRevision} domain={config.server.domain} />
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap="4">
        <MetricCard label="Sites" value={String(sites.length)} hint="Configured preview groups" />
        <MetricCard
          label="Deploys"
          value={String(totalDeploys)}
          hint="Stable + preview directories detected"
        />
        <MetricCard
          label="Used disk"
          value={formatBytes(diskUsage.usedBytes)}
          hint={`Available ${formatBytes(diskUsage.availableBytes)}`}
        />
        <MetricCard
          label="Total disk"
          value={formatBytes(diskUsage.totalBytes)}
          hint={config.server.previewRootDir}
        />
      </SimpleGrid>

      <Box
        rounded="2xl"
        borderWidth="1px"
        borderColor="rgba(255,255,255,0.08)"
        bg="rgba(17,17,24,0.88)"
        p={{ base: "5", md: "6" }}
        boxShadow="panel"
      >
        <Flex
          justify="space-between"
          align={{ base: "flex-start", md: "center" }}
          gap="4"
          mb="5"
          wrap="wrap"
        >
          <Box>
            <Heading size="lg">Site inventory</Heading>
            <Text color="muted" mt="2">
              Disk-heavy sites appear first. Open the site page to manage settings and deploys.
            </Text>
          </Box>
        </Flex>

        <Stack gap="4">
          {sites.length === 0 ? (
            <Box rounded="xl" borderWidth="1px" borderColor="rgba(255,255,255,0.08)" px="4" py="4">
              <Heading size="sm">No sites configured</Heading>
              <Text color="muted" mt="2" fontSize="sm">
                Create the first site to generate its stable directory, preview wildcard routing and
                placeholder build.
              </Text>
            </Box>
          ) : null}
          {sites.map((site) => (
            <Box
              key={site.slug}
              rounded="xl"
              borderWidth="1px"
              borderColor="rgba(255,255,255,0.08)"
              px="4"
              py="4"
            >
              <Flex
                justify="space-between"
                gap="4"
                wrap="wrap"
                align={{ base: "flex-start", md: "center" }}
              >
                <Box>
                  <Link href={`/sites/${site.slug}`}>
                    <Heading
                      as="span"
                      size="md"
                      display="inline-block"
                      transition="color 0.2s ease"
                      _hover={{ color: "brand.300" }}
                    >
                      {site.name}
                    </Heading>
                  </Link>
                  <Text color="muted" mt="1">
                    {site.slug}.{config.server.domain} · {site.mainBranch}
                  </Text>
                  <Text color="whiteAlpha.700" mt="2" fontSize="sm">
                    {site.dir}
                  </Text>
                </Box>
                <Stack gap="2" align={{ base: "stretch", md: "flex-end" }}>
                  <Text color="whiteAlpha.800" fontSize="sm">
                    {site.deployCount} deploys · {site.totalSizeLabel}
                  </Text>
                  <Flex gap="2" wrap="wrap">
                    <Link href={site.stableUrl} target="_blank" rel="noreferrer">
                      <Button as="span" variant="outline">
                        Open stable
                      </Button>
                    </Link>
                    <Link href={`/sites/${site.slug}`}>
                      <Button as="span" bg="action.500" color="white" _hover={{ bg: "action.600" }}>
                        Manage site
                      </Button>
                    </Link>
                  </Flex>
                </Stack>
              </Flex>
            </Box>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
