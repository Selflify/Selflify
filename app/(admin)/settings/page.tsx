import { Box, Heading, Input, Stack, Text } from "@chakra-ui/react";

import { saveSettingsAction } from "@/app/actions";
import { FlashMessage } from "@/components/flash-message";
import { FormField } from "@/components/form-field";
import { FormSubmitButton } from "@/components/form-submit-button";
import { requireAdminSession } from "@/lib/auth/guards";
import { getEffectiveBackupRoot } from "@/lib/config/paths";

type SettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const { config } = await requireAdminSession();
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
        <Heading size="lg">Global settings</Heading>
        <Text color="muted" mt="2">
          Saving here rewrites the runtime config, regenerates Caddy routing and applies the updated
          state immediately.
        </Text>

        <form action={saveSettingsAction}>
          <input type="hidden" name="configRevision" value={String(config.configRevision)} />
          <Stack gap="6">
            <Stack gap="4">
              <FormField label="Domain" htmlFor="settings-domain">
                <Input
                  id="settings-domain"
                  name="domain"
                  defaultValue={config.server.domain}
                  placeholder="example.com"
                  required
                  bg="rgba(255,255,255,0.04)"
                />
              </FormField>
              <FormField label="Server IP" htmlFor="settings-server-ip">
                <Input
                  id="settings-server-ip"
                  name="serverIp"
                  defaultValue={config.server.serverIp}
                  placeholder="203.0.113.10"
                  bg="rgba(255,255,255,0.04)"
                />
              </FormField>
              <FormField label="Caddy contact email" htmlFor="settings-caddy-contact-email">
                <Input
                  id="settings-caddy-contact-email"
                  name="caddyContactEmail"
                  type="email"
                  defaultValue={config.server.caddyContactEmail}
                  placeholder="ops@example.com"
                  required
                  bg="rgba(255,255,255,0.04)"
                />
              </FormField>
            </Stack>

            <Box rounded="xl" borderWidth="1px" borderColor="rgba(255,255,255,0.08)" px="4" py="4">
              <Text fontWeight="700">Admin access</Text>
              <Stack gap="4" mt="4">
                <FormField label="Admin login" htmlFor="settings-admin-login">
                  <Input
                    id="settings-admin-login"
                    name="adminLogin"
                    defaultValue={config.admin.login}
                    placeholder="selflify-admin"
                    required
                    bg="rgba(255,255,255,0.04)"
                  />
                </FormField>
                <FormField
                  label="Admin password"
                  htmlFor="settings-admin-password"
                  hint="Enter a new password only if you want to change the current one."
                >
                  <Input
                    id="settings-admin-password"
                    name="adminPassword"
                    type="password"
                    placeholder="Set a new password"
                    bg="rgba(255,255,255,0.04)"
                  />
                </FormField>
              </Stack>
            </Box>

            <FormField
              label="Cloudflare API token"
              htmlFor="settings-cloudflare-api-token"
              hint={
                config.server.cloudflareApiToken
                  ? "Leave this blank to keep the current token."
                  : "Used to create and delete DNS records automatically."
              }
            >
              <Input
                id="settings-cloudflare-api-token"
                name="cloudflareApiToken"
                type="password"
                placeholder="Paste a Cloudflare API token"
                bg="rgba(255,255,255,0.04)"
              />
            </FormField>
            <Box rounded="xl" borderWidth="1px" borderColor="rgba(255,255,255,0.08)" px="4" py="4">
              <Text fontWeight="700">Cloudflare token</Text>
              <Text color="muted" mt="2" fontSize="sm">
                {config.server.cloudflareApiToken
                  ? "A token is already configured."
                  : "No token is configured yet."}
              </Text>
              <Text color="muted" mt="1" fontSize="sm">
                The saved token is never echoed back into the form.
              </Text>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  marginTop: "0.875rem",
                }}
              >
                <input type="checkbox" name="clearCloudflareToken" value="on" />
                <Text as="span" fontSize="sm" color="whiteAlpha.900">
                  Clear the saved Cloudflare token on next save
                </Text>
              </label>
            </Box>

            <Box rounded="xl" borderWidth="1px" borderColor="rgba(255,255,255,0.08)" px="4" py="4">
              <Text fontWeight="700">Runtime paths</Text>
              <Text color="muted" mt="2" fontSize="sm">
                Preview root: {config.server.previewRootDir}
              </Text>
              <Text color="muted" mt="1" fontSize="sm">
                Caddy config: {config.server.caddyConfigPath}
              </Text>
              <Text color="muted" mt="1" fontSize="sm">
                Caddy admin: {config.server.caddyAdminAddress}
              </Text>
              <Text color="muted" mt="1" fontSize="sm">
                Backups: {getEffectiveBackupRoot()}
              </Text>
            </Box>

            <FormSubmitButton
              alignSelf="flex-start"
              bg="brand.600"
              color="white"
              _hover={{ bg: "brand.500" }}
              pendingText="Applying settings"
            >
              Save settings
            </FormSubmitButton>
          </Stack>
        </form>
      </Box>
    </Stack>
  );
}
