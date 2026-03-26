import Link from "next/link";
import { Box, Button, Flex, Heading, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react";

import { createSiteAction } from "@/app/actions";
import { FlashMessage } from "@/components/flash-message";
import { FormSubmitButton } from "@/components/form-submit-button";
import { requireAdminSession } from "@/lib/auth/guards";
import { getAllSiteSummaries } from "@/lib/sites/service";

type SitesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SitesPage({ searchParams }: SitesPageProps) {
  const { config } = await requireAdminSession();
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? params.notice : "";
  const error = typeof params.error === "string" ? params.error : "";
  const sites = await getAllSiteSummaries(config);

  return (
    <Stack gap="8">
      {notice ? <FlashMessage kind="notice" message={notice} /> : null}
      {error ? <FlashMessage kind="error" message={error} /> : null}

      <Box
        rounded="2xl"
        borderWidth="1px"
        borderColor="rgba(255,255,255,0.08)"
        bg="rgba(17,17,24,0.88)"
        p={{ base: "5", md: "6" }}
        boxShadow="panel"
      >
        <Heading size="lg">Create a site</Heading>
        <Text color="muted" mt="2">
          New sites immediately get a stable directory, a placeholder page and wildcard routing in
          Caddy.
        </Text>

        <form action={createSiteAction}>
          <input type="hidden" name="configRevision" value={String(config.configRevision)} />
          <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} gap="4">
            <Input name="slug" placeholder="site-slug" required bg="rgba(255,255,255,0.04)" />
            <Input name="name" placeholder="Display name" required bg="rgba(255,255,255,0.04)" />
            <Input
              name="mainBranch"
              placeholder="stable"
              defaultValue="stable"
              required
              bg="rgba(255,255,255,0.04)"
            />
            <Input
              name="previewLogin"
              placeholder="Preview login (optional)"
              bg="rgba(255,255,255,0.04)"
            />
            <Input
              name="previewPassword"
              type="password"
              placeholder="Preview password (optional)"
              bg="rgba(255,255,255,0.04)"
            />
          </SimpleGrid>
          <FormSubmitButton
            mt="4"
            bg="brand.600"
            color="white"
            _hover={{ bg: "brand.500" }}
            pendingText="Creating site"
          >
            Create site
          </FormSubmitButton>
        </form>
      </Box>

      <Stack gap="4">
        {sites.length === 0 ? (
          <Box
            rounded="2xl"
            borderWidth="1px"
            borderColor="rgba(255,255,255,0.08)"
            bg="rgba(17,17,24,0.68)"
            p={{ base: "5", md: "6" }}
            boxShadow="panel"
          >
            <Heading size="md">No sites yet</Heading>
            <Text color="muted" mt="2">
              Create the first site to generate its stable directory, preview wildcard routing and
              placeholder build.
            </Text>
          </Box>
        ) : null}
        {sites.map((site) => (
          <Box
            key={site.slug}
            rounded="2xl"
            borderWidth="1px"
            borderColor="rgba(255,255,255,0.08)"
            bg="rgba(17,17,24,0.88)"
            p={{ base: "5", md: "6" }}
            boxShadow="panel"
          >
            <Flex
              justify="space-between"
              gap="4"
              wrap="wrap"
              align={{ base: "flex-start", md: "center" }}
            >
              <Box>
                <Heading size="md">{site.name}</Heading>
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
                    <Button as="span" bg="brand.600" color="white" _hover={{ bg: "brand.500" }}>
                      Manage site
                    </Button>
                  </Link>
                </Flex>
              </Stack>
            </Flex>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}
