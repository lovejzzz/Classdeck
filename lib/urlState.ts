"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * How to change the address:
 * - push (default when setting a value): a new history entry, so Back returns to the previous state.
 * - replace: change the address without a new entry (moving between cards inside an open editor).
 * - back: the caller opened this entry itself and is closing it on screen, so step back out of it,
 *   leaving no dead entry behind for the Back button.
 */
/** drop: other keys to clear at the same time (switching tabs leaves no stale card or timer behind). */
type How = { replace?: boolean; back?: boolean; push?: boolean; drop?: string[] };

/** A piece of page state kept in the address (?key=value), so Back steps through it and a reload keeps it. */
export function useUrlState(key: string): [string | null, (value: string | null, how?: How) => void] {
  const search = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const value = search.get(key);
  const set = useCallback(
    (next: string | null, how: How = {}) => {
      const p = new URLSearchParams(window.location.search);
      const current = p.get(key);
      const stale = (how.drop ?? []).some((k) => p.has(k));
      for (const k of how.drop ?? []) p.delete(k);
      if (next === null) {
        if (current === null && !stale) return;
        if (how.back) {
          window.history.back();
          return;
        }
        p.delete(key);
        const href = `${path}${p.size ? `?${p}` : ""}`;
        if (how.push) router.push(href, { scroll: false });
        else router.replace(href, { scroll: false });
        return;
      }
      if (current === next && !stale) return;
      p.set(key, next);
      if (how.replace && current !== null) router.replace(`${path}?${p}`, { scroll: false });
      else router.push(`${path}?${p}`, { scroll: false });
    },
    [key, path, router],
  );
  return [value, set];
}
