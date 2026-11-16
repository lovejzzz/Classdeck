"use client";

import { useEffect, useRef } from "react";

type Gsi = { accounts: { id: { initialize(o: object): void; renderButton(el: HTMLElement, o: object): void } } };

/** Google's "Sign in with Google" button, when the site has a Google client id. */
export function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  useEffect(() => { cb.current = onCredential; });
  useEffect(() => {
    let off = false;
    fetch("/api/auth").then((r) => r.json()).then((me: { google?: string | null }) => {
      if (off || !me.google) return;
      const draw = () => {
        const g = (window as unknown as { google?: Gsi }).google;
        if (!g || !box.current) return;
        g.accounts.id.initialize({ client_id: me.google, callback: (r: { credential: string }) => cb.current(r.credential), ux_mode: "popup" });
        g.accounts.id.renderButton(box.current, { theme: "outline", size: "large", text: "continue_with", shape: "rectangular", width: box.current.offsetWidth || 320 });
      };
      if ((window as unknown as { google?: Gsi }).google) return draw();
      const sc = document.createElement("script");
      sc.src = "https://accounts.google.com/gsi/client";
      sc.async = true;
      sc.onload = draw;
      document.head.appendChild(sc);
    }).catch(() => {});
    return () => { off = true; };
  }, []);
  return <div ref={box} className="min-h-0 w-full [&:not(:empty)]:min-h-10" />;
}
