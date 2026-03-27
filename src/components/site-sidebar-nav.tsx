"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Box, Stack, Text } from "@chakra-ui/react";

function SiteSectionItem({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link href={href}>
      <Box
        px="3"
        py="2"
        rounded="lg"
        borderWidth="1px"
        borderColor={active ? "brand.500" : "transparent"}
        bg={active ? "accentMuted" : "transparent"}
        transition="all 0.2s ease"
        _hover={{
          borderColor: active ? "brand.500" : "rgba(255,255,255,0.08)",
          bg: active ? "accentMuted" : "rgba(255,255,255,0.03)",
        }}
      >
        <Text fontSize="sm" fontWeight="700">
          {label}
        </Text>
      </Box>
    </Link>
  );
}

export function SiteSidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const match = pathname.match(/^\/sites\/([^/]+)$/);

  if (!match) {
    return null;
  }

  const slug = decodeURIComponent(match[1]);
  const view = searchParams.get("view") === "configuration" ? "configuration" : "deploys";

  return (
    <Stack gap="1" mt="-1" pl="4">
      <Text color="muted" fontSize="xs" letterSpacing="0.08em" textTransform="uppercase" px="3" pt="1">
        {slug}
      </Text>
      <SiteSectionItem href={`/sites/${slug}`} label="Deploys" active={view === "deploys"} />
      <SiteSectionItem
        href={`/sites/${slug}?view=configuration`}
        label="Configuration"
        active={view === "configuration"}
      />
    </Stack>
  );
}
