import Link from "next/link";
import { notFound } from "next/navigation";
import { Box, Button, Flex, Heading, Input, Stack, Text } from "@chakra-ui/react";

import { deleteDeployAction, deleteSiteAction, updateSiteAction } from "@/app/actions";
import { FlashMessage } from "@/components/flash-message";
import { FormField } from "@/components/form-field";
import { FormSubmitButton } from "@/components/form-submit-button";
import { requireAdminSession } from "@/lib/auth/guards";
import { listDeploys } from "@/lib/sites/service";
import { formatDateTime } from "@/lib/utils/format";

type SiteDetailsPageProps = {
  params: Promise<{ site: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function SectionLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link href={href}>
      <Box
        px="4"
        py="2.5"
        rounded="lg"
        borderWidth="1px"
        borderColor={active ? "brand.500" : "transparent"}
        bg={active ? "accentMuted" : "transparent"}
        transition="all 0.2s ease"
        _hover={{
          borderColor: active ? "brand.500" : "rgba(255,255,255,0.08)",
          bg: active ? "accentMuted" : "rgba(255,255,255,0.03)",
        }}
      >
        <Text fontWeight="700" whiteSpace="nowrap">
          {label}
        </Text>
      </Box>
    </Link>
  );
}

export default async function SiteDetailsPage({ params, searchParams }: SiteDetailsPageProps) {
  const { config } = await requireAdminSession();
  const { site: slug } = await params;
  const site = config.sites.find((entry) => entry.slug === slug);

  if (!site) {
    notFound();
  }

  const deploys = await listDeploys(config, site);
  const queries = await searchParams;
  const notice = typeof queries.notice === "string" ? queries.notice : "";
  const error = typeof queries.error === "string" ? queries.error : "";
  const view = queries.view === "configuration" ? "configuration" : "deploys";

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
        <Flex
          justify="space-between"
          align={{ base: "flex-start", md: "center" }}
          gap="4"
          wrap="wrap"
        >
          <Box>
            <Heading size="lg">{site.name}</Heading>
            <Text color="muted" mt="2">
              {site.slug}.{config.server.domain} · {site.mainBranch}
            </Text>
            <Text color="whiteAlpha.700" mt="2" fontSize="sm">
              {config.server.previewRootDir}/{site.slug}
            </Text>
          </Box>

          <Flex
            gap="1"
            p="1"
            rounded="xl"
            borderWidth="1px"
            borderColor="rgba(255,255,255,0.08)"
            bg="rgba(255,255,255,0.02)"
            wrap="wrap"
          >
            <SectionLink href={`/sites/${site.slug}`} label="Deploys" active={view === "deploys"} />
            <SectionLink
              href={`/sites/${site.slug}?view=configuration`}
              label="Configuration"
              active={view === "configuration"}
            />
          </Flex>
        </Flex>
      </Box>

      {view === "deploys" ? (
        <Box
          rounded="2xl"
          borderWidth="1px"
          borderColor="rgba(255,255,255,0.08)"
          bg="rgba(17,17,24,0.88)"
          p={{ base: "5", md: "6" }}
          boxShadow="panel"
        >
          <Box>
            <Heading size="lg">Deploy inventory</Heading>
            <Text color="muted" mt="2">
              Stable stays pinned on top. All preview deploys are sorted by latest modification
              time.
            </Text>
          </Box>

          <Stack gap="4" mt="6">
            {deploys.length === 0 ? (
              <Box rounded="xl" borderWidth="1px" borderColor="rgba(255,255,255,0.08)" px="4" py="4">
                <Heading size="sm">No deploy directories found</Heading>
                <Text color="muted" mt="2" fontSize="sm">
                  Selflify will show stable and preview deploys here as soon as files appear under the
                  site directory.
                </Text>
              </Box>
            ) : null}
            {deploys.map((deploy) => (
              <Flex
                key={deploy.name}
                justify="space-between"
                align={{ base: "flex-start", md: "center" }}
                gap="4"
                wrap="wrap"
                rounded="xl"
                borderWidth="1px"
                borderColor={
                  deploy.isMainBranch ? "rgba(161,33,65,0.42)" : "rgba(255,255,255,0.08)"
                }
                bg={deploy.isMainBranch ? "rgba(161,33,65,0.1)" : "transparent"}
                px="4"
                py="4"
              >
                <Box>
                  <Heading size="sm">{deploy.name}</Heading>
                  <Text color="whiteAlpha.700" mt="1">
                    {deploy.url}
                  </Text>
                  <Text color="muted" mt="2" fontSize="sm">
                    {deploy.sizeLabel} · updated {formatDateTime(deploy.modifiedAt)}
                  </Text>
                </Box>
                <Flex gap="2" wrap="wrap">
                  <a href={deploy.url} target="_blank" rel="noreferrer">
                    <Button as="span" variant="outline">
                      Open
                    </Button>
                  </a>
                  {!deploy.isMainBranch ? (
                    <form action={deleteDeployAction.bind(null, site.slug, deploy.name)}>
                      <input
                        type="hidden"
                        name="configRevision"
                        value={String(config.configRevision)}
                      />
                      <FormSubmitButton
                        colorPalette="red"
                        variant="outline"
                        pendingText="Deleting deploy"
                        confirmMessage={`Delete deploy ${deploy.name} for ${site.slug}? This action is irreversible.`}
                      >
                        Delete
                      </FormSubmitButton>
                    </form>
                  ) : null}
                </Flex>
              </Flex>
            ))}
          </Stack>
        </Box>
      ) : null}

      {view === "configuration" ? (
        <Stack gap="6">
          <Box
            rounded="2xl"
            borderWidth="1px"
            borderColor="rgba(255,255,255,0.08)"
            bg="rgba(17,17,24,0.88)"
            p={{ base: "5", md: "6" }}
            boxShadow="panel"
          >
            <Heading size="lg">Configuration</Heading>
            <Text color="muted" mt="2">
              The site directory is derived from the slug and cannot drift away from the configured
              preview root.
            </Text>

            <form action={updateSiteAction.bind(null, site.slug)}>
              <input type="hidden" name="configRevision" value={String(config.configRevision)} />
              <Stack gap="4" mt="6">
                <FormField label="Site slug" htmlFor="site-settings-slug">
                  <Input
                    id="site-settings-slug"
                    value={site.slug}
                    readOnly
                    bg="rgba(255,255,255,0.02)"
                  />
                </FormField>
                <FormField label="Display name" htmlFor="site-settings-name">
                  <Input
                    id="site-settings-name"
                    name="name"
                    defaultValue={site.name}
                    required
                    bg="rgba(255,255,255,0.04)"
                  />
                </FormField>
                <FormField label="Main branch" htmlFor="site-settings-main-branch">
                  <Input
                    id="site-settings-main-branch"
                    name="mainBranch"
                    defaultValue={site.mainBranch}
                    required
                    bg="rgba(255,255,255,0.04)"
                  />
                </FormField>
                <FormField label="Preview login" htmlFor="site-settings-preview-login">
                  <Input
                    id="site-settings-preview-login"
                    name="previewLogin"
                    defaultValue={site.previewAuth.login ?? ""}
                    placeholder="Optional"
                    bg="rgba(255,255,255,0.04)"
                  />
                </FormField>
                <FormField
                  label="Preview password"
                  htmlFor="site-settings-preview-password"
                  hint="Leave this blank to keep the existing preview password."
                >
                  <Input
                    id="site-settings-preview-password"
                    name="previewPassword"
                    type="password"
                    placeholder="Set a new preview password"
                    bg="rgba(255,255,255,0.04)"
                  />
                </FormField>
                <FormSubmitButton
                  alignSelf="flex-start"
                  bg="brand.600"
                  color="white"
                  _hover={{ bg: "brand.500" }}
                  pendingText="Saving site"
                >
                  Save site
                </FormSubmitButton>
              </Stack>
            </form>
          </Box>

          <Box
            rounded="2xl"
            borderWidth="1px"
            borderColor="rgba(161,33,65,0.28)"
            bg="rgba(161,33,65,0.08)"
            p={{ base: "5", md: "6" }}
            boxShadow="panel"
          >
            <Heading size="md">Danger zone</Heading>
            <Text color="whiteAlpha.800" mt="2">
              Deleting the site removes it from config and moves its files into orphan storage.
            </Text>

            <form action={deleteSiteAction.bind(null, site.slug)}>
              <input type="hidden" name="configRevision" value={String(config.configRevision)} />
              <FormSubmitButton
                mt="5"
                colorPalette="red"
                variant="outline"
                pendingText="Deleting site"
                confirmMessage={`Delete ${site.slug} from config and move its files to orphan storage?`}
              >
                Delete site
              </FormSubmitButton>
            </form>
          </Box>
        </Stack>
      ) : null}
    </Stack>
  );
}
