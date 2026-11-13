"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Box, Button, Flex, Grid, Heading, Input, Stack, Text } from "@chakra-ui/react";
import {
  createDeployTokenAction,
  revokeDeployTokenAction,
  type DeployTokenActionState,
} from "@/app/deploy-actions";
import { FormField } from "@/components/form-field";
import { FormSubmitButton } from "@/components/form-submit-button";
import { IssuedToken } from "@/components/issued-token";
import type { DeployToken } from "@/lib/config/schema";

const scopeLabels: Record<DeployToken["scopes"][number], string> = {
  "preview:write": "Preview deployments",
  "stable:write": "Stable deployments",
  "container:write": "Container deployments",
  "mcp:read": "MCP read access",
  "mcp:write": "MCP settings access",
};

function tokenDetails(token: PublicToken) {
  const scopes = token.scopes.filter(
    (scope) => scope !== "mcp:read" || !token.scopes.includes("mcp:write"),
  );
  return `${scopes.map((scope) => scopeLabels[scope]).join(", ")} · Expires ${token.expiresAt.slice(0, 10)}`;
}

type PublicToken = Omit<DeployToken, "secretHash" | "siteId">;

export function DeployTokens({
  siteSlug,
  revision,
  tokens,
  container,
}: {
  siteSlug: string;
  revision: number;
  tokens: PublicToken[];
  container?: boolean;
}) {
  const [state, action] = useActionState(
    async (_previous: DeployTokenActionState, form: FormData) =>
      createDeployTokenAction(siteSlug, {}, form),
    {} as DeployTokenActionState,
  );
  const [completedId, setCompletedId] = useState<string>();
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [preview, setPreview] = useState(true);
  const [stable, setStable] = useState(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [deployment, setDeployment] = useState("preview");
  const [mcpAccess, setMcpAccess] = useState("none");
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
  const tokenId = state.token?.slice(4, state.token.indexOf("."));
  const issued = tokenId !== completedId ? state.token : undefined;
  useEffect(() => {
    if (issued) resultHeading.current?.focus();
    else if (completedId) nameInput.current?.focus();
  }, [issued, completedId]);
  const issuedId = issued ? tokenId : undefined;
  const issuedRecord = tokens.find(({ id }) => id === issuedId);
  const savedTokens = tokens.filter(({ id }) => id !== issuedId);
  return (
    <Box
      className="form-layout"
      rounded="2xl"
      borderWidth="1px"
      borderColor="rgba(255,255,255,0.08)"
      bg="rgba(17,17,24,0.88)"
      p={{ base: "5", md: "6" }}
    >
      <Heading size="lg">Deploy tokens</Heading>
      <Text color="muted" mt="2">
        Deploy with the Selflify CLI or connect an agent to /mcp. Each token is limited to this
        site.{" "}
        {container ? "Use a dedicated token for container deployments." : "MCP access is opt-in."}
      </Text>
      <Stack gap="4" mt="5">
        {issued ? (
          <Stack gap="3" p="4" rounded="lg" borderWidth="1px" borderColor="green.700">
            <Heading size="md" tabIndex={-1} ref={resultHeading}>
              Token created: {issuedRecord?.name ?? state.name}
            </Heading>
            {issuedRecord ? (
              <Text color="muted" fontSize="sm">
                {tokenDetails(issuedRecord)}
              </Text>
            ) : null}
            <Text fontSize="sm">
              Copy or download the token now. It won’t be shown again. Store it as a secret in your
              CI system or MCP client. The CLI reads it from{" "}
              <Text as="code" overflowWrap="anywhere">
                SELFLIFY_DEPLOY_TOKEN
              </Text>
              .
            </Text>
            <IssuedToken
              key={issuedId}
              id="issued-deploy-token"
              label="New deploy token"
              token={issued}
              filename="selflify-deploy-token.txt"
            />
            <Button
              type="button"
              variant="ghost"
              alignSelf="flex-start"
              onClick={() => {
                setCompletedId(issuedId);
                setName("");
                setExpiry("");
                setPreview(true);
                setStable(false);
                setDeployment("preview");
                setMcpAccess("none");
              }}
            >
              Done
            </Button>
          </Stack>
        ) : (
          <form action={action}>
            <input type="hidden" name="configRevision" value={currentRevision} />
            <Stack gap="4">
              <Heading size="sm">Create a deploy token</Heading>
              <Grid
                gap="4"
                maxW="49rem"
                templateColumns={{ base: "1fr", lg: "minmax(0, 1fr) minmax(0, 1fr)" }}
              >
                <FormField label="Token name" htmlFor="deploy-token-name">
                  <Input
                    id="deploy-token-name"
                    ref={nameInput}
                    name="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={80}
                    placeholder="e.g. Storybook CI"
                  />
                </FormField>
                <FormField label="Expiry date (UTC)" htmlFor="deploy-token-expiry">
                  <Input
                    id="deploy-token-expiry"
                    name="expiresAt"
                    type="date"
                    w={{ base: "full", lg: "14rem" }}
                    value={expiry}
                    onChange={(event) => setExpiry(event.target.value)}
                    required
                  />
                </FormField>
              </Grid>
              <Stack as="fieldset" gap="2">
                <Text as="legend" fontSize="sm" fontWeight="bold" mb="2">
                  Deployment access
                </Text>
                {container ? (
                  <>
                    <Text id="deploy-mode-hint" color="muted" fontSize="sm">
                      Choose one. A container token grants access to container deployments only.
                    </Text>
                    {[
                      ["preview", "Preview deployments"],
                      ["container", "Container deployments"],
                      ["none", "MCP access only"],
                    ].map(([value, label]) => (
                      <label key={value} className="form-choice">
                        <input
                          type="radio"
                          name="deployment"
                          value={value}
                          aria-describedby="deploy-mode-hint"
                          checked={deployment === value}
                          onChange={() => setDeployment(value)}
                        />
                        {label}
                      </label>
                    ))}
                  </>
                ) : (
                  <>
                    <label className="form-choice">
                      <input
                        type="checkbox"
                        name="preview"
                        checked={preview}
                        onChange={(event) => setPreview(event.target.checked)}
                      />
                      Allow preview deployments
                    </label>
                    <label className="form-choice">
                      <input
                        type="checkbox"
                        name="stable"
                        checked={stable}
                        onChange={(event) => setStable(event.target.checked)}
                      />
                      Allow stable deployments
                    </label>
                  </>
                )}
              </Stack>
              {!container || deployment !== "container" ? (
                <FormField label="MCP permissions" htmlFor="deploy-token-mcp-access">
                  <select
                    id="deploy-token-mcp-access"
                    name="mcpAccess"
                    className="form-select"
                    value={
                      container && deployment === "none" && mcpAccess === "none"
                        ? "read"
                        : mcpAccess
                    }
                    onChange={(event) => setMcpAccess(event.target.value)}
                  >
                    {!(container && deployment === "none") ? (
                      <option value="none">No MCP access</option>
                    ) : null}
                    <option value="read">Read only</option>
                    <option value="write">Read and change settings</option>
                  </select>
                </FormField>
              ) : null}
              {state.error ? (
                <Text role="alert" color="red.300">
                  {state.error}
                </Text>
              ) : null}
              <FormSubmitButton
                bg="action.500"
                color="white"
                _hover={{ bg: "action.600" }}
                pendingText="Creating token"
              >
                Create token
              </FormSubmitButton>
            </Stack>
          </form>
        )}
        {savedTokens.length ? (
          <Stack gap="2">
            <Heading size="sm">Saved tokens</Heading>
            {savedTokens.map((token) => (
              <Flex
                key={token.id}
                borderWidth="1px"
                borderColor="whiteAlpha.200"
                rounded="lg"
                p="4"
                gap="3"
                align="center"
                justify="space-between"
                wrap="wrap"
              >
                <Box minW="0" overflowWrap="anywhere">
                  <Text fontWeight="bold">{token.name}</Text>
                  <Text color="muted" fontSize="sm">
                    {tokenDetails(token)}
                    {token.revokedAt ? " · Revoked" : ""}
                  </Text>
                  {activity?.usage[token.id] ? (
                    <Text color="muted" fontSize="sm">
                      Last used: {activity.usage[token.id]}
                    </Text>
                  ) : null}
                </Box>
                {!token.revokedAt ? (
                  <form action={revokeDeployTokenAction.bind(null, siteSlug, token.id)}>
                    <input type="hidden" name="configRevision" value={currentRevision} />
                    <FormSubmitButton
                      danger
                      size="sm"
                      confirmMessage={`Revoke deploy token ${token.name}?`}
                      pendingText="Revoking"
                    >
                      Revoke
                    </FormSubmitButton>
                  </form>
                ) : null}
              </Flex>
            ))}
          </Stack>
        ) : null}
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
      </Stack>
    </Box>
  );
}
