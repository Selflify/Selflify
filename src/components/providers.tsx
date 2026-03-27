"use client";

import { ChakraProvider } from "@chakra-ui/react";
import { ThemeProvider } from "next-themes";

import { system } from "@/lib/ui/system";

type ProvidersProps = {
  children: React.ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider attribute="class" forcedTheme="dark">
      <ChakraProvider value={system}>{children}</ChakraProvider>
    </ThemeProvider>
  );
}
