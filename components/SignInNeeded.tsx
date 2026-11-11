import Link from "next/link";

/** Shown when a page needs a sign-in this browser doesn't have. */
export function SignInNeeded({ who, courseId, next }: { who: "teacher" | "student"; courseId: string; next: string }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16 text-center">
      <span className="mx-auto inline-block h-5 w-5 rounded-[6px] bg-ink" />
      <h1 className="mt-5 text-[20px] font-semibold tracking-tight">{who === "teacher" ? "Sign in to open this course" : "Sign in to your class"}</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-2">
        {who === "teacher" ? "Only the teacher who owns this course can open its teacher view." : "Use your class code, your name, and your PIN."}
      </p>
      <Link href={who === "teacher" ? `/login?next=${encodeURIComponent(next)}` : `/learn/${courseId}`} className="btn btn-dark press mx-auto mt-5 h-9 px-5">
        {who === "teacher" ? "Sign in" : "Join with class code"}
      </Link>
    </main>
  );
}
