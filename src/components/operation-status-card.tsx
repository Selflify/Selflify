import { Badge, Box, Flex, Heading, Stack, Text } from "@chakra-ui/react";

import type { SelflifyConfig } from "@/lib/config/schema";
import {
  getRuntimeModeLabel,
  shouldMockCloudflare,
  shouldSkipCaddyReload,
} from "@/lib/system/runtime";
import { formatDateTime } from "@/lib/utils/format";

type OperationStatusCardProps = {
  config: SelflifyConfig;
};

function humanizeOperationLabel(label: string | null): string {
  if (!label) {
    return "No changes applied yet";
  }

  if (label === "setup-admin") {
    return "Admin account setup";
  }

  if (label === "save-settings") {
    return "Global settings update";
  }

  if (label === "save-settings:server") {
    return "Infrastructure settings update";
  }

  if (label === "save-settings:admin") {
    return "Admin access update";
  }

  if (label === "save-settings:cloudflare") {
    return "Cloudflare token update";
  }

  if (label.startsWith("create-site:")) {
    return `Create site ${label.slice("create-site:".length)}`;
  }

  if (label.startsWith("update-site:")) {
    return `Update site ${label.slice("update-site:".length)}`;
  }

  if (label.startsWith("delete-site:")) {
    return `Delete site ${label.slice("delete-site:".length)}`;
  }

  if (label.startsWith("delete-deploy:")) {
    const [, siteSlug, deployName] = label.split(":");
    return `Delete deploy ${deployName} from ${siteSlug}`;
  }

  return label;
}

function getStatusColor(status: SelflifyConfig["operations"]["lastStatus"]): string {
  if (status === "success") {
    return "green";
  }

  if (status === "partial") {
    return "orange";
  }

  if (status === "failed") {
    return "red";
  }

  return "gray";
}

function getStatusLabel(status: SelflifyConfig["operations"]["lastStatus"]): string {
  if (status === "success") {
    return "Applied";
  }

  if (status === "partial") {
    return "Applied with warnings";
  }

  if (status === "failed") {
    return "Apply failed";
  }

  return "Not run yet";
}

export function OperationStatusCard({ config }: OperationStatusCardProps) {
  const status = config.operations.lastStatus;
  const runtimeMode = getRuntimeModeLabel();
  const runtimeNotes = [
    shouldSkipCaddyReload() ? "Caddy reload is skipped in this runtime." : null,
    shouldMockCloudflare() ? "Cloudflare DNS calls are mocked in this runtime." : null,
  ].filter(Boolean);

  return (
    <Box
      rounded="2xl"
      borderWidth="1px"
      borderColor={
        status === "failed"
          ? "rgba(255, 90, 111, 0.32)"
          : status === "partial"
            ? "rgba(255, 173, 84, 0.28)"
            : "rgba(255,255,255,0.08)"
      }
      bg="rgba(17,17,24,0.88)"
      p={{ base: "5", md: "6" }}
      boxShadow="panel"
    >
      <Flex
        justify="space-between"
        align={{ base: "flex-start", md: "center" }}
        gap="4"
        wrap="wrap"
      >
        <Stack gap="2">
          <Text textTransform="uppercase" letterSpacing="0.18em" fontSize="xs" color="brand.300">
            Last operation
          </Text>
          <Heading size="md">
            {humanizeOperationLabel(config.operations.lastOperationLabel)}
          </Heading>
          <Text color="muted" fontSize="sm">
            Last attempt: {formatDateTime(config.operations.lastAppliedAt)}
          </Text>
        </Stack>

        <Stack gap="2" align={{ base: "flex-start", md: "flex-end" }}>
          <Badge
            colorPalette={getStatusColor(status)}
            variant="subtle"
            px="2.5"
            py="1"
          >
            {getStatusLabel(status)}
          </Badge>
          <Badge
            colorPalette={runtimeMode === "development" ? "blue" : "green"}
            variant="outline"
            textTransform="capitalize"
            px="2.5"
            py="1"
          >
            {runtimeMode}
          </Badge>
        </Stack>
      </Flex>

      {config.operations.lastMessage ? (
        <Box
          mt="4"
          rounded="xl"
          borderWidth="1px"
          borderColor={
            status === "failed" ? "rgba(255, 90, 111, 0.28)" : "rgba(255, 173, 84, 0.24)"
          }
          bg={status === "failed" ? "rgba(98, 18, 31, 0.22)" : "rgba(120, 72, 0, 0.18)"}
          px="4"
          py="3"
        >
          <Text fontWeight="700">{status === "failed" ? "Last error" : "Last warning"}</Text>
          <Text color="whiteAlpha.800" mt="1">
            {config.operations.lastMessage}
          </Text>
        </Box>
      ) : null}

      {runtimeNotes.length > 0 ? (
        <Stack gap="1" mt="4">
          {runtimeNotes.map((note) => (
            <Text key={note} color="muted" fontSize="sm">
              {note}
            </Text>
          ))}
        </Stack>
      ) : null}
    </Box>
  );
}
