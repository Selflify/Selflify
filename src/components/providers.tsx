"use client";

import { ChakraProvider } from "@chakra-ui/react";

import { AppToaster } from "@/components/app-toaster";
import { system } from "@/lib/ui/system";

type ProvidersProps = {
  children: React.ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <ChakraProvider value={system}>
      {children}
      <AppToaster />
    </ChakraProvider>
  );
}
