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
        <Heading size="lg">Site settings</Heading>
        <Text color="muted" mt="2">
          The site directory is derived from the slug and cannot drift away from the configured
          preview root.
        </Text>

        <form action={updateSiteAction.bind(null, site.slug)}>
          <input type="hidden" name="configRevision" value={String(config.configRevision)} />
          <Stack gap="4">
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
            <Heading size="lg">Deploy inventory</Heading>
            <Text color="muted" mt="2">
              Stable stays pinned on top. All preview deploys are sorted by latest modification
              time.
            </Text>
          </Box>
          <form action={deleteSiteAction.bind(null, site.slug)}>
            <input type="hidden" name="configRevision" value={String(config.configRevision)} />
            <FormSubmitButton
              colorPalette="red"
              variant="outline"
              pendingText="Deleting site"
              confirmMessage={`Delete ${site.slug} from config and move its files to orphan storage?`}
            >
              Delete site
            </FormSubmitButton>
          </form>
        </Flex>

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
              borderColor={deploy.isMainBranch ? "rgba(161,33,65,0.42)" : "rgba(255,255,255,0.08)"}
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
    </Stack>
  );
}
