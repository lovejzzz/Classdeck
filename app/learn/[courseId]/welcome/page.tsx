"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * A student's own link (from their invitation email, or from a form). Opening it signs them straight in to their
 * board. The token is in the URL fragment, so it never reaches server logs; it's removed from the address bar at once.
 */
export default function WelcomePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const hash = useSyncExternalStore(noop, () => window.location.hash.slice(1), () => null);
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!hash || started.current) return;
    started.current = true;
    fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", courseId, token: hash }) })
      .then((r) => r.json())
      .then((r) => {
        history.replaceState(null, "", window.location.pathname);
        if (r.ok) router.replace(`/learn/${courseId}/${r.studentId}`);
        else setError(r.error ?? "This link doesn’t work");
      })
      .catch(() => setError("Couldn’t reach Questhand. Check your connection and reload."));
  }, [hash, courseId, router]);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-16">
      {error ? (
        <div className="rise">
          <h1 className="text-[22px] font-semibold tracking-tight">This link doesn’t work</h1>
          <p className="mt-2 text-[13.5px] text-ink-2" role="alert">{error}</p>
          <Link href={`/learn/${courseId}`} className="btn btn-ghost press mt-4">Sign in with your class code</Link>
        </div>
      ) : hash === "" ? (
        <p className="text-[13.5px] text-ink-2">This page needs the full link from your email. Open it from there, or sign in with your class code.</p>
      ) : (
        <p className="text-[13.5px] text-ink-3">Opening your board…</p>
      )}
    </main>
  );
}
