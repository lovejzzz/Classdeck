"use client";

import { useState } from "react";
import { GoogleButton } from "./GoogleButton";
import { Icon } from "./Icon";

/**
 * Sign in, or make an account: Google, or email and password. One account is for everything, teaching and learning.
 * `as` says how someone is arriving (from an invitation or a class code: "student"), so their course list leads with
 * that side. `onDone` runs once they're signed in.
 */
export function SignInPanel({ onDone, as, email: startEmail = "", startMode = "login", note }: {
  onDone: () => void | Promise<void>;
  as?: "student" | "teacher";
  email?: string;
  startMode?: "login" | "signup";
  note?: React.ReactNode;
}) {
  const [mode, setMode] = useState<"login" | "signup">(startMode);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState(startEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Signing up on an address whose account was never confirmed: the code sent to it makes the account theirs.
  const [claim, setClaim] = useState<{ email: string; note: string } | null>(null);
  const [code, setCode] = useState("");

  async function send(body: object) {
    setBusy(true);
    setError("");
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, as }) })
      .then((x) => x.json()).catch(() => ({ ok: false, error: "Couldn’t reach Questhand. Check your connection." }));
    // Off the live site no email goes out: the code comes back to type in.
    if (r.devCode) console.info(`[dev] Questhand code: ${r.devCode}`);
    if (r.ok) {
      // A new account confirms its email next: the code screen (VerifyGate) opens over the page.
      await onDone(); return;
    }
    setBusy(false);
    if (r.needCode) { setClaim({ email: r.email, note: r.error }); setError(""); return; }
    setError(r.error ?? "That didn’t work. Try again.");
  }

  if (claim) return (
    <div>
      {note}
      <form onSubmit={(e) => { e.preventDefault(); void send({ action: "claim", email: claim.email, code }); }} className="mt-5 space-y-2.5">
        <p className="text-[13.5px] text-ink-2">{claim.note}</p>
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" aria-label="Code from your email" autoFocus className="field h-11 text-center font-mono text-[18px] tracking-[0.3em]" />
        {error && <p className="rise text-[13px] text-bad" role="alert">{error}</p>}
        <button disabled={busy || code.length !== 6} className="btn btn-dark press h-10 w-full justify-center">{busy ? "One moment…" : "Make the account mine"}</button>
      </form>
      <button onClick={() => { setClaim(null); setCode(""); setError(""); }} className="mt-4 text-left text-[13px] text-ink-2 hover:text-ink"><Icon name="back" size={12} className="inline" /> Back</button>
    </div>
  );

  return (
    <div>
      {note}
      <div className="mt-5"><GoogleButton onCredential={(credential) => send({ action: "google", credential })} /></div>
      <form onSubmit={(e) => { e.preventDefault(); send(mode === "signup" ? { action: mode, firstName: first, lastName: last, email, password } : { action: mode, email, password }); }} className="mt-3 space-y-2.5">
        {mode === "signup" && (
          <div className="flex gap-2">
            <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" aria-label="First name" autoComplete="given-name" className="field h-10 min-w-0 flex-1" />
            <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" aria-label="Last name" autoComplete="family-name" className="field h-10 min-w-0 flex-1" />
          </div>
        )}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" autoComplete="email" className="field h-10" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"} aria-label="Password" autoComplete={mode === "signup" ? "new-password" : "current-password"} className="field h-10" />
        {error && <p className="rise text-[13px] text-bad" role="alert">{error}</p>}
        <button disabled={busy} className="btn btn-dark press h-10 w-full justify-center">{busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }} className="mt-4 text-left text-[13px] text-ink-2 hover:text-ink">
        {mode === "login" ? "New to Questhand? Create an account" : "Already have an account? Sign in"} <Icon name="arrow" size={12} className="inline" />
      </button>
    </div>
  );
}
