import Link from "next/link";

export const metadata = { title: "Terms · Questhand" };

/** The short rules for using Questhand. */
export default function Terms() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-14 text-[15px] leading-relaxed text-ink-2 [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
      <Link href="/" className="flex items-center gap-2 text-[13px] font-medium text-ink-2"><span className="inline-block h-4 w-4 rounded-[5px] bg-ink" />Questhand</Link>
      <h1 className="mt-6 text-[28px] font-semibold tracking-tight text-ink">Terms of use</h1>
      <p className="mt-2 text-[13px] text-ink-3">Last updated November 12, 2026</p>
      <ul className="mt-6">
        <li>Questhand is offered as is, while it’s being built. Features may change.</li>
        <li>Teachers are responsible for the courses they create and for having the right to share what they upload.</li>
        <li>Upload only work that is yours to share. Don’t upload anything unlawful, hateful, or private about someone else.</li>
        <li>Keep your sign-in to yourself. A student’s PIN is for that student only.</li>
        <li>Uploads have size limits, and files may be cleared after a course ends.</li>
        <li>We may remove content or accounts that break these rules.</li>
      </ul>
      <p className="mt-10 text-[13px]"><Link href="/privacy" className="underline">Privacy</Link></p>
    </main>
  );
}
