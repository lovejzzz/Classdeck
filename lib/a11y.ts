"use client";

import { useEffect } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep keyboard focus inside a dialog while it's open, and put it back where it was
 * when the dialog closes.
 */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    if (!active) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!ref.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Return focus to whatever opened the dialog. A card that just closed can still be hidden for a moment
      // (or gone, once finished), so try again after the closing animation and fall back to the main content.
      const back = () => {
        if (before && document.contains(before) && before.getClientRects().length && getComputedStyle(before).visibility !== "hidden") {
          before.focus({ preventScroll: true });
          return true;
        }
        return false;
      };
      if (!back()) setTimeout(() => {
        if (back() || (document.activeElement && document.activeElement !== document.body)) return;
        const main = document.querySelector<HTMLElement>("main");
        if (main) { if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1"); main.focus({ preventScroll: true }); }
      }, 700);
    };
  }, [ref, active]);
}
