"use client";

import { useSyncExternalStore } from "react";
import { formatDateTime, formatRelativeTime } from "@/lib/utils/format";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

// The first client render matches the server even when their timezones differ.
// After hydration, show the browser's local time and relative age.
export function DeployTimestamp({ value }: { value: string | null }) {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  if (!value) return <>Not available</>;
  return (
    <time dateTime={value}>
      {mounted ? `${formatDateTime(value)} · ${formatRelativeTime(value)}` : value}
    </time>
  );
}
