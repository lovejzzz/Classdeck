"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { GoogleButton } from "./GoogleButton";

/**
 * A new account confirms its email before going on: a six-digit code was sent to it at sign-up. Send again, sign in
 * with Google instead (Google has checked the address), or sign out. Until it's confirmed, nobody can find the account
 * by its address; the server holds to that whatever this page shows.
 */
export function VerifyGate() {
  const path = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const quiet = /^\/(login|legal|privacy|terms|changelog|guest)/.test(path ?? "");
  useEffect(() => {
    if (quiet) return;
    fetch("/api/auth").then((r) => r.json()).then((j: { kind?: string | null; verifyNeeded?: boolean; email?: string }) => {
      if (j.kind === "teacher" && j.verifyNeeded) setEmail(j.email ?? "");
    }).catch(() => {});
  }, [quiet, path]);
  if (email === null) return null;
  const post = (body: object) => fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Can’t reach Questhand. Check your connection." }));
  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true); setError("");
    const r = await post({ action: "verifyCode", code });
    setBusy(false);
    if (r.ok) window.location.reload();
    else setError(r.error ?? "That code isn’t right");
  }
  async function again() {
    setError(""); setNote("");
    const r = await post({ action: "sendCode" });
    if (r.devCode) console.info(`[dev] Questhand code: ${r.devCode}`);
    if (r.ok) setNote(`A new code is on its way to ${email}.`); else setError(r.error ?? "Couldn’t send a code");
  }
  return (
    <div className="fixed inset-0 z-[125] flex items-start justify-center bg-ink/30 p-4 pt-[12vh]">
      <div role="dialog" aria-modal="true" aria-labelledby="verify-title" className="pop w-full max-w-sm rounded-2xl bg-white p-6 shadow-[0_30px_80px_-24px_rgba(20,20,18,0.45)]">
        <h2 id="verify-title" className="text-[20px] font-semibold tracking-tight">Check your email</h2>
        <p className="mt-1.5 text-[13.5px] text-ink-2">We sent a 6-digit code to <span className="font-medium text-ink">{email}</span>. Type it here to confirm the address is yours.</p>
        <form onSubmit={check} className="mt-4 space-y-2.5">
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" aria-label="Code from your email" autoFocus
            className="field h-11 text-center font-mono text-[18px] tracking-[0.3em]" />
          {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
          {note && !error && <p className="text-[13px] text-ink-2" role="status">{note}</p>}
          <button disabled={busy || code.length !== 6} className="btn btn-dark press h-10 w-full justify-center">{busy ? "Checking…" : "Confirm"}</button>
        </form>
        <p className="mt-3 text-[12.5px] text-ink-3">Nothing came? Look in spam, or <button onClick={again} className="underline underline-offset-2 hover:text-ink">send a new code</button>.</p>
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-2 text-[12.5px] text-ink-3">Or sign in with Google using this address instead:</p>
          <GoogleButton onCredential={async (credential) => { const r = await post({ action: "google", credential }); if (r.ok) window.location.reload(); else setError(r.error ?? "Google sign-in didn’t work"); }} />
          <button onClick={async () => { await post({ action: "logout" }); window.location.href = "/"; }} className="mt-3 text-[12.5px] text-ink-3 underline underline-offset-2 hover:text-ink">Sign out</button>
        </div>
      </div>
    </div>
  );
}
