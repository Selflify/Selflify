"use client";

import { Button, Dialog, Input, Portal, SimpleGrid, Stack, Text } from "@chakra-ui/react";

import { createSiteAction } from "@/app/actions";
import { FormField } from "@/components/form-field";
import { FormSubmitButton } from "@/components/form-submit-button";

type CreateSiteDialogProps = {
  configRevision: number;
};

export function CreateSiteDialog({ configRevision }: CreateSiteDialogProps) {
  return (
    <Dialog.Root size="xl">
      <Dialog.Trigger asChild>
        <Button bg="brand.600" color="white" _hover={{ bg: "brand.500" }}>
          Create site
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop bg="rgba(0,0,0,0.66)" backdropFilter="blur(6px)" />
        <Dialog.Positioner px={{ base: "4", md: "6" }}>
          <Dialog.Content
            rounded="2xl"
            borderWidth="1px"
            borderColor="rgba(255,255,255,0.08)"
            bg="rgba(17,17,24,0.96)"
            boxShadow="panel"
          >
            <form action={createSiteAction}>
              <input type="hidden" name="configRevision" value={String(configRevision)} />

              <Dialog.Header pb="0">
                <Stack gap="2">
                  <Dialog.Title>Create a site</Dialog.Title>
                  <Text color="muted" fontSize="sm">
                    New sites immediately get a stable directory, a placeholder page and wildcard
                    routing in Caddy.
                  </Text>
                </Stack>
              </Dialog.Header>

              <Dialog.Body pt="5">
                <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
                  <FormField label="Site slug" htmlFor="create-site-slug">
                    <Input
                      id="create-site-slug"
                      name="slug"
                      placeholder="site-slug"
                      required
                      bg="rgba(255,255,255,0.04)"
                    />
                  </FormField>
                  <FormField label="Display name" htmlFor="create-site-name">
                    <Input
                      id="create-site-name"
                      name="name"
                      placeholder="Marketing Site"
                      required
                      bg="rgba(255,255,255,0.04)"
                    />
                  </FormField>
                  <FormField label="Main branch" htmlFor="create-site-main-branch">
                    <Input
                      id="create-site-main-branch"
                      name="mainBranch"
                      defaultValue="stable"
                      required
                      bg="rgba(255,255,255,0.04)"
                    />
                  </FormField>
                  <FormField label="Preview login" htmlFor="create-site-preview-login">
                    <Input
                      id="create-site-preview-login"
                      name="previewLogin"
                      placeholder="Optional"
                      bg="rgba(255,255,255,0.04)"
                    />
                  </FormField>
                  <FormField
                    label="Preview password"
                    htmlFor="create-site-preview-password"
                    hint="If login is set, Selflify will hash this password through Caddy."
                    gridColumn={{ base: "auto", md: "1 / -1" }}
                  >
                    <Input
                      id="create-site-preview-password"
                      name="previewPassword"
                      type="password"
                      placeholder="Optional"
                      bg="rgba(255,255,255,0.04)"
                    />
                  </FormField>
                </SimpleGrid>
              </Dialog.Body>

              <Dialog.Footer pt="0" gap="3">
                <Dialog.CloseTrigger asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Dialog.CloseTrigger>
                <FormSubmitButton
                  bg="brand.600"
                  color="white"
                  _hover={{ bg: "brand.500" }}
                  pendingText="Creating site"
                >
                  Create site
                </FormSubmitButton>
              </Dialog.Footer>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
