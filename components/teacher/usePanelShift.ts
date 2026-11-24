"use client";

import { useEffect } from "react";

/**
 * While a right-hand panel is open (the card editor, a student's work), the page's top bar and tabs make room for it,
 * so the Inbox and the rest of the bar stay in reach (see .panel-shift-* in globals.css).
 */
export function usePanelShift(open: boolean) {
  useEffect(() => {
    const b = document.body;
    const fit = () => {
      // The page's content fills the window up to 100rem (1600px, centred beyond that, 24px in from the right); the
      // panels are at most 480px wide. Room enough for the controls to end just left of one (not on a phone, where the
      // panel covers the page anyway).
      const w = window.innerWidth, side = (w - Math.min(w, 1600)) / 2;
      b.style.setProperty("--panel-head", w < 900 ? "1rem" : `${Math.max(24, 492 - side)}px`);
      b.style.setProperty("--panel-row", w < 900 ? "0px" : `${Math.max(0, 468 - side)}px`);
    };
    if (!open) return;
    fit();
    b.dataset.panel = "open";
    window.addEventListener("resize", fit);
    return () => { delete b.dataset.panel; window.removeEventListener("resize", fit); };
  }, [open]);
}
