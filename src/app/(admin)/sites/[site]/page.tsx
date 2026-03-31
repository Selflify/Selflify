import { notFound } from "next/navigation";
import { Box, Flex, Heading, Input, Stack, Text } from "@chakra-ui/react";

import {
  deleteSiteAction,
  resetSitePreviewAccessAction,
  updateSiteAction,
  updateSiteStableAliasAction,
  updateSitePreviewAccessAction,
} from "@/app/actions";
import { ActionFeedbackToast } from "@/components/action-feedback-toast";
import { FormField } from "@/components/form-field";
import { FormSubmitButton } from "@/components/form-submit-button";
import { SiteDeployCard } from "@/components/site-deploy-card";
import { SiteDeployInventory } from "@/components/site-deploy-inventory";
import { requireAdminSession } from "@/lib/auth/guards";
import { getDeploySummary, listPreviewDeployPage } from "@/lib/sites/service";
import { formatSiteName } from "@/lib/utils/format";

type SiteDetailsPageProps = {
  params: Promise<{ site: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SiteDetailsPage({ params, searchParams }: SiteDetailsPageProps) {
  const { config } = await requireAdminSession();
  const { site: slug } = await params;
  const site = config.sites.find((entry) => entry.slug === slug) ?? notFound();

  const [stableDeploy, previewPage] = await Promise.all([
    getDeploySummary(config, site, site.mainBranch),
    listPreviewDeployPage(config, site),
  ]);
  const queries = await searchParams;
  const notice = typeof queries.notice === "string" ? queries.notice : "";
  const error = typeof queries.error === "string" ? queries.error : "";
  const view = queries.view === "configuration" ? "configuration" : "deploys";
  const siteDisplayName = formatSiteName(site.name);

  return (
    <Stack gap="8">
      <ActionFeedbackToast notice={notice} error={error} />

      {stableDeploy
        ? <SiteDeployCard
            siteSlug={site.slug}
            configRevision={config.configRevision}
            deploy={stableDeploy}
            title={siteDisplayName}
            metaText={site.mainBranch}
          />
        : null}

      {view === "deploys" ? (
        <SiteDeployInventory
          siteSlug={site.slug}
          configRevision={config.configRevision}
          initialItems={previewPage.items}
          initialTotalCount={previewPage.totalCount}
          initialNextOffset={previewPage.nextOffset}
        />
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
                <FormField
                  label="Subdomain"
                  htmlFor="site-settings-slug"
                  hint={`Full address: https://${site.slug}.${config.server.domain}`}
                >
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
                    defaultValue={siteDisplayName}
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
                <FormSubmitButton
                  alignSelf="flex-start"
                  bg="action.500"
                  color="white"
                  _hover={{ bg: "action.600" }}
                  pendingText="Saving site"
                >
                  Save
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
            <Heading size="lg">Stable alias (optional)</Heading>
            <Text color="muted" mt="2">
              Add one extra hostname that should serve the main branch only. Preview deploys stay
              on the canonical subdomain and wildcard hosts.
            </Text>

            <form action={updateSiteStableAliasAction.bind(null, site.slug)}>
              <input type="hidden" name="configRevision" value={String(config.configRevision)} />
              <Stack gap="4" mt="6">
                <FormField
                  label="Alias hostname"
                  htmlFor="site-settings-stable-alias"
                  hint="Leave this empty and save to remove the alias."
                >
                  <Input
                    id="site-settings-stable-alias"
                    name="stableAlias"
                    defaultValue={site.stableAlias ?? ""}
                    placeholder="www.example.com"
                    bg="rgba(255,255,255,0.04)"
                  />
                </FormField>
                <FormSubmitButton
                  alignSelf="flex-start"
                  bg="action.500"
                  color="white"
                  _hover={{ bg: "action.600" }}
                  pendingText="Saving alias"
                >
                  Save
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
            <Heading size="lg">Preview access (optional)</Heading>
            <Text color="muted" mt="2">
              Protect preview deploys with a shared login and password. Stable remains public.
            </Text>

            <form
              id="site-preview-access-form"
              action={updateSitePreviewAccessAction.bind(null, site.slug)}
            >
              <input type="hidden" name="configRevision" value={String(config.configRevision)} />
              <Stack gap="4" mt="6">
                <FormField label="Login" htmlFor="site-settings-preview-login">
                  <Input
                    id="site-settings-preview-login"
                    name="previewLogin"
                    defaultValue={site.previewAuth.login ?? ""}
                    placeholder="Set preview login"
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
                <FormField
                  label="Confirm password"
                  htmlFor="site-settings-preview-password-confirm"
                  hint="Repeat the new password to avoid saving a typo."
                >
                  <Input
                    id="site-settings-preview-password-confirm"
                    name="previewPasswordConfirm"
                    type="password"
                    placeholder="Repeat new preview password"
                    bg="rgba(255,255,255,0.04)"
                  />
                </FormField>
              </Stack>
            </form>

            <form
              id="site-preview-access-reset-form"
              action={resetSitePreviewAccessAction.bind(null, site.slug)}
            >
              <input type="hidden" name="configRevision" value={String(config.configRevision)} />
            </form>

            <Flex gap="3" wrap="wrap" mt="4">
              <FormSubmitButton
                form="site-preview-access-form"
                bg="action.500"
                color="white"
                _hover={{ bg: "action.600" }}
                pendingText="Saving preview access"
              >
                Save
              </FormSubmitButton>
              <FormSubmitButton
                form="site-preview-access-reset-form"
                danger
                pendingText="Resetting preview access"
                confirmMessage={`Reset preview login and password for ${site.slug}?`}
                disabled={!site.previewAuth.enabled}
              >
                Reset
              </FormSubmitButton>
            </Flex>
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
                danger
                pendingText="Deleting site"
                confirmMessage={`Delete ${site.slug} from config and move its files to orphan storage?`}
                confirmTitle="Delete site"
                confirmInputLabel={`Type "${siteDisplayName}" to confirm deletion`}
                confirmInputPlaceholder={siteDisplayName}
                confirmInputValue={siteDisplayName}
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
