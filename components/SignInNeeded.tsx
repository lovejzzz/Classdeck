import Link from "next/link";
import { LogoMark } from "./Logo";

/** Shown when a page needs a sign-in this browser doesn't have. */
export function SignInNeeded({ who, courseId, next, detail }: { who: "teacher" | "student"; courseId: string; next: string; detail?: string }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16 text-center">
      <LogoMark size={28} className="mx-auto" />
      <h1 className="mt-5 text-[20px] font-semibold tracking-tight">{who === "teacher" ? "Sign in to open this course" : "Sign in to your class"}</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-2">
        {detail ?? (who === "teacher" ? "Only the course’s teachers can open its teacher view." : "Sign in with the account you joined this class with. New to the class? Open the link in your invitation email, or join with the class code from your courses page.")}
      </p>
      <Link href={`/login?next=${encodeURIComponent(next)}`} data-course={courseId} className="btn btn-dark press mx-auto mt-5 h-9 px-5">
        {detail ? "Sign in with another account" : "Sign in"}
      </Link>
    </main>
  );
}
