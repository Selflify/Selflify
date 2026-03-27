"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Text } from "@chakra-ui/react";

type NavItemProps = {
  href: string;
  label: string;
};

export function NavItem({ href, label }: NavItemProps) {
  const pathname = usePathname();
  const exactActive = pathname === href;
  const sectionActive = !exactActive && pathname.startsWith(`${href}/`);
  const active = exactActive || sectionActive;

  return (
    <Link href={href}>
      <Box
        px="4"
        py="3"
        rounded="xl"
        borderWidth="1px"
        borderColor={exactActive ? "brand.500" : sectionActive ? "rgba(255,255,255,0.08)" : "transparent"}
        bg={exactActive ? "accentMuted" : sectionActive ? "rgba(255,255,255,0.02)" : "transparent"}
        transition="all 0.2s ease"
        _hover={{
          borderColor: exactActive ? "brand.500" : "rgba(255,255,255,0.08)",
          bg: exactActive ? "accentMuted" : "rgba(255,255,255,0.03)",
        }}
      >
        <Text
          fontWeight="700"
          letterSpacing="0.01em"
          color={exactActive ? "whiteAlpha.950" : active ? "brand.200" : "whiteAlpha.950"}
        >
          {label}
        </Text>
      </Box>
    </Link>
  );
}
