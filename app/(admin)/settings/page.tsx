import { Box, Heading, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react";

import { saveSettingsAction } from "@/app/actions";
import { FlashMessage } from "@/components/flash-message";
import { FormSubmitButton } from "@/components/form-submit-button";
import { requireAdminSession } from "@/lib/auth/guards";

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
          Saving here rewrites the runtime config, regenerates Caddy routing and applies the updated state immediately.
        </Text>

        <form action={saveSettingsAction}>
          <input type="hidden" name="configRevision" value={String(config.configRevision)} />
          <Stack gap="6">
            <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
              <Input name="domain" defaultValue={config.server.domain} placeholder="Domain" required bg="rgba(255,255,255,0.04)" />
              <Input
                name="serverIp"
                defaultValue={config.server.serverIp}
                placeholder="Server IP"
                bg="rgba(255,255,255,0.04)"
              />
              <Input
                name="caddyContactEmail"
                type="email"
                defaultValue={config.server.caddyContactEmail}
                placeholder="Caddy contact email"
                required
                bg="rgba(255,255,255,0.04)"
              />
              <Input
                name="adminLogin"
                defaultValue={config.admin.login}
                placeholder="Admin login"
                required
                bg="rgba(255,255,255,0.04)"
              />
            </SimpleGrid>

            <Input
              name="cloudflareApiToken"
              type="password"
              placeholder={
                config.server.cloudflareApiToken
                  ? "Leave blank to keep the current Cloudflare API token"
                  : "Cloudflare API token"
              }
              bg="rgba(255,255,255,0.04)"
            />
            <Box rounded="xl" borderWidth="1px" borderColor="rgba(255,255,255,0.08)" px="4" py="4">
              <Text fontWeight="700">Cloudflare token</Text>
              <Text color="muted" mt="2" fontSize="sm">
                {config.server.cloudflareApiToken ? "A token is already configured." : "No token is configured yet."}
              </Text>
              <Text color="muted" mt="1" fontSize="sm">
                The saved token is never echoed back into the form.
              </Text>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "0.625rem", marginTop: "0.875rem" }}>
                <input type="checkbox" name="clearCloudflareToken" value="on" />
                <Text as="span" fontSize="sm" color="whiteAlpha.900">
                  Clear the saved Cloudflare token on next save
                </Text>
              </label>
            </Box>
            <Input
              name="adminPassword"
              type="password"
              placeholder="Leave blank to keep the current admin password"
              bg="rgba(255,255,255,0.04)"
            />

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
