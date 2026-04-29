"use client";

import type { ReactNode } from "react";
import { Box, Button, Flex, Heading, Text } from "@chakra-ui/react";

import { deleteDeployAction } from "@/app/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { formatDateTime, formatRelativeTime } from "@/lib/utils/format";

type SiteDeployCardProps = {
  siteSlug: string;
  configRevision: number;
  deploy: {
    name: string;
    dir: string;
    modifiedAt: string;
    sizeLabel: string;
    url: string;
  };
  title?: ReactNode;
  metaText?: string;
  extraHosts?: string[];
  showDelete?: boolean;
};

function formatDeployHost(url: string) {
  return url.replace(/^https?:\/\//, "");
}

export function SiteDeployCard({
  siteSlug,
  configRevision,
  deploy,
  title,
  metaText,
  extraHosts,
  showDelete,
}: SiteDeployCardProps) {
  const deployHost = formatDeployHost(deploy.url);
  const visibleExtraHosts = extraHosts?.filter((host) => host && host !== deployHost) ?? [];

  return (
    <Flex
      justify="space-between"
      align={{ base: "flex-start", md: "center" }}
      gap="4"
      wrap="wrap"
      rounded="xl"
      borderWidth="1px"
      borderColor="rgba(255,255,255,0.08)"
      bg="rgba(17,17,24,0.88)"
      px="4"
      py="4"
    >
      <Box>
        <Heading size="md">{title ?? deploy.name}</Heading>
        <Flex mt="1" gap="2" wrap="wrap" align="center">
          <a href={deploy.url} target="_blank" rel="noreferrer">
            <Text
              as="span"
              color="whiteAlpha.700"
              textDecoration="underline"
              textDecorationColor="rgba(255,255,255,0.18)"
              textUnderlineOffset="0.18em"
              transition="color 0.2s ease"
              _hover={{ color: "whiteAlpha.950" }}
            >
              {deployHost}
            </Text>
          </a>
          {metaText ? (
            <Text color="muted" fontSize="sm">
              · {metaText}
            </Text>
          ) : null}
        </Flex>
        {visibleExtraHosts.length > 0 ? (
          <Flex mt="1" gap="2" wrap="wrap" align="center">
            {visibleExtraHosts.map((host) => (
              <a key={host} href={`https://${host}`} target="_blank" rel="noreferrer">
                <Text
                  as="span"
                  color="whiteAlpha.700"
                  textDecoration="underline"
                  textDecorationColor="rgba(255,255,255,0.18)"
                  textUnderlineOffset="0.18em"
                  transition="color 0.2s ease"
                  _hover={{ color: "whiteAlpha.950" }}
                >
                  {host}
                </Text>
              </a>
            ))}
          </Flex>
        ) : null}
        <Text color="whiteAlpha.700" mt="2" fontSize="sm" fontFamily="mono">
          {deploy.dir}
        </Text>
        <Text color="muted" mt="2" fontSize="sm">
          {deploy.sizeLabel} · updated {formatDateTime(deploy.modifiedAt)} · {formatRelativeTime(deploy.modifiedAt)}
        </Text>
      </Box>
      <Flex gap="2" wrap="wrap">
        <a href={deploy.url} target="_blank" rel="noreferrer">
          <Button as="span" variant="outline">
            Open
          </Button>
        </a>
        {showDelete ? (
          <form action={deleteDeployAction.bind(null, siteSlug, deploy.name)}>
            <input type="hidden" name="configRevision" value={String(configRevision)} />
            <FormSubmitButton
              danger
              pendingText="Deleting deploy"
              confirmMessage={`Delete deploy ${deploy.name} for ${siteSlug}? This action is irreversible.`}
            >
              Delete
            </FormSubmitButton>
          </form>
        ) : null}
      </Flex>
    </Flex>
  );
}
