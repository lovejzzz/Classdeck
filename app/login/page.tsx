"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useQuery } from "@/lib/client";

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

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <Link href="/" className="rise flex items-center gap-2 text-[13px] font-medium text-ink-2"><span className="inline-block h-4 w-4 rounded-[5px] bg-ink" />Classdeck</Link>
      <h1 className="rise mt-6 text-[24px] font-semibold tracking-tight">{mode === "login" ? "Sign in" : "Create a teacher account"}</h1>
      <p className="rise mt-1.5 text-[13.5px] text-ink-2">{mode === "login" ? "For teachers. Students join with a class code instead." : "You’ll own the courses you create. Students never need an account."}</p>
      <form onSubmit={submit} className="rise mt-6 space-y-2.5" style={{ "--i": 1 } as React.CSSProperties}>
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
    </main>
  );
}
