"use client";

import { useActionState, useEffect, useState } from "react";
import { Box, Button, Heading, Input, Stack, Text } from "@chakra-ui/react";
import {
  createDeployTokenAction,
  revokeDeployTokenAction,
  type DeployTokenActionState,
} from "@/app/deploy-actions";
import { FormField } from "@/components/form-field";
import { FormSubmitButton } from "@/components/form-submit-button";
import type { DeployToken } from "@/lib/config/schema";

type PublicToken = Omit<DeployToken, "secretHash" | "siteId">;

export function DeployTokens({
  siteSlug,
  revision,
  tokens,
}: {
  siteSlug: string;
  revision: number;
  tokens: PublicToken[];
}) {
  const [state, action] = useActionState(
    async (_previous: DeployTokenActionState, form: FormData) =>
      createDeployTokenAction(siteSlug, {}, form),
    {} as DeployTokenActionState,
  );
  const [hiddenToken, setHiddenToken] = useState<string>();
  const [activity, setActivity] = useState<{
    usage: Record<string, string | null>;
    events: Array<{ deploy: string; state: string; at: string }>;
  }>();
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/sites/${siteSlug}/deploy-activity`, { signal: abort.signal })
      .then(async (response) => {
        if (response.ok) setActivity(await response.json());
      })
      .catch(() => {});
    return () => abort.abort();
  }, [siteSlug, revision]);
  const currentRevision = Math.max(revision, state.revision ?? 0);
  return (
    <Box
      rounded="2xl"
      borderWidth="1px"
      borderColor="rgba(255,255,255,0.08)"
      bg="rgba(17,17,24,0.88)"
      p={{ base: "5", md: "6" }}
    >
      <Heading size="lg">Deploy tokens</Heading>
      <Text color="muted" mt="2">
        Upload builds with the Selflify CLI or connect an agent to /mcp. Each token is limited to
        this site. MCP access is opt-in.
      </Text>
      <Stack gap="4" mt="5">
        {tokens.map((token) => (
          <Box key={token.id} borderWidth="1px" borderColor="whiteAlpha.200" rounded="lg" p="4">
            <Text fontWeight="bold">{token.name}</Text>
            <Text color="muted" fontSize="sm">
              {token.scopes.join(", ")} · Expires {token.expiresAt.slice(0, 10)}
              {token.revokedAt ? " · Revoked" : ""}
            </Text>
            {activity?.usage[token.id] ? (
              <Text color="muted" fontSize="sm">
                Last used: {activity.usage[token.id]}
              </Text>
            ) : null}
            {!token.revokedAt ? (
              <form action={revokeDeployTokenAction.bind(null, siteSlug, token.id)}>
                <input type="hidden" name="configRevision" value={currentRevision} />
                <FormSubmitButton
                  danger
                  mt="3"
                  confirmMessage={`Revoke deploy token ${token.name}?`}
                  pendingText="Revoking"
                >
                  Revoke
                </FormSubmitButton>
              </form>
            ) : null}
          </Box>
        ))}
        {activity?.events.length ? (
          <Box>
            <Heading size="sm">Recent deployments</Heading>
            {activity.events.map((event, index) => (
              <Text key={index} color="muted" fontSize="sm">
                {event.deploy} · {event.state} · {event.at}
              </Text>
            ))}
          </Box>
        ) : null}
        <form action={action}>
          <input type="hidden" name="configRevision" value={currentRevision} />
          <Stack gap="4">
            <FormField label="Token name" htmlFor="deploy-token-name">
              <Input
                id="deploy-token-name"
                name="name"
                required
                maxLength={80}
                placeholder="GitHub Actions"
              />
            </FormField>
            <FormField label="Expiry date (UTC)" htmlFor="deploy-token-expiry">
              <Input id="deploy-token-expiry" name="expiresAt" type="date" required />
            </FormField>
            <label>
              <input type="checkbox" name="preview" defaultChecked /> Allow preview deployments
            </label>
            <label>
              <input type="checkbox" name="stable" /> Allow stable deployments
            </label>
            <label>
              <input type="checkbox" name="mcpRead" /> Allow MCP read access
            </label>
            <label>
              <input type="checkbox" name="mcpWrite" /> Allow MCP settings changes (includes read
              access)
            </label>
            <FormSubmitButton bg="action.500" color="white" pendingText="Creating token">
              Create token
            </FormSubmitButton>
          </Stack>
        </form>
        {state.error ? (
          <Text role="alert" color="red.300">
            {state.error}
          </Text>
        ) : null}
        {state.token && hiddenToken !== state.token ? (
          <Stack gap="3">
            <Text>
              Copy this token now. It will not be shown again. Store it securely as
              SELFLIFY_DEPLOY_TOKEN for the CLI or your MCP client.
            </Text>
            <Input
              aria-label="New deploy token"
              value={state.token}
              readOnly
              autoComplete="off"
              fontFamily="mono"
            />
            <Button variant="outline" onClick={() => setHiddenToken(state.token)}>
              Hide token
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
}
