"use client";

/** The first thing a keyboard user reaches: jumps past the header to the page's main content. */
export function SkipLink() {
  return (
    <a
      href="#main"
      onClick={(e) => {
        const main = document.querySelector("main");
        if (!main) return;
        e.preventDefault();
        main.setAttribute("tabindex", "-1");
        main.focus();
      }}
      className="fixed left-3 top-3 z-[100] -translate-y-16 rounded-lg bg-ink px-3 py-2 text-[13px] text-white transition-transform focus:translate-y-0"
    >
      Skip to content
    </a>
  );
}
