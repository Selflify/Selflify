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
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href}>
      <Box
        px="4"
        py="3"
        rounded="xl"
        borderWidth="1px"
        borderColor={active ? "brand.500" : "transparent"}
        bg={active ? "accentMuted" : "transparent"}
        transition="all 0.2s ease"
        _hover={{
          borderColor: "rgba(255,255,255,0.08)",
          bg: "rgba(255,255,255,0.03)",
        }}
      >
        <Text fontWeight="700" letterSpacing="0.01em">
          {label}
        </Text>
      </Box>
    </Link>
  );
}
