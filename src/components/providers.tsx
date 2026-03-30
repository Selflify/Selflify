"use client";

import { ChakraProvider } from "@chakra-ui/react";

import { AppToaster } from "@/components/app-toaster";
import { EmotionCacheProvider } from "@/components/emotion-cache-provider";
import { system } from "@/lib/ui/system";

type ProvidersProps = {
  children: React.ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <EmotionCacheProvider>
      <ChakraProvider value={system}>
        {children}
        <AppToaster />
      </ChakraProvider>
    </EmotionCacheProvider>
  );
}
