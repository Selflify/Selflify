import { Box, Heading, Text } from "@chakra-ui/react";

type MetricCardProps = {
  label: string;
  value: string;
  hint?: string;
};

export function MetricCard({ label, value, hint }: MetricCardProps) {
  return (
    <Box
      rounded="2xl"
      borderWidth="1px"
      borderColor="rgba(255,255,255,0.08)"
      bg="rgba(17,17,24,0.88)"
      px="5"
      py="5"
      boxShadow="panel"
      minH="11.5rem"
    >
      <Text color="muted" textTransform="uppercase" letterSpacing="0.14em" fontSize="xs">
        {label}
      </Text>
      <Heading size="2xl" mt="3" minH="3.5rem" display="flex" alignItems="flex-end">
        {value}
      </Heading>
      <Box mt="2" minH="2.75rem">
        {hint ? (
          <Text color="whiteAlpha.700" fontSize="sm">
            {hint}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}
