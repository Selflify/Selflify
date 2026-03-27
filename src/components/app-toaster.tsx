"use client";

import { Flex, Stack, Text, Toast, Toaster, createToaster } from "@chakra-ui/react";

export const toaster = createToaster({
  placement: "top-end",
  pauseOnPageIdle: true,
  max: 4,
});

export function AppToaster() {
  return (
    <Toaster
      toaster={toaster}
      insetInline={{ base: "4", md: "6" }}
      insetBlockStart={{ base: "4", md: "6" }}
    >
      {(toast) => (
        <Toast.Root maxW="sm">
          <Flex align="flex-start" gap="3">
            <Toast.Indicator mt="1" />
            <Stack gap="1" flex="1" minW="0">
              {toast.title ? (
                <Toast.Title>
                  <Text fontWeight="700">{toast.title}</Text>
                </Toast.Title>
              ) : null}
              {toast.description ? (
                <Toast.Description color="whiteAlpha.800">{toast.description}</Toast.Description>
              ) : null}
            </Stack>
            <Toast.CloseTrigger />
          </Flex>
        </Toast.Root>
      )}
    </Toaster>
  );
}
