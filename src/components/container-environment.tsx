"use client";

import { useRef, useState } from "react";
import { Button, Grid, Heading, Input, Stack, Text, Textarea } from "@chakra-ui/react";

export type EnvironmentEntry = { name: string; value?: string };

type Row = {
  id: number;
  name: string;
  value?: string;
  mode: "variable" | "secret" | "stored";
};

export function ContainerEnvironment({ entries }: { entries: EnvironmentEntry[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    entries.map((entry, id) => ({
      ...entry,
      id,
      mode: entry.value === undefined ? "stored" : "variable",
    })),
  );
  const nextId = useRef(entries.length);

  function addRow(mode: "variable" | "secret") {
    const id = nextId.current++;
    setRows((current) => [...current, { id, name: "", mode }]);
  }

  return (
    <Stack gap="4">
      <input type="hidden" name="editEnvironment" value="1" />
      <Heading size="md">Environment &amp; secrets</Heading>
      <Text color="muted" fontSize="sm">
        Changes apply to the next deployment.
      </Text>
      {(["variable", "secret"] as const).map((kind) => {
        const secret = kind === "secret";
        return (
          <Stack key={kind} gap="2">
            <Heading size="sm">{secret ? "Secrets" : "Variables"}</Heading>
            {rows
              .filter((row) => (row.mode !== "variable") === secret)
              .map((row, index) => {
                const label = `${secret ? "Secret" : "Variable"} ${index + 1}`;
                return (
                  <Grid
                    key={row.id}
                    gap="2"
                    maxW="65rem"
                    templateColumns={{ base: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr) auto" }}
                  >
                    <input type="hidden" name="envMode" value={row.mode} />
                    <Input
                      aria-label={`${label} name`}
                      name="envName"
                      defaultValue={row.name}
                      readOnly={row.mode === "stored"}
                      placeholder={secret ? "SECRET_NAME" : "NAME"}
                      pattern="[A-Za-z_][A-Za-z0-9_]*"
                      maxLength={128}
                      spellCheck={false}
                      required
                    />
                    {secret ? (
                      <Input
                        aria-label={`${label} value`}
                        name="envValue"
                        type="password"
                        autoComplete="new-password"
                        placeholder={row.mode === "stored" ? "••••••••" : "Value"}
                        required={row.mode === "secret"}
                        maxLength={8192}
                      />
                    ) : (
                      <Textarea
                        aria-label={`${label} value`}
                        name="envValue"
                        defaultValue={row.value}
                        rows={1}
                        minH="10"
                        placeholder="Value"
                        maxLength={8192}
                        spellCheck={false}
                      />
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      justifySelf="start"
                      aria-label={`Remove ${label.toLowerCase()}`}
                      onClick={() =>
                        setRows((current) => current.filter(({ id }) => id !== row.id))
                      }
                    >
                      Remove
                    </Button>
                  </Grid>
                );
              })}
            <Button
              type="button"
              variant="outline"
              alignSelf="flex-start"
              disabled={rows.length >= 64}
              onClick={() => addRow(kind)}
            >
              Add {kind}
            </Button>
          </Stack>
        );
      })}
    </Stack>
  );
}
