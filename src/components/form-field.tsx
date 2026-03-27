import { Stack, Text, type StackProps } from "@chakra-ui/react";

type FormFieldProps = StackProps & {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
};

export function FormField({ label, htmlFor, hint, children, ...props }: FormFieldProps) {
  return (
    <Stack gap="2" {...props}>
      <label htmlFor={htmlFor}>
        <Text fontSize="sm" fontWeight="700" color="whiteAlpha.900">
          {label}
        </Text>
        {hint ? (
          <Text color="muted" mt="1" fontSize="xs">
            {hint}
          </Text>
        ) : null}
      </label>
      {children}
    </Stack>
  );
}
