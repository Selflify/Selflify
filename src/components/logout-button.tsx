"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@chakra-ui/react";
import { signOut } from "next-auth/react";

import { resolveAuthClientRedirect } from "@/lib/auth/redirects";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);

    const result = await signOut({
      redirect: false,
      callbackUrl: "/login",
    });

    router.push(resolveAuthClientRedirect(result?.url, "/login", window.location.origin));
    router.refresh();
  }

  return (
    <Button
      variant="outline"
      borderColor="rgba(255,255,255,0.12)"
      color="whiteAlpha.900"
      bg="transparent"
      _hover={{ bg: "rgba(255,255,255,0.05)" }}
      loading={pending}
      loadingText="Signing out"
      onClick={handleSignOut}
    >
      Sign out
    </Button>
  );
}
