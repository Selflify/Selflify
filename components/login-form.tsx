"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Stack, Text } from "@chakra-ui/react";
import { signIn } from "next-auth/react";

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
      callbackUrl: "/dashboard",
    });

    if (!result || result.error) {
      setError("Invalid credentials.");
      setPending(false);
      return;
    }

    router.push(result.url ?? "/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="4">
        <Input
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          name="login"
          placeholder="Admin login"
          autoComplete="username"
          required
          bg="rgba(255,255,255,0.04)"
          borderColor="rgba(255,255,255,0.08)"
          color="whiteAlpha.950"
          _placeholder={{ color: "rgba(255,255,255,0.35)" }}
        />
        <Input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          name="password"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          required
          bg="rgba(255,255,255,0.04)"
          borderColor="rgba(255,255,255,0.08)"
          color="whiteAlpha.950"
          _placeholder={{ color: "rgba(255,255,255,0.35)" }}
        />
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
