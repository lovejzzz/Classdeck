"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar, Icon } from "@/components/Icon";
import { useQuery } from "@/lib/client";

type Roster = { courseId: string; title: string; demo: boolean; students: { id: string; name: string; hasPin: boolean }[] };

/** Joining a class: class code → your name → your 4-digit PIN (chosen the first time). */
export default function PickName() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const query = useQuery();
  const [code, setCode] = useState("");
  const [roster, setRoster] = useState<Roster | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Roster["students"][number] | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const passcode = () => {
    try {
      return sessionStorage.getItem(`passcode:${courseId}`) ?? "";
    } catch {
      return "";
    }
  };

  async function load(c: string) {
    setError("");
    const res = await fetch(`/api/join?code=${encodeURIComponent(c)}&passcode=${encodeURIComponent(passcode())}`);
    const data = await res.json();
    if (!res.ok || data.courseId !== courseId) return setError(data.error ?? "That code is for a different class");
    setRoster(data);
  }

  const linkCode = query?.get("code") ?? "";
  useEffect(() => {
    // Already signed in to this class? Go straight to your cards.
    fetch("/api/auth").then((r) => r.json()).then((me) => {
      if (me.kind === "student" && me.courseId === courseId) router.replace(`/learn/${courseId}/${me.studentId}`);
    });
  }, [courseId, router]);
  useEffect(() => {
    if (!linkCode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill from the link
    setCode(linkCode);
    load(linkCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkCode]);

  async function signIn(e?: React.FormEvent) {
    e?.preventDefault();
    if (!picked || !roster) return;
    if (roster.demo) return router.push(`/learn/${courseId}/${picked.id}`);
    setBusy(true);
    setError("");
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "student", courseId, studentId: picked.id, pin, code, passcode: passcode() }) }).then((x) => x.json());
    if (r.ok) router.push(`/learn/${courseId}/${picked.id}`);
    else {
      setBusy(false);
      setPin("");
      setError(r.error);
      pinRef.current?.focus();
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16">
      {!roster ? (
        <form className="rise" onSubmit={(e) => { e.preventDefault(); load(code); }}>
          <h1 className="text-[24px] font-semibold tracking-tight">Join your class</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-2">Enter the class code your teacher gave you.</p>
          <div className="mt-5 flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Class code" aria-label="Class code" className="field w-40 font-mono tracking-[0.2em]" autoFocus />
            <button disabled={!code.trim()} className="btn btn-dark press">Continue</button>
          </div>
          {error && <p className="rise mt-2 text-[13px] text-bad" role="alert">{error}</p>}
        </form>
      ) : !picked ? (
        <>
          <p className="rise eyebrow">{roster.title}</p>
          <h1 className="rise mt-1 text-[24px] font-semibold tracking-tight">Which one is you?</h1>
          {roster.students.length === 0 && <p className="mt-6 text-[13.5px] text-ink-2">Your teacher hasn’t added the class list yet. Check back soon.</p>}
          <div className="rise card mt-6 divide-y divide-line overflow-hidden">
            {roster.students.map((s, i) => (
              <button key={s.id} onClick={() => { setPicked(s); setError(""); if (roster.demo) router.push(`/learn/${courseId}/${s.id}`); }} style={{ "--i": i } as React.CSSProperties}
                className="rise group flex w-full items-center gap-3 bg-white px-4 py-3 text-left text-[14px] hover:bg-[#fafaf9]">
                <Avatar name={s.name} size={26} />
                <span className="flex-1 font-medium">{s.name}</span>
                <Icon name="arrow" size={14} className="text-ink-3 opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100" />
              </button>
            ))}
          </div>
          {roster.demo && <p className="mt-4 text-[12.5px] text-ink-3">This is the open demo course, so there’s no PIN.</p>}
        </>
      ) : (
        <form className="rise" onSubmit={signIn}>
          <button type="button" onClick={() => { setPicked(null); setPin(""); setError(""); }} className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink"><Icon name="back" size={13} /> Not you?</button>
          <div className="mt-5 flex items-center gap-3">
            <Avatar name={picked.name} size={40} />
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight">Hi, {picked.name}</h1>
              <p className="text-[13.5px] text-ink-2">{picked.hasPin ? "Enter your 4-digit PIN." : "Choose a 4-digit PIN. You’ll use it to get back in, so remember it."}</p>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <input ref={pinRef} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" autoFocus
              placeholder="••••" aria-label={picked.hasPin ? "Your PIN" : "Choose a PIN"} className="field w-32 text-center font-mono text-[20px] tracking-[0.5em]" />
            <button disabled={pin.length !== 4 || busy} className="btn btn-dark press">{busy ? "…" : picked.hasPin ? "Sign in" : "Set PIN and go"}</button>
          </div>
          {error && <p className="rise mt-2 text-[13px] text-bad" role="alert">{error}</p>}
        </form>
      )}
      <Link href="/" className="mt-10 inline-block text-[12.5px] text-ink-3 hover:text-ink">← Classdeck home</Link>
    </main>
  );
}
