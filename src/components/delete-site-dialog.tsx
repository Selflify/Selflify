"use client";

import { useRef, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  Flex,
  Input,
  Portal,
  Stack,
  Text,
  type ButtonProps,
} from "@chakra-ui/react";
import { useFormStatus } from "react-dom";

const dangerButtonStyles: ButtonProps = {
  borderColor: "rgba(214,58,99,0.34)",
  bg: "rgba(161,33,65,0.18)",
  color: "#ffe5ec",
  _hover: {
    bg: "rgba(161,33,65,0.26)",
    borderColor: "rgba(214,58,99,0.48)",
  },
  _active: {
    bg: "rgba(161,33,65,0.3)",
  },
  _disabled: {
    bg: "rgba(161,33,65,0.1)",
    borderColor: "rgba(214,58,99,0.18)",
    color: "rgba(255,229,236,0.46)",
  },
};

type DeleteSiteDialogProps = {
  siteSlug: string;
  siteDisplayName: string;
};

function DeleteOptionRow({
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description: string;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <Flex
      gap="3"
      align="flex-start"
      rounded="xl"
      borderWidth="1px"
      borderColor="rgba(255,255,255,0.08)"
      bg="rgba(255,255,255,0.03)"
      px="4"
      py="3"
    >
      <Box pt="0.5">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-label={label}
          onChange={(event) => onChange?.(event.target.checked)}
          style={{
            width: "16px",
            height: "16px",
            accentColor: "#a12141",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        />
      </Box>
      <Stack gap="1" flex="1">
        <Text color="whiteAlpha.960" fontWeight="700">
          {label}
        </Text>
        <Text color="muted" fontSize="sm">
          {description}
        </Text>
      </Stack>
    </Flex>
  );
}

export function DeleteSiteDialog({ siteSlug, siteDisplayName }: DeleteSiteDialogProps) {
  const { pending } = useFormStatus();
  const [open, setOpen] = useState(false);
  const [confirmValue, setConfirmValue] = useState("");
  const [removeFilesFromServer, setRemoveFilesFromServer] = useState(false);
  const [removeDnsRecords, setRemoveDnsRecords] = useState(false);
  const hiddenSubmitRef = useRef<HTMLButtonElement>(null);

  function resetState() {
    setConfirmValue("");
    setRemoveFilesFromServer(false);
    setRemoveDnsRecords(false);
  }

  const typedConfirmationMatches = confirmValue.trim() === siteDisplayName;

  return (
    <>
      <input type="hidden" name="removeFilesFromServer" value={removeFilesFromServer ? "1" : "0"} />
      <input type="hidden" name="removeDnsRecords" value={removeDnsRecords ? "1" : "0"} />

      <button ref={hiddenSubmitRef} type="submit" hidden aria-hidden="true" tabIndex={-1} />

      <Dialog.Root
        open={open}
        onOpenChange={(details) => {
          setOpen(details.open);

          if (!details.open) {
            resetState();
          }
        }}
        role="alertdialog"
      >
        <Dialog.Trigger asChild>
          <Button mt="5" type="button" loading={pending} {...dangerButtonStyles}>
            {pending ? "Deleting site" : "Delete site"}
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
              <Dialog.Header pb="0">
                <Dialog.Title>Delete site</Dialog.Title>
              </Dialog.Header>

              <Dialog.Body pt="5">
                <Stack gap="4">
                  <Text color="muted">
                    Delete {siteSlug} from configuration? Optional cleanup steps can also remove
                    server files and managed DNS records.
                  </Text>

                  <Stack gap="3">
                    <DeleteOptionRow
                      checked
                      disabled
                      label="Remove from configuration"
                      description="This happens automatically whenever the site is deleted."
                    />
                    <DeleteOptionRow
                      checked={removeFilesFromServer}
                      onChange={setRemoveFilesFromServer}
                      label="Remove files from server"
                      description={`Delete /var/www/${siteSlug} permanently instead of keeping it in orphan storage.`}
                    />
                    <DeleteOptionRow
                      checked={removeDnsRecords}
                      onChange={setRemoveDnsRecords}
                      label="Remove DNS records"
                      description="Delete the managed canonical and wildcard Cloudflare records for this subdomain."
                    />
                  </Stack>

                  <Stack gap="2">
                    <Text fontSize="sm" fontWeight="700" color="whiteAlpha.900">
                      Type &quot;{siteDisplayName}&quot; to confirm deletion
                    </Text>
                    <Input
                      value={confirmValue}
                      onChange={(event) => setConfirmValue(event.target.value)}
                      placeholder={siteDisplayName}
                      bg="rgba(255,255,255,0.04)"
                    />
                  </Stack>
                </Stack>
              </Dialog.Body>

              <Flex
                px={{ base: "6", md: "6" }}
                pb={{ base: "6", md: "6" }}
                pt="4"
                justify="flex-end"
                align="center"
                gap="3"
                wrap="nowrap"
              >
                <Button
                  type="button"
                  variant="outline"
                  h="10"
                  m="0"
                  flexShrink={0}
                  onClick={() => {
                    setOpen(false);
                    resetState();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  h="10"
                  m="0"
                  flexShrink={0}
                  loading={pending}
                  disabled={!typedConfirmationMatches}
                  {...dangerButtonStyles}
                  onClick={() => {
                    hiddenSubmitRef.current?.click();
                    setOpen(false);
                  }}
                >
                  {pending ? "Deleting site" : "Delete site"}
                </Button>
              </Flex>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
