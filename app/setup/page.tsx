import { Box, Button, Heading, Input, Stack, Text } from "@chakra-ui/react";
import { redirect } from "next/navigation";

import { FlashMessage } from "@/components/flash-message";
import { FormField } from "@/components/form-field";
import { setupAction } from "@/app/actions";
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
        <Stack gap="5">
          <Box>
            <Text textTransform="uppercase" letterSpacing="0.18em" fontSize="xs" color="brand.300">
              First launch
            </Text>
            <Heading size="2xl" mt="3">
              Create the admin account
            </Heading>
            <Text color="muted" mt="2">
              Selflify stores credentials in {config.server.domain} configuration files. This
              account is the only entry point to the panel.
            </Text>
          </Box>

          {error ? <FlashMessage kind="error" message={error} /> : null}

          <form action={setupAction}>
            <Stack gap="4">
              <FormField label="Admin login" htmlFor="setup-login">
                <Input
                  id="setup-login"
                  name="login"
                  placeholder="selflify-admin"
                  autoComplete="username"
                  required
                  bg="rgba(255,255,255,0.04)"
                  borderColor="rgba(255,255,255,0.08)"
                />
              </FormField>
              <FormField label="Password" htmlFor="setup-password">
                <Input
                  id="setup-password"
                  name="password"
                  type="password"
                  placeholder="Strong password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  bg="rgba(255,255,255,0.04)"
                  borderColor="rgba(255,255,255,0.08)"
                />
              </FormField>
              <Button type="submit" bg="brand.600" color="white" _hover={{ bg: "brand.500" }}>
                Create admin account
              </Button>
            </Stack>
          </form>
        </Stack>
      </Box>
    </Box>
  );
}
