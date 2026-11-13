"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * The private link a student gets after filling in the class's Google Form. The one-time token
 * is in the URL fragment, so it never reaches server logs; it's removed from the address bar at once.
 */
export default function WelcomePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const hash = useSyncExternalStore(noop, () => window.location.hash.slice(1), () => null);
  const [info, setInfo] = useState<{ token: string; name: string; courseTitle: string } | null>(null);
  const [error, setError] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hash === null || info) return;
    const token = hash;
    fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", courseId, token }) })
      .then((r) => r.json())
      .then((r) => {
        history.replaceState(null, "", window.location.pathname);
        if (r.ok) setInfo({ token, name: r.name, courseTitle: r.courseTitle });
        else setError(r.error ?? "This link doesn’t work");
      })
      .catch(() => setError("Couldn’t reach Questhand. Check your connection and reload."));
  }, [hash, courseId, info]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!info) return;
    if (pin !== pin2) return setError("The two PINs don’t match");
    setBusy(true);
    setError("");
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", courseId, token: info.token, pin }) }).then((x) => x.json());
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Couldn’t set your PIN");
    router.replace(`/learn/${courseId}/${r.studentId}`);
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-16">
      {info ? (
        <form className="rise" onSubmit={submit}>
          <div className="eyebrow">{info.courseTitle}</div>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight">Welcome, {info.name}</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">Your board is ready. Choose a 4-digit PIN: next time, sign in with your class code, your name, and this PIN.</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="new-password" autoFocus
              placeholder="••••" aria-label="Choose a PIN" className="field w-32 text-center font-mono text-[20px] tracking-[0.5em]" />
            <input value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="new-password"
              placeholder="••••" aria-label="Type the PIN again" className="field w-32 text-center font-mono text-[20px] tracking-[0.5em]" />
            <button disabled={pin.length !== 4 || pin2.length !== 4 || busy} className="btn btn-dark press">{busy ? "…" : "Open my board"}</button>
          </div>
          {error && <p className="rise mt-2 text-[13px] text-bad" role="alert">{error}</p>}
        </form>
      ) : error ? (
        <div className="rise">
          <h1 className="text-[22px] font-semibold tracking-tight">This link doesn’t work</h1>
          <p className="mt-2 text-[13.5px] text-ink-2" role="alert">{error}</p>
          <Link href={`/learn/${courseId}`} className="btn btn-ghost press mt-4">Sign in with your class code</Link>
        </div>
      ) : hash === "" ? (
        <p className="text-[13.5px] text-ink-2">This page needs the full link from your email. Open it from there, or sign in with your class code.</p>
      ) : (
        <div className="skeleton h-40" />
      )}
    </main>
  );
}
