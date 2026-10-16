import type { Metadata } from "next";
import Link from "next/link";
import { Box, Heading, Text } from "@chakra-ui/react";
import { requireAdminSession } from "@/lib/auth/guards";
import { getDeploymentSiteId } from "@/lib/deploy/permissions";
import { McpConsent } from "@/components/mcp-consent";
import { readConsentRequest, OAuthError, listMcpConnections } from "@/lib/mcp/oauth";
import { MCP_SCOPES, mcpResource } from "@/lib/mcp/oauth-urls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Connect your agent · Selflify",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function McpAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (typeof value === "string") query.set(key, value);
  const returnTo = `/mcp/authorize${query.size ? `?${query}` : ""}`;
  const { config, session } = await requireAdminSession(returnTo);
  let consent: ReturnType<typeof readConsentRequest> | null = null;
  if (Object.keys(params).length) {
    try {
      consent = readConsentRequest(config, params);
    } catch (error) {
      return (
        <Box minH="100vh" display="grid" placeItems="center" p="6">
          <Box maxW="lg" p="8" rounded="2xl" bg="panel" borderWidth="1px" borderColor="border">
            <Text color="brand.300" fontSize="sm">
              Selflify · MCP access
            </Text>
            <Heading mt="4" size="2xl">
              Unable to connect
            </Heading>
            <Text mt="4" color="muted">
              {error instanceof OAuthError
                ? error.message
                : "The authorization request is invalid. Reconnect from your client."}
            </Text>
            <Box mt="6">
              <Link href="/mcp/authorize">Manage MCP access →</Link>
            </Box>
          </Box>
        </Box>
      );
    }
  }
  const sites = config.sites.map((site) => ({
    id: getDeploymentSiteId(site),
    slug: site.slug,
    name: site.name,
    host: `${site.slug}.${config.server.domain}`,
  }));
  const connections = listMcpConnections(config);
  return (
    <McpConsent
      request={consent?.request ?? null}
      clientName={consent?.client.name ?? null}
      callbackHost={consent ? new URL(consent.request.redirect_uri).host : null}
      requestedScopes={consent?.scopes ?? [...MCP_SCOPES]}
      sites={sites}
      domain={config.server.domain}
      resource={mcpResource(config)}
      account={session?.user?.name ?? ""}
      connections={connections}
    />
  );
}
