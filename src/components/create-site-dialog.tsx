"use client";

import { useState } from "react";
import { Button, Dialog, Input, Portal, Stack, Text } from "@chakra-ui/react";

import { createSiteAction } from "@/app/actions";
import { FormField } from "@/components/form-field";
import { FormSubmitButton } from "@/components/form-submit-button";

type CreateSiteDialogProps = {
  configRevision: number;
  domain: string;
};

export function CreateSiteDialog({ configRevision, domain }: CreateSiteDialogProps) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");

  return (
    <Dialog.Root
      size="xl"
      open={open}
      onOpenChange={(details) => {
        setOpen(details.open);

        if (!details.open) {
          setSlug("");
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button bg="action.500" color="white" _hover={{ bg: "action.600" }}>
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
                <Stack gap="4">
                  <FormField
                    label="Subdomain"
                    htmlFor="create-site-slug"
                    hint={`Full address: https://${slug || "<subdomain>"}.${domain}`}
                  >
                    <Input
                      id="create-site-slug"
                      name="slug"
                      value={slug}
                      onChange={(event) => setSlug(event.target.value)}
                      placeholder="marketing"
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
                  <FormField label="Login" htmlFor="create-site-preview-login">
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
                  >
                    <Input
                      id="create-site-preview-password"
                      name="previewPassword"
                      type="password"
                      placeholder="Optional"
                      bg="rgba(255,255,255,0.04)"
                    />
                  </FormField>
                </Stack>
              </Dialog.Body>

              <Stack
                direction="row"
                justify="flex-end"
                gap="3"
                px={{ base: "6", md: "6" }}
                pb={{ base: "6", md: "6" }}
                pt="4"
              >
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <FormSubmitButton
                  bg="action.500"
                  color="white"
                  _hover={{ bg: "action.600" }}
                  pendingText="Creating site"
                >
                  Create site
                </FormSubmitButton>
              </Stack>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
