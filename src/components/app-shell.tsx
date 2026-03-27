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
      <Flex
        as="aside"
        direction="column"
        w={{ base: "full", lg: "18rem" }}
        maxW={{ base: "none", lg: "18rem" }}
        minH={{ base: "auto", lg: "100vh" }}
        borderRightWidth={{ base: "0", lg: "1px" }}
        borderColor="rgba(255,255,255,0.08)"
        px={{ base: "5", lg: "6" }}
        py={{ base: "5", lg: "8" }}
        position={{ base: "static", lg: "sticky" }}
        top="0"
        alignSelf="flex-start"
      >
        <Box mb="8">
          <Box>
            <Text textTransform="uppercase" letterSpacing="0.18em" fontSize="xs" color="brand.300">
              Selflify
            </Text>
            <Heading mt="2" fontSize={{ base: "xl", lg: "1.1rem" }} lineHeight="1.1" whiteSpace="nowrap">
              Preview Control
            </Heading>
            <Text color="muted" fontSize="sm" mt="2">
              {domain}
            </Text>
          </Box>
        </Box>

        <Stack gap="2">
          <NavItem href="/sites" label="Sites" />
          <NavItem href="/settings" label="Settings" />
        </Stack>

        <Flex mt={{ base: "6", lg: "auto" }} pt={{ base: "0", lg: "6" }}>
          <LogoutButton />
        </Flex>
      </Flex>

      <Box flex="1" px={{ base: "5", md: "8", xl: "10" }} py={{ base: "6", md: "8" }}>
        {children}
      </Box>
    </Flex>
  );
}
