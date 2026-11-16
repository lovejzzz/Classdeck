"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Me = { kind: "teacher" | "student" | null; name?: string; email?: string; picture?: string | null; courseId?: string; studentId?: string; courseTitle?: string };

/** The signed-in person's photo (or initial) with a small menu: who they are, and Sign out. Shows nothing when signed out. */
export function AccountMenu({ className = "" }: { className?: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fetch("/api/auth").then((r) => r.json()).then(setMe).catch(() => {});
  }, []);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", off);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", off); window.removeEventListener("keydown", esc); };
  }, [open]);
  if (!me?.kind || !me.name) return null;
  async function signOut() {
    await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    window.location.href = "/";
  }
  const face = (size: number) =>
    me.picture && !broken ? (
      // eslint-disable-next-line @next/next/no-img-element -- a small remote profile photo
      <img src={me.picture} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)} className="rounded-full object-cover" style={{ width: size, height: size }} />
    ) : (
      <span className="inline-flex items-center justify-center rounded-full bg-ink font-medium text-white" style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden="true">{me.name!.slice(0, 1).toUpperCase()}</span>
    );
  return (
    <div ref={box} className={`relative ${className}`}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`Account: ${me.name}`}
        className="press flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-line hover:ring-line-strong">
        {face(32)}
      </button>
      {open && (
        <div role="menu" className="pop absolute right-0 top-11 z-40 w-60 rounded-xl border border-line bg-white p-1.5 shadow-[0_16px_40px_-16px_rgba(20,20,18,0.35)]">
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            {face(36)}
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-medium">{me.name}</div>
              <div className="truncate text-[12px] text-ink-3">{me.kind === "teacher" ? me.email : `Student · ${me.courseTitle ?? ""}`}</div>
            </div>
          </div>
          <div className="my-1 border-t border-line" />
          {me.kind === "teacher" && <Link role="menuitem" href="/" onClick={() => setOpen(false)} className="press block rounded-lg px-2.5 py-2 text-[13px] hover:bg-lane">Your courses</Link>}
          {me.kind === "student" && <Link role="menuitem" href={`/learn/${me.courseId}/${me.studentId}`} onClick={() => setOpen(false)} className="press block rounded-lg px-2.5 py-2 text-[13px] hover:bg-lane">My cards</Link>}
          <button role="menuitem" onClick={signOut} className="press block w-full rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-lane">Sign out</button>
        </div>
      )}
    </div>
  );
}
