"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { toaster } from "@/components/app-toaster";

type ActionFeedbackToastProps = {
  notice?: string;
  error?: string;
};

export function ActionFeedbackToast({ notice = "", error = "" }: ActionFeedbackToastProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const handledKeyRef = useRef<string>("");

  useEffect(() => {
    if (!notice && !error) {
      handledKeyRef.current = "";
      return;
    }

    const handledKey = `${notice}::${error}`;

    if (handledKeyRef.current === handledKey) {
      return;
    }

    handledKeyRef.current = handledKey;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      if (notice) {
        toaster.create({
          type: "success",
          title: "Saved",
          description: notice,
          closable: true,
        });
      }

      if (error) {
        toaster.create({
          type: "error",
          title: "Action failed",
          description: error,
          closable: true,
        });
      }

      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("notice");
      nextParams.delete("error");

      const nextSearch = nextParams.toString();

      router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, { scroll: false });
    });

    return () => {
      cancelled = true;
    };
  }, [error, notice, pathname, router, searchParams]);

  return null;
}
