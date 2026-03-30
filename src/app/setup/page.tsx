import { Box } from "@chakra-ui/react";
import { redirect } from "next/navigation";

import { ActionFeedbackToast } from "@/components/action-feedback-toast";
import { SetupWizard } from "@/components/setup-wizard";
import {
  DEFAULT_RUNTIME_CADDY_EMAIL,
  DEFAULT_RUNTIME_DOMAIN,
} from "@/lib/bootstrap/runtime-seed";
import { isAdminConfigured, readSelflifyConfig } from "@/lib/config/service";

type SetupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const config = await readSelflifyConfig();
  const adminConfigured = isAdminConfigured(config);

  if (adminConfigured) {
    redirect("/login");
  }

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  const defaultDomain =
    config.server.domain === DEFAULT_RUNTIME_DOMAIN ? "" : config.server.domain;
  const defaultCaddyContactEmail =
    config.server.caddyContactEmail === DEFAULT_RUNTIME_CADDY_EMAIL
      ? ""
      : config.server.caddyContactEmail;

  return (
    <Box
      minH="100vh"
      display="grid"
      placeItems="center"
      px="5"
      py="10"
      background="radial-gradient(circle at top left, rgba(161,33,65,0.26), transparent 22%), linear-gradient(180deg, #120d12 0%, #050507 100%)"
    >
      <Box
        w="full"
        maxW="32rem"
        rounded="2xl"
        borderWidth="1px"
        borderColor="rgba(255,255,255,0.08)"
        bg="rgba(17,17,24,0.92)"
        p={{ base: "6", md: "8" }}
        boxShadow="panel"
      >
        <ActionFeedbackToast error={error} />
        <SetupWizard
          defaultDomain={defaultDomain}
          defaultServerIp={config.server.serverIp}
          defaultCaddyContactEmail={defaultCaddyContactEmail}
        />
      </Box>
    </Box>
  );
}
