"use client";

import { useRef, useState } from "react";
import { Button, Flex, Input, Stack, Text } from "@chakra-ui/react";

import { setupAction } from "@/app/actions";
import { FlashMessage } from "@/components/flash-message";
import { FormField } from "@/components/form-field";

type SetupWizardProps = {
  defaultDomain: string;
  defaultServerIp: string;
  defaultCaddyContactEmail: string;
  defaultCloudflareToken: string;
  error?: string;
};

type SetupStep = 1 | 2;

export function SetupWizard({
  defaultDomain,
  defaultServerIp,
  defaultCaddyContactEmail,
  defaultCloudflareToken,
  error = "",
}: SetupWizardProps) {
  const [step, setStep] = useState<SetupStep>(1);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [domain, setDomain] = useState(defaultDomain);
  const [serverIp, setServerIp] = useState(defaultServerIp);
  const [caddyContactEmail, setCaddyContactEmail] = useState(defaultCaddyContactEmail);
  const [cloudflareApiToken, setCloudflareApiToken] = useState(defaultCloudflareToken);
  const loginRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const passwordConfirmRef = useRef<HTMLInputElement>(null);

  function continueToInfrastructureStep() {
    const stepOneFields = [loginRef.current, passwordRef.current, passwordConfirmRef.current];

    for (const field of stepOneFields) {
      if (!field?.reportValidity()) {
        return;
      }
    }

    if (password !== passwordConfirm) {
      passwordConfirmRef.current?.setCustomValidity(
        "Password confirmation does not match the new password.",
      );
      passwordConfirmRef.current?.reportValidity();
      return;
    }

    passwordConfirmRef.current?.setCustomValidity("");
    setStep(2);
  }

  return (
    <Stack gap="5">
      <Flex justify="space-between" align="flex-start" gap="4" wrap="wrap">
        <Text textTransform="uppercase" letterSpacing="0.18em" fontSize="xs" color="brand.300">
          First launch
        </Text>
        <Text color="muted" fontSize="sm">
          Step {step} of 2
        </Text>
      </Flex>

      <Stack gap="2">
        <Text as="h1" fontSize={{ base: "2xl", md: "3xl" }} fontWeight="700" lineHeight="1.1">
          {step === 1 ? "Create account" : "Project settings"}
        </Text>
        <Text color="muted">
          {step === 1
            ? "Set the login and password for entering the panel."
            : "Finish the required infrastructure settings: main domain, public server IP, Cloudflare API token and the email used by Caddy certificates."}
        </Text>
      </Stack>

      {error ? <FlashMessage kind="error" message={error} /> : null}

      <form action={setupAction}>
        <Stack gap="4">
          {step === 1 ? (
            <>
              <FormField label="Login" htmlFor="setup-login">
                <Input
                  ref={loginRef}
                  id="setup-login"
                  name="login"
                  value={login}
                  onChange={(event) => setLogin(event.target.value)}
                  placeholder="Enter login"
                  autoComplete="username"
                  required
                  bg="rgba(255,255,255,0.04)"
                  borderColor="rgba(255,255,255,0.08)"
                />
              </FormField>
              <FormField label="Password" htmlFor="setup-password">
                <Input
                  ref={passwordRef}
                  id="setup-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    passwordConfirmRef.current?.setCustomValidity("");
                  }}
                  placeholder="Strong password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  bg="rgba(255,255,255,0.04)"
                  borderColor="rgba(255,255,255,0.08)"
                />
              </FormField>
              <FormField
                label="Confirm password"
                htmlFor="setup-password-confirm"
                hint="Repeat the password to avoid saving a typo."
              >
                <Input
                  ref={passwordConfirmRef}
                  id="setup-password-confirm"
                  name="passwordConfirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(event) => {
                    setPasswordConfirm(event.target.value);
                    event.target.setCustomValidity("");
                  }}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  bg="rgba(255,255,255,0.04)"
                  borderColor="rgba(255,255,255,0.08)"
                />
              </FormField>
            </>
          ) : (
            <>
              <input type="hidden" name="login" value={login} />
              <input type="hidden" name="password" value={password} />
              <input type="hidden" name="passwordConfirm" value={passwordConfirm} />

              <FormField label="Primary domain" htmlFor="setup-domain">
                <Input
                  id="setup-domain"
                  name="domain"
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  placeholder="example.com"
                  required
                  bg="rgba(255,255,255,0.04)"
                  borderColor="rgba(255,255,255,0.08)"
                />
              </FormField>
              <FormField label="Server IP" htmlFor="setup-server-ip">
                <Input
                  id="setup-server-ip"
                  name="serverIp"
                  value={serverIp}
                  onChange={(event) => setServerIp(event.target.value)}
                  placeholder="203.0.113.10"
                  required
                  bg="rgba(255,255,255,0.04)"
                  borderColor="rgba(255,255,255,0.08)"
                />
              </FormField>
              <FormField label="Caddy contact email" htmlFor="setup-caddy-contact-email">
                <Input
                  id="setup-caddy-contact-email"
                  name="caddyContactEmail"
                  type="email"
                  value={caddyContactEmail}
                  onChange={(event) => setCaddyContactEmail(event.target.value)}
                  placeholder="ops@example.com"
                  required
                  bg="rgba(255,255,255,0.04)"
                  borderColor="rgba(255,255,255,0.08)"
                />
              </FormField>
              <FormField
                label="Cloudflare API token"
                htmlFor="setup-cloudflare-api-token"
                hint="Required for automatic DNS updates."
              >
                <Input
                  id="setup-cloudflare-api-token"
                  name="cloudflareApiToken"
                  type="password"
                  value={cloudflareApiToken}
                  onChange={(event) => setCloudflareApiToken(event.target.value)}
                  placeholder="Paste a Cloudflare API token"
                  autoComplete="off"
                  required
                  bg="rgba(255,255,255,0.04)"
                  borderColor="rgba(255,255,255,0.08)"
                />
              </FormField>
            </>
          )}

          <Flex gap="3" wrap="wrap">
            {step === 2 ? (
              <Button
                type="button"
                variant="outline"
                borderColor="rgba(255,255,255,0.12)"
                color="whiteAlpha.900"
                _hover={{ bg: "rgba(255,255,255,0.05)" }}
                onClick={() => setStep(1)}
              >
                Back
              </Button>
            ) : null}

            {step === 1 ? (
              <Button type="button" bg="brand.600" color="white" _hover={{ bg: "brand.500" }} onClick={continueToInfrastructureStep}>
                Continue
              </Button>
            ) : (
              <Button type="submit" bg="brand.600" color="white" _hover={{ bg: "brand.500" }}>
                Finish setup
              </Button>
            )}
          </Flex>
        </Stack>
      </form>
    </Stack>
  );
}
