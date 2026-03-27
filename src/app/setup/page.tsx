import { Box } from "@chakra-ui/react";
import { redirect } from "next/navigation";

import { SetupWizard } from "@/components/setup-wizard";
import { isAdminConfigured, readSelflifyConfig } from "@/lib/config/service";

type SetupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const config = await readSelflifyConfig();

  if (isAdminConfigured(config)) {
    redirect("/login");
  }

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";

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
        <SetupWizard
          defaultDomain={config.server.domain}
          defaultServerIp={config.server.serverIp}
          defaultCaddyContactEmail={config.server.caddyContactEmail}
          defaultCloudflareToken={config.server.cloudflareApiToken}
          error={error}
        />
      </Box>
    </Box>
  );
}
