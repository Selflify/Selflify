"use client";

import { Button, type ButtonProps } from "@chakra-ui/react";
import { useFormStatus } from "react-dom";

type FormSubmitButtonProps = ButtonProps & {
  children: React.ReactNode;
  pendingText?: string;
  confirmMessage?: string;
};

export function FormSubmitButton({
  children,
  pendingText,
  confirmMessage,
  onClick,
  ...props
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      loading={pending}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }

        onClick?.(event);
      }}
      {...props}
    >
      {pending ? (pendingText ?? children) : children}
    </Button>
  );
}
