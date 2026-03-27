import { Box, Heading, Input, Stack, Text } from "@chakra-ui/react";

import { saveAdminAccessAction, saveServerSettingsAction } from "@/app/actions";
import { ActionFeedbackToast } from "@/components/action-feedback-toast";
import { CloudflareTokenSection } from "@/components/cloudflare-token-section";
import { FormField } from "@/components/form-field";
import { FormSubmitButton } from "@/components/form-submit-button";
import { requireAdminSession } from "@/lib/auth/guards";
import { getEffectiveBackupRoot } from "@/lib/config/paths";

type SettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function maskCloudflareToken(token: string): string {
  const tail = token.slice(-4);
  return `********${tail || "****"}`;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const { config } = await requireAdminSession();
  const queries = await searchParams;
  const notice = typeof queries.notice === "string" ? queries.notice : "";
  const error = typeof queries.error === "string" ? queries.error : "";

  return (
    <Stack gap="8">
      <ActionFeedbackToast notice={notice} error={error} />

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
      </Box>

      <Box
        rounded="2xl"
        borderWidth="1px"
        borderColor="rgba(255,255,255,0.08)"
        bg="rgba(17,17,24,0.88)"
        p={{ base: "5", md: "6" }}
        boxShadow="panel"
      >
        <Text fontWeight="700">Infrastructure</Text>
        <Text color="muted" mt="2" fontSize="sm">
          Keep the main domain, public IP and Caddy contact email filled in at all times.
        </Text>

        <form action={saveServerSettingsAction}>
          <input type="hidden" name="configRevision" value={String(config.configRevision)} />
          <Stack gap="4" mt="4">
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
                required
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
            <FormSubmitButton
              alignSelf="flex-start"
              bg="action.500"
              color="white"
              _hover={{ bg: "action.600" }}
              pendingText="Applying infrastructure"
            >
              Save infrastructure
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
        <Text fontWeight="700">Admin access</Text>
        <Text color="muted" mt="2" fontSize="sm">
          Login and password for entering the panel.
        </Text>

        <form action={saveAdminAccessAction}>
          <input type="hidden" name="configRevision" value={String(config.configRevision)} />
          <Stack gap="4" mt="4">
            <FormField label="Login" htmlFor="settings-admin-login">
              <Input
                id="settings-admin-login"
                name="adminLogin"
                defaultValue={config.admin.login}
                placeholder="Enter login"
                required
                bg="rgba(255,255,255,0.04)"
              />
            </FormField>
            <FormField
              label="Password"
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
            <FormField
              label="Confirm password"
              htmlFor="settings-admin-password-confirm"
              hint="Repeat the new password to avoid saving a typo."
            >
              <Input
                id="settings-admin-password-confirm"
                name="adminPasswordConfirm"
                type="password"
                placeholder="Repeat the new password"
                bg="rgba(255,255,255,0.04)"
              />
            </FormField>
            <FormSubmitButton
              alignSelf="flex-start"
              bg="action.500"
              color="white"
              _hover={{ bg: "action.600" }}
              pendingText="Saving access"
            >
              Save access
            </FormSubmitButton>
          </Stack>
        </form>
      </Box>

      <CloudflareTokenSection
        configRevision={config.configRevision}
        maskedToken={
          config.server.cloudflareApiToken
            ? maskCloudflareToken(config.server.cloudflareApiToken)
            : null
        }
      />

      <Box
        rounded="2xl"
        borderWidth="1px"
        borderColor="rgba(255,255,255,0.08)"
        bg="rgba(17,17,24,0.88)"
        p={{ base: "5", md: "6" }}
        boxShadow="panel"
      >
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
    </Stack>
  );
}
