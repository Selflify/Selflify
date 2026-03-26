import { Box, Flex, Heading, Stack, Text } from "@chakra-ui/react";

import { LogoutButton } from "@/components/logout-button";
import { NavItem } from "@/components/nav-item";

type AppShellProps = {
  domain: string;
  children: React.ReactNode;
};

export function AppShell({ domain, children }: AppShellProps) {
  return (
    <Flex minH="100vh">
      <Box
        as="aside"
        w={{ base: "full", lg: "18rem" }}
        maxW={{ base: "none", lg: "18rem" }}
        borderRightWidth={{ base: "0", lg: "1px" }}
        borderColor="rgba(255,255,255,0.08)"
        px={{ base: "5", lg: "6" }}
        py={{ base: "5", lg: "8" }}
        position={{ base: "static", lg: "sticky" }}
        top="0"
        alignSelf="flex-start"
      >
        <Flex justify="space-between" align="center" gap="4" mb="8">
          <Box>
            <Text textTransform="uppercase" letterSpacing="0.18em" fontSize="xs" color="brand.300">
              Selflify
            </Text>
            <Heading size="lg" mt="2">
              Preview Control
            </Heading>
            <Text color="muted" fontSize="sm" mt="2">
              {domain}
            </Text>
          </Box>
          <LogoutButton />
        </Flex>

        <Stack gap="2">
          <NavItem href="/sites" label="Sites" />
          <NavItem href="/settings" label="Settings" />
        </Stack>
      </Box>

      <Box flex="1" px={{ base: "5", md: "8", xl: "10" }} py={{ base: "6", md: "8" }}>
        {children}
      </Box>
    </Flex>
  );
}
