"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * A piece of page state kept in the address (?key=value), so the browser's Back button steps back through it
 * and reloading keeps it. Setting it adds a history entry; clearing it goes back when we added that entry.
 */
export function useUrlState(key: string): [string | null, (value: string | null) => void] {
  const search = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const value = search.get(key);
  const set = useCallback(
    (next: string | null) => {
      const p = new URLSearchParams(window.location.search);
      if (next === null) {
        // If the entry we're closing was added on this page, step back so Back and the close button agree.
        if (p.get(key) !== null && (window.history.state as { qhOpened?: string } | null)?.qhOpened === key) {
          window.history.back();
          return;
        }
        p.delete(key);
        router.replace(`${path}${p.size ? `?${p}` : ""}`, { scroll: false });
        return;
      }
      if (p.get(key) === next) return;
      p.set(key, next);
      router.push(`${path}?${p}`, { scroll: false });
      // Mark the new entry so closing it can go back instead of piling up entries.
      setTimeout(() => window.history.replaceState({ ...window.history.state, qhOpened: key }, ""), 0);
    },
    [key, path, router],
  );
  return [value, set];
}
