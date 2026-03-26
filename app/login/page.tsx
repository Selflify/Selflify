import { Box, Heading, Stack, Text } from "@chakra-ui/react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FlashMessage } from "@/components/flash-message";
import { LoginForm } from "@/components/login-form";
import { isAdminConfigured, readSelflifyConfig } from "@/lib/config/service";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const config = await readSelflifyConfig();

  if (!isAdminConfigured(config)) {
    redirect("/setup");
  }

  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const notice = typeof params.notice === "string" ? params.notice : "";
  const error = typeof params.error === "string" ? params.error : "";

  return (
    <Box
      minH="100vh"
      display="grid"
      placeItems="center"
      px="5"
      py="10"
      background="radial-gradient(circle at top left, rgba(161,33,65,0.22), transparent 24%), linear-gradient(180deg, #0d0a0f 0%, #050507 100%)"
    >
      <Box
        w="full"
        maxW="28rem"
        rounded="2xl"
        borderWidth="1px"
        borderColor="rgba(255,255,255,0.08)"
        bg="rgba(17,17,24,0.9)"
        p={{ base: "6", md: "8" }}
        boxShadow="panel"
      >
        <Stack gap="5">
          <Box>
            <Text textTransform="uppercase" letterSpacing="0.18em" fontSize="xs" color="brand.300">
              Selflify
            </Text>
            <Heading size="2xl" mt="3">
              Sign in
            </Heading>
            <Text color="muted" mt="2">
              Access the deployment control panel for {config.server.domain}.
            </Text>
          </Box>

          {notice ? <FlashMessage kind="notice" message={notice} /> : null}
          {error ? <FlashMessage kind="error" message={error} /> : null}

          <LoginForm />
        </Stack>
      </Box>
    </Box>
  );
}
