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
  const back = useRef(onBack);
  useEffect(() => { back.current = onBack; });

  // Opened, switched, or closed on screen: keep the address in step.
  useEffect(() => {
    if (value && value !== shown.current) {
      setParam(value, { replace: shown.current !== null });
      shown.current = value;
    } else if (!value && shown.current) {
      shown.current = null;
      setParam(null);
    }
  }, [value, setParam]);

  // Back pressed while open: the value left the address, so close the overlay.
  useEffect(() => {
    if (param === null && shown.current) {
      shown.current = null;
      back.current();
    }
  }, [param]);

  return null;
}
