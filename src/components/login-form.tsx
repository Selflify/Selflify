"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Stack } from "@chakra-ui/react";
import { signIn } from "next-auth/react";

import { toaster } from "@/components/app-toaster";
import { FormField } from "@/components/form-field";

export function LoginForm() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const result = await signIn("credentials", {
      login,
      password,
      redirect: false,
      callbackUrl: "/sites",
    });

    if (!result || result.error) {
      toaster.create({
        type: "error",
        title: "Action failed",
        description: "Invalid credentials.",
        closable: true,
      });
      setPending(false);
      return;
    }

    router.push(result.url ?? "/sites");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="4">
        <FormField label="Login" htmlFor="login-form-login">
          <Input
            id="login-form-login"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            name="login"
            placeholder="Enter login"
            autoComplete="username"
            required
            bg="rgba(255,255,255,0.04)"
            borderColor="rgba(255,255,255,0.08)"
            color="whiteAlpha.950"
            _placeholder={{ color: "rgba(255,255,255,0.35)" }}
          />
        </FormField>
        <FormField label="Password" htmlFor="login-form-password">
          <Input
            id="login-form-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            name="password"
            type="password"
            placeholder="Enter password"
            autoComplete="current-password"
            required
            bg="rgba(255,255,255,0.04)"
            borderColor="rgba(255,255,255,0.08)"
            color="whiteAlpha.950"
            _placeholder={{ color: "rgba(255,255,255,0.35)" }}
          />
        </FormField>
        <Button
          type="submit"
          bg="action.500"
          color="white"
          _hover={{ bg: "action.600" }}
          loading={pending}
          loadingText="Signing in"
        >
          Sign in
        </Button>
      </Stack>
    </form>
  );
}
