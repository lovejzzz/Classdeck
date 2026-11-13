"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useQuery } from "@/lib/client";

type Gsi = { accounts: { id: { initialize(o: object): void; renderButton(el: HTMLElement, o: object): void } } };

/** Google's "Sign in with Google" button, when the site has a Google client id. */
function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
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

/** Teacher sign-in and sign-up. */
export default function Login() {
  const router = useRouter();
  const query = useQuery();
  const next = query?.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode, name, email, password }) }).then((x) => x.json());
    if (r.ok) router.push(safeNext);
    else {
      setBusy(false);
      setError(r.error);
    }
  }

  async function google(credential: string) {
    setBusy(true);
    setError("");
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "google", credential }) }).then((x) => x.json());
    if (r.ok) router.push(safeNext);
    else {
      setBusy(false);
      setError(r.error);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <Link href="/" className="rise flex items-center gap-2 text-[13px] font-medium text-ink-2"><span className="inline-block h-4 w-4 rounded-[5px] bg-ink" />Questhand</Link>
      <h1 className="rise mt-6 text-[24px] font-semibold tracking-tight">{mode === "login" ? "Sign in" : "Create a teacher account"}</h1>
      <p className="rise mt-1.5 text-[13.5px] text-ink-2">{mode === "login" ? "For teachers. Students join with a class code instead." : "You’ll own the courses you create. Students never need an account."}</p>
      <div className="rise mt-6" style={{ "--i": 1 } as React.CSSProperties}><GoogleButton onCredential={google} /></div>
      <form onSubmit={submit} className="rise mt-3 space-y-2.5" style={{ "--i": 1 } as React.CSSProperties}>
        {mode === "signup" && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" autoComplete="name" className="field h-10" />}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" autoComplete="email" className="field h-10" autoFocus />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"} aria-label="Password" autoComplete={mode === "signup" ? "new-password" : "current-password"} className="field h-10" />
        {error && <p className="rise text-[13px] text-bad" role="alert">{error}</p>}
        <button disabled={busy} className="btn btn-dark press h-10 w-full justify-center">{busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }} className="rise mt-4 text-left text-[13px] text-ink-2 hover:text-ink">
        {mode === "login" ? "New here? Create a teacher account" : "Already have an account? Sign in"} <Icon name="arrow" size={12} className="inline" />
      </button>
      <Link href="/teach/demo" className="rise mt-8 text-[12.5px] text-ink-3 hover:text-ink">Or look around the CaPS demo course without an account →</Link>
      <p className="rise mt-6 flex gap-4 text-[12px] text-ink-3"><Link href="/privacy" className="hover:text-ink">Privacy</Link><Link href="/terms" className="hover:text-ink">Terms</Link></p>
    </main>
  );
}
