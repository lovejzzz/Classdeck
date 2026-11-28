"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { splitName } from "@/lib/namesplit";

/**
 * Every account has a first and a last name. One that doesn't yet (made before names were asked, or a Google account
 * without both) is asked once, on its next visit, before anything else: it's how teachers, classmates and messages
 * know who they are. Their current name is filled in to start from.
 */
export function NameGate() {
  const path = usePathname();
  const [ask, setAsk] = useState<{ first: string; last: string; email: string } | null>(null);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Pages anyone reads (legal, the changelog, sign-in itself) never ask.
  const quiet = /^\/(login|legal|privacy|terms|changelog|guest)/.test(path ?? "");
  useEffect(() => {
    if (quiet) return;
    try { if (sessionStorage.getItem("questhand:named") === "1") return; } catch { /* storage blocked */ }
    fetch("/api/auth").then((r) => r.json()).then((j: { kind?: string | null; needsName?: boolean; name?: string; firstName?: string | null; lastName?: string | null; email?: string }) => {
      if (j.kind !== "teacher") return;
      if (!j.needsName) { try { sessionStorage.setItem("questhand:named", "1"); } catch { /* storage blocked */ } return; }
      const s = j.firstName || j.lastName ? { first: j.firstName ?? "", last: j.lastName ?? "" } : splitName(j.name ?? "");
      setFirst(s.first); setLast(s.last); setAsk({ ...s, email: j.email ?? "" });
    }).catch(() => {});
  }, [quiet]);
  if (!ask) return null;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!first.trim() || !last.trim()) return setError(!first.trim() ? "Enter your first name" : "Enter your last name");
    setBusy(true);
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setName", firstName: first, lastName: last }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Can’t reach Questhand. Check your connection." }));
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn’t save");
    try { sessionStorage.setItem("questhand:named", "1"); } catch { /* storage blocked */ }
    // Pages already open show the old name: start them again with the new one.
    window.location.reload();
  }
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-ink/30 p-4 pt-[14vh]">
      <form role="dialog" aria-modal="true" aria-labelledby="name-gate-title" onSubmit={save} className="pop w-full max-w-sm rounded-2xl bg-white p-6 shadow-[0_30px_80px_-24px_rgba(20,20,18,0.45)]">
        <h2 id="name-gate-title" className="text-[20px] font-semibold tracking-tight">What’s your name?</h2>
        <p className="mt-1.5 text-[13.5px] text-ink-2">Your teachers, classmates and anyone you message see it, with your email {ask.email && <span className="text-ink">{ask.email}</span>}.</p>
        <div className="mt-4 flex gap-2">
          <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" aria-label="First name" autoComplete="given-name" autoFocus className="field h-10 min-w-0 flex-1" />
          <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" aria-label="Last name" autoComplete="family-name" className="field h-10 min-w-0 flex-1" />
        </div>
        {error && <p className="mt-2 text-[13px] text-bad" role="alert">{error}</p>}
        <button disabled={busy} className="btn btn-dark press mt-4 h-10 w-full justify-center">{busy ? "Saving…" : "Continue"}</button>
      </form>
    </div>
  );
}
