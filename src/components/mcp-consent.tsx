"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Box, Button, Heading, Input, Text } from "@chakra-ui/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Copy,
  Eye,
  Globe2,
  LockKeyhole,
  Rocket,
  Search,
  Settings2,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import {
  grantMcpAccessAction,
  revokeMcpAccessAction,
  type McpConsentState,
} from "@/app/mcp/authorize/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import type { ConsentRequest } from "@/lib/mcp/oauth";
import type { McpScope } from "@/lib/mcp/oauth-urls";
import styles from "./mcp-consent.module.css";

const permissions = [
  {
    scope: "mcp:read",
    title: "Read & inspect",
    description: "View settings, storage and deployments. Check site availability.",
    icon: Eye,
    note: "Required",
  },
  {
    scope: "preview:write",
    title: "Deploy previews",
    description: "Upload builds and publish preview environments.",
    icon: Rocket,
    note: null,
  },
  {
    scope: "mcp:write",
    title: "Manage settings",
    description: "Change site settings and preview password protection.",
    icon: Settings2,
    note: null,
  },
  {
    scope: "stable:write",
    title: "Publish to production",
    description:
      "Publish stable builds. With settings access, change the main branch and domain alias.",
    icon: Globe2,
    note: "Production",
  },
] as const;

type Connection = {
  id: string;
  name: string;
  allSites: boolean;
  sites: string[];
  scopes: string[];
  expiresAt: string;
};
type Props = {
  request: ConsentRequest | null;
  clientName: string | null;
  callbackHost: string | null;
  requestedScopes: McpScope[];
  sites: Array<{ id: string; slug: string; name: string; host: string }>;
  domain: string;
  resource: string;
  account: string;
  connections: Connection[];
};

