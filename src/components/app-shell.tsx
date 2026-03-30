import dynamic from "next/dynamic";
import { Box, Flex, Heading, Stack, Text } from "@chakra-ui/react";

import { NavItem } from "@/components/nav-item";
import { SiteSidebarNav } from "@/components/site-sidebar-nav";

const LogoutButton = dynamic(
  () => import("@/components/logout-button").then((module) => module.LogoutButton),
  {
    ssr: false,
    loading: () => <Box aria-hidden="true" h="10" />,
  },
);

type AppShellProps = {
  domain: string;
  children: React.ReactNode;
};

export function AppShell({ domain, children }: AppShellProps) {
  return (
    <Flex minH="100vh" direction={{ base: "column", lg: "row" }}>
      <Flex
        as="aside"
        direction="column"
        w={{ base: "full", lg: "15rem", xl: "17rem" }}
        maxW={{ base: "none", lg: "15rem", xl: "17rem" }}
        minH={{ base: "auto", lg: "100vh" }}
        borderRightWidth={{ base: "0", lg: "1px" }}
        borderColor="rgba(255,255,255,0.08)"
        px={{ base: "5", lg: "4", xl: "6" }}
        py={{ base: "5", lg: "8" }}
        position={{ base: "static", lg: "sticky" }}
        top="0"
        alignSelf={{ base: "stretch", lg: "flex-start" }}
      >
        <Box mb="8">
          <Box>
            <Text textTransform="uppercase" letterSpacing="0.18em" fontSize="xs" color="brand.300">
              Selflify
            </Text>
            <Heading
              mt="2"
              fontSize={{ base: "xl", lg: "1rem", xl: "1.1rem" }}
              lineHeight="1.1"
              whiteSpace="nowrap"
            >
              Preview Control
            </Heading>
            <Text color="muted" fontSize={{ base: "sm", lg: "xs", xl: "sm" }} mt="2">
              {domain}
            </Text>
          </Box>
        </Box>

        <Stack gap="2">
          <NavItem href="/sites" label="Sites" />
          <SiteSidebarNav />
          <NavItem href="/settings" label="Settings" />
        </Stack>

        <Flex mt={{ base: "6", lg: "auto" }} pt={{ base: "0", lg: "6" }}>
          <LogoutButton />
        </Flex>
      </Flex>

      <Box flex="1" minW="0" px={{ base: "5", md: "8", xl: "10" }} py={{ base: "6", md: "8" }}>
        {children}
      </Box>
    </Flex>
  );
}
