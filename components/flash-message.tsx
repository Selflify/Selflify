import { Box, Text } from "@chakra-ui/react";

type FlashMessageProps = {
  kind: "notice" | "error";
  message: string;
};

export function FlashMessage({ kind, message }: FlashMessageProps) {
  return (
    <Box
      px="4"
      py="3"
      rounded="xl"
      borderWidth="1px"
      borderColor={kind === "error" ? "rgba(255, 90, 111, 0.32)" : "rgba(161, 33, 65, 0.36)"}
      bg={kind === "error" ? "rgba(98, 18, 31, 0.34)" : "rgba(161, 33, 65, 0.18)"}
    >
      <Text fontWeight="700">{kind === "error" ? "Action failed" : "Saved"}</Text>
      <Text color="whiteAlpha.800" mt="1">
        {message}
      </Text>
    </Box>
  );
}
