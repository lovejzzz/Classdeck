"use client";

import { useEffect, useRef } from "react";
import { useUrlState } from "@/lib/urlState";

/**
 * Ties an overlay (a card, a full-screen view) to the browser's Back button: opening it adds ?key=value to the
 * address, Back closes it, and closing it on screen takes that step back out of the history.
 */
export function BackCloses({ name, value, onBack }: { name: string; value: string | null; onBack: () => void }) {
  const [param, setParam] = useUrlState(name);
  const shown = useRef<string | null>(null);
  // Whether opening added a history entry; only then does closing on screen step back (never out of the site).
  const pushed = useRef(false);
  const back = useRef(onBack);
  useEffect(() => { back.current = onBack; });

  // A value already in the address when the page loads (a reload, a bookmark) isn't open here: clear it quietly.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has(name) && !value) setParam(null, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opened, switched, or closed on screen: keep the address in step.
  useEffect(() => {
    if (value && value !== shown.current) {
      if (shown.current === null) pushed.current = new URLSearchParams(window.location.search).get(name) !== value;
      setParam(value, { replace: shown.current !== null });
      shown.current = value;
    } else if (!value && shown.current) {
      shown.current = null;
      setParam(null, { back: pushed.current });
      pushed.current = false;
    }
  }, [value, setParam, name]);

  // Back pressed while open: the value left the address (or changed), so close the overlay.
  useEffect(() => {
    if (shown.current && param !== shown.current) {
      shown.current = null;
      pushed.current = false;
      back.current();
    }
  }, [param]);

  return null;
}
