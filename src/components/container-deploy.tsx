import { Box, Heading, Input, Stack, Text } from "@chakra-ui/react";

import { publishContainerAction, saveContainerAction } from "@/app/container-actions";
import { ContainerEnvironment, type EnvironmentEntry } from "@/components/container-environment";
import { FormField } from "@/components/form-field";
import { FormSubmitButton } from "@/components/form-submit-button";
import type { SiteConfig } from "@/lib/config/schema";
import { containerRunnerEnabled } from "@/lib/containers/client";

type Props = {
  site: SiteConfig;
  revision: number;
};

const panel = {
  rounded: "2xl",
  borderWidth: "1px",
  borderColor: "whiteAlpha.200",
  bg: "rgba(17,17,24,0.88)",
  p: { base: "5", md: "6" },
};

export function ContainerSettings({
  site,
  revision,
  secrets,
}: Props & { secrets: { registry: boolean; environment: EnvironmentEntry[] } | null }) {
  const container = site.container;
  const enabled = containerRunnerEnabled();
  if (!enabled && !container) return null;

  return (
    <Box {...panel}>
      <Heading size="lg">Container</Heading>
      <Text color="muted" mt="2">
        Serve the stable domain from an image. Preview deploys use static builds.
      </Text>
      {!enabled ? (
        <Text mt="3">Enable the container runner to edit these settings.</Text>
      ) : (
        <form className="form-layout" action={saveContainerAction.bind(null, site.slug)}>
          <input type="hidden" name="configRevision" value={revision} />
          <Stack gap="4" mt="5">
            <FormField label="Image repository" htmlFor="container-repository">
              <Input
                id="container-repository"
                name="repository"
                defaultValue={container?.repository}
                placeholder="registry.example.com/account/storybook"
                required
                maxLength={255}
              />
            </FormField>
            <FormField label="Internal HTTP port" htmlFor="container-port">
              <Input
                id="container-port"
                name="port"
                type="number"
                min="1"
                max="65535"
                defaultValue={container?.port ?? 3000}
                required
              />
            </FormField>
            <FormField label="Health check path" htmlFor="container-health">
              <Input
                id="container-health"
                name="healthPath"
                defaultValue={container?.healthPath ?? "/healthz"}
                required
              />
            </FormField>
            <details>
              <summary>Registry access {secrets?.registry ? "· Configured" : ""}</summary>
              <Stack gap="3" mt="3">
                <FormField label="Registry username" htmlFor="container-registry-user">
                  <Input id="container-registry-user" name="registryUsername" autoComplete="off" />
                </FormField>
                <FormField
                  label="Registry password or token"
                  htmlFor="container-registry-password"
                  hint="Leave both fields empty to keep the credentials for this registry."
                >
                  <Input
                    id="container-registry-password"
                    name="registryPassword"
                    type="password"
                    autoComplete="new-password"
                  />
                </FormField>
                {secrets?.registry ? (
                  <label>
                    <input type="checkbox" name="clearRegistry" /> Remove registry credentials
                  </label>
                ) : null}
              </Stack>
            </details>
            {secrets ? (
              <ContainerEnvironment
                key={`${site.slug}:${site.container?.secretsId ?? ""}`}
                entries={secrets.environment}
              />
            ) : null}
            {!secrets ? <Text role="alert">Stored secrets could not be read.</Text> : null}
            <FormSubmitButton
              alignSelf="flex-start"
              bg="action.500"
              color="white"
              pendingText="Saving"
            >
              Save container settings
            </FormSubmitButton>
          </Stack>
        </form>
      )}
    </Box>
  );
}

export function ContainerDeploy({ site, revision, url }: Props & { url: string }) {
  const container = site.container;
  if (!container) return null;
  const enabled = containerRunnerEnabled();
  return (
    <Box {...panel}>
      <Stack gap="4">
        <Heading size="lg">Stable container</Heading>
        <Text asChild textDecoration="underline">
          <a href={url} target="_blank" rel="noreferrer">
            {url}
          </a>
        </Text>
        {container.active ? (
          <Box>
            <Text fontWeight="bold">Current release</Text>
            <Text fontFamily="mono" overflowWrap="anywhere">
              {container.active.image}
            </Text>
            <Text color="muted">Published {container.active.publishedAt.slice(0, 10)}</Text>
            {enabled ? (
              <Text asChild textDecoration="underline">
                <a href={`/api/sites/${site.slug}/container-logs`} target="_blank" rel="noreferrer">
                  View container logs
                </a>
              </Text>
            ) : null}
          </Box>
        ) : (
          <Text color="muted">
            Publish the first image to switch the stable domain to the container.
          </Text>
        )}
        {container.previous ? (
          <Stack gap="2">
            <Text fontWeight="bold">Previous release</Text>
            <Text fontFamily="mono" overflowWrap="anywhere">
              {container.previous.image}
            </Text>
            <form
              className="form-layout"
              action={publishContainerAction.bind(null, site.slug, true)}
            >
              <input type="hidden" name="configRevision" value={revision} />
              <FormSubmitButton
                variant="outline"
                disabled={!enabled}
                pendingText="Checking previous release"
                confirmMessage="Restore the previous container release on the stable domain?"
              >
                Rollback
              </FormSubmitButton>
            </form>
          </Stack>
        ) : null}
        {enabled ? (
          <form
            className="form-layout"
            action={publishContainerAction.bind(null, site.slug, false)}
          >
            <input type="hidden" name="configRevision" value={revision} />
            <Stack gap="3">
              <FormField
                label="Image digest reference"
                htmlFor="container-image"
                hint={`Use an image from ${container.repository} pinned by digest.`}
              >
                <Input
                  id="container-image"
                  name="image"
                  placeholder={`${container.repository}@sha256:…`}
                  required
                  maxLength={327}
                />
              </FormField>
              <FormSubmitButton
                alignSelf="flex-start"
                bg="action.500"
                color="white"
                pendingText="Preparing container"
              >
                Deploy image
              </FormSubmitButton>
            </Stack>
          </form>
        ) : (
          <Text>Enable the container runner to publish images.</Text>
        )}
      </Stack>
    </Box>
  );
}
