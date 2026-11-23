"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LogoMark } from "@/components/Logo";
import { SignInPanel } from "@/components/SignInPanel";

const noop = () => () => {};
type Invite = { courseTitle: string; teacher: string | null; name: string; email: string | null };

/**
 * A student's own invitation link (from their email, a form, or copied by their teacher). Signed in, opening it adds
 * the class to their account and opens their board. Signed out, it says whose invitation it is and asks them to sign
 * in or make an account first, then carries on. The token is in the URL fragment, so it never reaches server logs; it
 * stays in the address bar until it has worked, so it survives signing in.
 */
export default function WelcomePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const hash = useSyncExternalStore(noop, () => window.location.hash.slice(1), () => null);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState<Invite | null>(null);
  // A classmate already has the name on this invitation: they choose another one.
  const [rename, setRename] = useState<{ name: string; why: string } | null>(null);
  const started = useRef(false);

  async function use(token: string, name?: string) {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", courseId, token, name }) })
      .then((x) => x.json()).catch(() => ({ ok: false, error: "Couldn’t reach Questhand. Check your connection and reload." }));
    if (r.ok) {
      history.replaceState(null, "", window.location.pathname);
      router.replace(`/learn/${courseId}/${r.studentId}`);
    } else if (r.needAccount) setInvite(r);
    else if (r.needName) setRename({ name: name ?? r.name ?? "", why: r.error });
    else { history.replaceState(null, "", window.location.pathname); setError(r.error ?? "This link doesn’t work"); }
  }

  useEffect(() => {
    if (!hash || started.current) return;
    started.current = true;
    void use(hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <Link href="/" className="rise flex items-center gap-2 text-[13px] font-medium text-ink-2"><LogoMark size={15} />Questhand</Link>
      {rename ? (
        <form className="rise mt-6" onSubmit={(e) => { e.preventDefault(); if (hash && rename.name.trim()) void use(hash, rename.name.trim()); }}>
          <h1 className="text-[22px] font-semibold tracking-tight">Choose your name in this class</h1>
          <p className="mt-2 text-[13.5px] text-ink-2" role="alert">{rename.why}</p>
          <input autoFocus value={rename.name} onChange={(e) => setRename({ ...rename, name: e.target.value })} aria-label="Your name in this class" className="field mt-4 h-10" />
          <button className="btn btn-dark press mt-3 h-10 w-full justify-center">Join the class</button>
        </form>
      ) : error ? (
        <div className="rise mt-6">
          <h1 className="text-[22px] font-semibold tracking-tight">This link doesn’t work</h1>
          <p className="mt-2 text-[13.5px] text-ink-2" role="alert">{error}</p>
          <Link href="/" className="btn btn-ghost press mt-4">Go to your courses</Link>
        </div>
      ) : invite ? (
        <div className="rise mt-6">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">You’re invited</p>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight">{invite.courseTitle}</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-2">
            {invite.teacher ? <><b className="font-medium text-ink">{invite.teacher}</b> added you</> : "You were added"} to the class as {invite.name}. Sign in, or make a free account, and the class is added to it.
          </p>
          <SignInPanel as="student" startMode="signup" email={invite.email ?? ""} onDone={() => (hash ? use(hash) : undefined)} />
        </div>
      ) : hash === "" ? (
        <p className="rise mt-6 text-[13.5px] text-ink-2">This page needs the full link from your invitation email. Open it from there.</p>
      ) : (
        <p className="rise mt-6 text-[13.5px] text-ink-3">Opening your invitation…</p>
      )}
    </main>
  );
}
