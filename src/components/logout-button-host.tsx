"use client";

import dynamic from "next/dynamic";
import { Box } from "@chakra-ui/react";

export const LogoutButtonHost = dynamic(
  () => import("@/components/logout-button").then((module) => module.LogoutButton),
  {
    ssr: false,
    loading: () => <Box aria-hidden="true" h="10" />,
  },
);