export function McpConsent({
  request,
  clientName,
  callbackHost,
  requestedScopes,
  sites,
  domain,
  resource,
  account,
  connections,
}: Props) {
  const [state, action, pending] = useActionState(
    grantMcpAccessAction.bind(null, request),
    {} as McpConsentState,
  );
  const [siteMode, setSiteMode] = useState("selected");
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["mcp:read"]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [hiddenToken, setHiddenToken] = useState<string>();
  const [dismissedToken, setDismissedToken] = useState<string>();
  const allSites = siteMode === "all";
  const canGrant = (allSites || selectedSites.length > 0) && (!!request || !!name.trim());
  const chosenSiteNames = sites
    .filter((site) => selectedSites.includes(site.id))
    .map((site) => site.name);
  const filteredSites = sites.filter((site) =>
    `${site.name} ${site.host}`.toLowerCase().includes(search.toLowerCase()),
  );
  const agentName = clientName ?? (name.trim() || "Your agent");

  function toggle<T extends string>(value: T, entries: T[], set: (entries: T[]) => void) {
    set(entries.includes(value) ? entries.filter((entry) => entry !== value) : [...entries, value]);
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(state.token!);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

  return (
    <Box className={styles.page}>
      <Box className={styles.topbar}>
        <Link href="/sites" className={styles.brand}>
          <Image src="/icon.svg" width={36} height={36} alt="" />
          <span>
            Selflify<span className={styles.brandDivider}>/</span>
            <span className={styles.brandSection}>MCP access</span>
          </span>
        </Link>
        <span className={styles.account}>
          <span className={styles.statusDot} />
          {account}
        </span>
      </Box>
      <Box as="main" className={styles.main}>
        <Box as="aside" className={styles.intro}>
          <span className={styles.eyebrow}>
            <LockKeyhole size={13} /> AGENT CONNECTION
          </span>
          <Heading className={styles.headline}>
            Connect <br />
            your agent<span>.</span>
          </Heading>
          <Text className={styles.lead}>
            Choose which sites your agent can access and what it can change.
          </Text>
          <Box className={styles.connectionDiagram} aria-label="Connection preview">
            <div className={styles.agentNode}>
              <span className={styles.agentIcon}>
                <Terminal size={21} />
              </span>
              <span>
                <strong>{agentName}</strong>
                <small>{request ? "Requesting access" : "MCP client"}</small>
              </span>
            </div>
            <div className={styles.connectionLine}>
              <span>
                <ShieldCheck size={13} /> Access you approve
              </span>
            </div>
            <div className={styles.serverNode}>
              <Image src="/icon.svg" width={34} height={34} alt="" />
              <span>
                <strong>Selflify</strong>
                <small>{domain}</small>
              </span>
              <span className={styles.statusDot} />
            </div>
            <div className={styles.siteBranches}>
              {allSites ? (
                <span>
                  <Globe2 size={13} /> All sites, including future sites
                </span>
              ) : chosenSiteNames.length ? (
                chosenSiteNames.map((site) => (
                  <span key={site}>
                    <span className={styles.branchDot} />
                    {site}
                  </span>
                ))
              ) : (
                <span className={styles.noSelection}>Select sites to complete the connection</span>
              )}
            </div>
          </Box>
          <div className={styles.trustNote}>
            <ShieldCheck size={18} />
            <p>
              Access stays under your control.
              <br />
              <span>You can revoke a connection at any time.</span>
            </p>
          </div>
          <Link href="/sites" className={styles.backLink}>
            <ArrowLeft size={14} /> Back to sites
          </Link>
        </Box>

        <Box className={styles.panel}>
          {state.token && state.token !== dismissedToken ? (
            <Box className={styles.success}>
              <span className={styles.successIcon}>
                <CheckCheck size={30} />
              </span>
              <span className={styles.eyebrow}>CONNECTION READY</span>
              <Heading size="2xl">Your agent has access.</Heading>
              <Text>
                Copy the token now and store it in the secret storage of your MCP client. Selflify
                will not show it again.
              </Text>
              {hiddenToken !== state.token ? (
                <>
                  <label htmlFor="mcp-access-token" className={styles.fieldLabel}>
                    Access token
                  </label>
                  <textarea
                    id="mcp-access-token"
                    className={styles.token}
                    readOnly
                    value={state.token}
                    onFocus={(event) => event.target.select()}
                    spellCheck={false}
                  />
                  <div className={styles.successActions}>
                    <Button className={styles.primaryButton} onClick={copyToken}>
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                      {copied ? "Copied" : "Copy token"}
                    </Button>
                    <Button variant="ghost" onClick={() => setHiddenToken(state.token)}>
                      Hide token
                    </Button>
                  </div>
                  {copyError && (
                    <p role="alert" className={styles.error}>
                      Select the token above and copy it manually.
                    </p>
                  )}
                </>
              ) : (
                <p className={styles.tokenHidden}>
                  <LockKeyhole size={15} /> Token hidden
                </p>
              )}
              <div className={styles.endpoint}>
                <span>MCP endpoint</span>
                <code>{resource}</code>
              </div>
              <Text className={styles.successHint}>
                Use the token as a Bearer authorization header. OAuth-capable clients can connect to
                this URL directly and open the consent page.
              </Text>
              <Button
                variant="ghost"
                onClick={() => {
                  setDismissedToken(state.token);
                  setHiddenToken(state.token);
                  setCopied(false);
                  setCopyError(false);
                  setName("");
                  setSelectedSites([]);
                  setSelectedScopes(["mcp:read"]);
                  setSiteMode("selected");
                }}
              >
                Create another connection <ArrowRight size={14} />
              </Button>
            </Box>
          ) : (
            <form action={action}>
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.eyebrow}>
                    {request ? "AUTHORIZE CONNECTION" : "NEW CONNECTION"}
                  </span>
                  <Heading size="2xl">
                    {clientName ? `${clientName} wants access` : "Choose its access"}
                  </Heading>
                </div>
                <span className={styles.headerIcon}>
                  <ShieldCheck size={22} />
                </span>
              </div>
              {callbackHost && (
                <p className={styles.callback}>
                  After approval, you will return to <strong>{callbackHost}</strong>.
                </p>
              )}
              {!request && (
                <div className={styles.nameField}>
                  <label htmlFor="mcp-connection-name" className={styles.fieldLabel}>
                    Connection name
                  </label>
                  <Input
                    id="mcp-connection-name"
                    name="name"
                    className={styles.input}
                    placeholder="e.g. My coding agent"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={80}
                    required
                  />
                </div>
              )}

              <fieldset className={styles.section}>
                <legend className={styles.sectionTitle}>
                  Sites <span>{allSites ? "All sites" : `${selectedSites.length} selected`}</span>
                </legend>
                <div className={styles.segmented}>
                  <label data-active={!allSites}>
                    <input
                      type="radio"
                      name="siteMode"
                      value="selected"
                      checked={!allSites}
                      onChange={() => setSiteMode("selected")}
                    />
                    Selected sites
                  </label>
                  <label data-active={allSites}>
                    <input
                      type="radio"
                      name="siteMode"
                      value="all"
                      checked={allSites}
                      onChange={() => setSiteMode("all")}
                    />
                    <Globe2 size={14} />
                    All sites
                  </label>
                </div>
                {allSites ? (
                  <div className={styles.allSitesNote}>
                    <Globe2 size={24} />
                    <div>
                      <strong>Access to every site</strong>
                      <p>
                        Includes all {sites.length} current sites and any sites you create later.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {sites.length > 4 && (
                      <div className={styles.searchField}>
                        <label htmlFor="mcp-site-search" className={styles.fieldLabel}>
                          Find a site
                        </label>
                        <div>
                          <Search size={15} />
                          <Input
                            id="mcp-site-search"
                            className={styles.input}
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search by name or domain"
                          />
                        </div>
                      </div>
                    )}
                    <div className={styles.siteList}>
                      {filteredSites.map((site) => (
                        <label
                          key={site.id}
                          className={styles.siteRow}
                          data-selected={selectedSites.includes(site.id)}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Access ${site.name}`}
                            checked={selectedSites.includes(site.id)}
                            onChange={() => toggle(site.id, selectedSites, setSelectedSites)}
                          />
                          <span className={styles.siteAvatar}>
                            {site.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span className={styles.siteIdentity}>
                            <strong>{site.name}</strong>
                            <small>{site.host}</small>
                          </span>
                          <span className={styles.checkBox}>
                            <Check size={13} />
                          </span>
                        </label>
                      ))}
                      {!sites.length && (
                        <p className={styles.empty}>
                          Create a site first, or choose All sites to include sites you create
                          later.
                        </p>
                      )}
                      {sites.length > 0 && !filteredSites.length && (
                        <p className={styles.empty}>No sites match your search.</p>
                      )}
                    </div>
                  </>
                )}
                {!allSites &&
                  selectedSites.map((id) => (
                    <input key={id} type="hidden" name="siteIds" value={id} />
                  ))}
              </fieldset>

              <fieldset className={styles.section}>
                <legend className={styles.sectionTitle}>
                  Permissions <span>{selectedScopes.length} enabled</span>
                </legend>
                <input type="hidden" name="scopes" value="mcp:read" />
                <div className={styles.permissions}>
                  {permissions
                    .filter((permission) => requestedScopes.includes(permission.scope))
                    .map(({ scope, title, description, icon: Icon, note }) => (
                      <label
                        key={scope}
                        className={styles.permission}
                        data-selected={selectedScopes.includes(scope)}
                        data-production={scope === "stable:write"}
                      >
                        <input
                          type="checkbox"
                          name={scope === "mcp:read" ? undefined : "scopes"}
                          value={scope}
                          checked={selectedScopes.includes(scope)}
                          disabled={scope === "mcp:read"}
                          onChange={() => toggle(scope, selectedScopes, setSelectedScopes)}
                        />
                        <Icon size={18} />
                        <span className={styles.permissionText}>
                          <strong>
                            {title}
                            {note && <span className={styles.permissionBadge}>{note}</span>}
                          </strong>
                          <small>{description}</small>
                        </span>
                        <span className={styles.switch} />
                      </label>
                    ))}
                </div>
              </fieldset>

              <div className={styles.approvalSummary}>
                <LockKeyhole size={15} />
                <span>
                  {allSites
                    ? "All current and future sites"
                    : selectedSites.length
                      ? `${selectedSites.length} selected ${selectedSites.length === 1 ? "site" : "sites"}`
                      : "No sites selected"}
                  <span className={styles.summaryDot}>·</span>
                  {selectedScopes.includes("stable:write")
                    ? "Production access enabled"
                    : selectedScopes.length === 1
                      ? "Read access only"
                      : "Production publishing disabled"}
                </span>
              </div>
              {!request && (
                <div className={styles.expiry}>
                  <label htmlFor="mcp-expiry">Access expires after</label>
                  <select id="mcp-expiry" name="days" defaultValue="30">
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                  </select>
                </div>
              )}
              {request && (
                <p className={styles.lifetime}>
                  Connection expires after 30 days. Your client refreshes access automatically.
                </p>
              )}
              {state.error && (
                <p className={styles.error} role="alert">
                  {state.error}
                </p>
              )}
              <div className={styles.formFooter}>
                {request ? (
                  <Button
                    type="submit"
                    name="decision"
                    value="deny"
                    variant="ghost"
                    disabled={pending}
                    formNoValidate
                  >
                    Cancel
                  </Button>
                ) : (
                  <Link href="/sites" className={styles.cancel}>
                    Cancel
                  </Link>
                )}
                <Button
                  type="submit"
                  name="decision"
                  value="allow"
                  className={styles.primaryButton}
                  disabled={!canGrant || pending}
                  loading={pending}
                  loadingText="Granting access"
                >
                  {request ? "Authorize connection" : "Create access token"}
                  <ArrowRight size={16} />
                </Button>
              </div>
            </form>
          )}
        </Box>
      </Box>

      {!request && connections.length > 0 && (
        <Box className={styles.connections}>
          <div className={styles.connectionsHeader}>
            <Heading size="lg">Connected agents</Heading>
            <span>{connections.length} active</span>
          </div>
          {connections.map((connection) => (
            <div className={styles.connectionRow} key={connection.id}>
              <span className={styles.smallAgent}>
                <Terminal size={16} />
              </span>
              <div>
                <strong>{connection.name}</strong>
                <p>
                  {connection.allSites
                    ? "All current and future sites"
                    : connection.sites.join(", ") || "Selected sites no longer exist"}
                  <span className={styles.summaryDot}>·</span>
                  {connection.scopes
                    .map(
                      (scope) =>
                        permissions.find((permission) => permission.scope === scope)?.title ??
                        scope,
                    )
                    .join(", ")}
                  <span className={styles.summaryDot}>·</span>
                  Expires {connection.expiresAt.slice(0, 10)}
                </p>
              </div>
              <form action={revokeMcpAccessAction.bind(null, connection.id)}>
                <FormSubmitButton
                  danger
                  size="sm"
                  variant="ghost"
                  confirmMessage={`Revoke ${connection.name}'s access to Selflify?`}
                  pendingText="Revoking"
                >
                  Revoke
                </FormSubmitButton>
              </form>
            </div>
          ))}
        </Box>
      )}
      <footer className={styles.footer}>
        <span>Self-hosted. Your server. Your access.</span>
        <span>
          <ShieldCheck size={13} /> Secured by Selflify
        </span>
      </footer>
    </Box>
  );
}
