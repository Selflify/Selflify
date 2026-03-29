import Link from "next/link";
import { Box, Button, Flex, Heading, Stack, Text } from "@chakra-ui/react";

import { ActionFeedbackToast } from "@/components/action-feedback-toast";
import { CreateSiteDialog } from "@/components/create-site-dialog";
import { SiteInventoryCardMetrics } from "@/components/site-inventory-card-metrics";
import { SitesOverviewMetrics } from "@/components/sites-overview-metrics";
import { requireAdminSession } from "@/lib/auth/guards";
import { getSiteDirectory, getStableUrl } from "@/lib/sites/service";
import { formatSiteName } from "@/lib/utils/format";

type SitesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SitesPage({ searchParams }: SitesPageProps) {
  const { config } = await requireAdminSession();
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? params.notice : "";
  const error = typeof params.error === "string" ? params.error : "";

  function formatHost(url: string) {
    return url.replace(/^https?:\/\//, "");
  }

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

      <SitesOverviewMetrics
        siteCount={config.sites.length}
        previewRootDir={config.server.previewRootDir}
      />

      <Stack gap="4">
        <Box>
          <Heading size="lg">Site inventory</Heading>
          <Text color="muted" mt="2">
            Open the site page to manage settings and deploys. Deploy counts and disk usage load progressively.
          </Text>
        </Box>

        {config.sites.length === 0 ? (
          <Box rounded="xl" borderWidth="1px" borderColor="rgba(255,255,255,0.08)" px="4" py="4">
            <Heading size="sm">No sites configured</Heading>
            <Text color="muted" mt="2" fontSize="sm">
              Create the first site to generate its stable directory, preview wildcard routing and
              placeholder build.
            </Text>
          </Box>
        ) : null}

        {config.sites.map((site) => {
          const stableUrl = getStableUrl(config, site);
          const dir = getSiteDirectory(config, site);

          return (
            <Flex
              key={site.slug}
              justify="space-between"
              align={{ base: "flex-start", md: "center" }}
              gap="4"
              wrap="wrap"
              rounded="xl"
              borderWidth="1px"
              borderColor="rgba(255,255,255,0.08)"
              bg="rgba(17,17,24,0.88)"
              px="4"
              py="4"
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
                    {formatSiteName(site.name)}
                  </Heading>
                </Link>
                <Flex mt="1" gap="2" wrap="wrap" align="center">
                  <a href={stableUrl} target="_blank" rel="noreferrer">
                    <Text
                      as="span"
                      color="whiteAlpha.700"
                      textDecoration="underline"
                      textDecorationColor="rgba(255,255,255,0.18)"
                      textUnderlineOffset="0.18em"
                      transition="color 0.2s ease"
                      _hover={{ color: "whiteAlpha.950" }}
                    >
                      {formatHost(stableUrl)}
                    </Text>
                  </a>
                  <Text color="muted" fontSize="sm">
                    · {site.mainBranch}
                  </Text>
                </Flex>
                <Text color="whiteAlpha.700" mt="2" fontSize="sm" fontFamily="mono">
                  {dir}
                </Text>
                <SiteInventoryCardMetrics siteSlug={site.slug} />
              </Box>
              <Flex gap="2" wrap="wrap">
                <a href={stableUrl} target="_blank" rel="noreferrer">
                  <Button as="span" variant="outline">
                    Open
                  </Button>
                </a>
                <Link href={`/sites/${site.slug}`}>
                  <Button as="span" bg="action.500" color="white" _hover={{ bg: "action.600" }}>
                    Manage site
                  </Button>
                </Link>
              </Flex>
            </Flex>
          );
        })}
      </Stack>
    </Stack>
  );
}
