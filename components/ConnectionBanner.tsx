"use client";

import Link from "next/link";

/** Shown over a loaded page when the session has ended or the server can't be reached, so work doesn't silently stop saving. */
export function ConnectionBanner({ needAuth, error, signInHref }: { needAuth: "teacher" | "student" | null; error: string | null; signInHref: string }) {
  if (!needAuth && !error) return null;
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[60] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-ink px-4 py-2.5 text-center text-[13.5px] text-white">
      {needAuth ? (
        <>
          <span>You’ve been signed out. Changes won’t save until you sign in again.</span>
          <Link href={signInHref} className="rounded-md bg-white px-2.5 py-1 font-medium text-ink">Sign in</Link>
        </>
      ) : (
        <span>Can’t reach the server right now. Changes may not save; this page will reconnect on its own.</span>
      )}
    </div>
  );
}
