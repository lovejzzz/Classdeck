"use client";

import { useEffect, useRef } from "react";

type Gsi = { accounts: { id: { initialize(o: object): void; renderButton(el: HTMLElement, o: object): void } } };

/** Google's sign-in script, loaded once per page however many buttons ask for it. */
let gsi: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if ((window as unknown as { google?: Gsi }).google) return Promise.resolve();
  gsi ??= new Promise((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src = "https://accounts.google.com/gsi/client";
    sc.async = true;
    sc.onload = () => resolve();
    sc.onerror = () => { gsi = null; reject(new Error("Google sign-in didn’t load")); };
    document.head.appendChild(sc);
  });
  return gsi;
}

/** Google's "Sign in with Google" button, when the site has a Google client id. */
export function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  useEffect(() => { cb.current = onCredential; });
  useEffect(() => {
    let off = false;
    Promise.all([fetch("/api/auth").then((r) => r.json()) as Promise<{ google?: string | null }>, loadGsi()]).then(([me]) => {
      const g = (window as unknown as { google?: Gsi }).google;
      if (off || !me.google || !g || !box.current) return;
      g.accounts.id.initialize({ client_id: me.google, callback: (r: { credential: string }) => cb.current(r.credential), ux_mode: "popup" });
      // Draw into an empty box, so a second draw can never leave two buttons.
      box.current.replaceChildren();
      g.accounts.id.renderButton(box.current, { theme: "outline", size: "large", text: "continue_with", shape: "rectangular", width: box.current.offsetWidth || 320 });
    }).catch(() => {});
    return () => { off = true; };
  }, []);
  return <div ref={box} className="min-h-0 w-full [&:not(:empty)]:min-h-10" />;
}
