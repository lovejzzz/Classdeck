"use client";

import { useEffect, useRef } from "react";

export interface Shortcut {
  /** "n", "?", "[", "1", "mod+enter", "mod+d" … */
  keys: string;
  label: string;
  run: () => void;
  /** Turn a shortcut off without unregistering it. */
  enabled?: boolean;
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function displayKeys(keys: string) {
  return keys.split("+").map((k) => (k === "mod" ? (isMac() ? "⌘" : "Ctrl") : k === "enter" ? "↵" : k === "shift" ? "⇧" : k.length === 1 ? k.toUpperCase() : k));
}

function matches(e: KeyboardEvent, keys: string) {
  const parts = keys.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const mod = parts.includes("mod");
  if (mod !== (e.metaKey || e.ctrlKey)) return false;
  if (!mod && (e.metaKey || e.ctrlKey || e.altKey)) return false;
  // "?" is Shift+/ on most layouts; some input methods report the unshifted key.
  if (key === "?" && e.key === "/" && e.shiftKey) return true;
  return e.key.toLowerCase() === key;
}

/**
 * Register keyboard shortcuts. Plain-key shortcuts are ignored while typing in a field;
 * shortcuts with ⌘/Ctrl work everywhere.
 */
export function useShortcuts(list: Shortcut[]) {
  const ref = useRef(list);
  useEffect(() => {
    ref.current = list;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      for (const s of ref.current) {
        if (s.enabled === false || !matches(e, s.keys)) continue;
        if (typing && !s.keys.includes("mod")) continue;
        e.preventDefault();
        s.run();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
