"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Stack, Text } from "@chakra-ui/react";
import { signIn } from "next-auth/react";

import { FormField } from "@/components/form-field";

type LoginFormProps = {
  initialError?: string;
};

export function LoginForm({ initialError }: LoginFormProps) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const result = await signIn("credentials", {
      login,
      password,
      redirect: false,
      callbackUrl: "/sites",
    });

    if (!result || result.error) {
      setError("Invalid credentials.");
      setPending(false);
      return;
    }

    router.push(result.url ?? "/sites");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="4">
        <FormField label="Admin login" htmlFor="login-form-login">
          <Input
            id="login-form-login"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            name="login"
            placeholder="selflify-admin"
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
        {error ? (
          <Text color="red.200" fontSize="sm">
            {error}
          </Text>
        ) : null}
        <Button
          type="submit"
          bg="brand.600"
          color="white"
          _hover={{ bg: "brand.500" }}
          loading={pending}
          loadingText="Signing in"
        >
          Sign in
        </Button>
      </Stack>
    </form>
  );
}
