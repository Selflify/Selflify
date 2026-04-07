import { Box, Button, Input, Stack, Text } from "@chakra-ui/react";

import { unlockSetupAccessAction } from "@/app/actions";
import { FormField } from "@/components/form-field";

type SetupAccessGateProps = {
  canUnlock: boolean;
  message: string;
};

export function SetupAccessGate({ canUnlock, message }: SetupAccessGateProps) {
  return (
    <Stack gap="5">
      <Stack gap="2">
        <Text textTransform="uppercase" letterSpacing="0.18em" fontSize="xs" color="brand.300">
          First launch
        </Text>
        <Text as="h1" fontSize={{ base: "2xl", md: "3xl" }} fontWeight="700" lineHeight="1.1">
          Unlock setup
        </Text>
        <Text color="muted">{message}</Text>
      </Stack>

      {canUnlock ? (
        <form action={unlockSetupAccessAction}>
          <Stack gap="4">
            <FormField
              label="Setup token"
              htmlFor="setup-access-token"
              hint="Use the SELFLIFY_SETUP_TOKEN value from the server environment."
            >
              <Input
                id="setup-access-token"
                name="setupToken"
                type="password"
                autoComplete="off"
                required
                bg="rgba(255,255,255,0.04)"
                borderColor="rgba(255,255,255,0.08)"
              />
            </FormField>

            <Button bg="action.500" color="white" _hover={{ bg: "action.600" }} type="submit">
              Continue to setup
            </Button>
          </Stack>
        </form>
      ) : (
        <Box
          rounded="xl"
          borderWidth="1px"
          borderColor="rgba(255,255,255,0.08)"
          bg="rgba(255,255,255,0.02)"
          px="4"
          py="4"
        >
          <Text color="muted" fontSize="sm">
            Add `SELFLIFY_SETUP_TOKEN` to `.env`, restart the stack, then reopen `/setup`.
          </Text>
        </Box>
      )}
    </Stack>
  );
}
