import { Badge, Box, Heading, Input, Stack, Text } from "@chakra-ui/react";

import { saveAdminAccessAction, saveServerSettingsAction } from "@/app/actions";
import { ActionFeedbackToast } from "@/components/action-feedback-toast";
import { CloudflareTokenSection } from "@/components/cloudflare-token-section";
import { FormField } from "@/components/form-field";
import { FormSubmitButton } from "@/components/form-submit-button";
import { OperationStatusCard } from "@/components/operation-status-card";
import { requireAdminSession } from "@/lib/auth/guards";
import { getEffectiveBackupRoot } from "@/lib/config/paths";
import { dnsGateway } from "@/lib/system/cloudflare";
import { shouldMockCloudflare } from "@/lib/system/runtime";
import type { ManagedDnsRecord } from "@/lib/system/ports";

type SettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function maskCloudflareToken(token: string): string {
  const tail = token.slice(-4);
  return `********${tail || "****"}`;
}

function buildExpectedDnsRecords(
  domain: string,
  serverIp: string,
  siteSlugs: string[],
): ManagedDnsRecord[] {
  return siteSlugs.flatMap((slug) => [
    {
      id: `${slug}:stable`,
      type: "A",
      name: `${slug}.${domain}`,
      content: serverIp,
      proxied: false,
      ttl: 1,
    },
    {
      id: `${slug}:wildcard`,
      type: "A",
      name: `*.${slug}.${domain}`,
      content: serverIp,
      proxied: false,
      ttl: 1,
    },
  ]);
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const { config } = await requireAdminSession();
  const queries = await searchParams;
  const notice = typeof queries.notice === "string" ? queries.notice : "";
  const error = typeof queries.error === "string" ? queries.error : "";
  const cloudflareMocked = shouldMockCloudflare();
  let dnsRecords = [] as Awaited<ReturnType<typeof dnsGateway.listManagedRecords>>;
  let dnsRecordsError = "";

  if (cloudflareMocked) {
    dnsRecords = buildExpectedDnsRecords(
      config.server.domain,
      config.server.serverIp,
      config.sites.map((site) => site.slug),
    );
  } else if (config.server.cloudflareApiToken) {
    try {
      dnsRecords = await dnsGateway.listManagedRecords(config);
    } catch (recordsError) {
      dnsRecordsError =
        recordsError instanceof Error ? recordsError.message : "Could not load Cloudflare DNS records.";
    }
  }

  return (
    <Stack gap="8">
      <ActionFeedbackToast notice={notice} error={error} />
      <OperationStatusCard config={config} />

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
              confirmTitle="Apply infrastructure changes"
              confirmMessage="Save infrastructure settings and update Cloudflare DNS records for all configured sites?"
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
        <Text fontWeight="700">Cloudflare DNS records</Text>
        <Text color="muted" mt="2" fontSize="sm">
          Read-only view of the A records Selflify manages for configured sites.
        </Text>

        <Stack gap="3" mt="4">
          {cloudflareMocked ? (
            <Text color="muted" fontSize="sm">
              Cloudflare DNS is mocked in this runtime. These are the records Selflify expects to
              manage.
            </Text>
          ) : null}

          {!cloudflareMocked && !config.server.cloudflareApiToken ? (
            <Text color="muted" fontSize="sm">
              Add a Cloudflare API token to load managed DNS records.
            </Text>
          ) : null}

          {!cloudflareMocked && config.server.cloudflareApiToken && dnsRecordsError ? (
            <Text color="red.200" fontSize="sm">
              {dnsRecordsError}
            </Text>
          ) : null}

          {cloudflareMocked && dnsRecords.length === 0 ? (
            <Text color="muted" fontSize="sm">
              No sites are configured yet, so no managed DNS records are expected.
            </Text>
          ) : null}

          {!cloudflareMocked && config.server.cloudflareApiToken && !dnsRecordsError && dnsRecords.length === 0 ? (
            <Text color="muted" fontSize="sm">
              No managed A records were found in Cloudflare for the current zone.
            </Text>
          ) : null}

          {(cloudflareMocked || (!cloudflareMocked && config.server.cloudflareApiToken && !dnsRecordsError)) &&
          dnsRecords.length > 0 ? (
            <Box
              rounded="xl"
              borderWidth="1px"
              borderColor="rgba(255,255,255,0.08)"
              overflowX="auto"
            >
              <Box as="table" width="full" minW="720px" borderCollapse="collapse">
                <Box as="thead" bg="rgba(255,255,255,0.02)">
                  <Box as="tr">
                    <Box
                      as="th"
                      px="4"
                      py="3"
                      textAlign="left"
                      fontSize="xs"
                      letterSpacing="0.08em"
                      textTransform="uppercase"
                      color="whiteAlpha.600"
                      fontWeight="600"
                    >
                      Host
                    </Box>
                    <Box
                      as="th"
                      px="4"
                      py="3"
                      textAlign="left"
                      fontSize="xs"
                      letterSpacing="0.08em"
                      textTransform="uppercase"
                      color="whiteAlpha.600"
                      fontWeight="600"
                    >
                      Type
                    </Box>
                    <Box
                      as="th"
                      px="4"
                      py="3"
                      textAlign="left"
                      fontSize="xs"
                      letterSpacing="0.08em"
                      textTransform="uppercase"
                      color="whiteAlpha.600"
                      fontWeight="600"
                    >
                      Value
                    </Box>
                    <Box
                      as="th"
                      px="4"
                      py="3"
                      textAlign="left"
                      fontSize="xs"
                      letterSpacing="0.08em"
                      textTransform="uppercase"
                      color="whiteAlpha.600"
                      fontWeight="600"
                    >
                      Proxy
                    </Box>
                    <Box
                      as="th"
                      px="4"
                      py="3"
                      textAlign="left"
                      fontSize="xs"
                      letterSpacing="0.08em"
                      textTransform="uppercase"
                      color="whiteAlpha.600"
                      fontWeight="600"
                    >
                      TTL
                    </Box>
                  </Box>
                </Box>
                <Box as="tbody">
                  {dnsRecords.map((record, index) => (
                    <Box
                      as="tr"
                      key={record.id}
                      borderTopWidth={index === 0 ? "0" : "1px"}
                      borderColor="rgba(255,255,255,0.08)"
                    >
                      <Box as="td" px="4" py="3.5" fontWeight="700">
                        {record.name}
                      </Box>
                      <Box as="td" px="4" py="3.5" verticalAlign="middle">
                        <Badge variant="outline">{record.type}</Badge>
                      </Box>
                      <Box
                        as="td"
                        px="4"
                        py="3.5"
                        color="whiteAlpha.700"
                        fontSize="sm"
                        fontFamily="mono"
                      >
                        {record.content}
                      </Box>
                      <Box as="td" px="4" py="3.5" color="whiteAlpha.700" fontSize="sm">
                        {record.proxied ? "Proxied" : "DNS only"}
                      </Box>
                      <Box as="td" px="4" py="3.5" color="whiteAlpha.700" fontSize="sm">
                        {record.ttl}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          ) : null}
        </Stack>
      </Box>

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
