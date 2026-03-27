"use client";

import { Button } from "@chakra-ui/react";
import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <Button
      variant="outline"
      borderColor="rgba(255,255,255,0.12)"
      color="whiteAlpha.900"
      bg="transparent"
      _hover={{ bg: "rgba(255,255,255,0.05)" }}
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      Sign out
    </Button>
  );
}
