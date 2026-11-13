"use client";

import { useRef, useState } from "react";
import { Button, Flex, Stack, Text, Textarea } from "@chakra-ui/react";
import { Copy, Download } from "lucide-react";

export function IssuedToken({
  id,
  label,
  token,
  filename,
}: {
  id: string;
  label: string;
  token: string;
  filename: string;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed">();

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopyStatus("copied");
    } catch {
      input.current?.focus();
      input.current?.select();
      setCopyStatus("failed");
    }
  }

  function downloadToken() {
    const url = URL.createObjectURL(new Blob([token], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Stack gap="3" w="full">
      <label htmlFor={id}>
        <Text as="span" fontSize="sm" fontWeight="semibold">
          {label}
        </Text>
      </label>
      <Textarea
        id={id}
        ref={input}
        value={token}
        rows={3}
        readOnly
        autoComplete="off"
        spellCheck={false}
        fontFamily="mono"
        fontSize="sm"
        overflowWrap="anywhere"
      />
      <Flex gap="2" wrap="wrap">
        <Button type="button" size="sm" variant="outline" onClick={copyToken}>
          <Copy size={14} /> Copy token
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={downloadToken}>
          <Download size={14} /> Download token
        </Button>
      </Flex>
      {copyStatus ? (
        <Text role="status" fontSize="sm" color={copyStatus === "failed" ? "red.300" : "muted"}>
          {copyStatus === "copied"
            ? "Token copied."
            : "Could not copy. Copy the selected token manually."}
        </Text>
      ) : null}
    </Stack>
  );
}
