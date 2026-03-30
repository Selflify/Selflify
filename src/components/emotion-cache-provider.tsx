"use client";

import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { useServerInsertedHTML } from "next/navigation";
import { useState } from "react";

type EmotionCacheProviderProps = {
  children: React.ReactNode;
};

type CacheState = {
  cache: ReturnType<typeof createCache>;
  flush: () => string[];
};

function createEmotionCacheState(): CacheState {
  const cache = createCache({ key: "css" });
  cache.compat = true;

  const inserted: string[] = [];
  const originalInsert = cache.insert;

  cache.insert = (...args) => {
    const serialized = args[1];

    if (cache.inserted[serialized.name] === undefined) {
      inserted.push(serialized.name);
    }

    return originalInsert(...args);
  };

  return {
    cache,
    flush() {
      const names = inserted.splice(0, inserted.length);
      return names;
    },
  };
}

export function EmotionCacheProvider({ children }: EmotionCacheProviderProps) {
  const [{ cache, flush }] = useState(createEmotionCacheState);

  useServerInsertedHTML(() => {
    const names = flush();

    if (names.length === 0) {
      return null;
    }

    let styles = "";

    for (const name of names) {
      const style = cache.inserted[name];

      if (typeof style === "string") {
        styles += style;
      }
    }

    return (
      <style
        data-emotion={`${cache.key} ${names.join(" ")}`}
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
