"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignInPanel } from "@/components/SignInPanel";
import { LogoMark } from "@/components/Logo";
import { useQuery } from "@/lib/client";

/** Sign in, or make an account (one account for teaching and learning). `?next=` is where to go after. */
export default function Login() {
  const router = useRouter();
  const query = useQuery();
  const next = query?.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <Link href="/" className="rise flex items-center gap-2 text-[13px] font-medium text-ink-2"><LogoMark size={15} />Questhand</Link>
      <h1 className="rise mt-6 text-[24px] font-semibold tracking-tight">Sign in</h1>
      <p className="rise mt-1.5 text-[13.5px] text-ink-2">One account for everything: the courses you teach and the ones you’re a student in.</p>
      <div className="rise" style={{ "--i": 1 } as React.CSSProperties}>
        <SignInPanel as={query?.get("as") === "student" ? "student" : undefined} startMode={query?.get("mode") === "signup" ? "signup" : "login"} onDone={() => router.push(safeNext)} />
      </div>
    </main>
  );
}
