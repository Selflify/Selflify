"use client";

import { useState } from "react";
import { Box, Button, Flex, IconButton, Input, Stack, Text } from "@chakra-ui/react";
import { PencilLine } from "lucide-react";

import { saveCloudflareTokenAction } from "@/app/actions";
import { FormField } from "@/components/form-field";
import { FormSubmitButton } from "@/components/form-submit-button";

type CloudflareTokenSectionProps = {
  configRevision: number;
  maskedToken: string | null;
};

export function CloudflareTokenSection({
  configRevision,
  maskedToken,
}: CloudflareTokenSectionProps) {
  const hasToken = Boolean(maskedToken);
  const [editing, setEditing] = useState(!hasToken);

  return (
    <Box
      rounded="2xl"
      borderWidth="1px"
      borderColor="rgba(255,255,255,0.08)"
      bg="rgba(17,17,24,0.88)"
      p={{ base: "5", md: "6" }}
      boxShadow="panel"
    >
      <Text fontWeight="700">Cloudflare token</Text>
      <Text color="muted" mt="2" fontSize="sm">
        Required for automatic DNS updates. The saved token can be replaced, but not cleared.
      </Text>

      {editing ? (
        <form action={saveCloudflareTokenAction}>
          <input type="hidden" name="configRevision" value={String(configRevision)} />
          <Stack gap="4" mt="4">
            <FormField
              label="Cloudflare API token"
              htmlFor="settings-cloudflare-api-token"
              hint={
                hasToken
                  ? "Paste a new token to replace the current one."
                  : "Paste a token to enable automatic DNS updates."
              }
            >
              <Input
                id="settings-cloudflare-api-token"
                name="cloudflareApiToken"
                type="password"
                placeholder="Paste a Cloudflare API token"
                autoComplete="off"
                required
                bg="rgba(255,255,255,0.04)"
              />
            </FormField>

            <Flex gap="3" wrap="wrap">
              <FormSubmitButton
                alignSelf="flex-start"
                bg="brand.600"
                color="white"
                _hover={{ bg: "brand.500" }}
                pendingText="Saving token"
              >
                Save token
              </FormSubmitButton>
              {hasToken ? (
                <Button
                  type="button"
                  variant="outline"
                  borderColor="rgba(255,255,255,0.12)"
                  color="whiteAlpha.900"
                  _hover={{ bg: "rgba(255,255,255,0.05)" }}
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              ) : null}
            </Flex>
          </Stack>
        </form>
      ) : (
        <Flex
          mt="4"
          justify="space-between"
          align={{ base: "flex-start", md: "center" }}
          gap="4"
          wrap="wrap"
          rounded="xl"
          borderWidth="1px"
          borderColor="rgba(255,255,255,0.08)"
          px="4"
          py="4"
        >
          <Stack gap="1">
            <Text fontFamily="monospace" fontSize="sm" color="whiteAlpha.900">
              {maskedToken}
            </Text>
            <Text color="muted" fontSize="sm">
              The full token stays hidden after it is saved.
            </Text>
          </Stack>

          <Flex gap="2">
            <IconButton
              type="button"
              aria-label="Edit token"
              variant="outline"
              borderColor="rgba(255,255,255,0.12)"
              color="whiteAlpha.900"
              _hover={{ bg: "rgba(255,255,255,0.05)" }}
              onClick={() => setEditing(true)}
            >
              <PencilLine size={16} />
            </IconButton>
          </Flex>
        </Flex>
      )}
    </Box>
  );
}
