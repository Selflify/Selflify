"use client";

import { useRef, useState } from "react";
import { Button, Grid, Heading, Input, Stack, Text } from "@chakra-ui/react";

import { FormField } from "@/components/form-field";
import type { ContainerVolume } from "@/lib/containers/schema";

export function ContainerVolumes({ volumes }: { volumes: ContainerVolume[] }) {
  const [rows, setRows] = useState(() => volumes.map((volume, id) => ({ ...volume, id })));
  const nextId = useRef(volumes.length);

  return (
    <Stack gap="3">
      <Heading size="md">Persistent volumes</Heading>
      <Text color="muted" fontSize="sm">
        Mount a volume at the directory where your application stores data. Keep the same volume
        name to reuse its data. Deployments with volumes briefly stop the old release.
      </Text>
      {rows.map(({ id, name, path }) => (
        <Grid
          key={id}
          gap="2"
          alignItems="end"
          templateColumns={{ base: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr) auto" }}
        >
          <FormField label="Volume name" htmlFor={`volume-name-${id}`}>
            <Input
              id={`volume-name-${id}`}
              name="volumeName"
              defaultValue={name}
              placeholder="database"
              maxLength={40}
              spellCheck={false}
              required
            />
          </FormField>
          <FormField label="Container path" htmlFor={`volume-path-${id}`}>
            <Input
              id={`volume-path-${id}`}
              name="volumePath"
              defaultValue={path}
              placeholder="/var/lib/app"
              maxLength={256}
              spellCheck={false}
              required
            />
          </FormField>
          <Button
            type="button"
            variant="outline"
            justifySelf="start"
            aria-label={name ? `Remove volume ${name}` : "Remove volume mount"}
            onClick={() => setRows((current) => current.filter((row) => row.id !== id))}
          >
            Remove
          </Button>
        </Grid>
      ))}
      <Button
        type="button"
        variant="outline"
        alignSelf="flex-start"
        disabled={rows.length >= 8}
        onClick={() => {
          const id = nextId.current++;
          setRows((current) => [...current, { id, name: "", path: "" }]);
        }}
      >
        Add volume
      </Button>
    </Stack>
  );
}
