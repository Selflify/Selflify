"use client";

import { useRef, useState } from "react";
import { Button, Dialog, Flex, Input, Portal, Stack, Text, type ButtonProps } from "@chakra-ui/react";
import { useFormStatus } from "react-dom";

type FormSubmitButtonProps = ButtonProps & {
  children: React.ReactNode;
  pendingText?: string;
  confirmMessage?: string;
  confirmTitle?: string;
  confirmInputLabel?: string;
  confirmInputPlaceholder?: string;
  confirmInputValue?: string;
};

export function FormSubmitButton({
  children,
  pendingText,
  confirmMessage,
  confirmTitle,
  confirmInputLabel,
  confirmInputPlaceholder,
  confirmInputValue,
  onClick,
  form,
  name,
  value,
  formAction,
  formEncType,
  formMethod,
  formNoValidate,
  formTarget,
  ...props
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();
  const [open, setOpen] = useState(false);
  const [confirmValue, setConfirmValue] = useState("");
  const hiddenSubmitRef = useRef<HTMLButtonElement>(null);
  const buttonProps = { ...props };
  const requiresTypedConfirmation = Boolean(confirmInputValue);
  const typedConfirmationMatches = !requiresTypedConfirmation || confirmValue.trim() === confirmInputValue;

  delete buttonProps.type;

  if (!confirmMessage) {
    return (
      <Button
        {...buttonProps}
        type="submit"
        loading={pending}
        onClick={onClick}
        form={form}
        name={name}
        value={value}
      >
        {pending ? (pendingText ?? children) : children}
      </Button>
    );
  }

  return (
    <>
      <button
        ref={hiddenSubmitRef}
        type="submit"
        form={form}
        name={name}
        value={typeof value === "string" ? value : value?.toString()}
        formAction={formAction}
        formEncType={formEncType}
        formMethod={formMethod}
        formNoValidate={formNoValidate}
        formTarget={formTarget}
        hidden
        aria-hidden="true"
        tabIndex={-1}
      />

      <Dialog.Root
        open={open}
        onOpenChange={(details) => {
          setOpen(details.open);

          if (!details.open) {
            setConfirmValue("");
          }
        }}
        role="alertdialog"
      >
        <Dialog.Trigger asChild>
          <Button {...buttonProps} type="button" loading={pending}>
            {pending ? (pendingText ?? children) : children}
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
                <Dialog.Title>{confirmTitle ?? "Confirm action"}</Dialog.Title>
              </Dialog.Header>

              <Dialog.Body pt="5">
                <Stack gap="4">
                  <Text color="muted">{confirmMessage}</Text>
                  {requiresTypedConfirmation ? (
                    <Stack gap="2">
                      <Text fontSize="sm" fontWeight="700" color="whiteAlpha.900">
                        {confirmInputLabel ?? "Type the confirmation value to continue"}
                      </Text>
                      <Input
                        value={confirmValue}
                        onChange={(event) => setConfirmValue(event.target.value)}
                        placeholder={confirmInputPlaceholder}
                        bg="rgba(255,255,255,0.04)"
                      />
                    </Stack>
                  ) : null}
                </Stack>
              </Dialog.Body>

              <Dialog.Footer pt="0">
                <Flex w="full" justify="flex-end" gap="3" wrap="nowrap">
                  <Dialog.CloseTrigger asChild>
                    <Button type="button" variant="outline" flexShrink={0}>
                      Cancel
                    </Button>
                  </Dialog.CloseTrigger>
                  <Button
                    {...buttonProps}
                    type="button"
                    loading={pending}
                    disabled={Boolean(buttonProps.disabled) || !typedConfirmationMatches}
                    form={form}
                    name={name}
                    value={value}
                    flexShrink={0}
                    onClick={(event) => {
                      onClick?.(event);

                      if (event.defaultPrevented) {
                        return;
                      }

                      setOpen(false);
                      setConfirmValue("");
                      hiddenSubmitRef.current?.click();
                    }}
                  >
                    {pending ? (pendingText ?? children) : children}
                  </Button>
                </Flex>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
