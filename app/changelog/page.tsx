import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { CHANGELOG } from "@/lib/version";

export const metadata: Metadata = { title: "Changelog · Questhand" };

/** What changed in each version of Questhand, newest first. */
export default function Changelog() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Link href="/" className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-2 hover:text-ink"><LogoMark size={15} />Questhand</Link>
      <h1 className="mt-6 text-[26px] font-semibold tracking-tight">Changelog</h1>
      <div className="mt-8 space-y-10">
        {CHANGELOG.map((v) => (
          <section key={v.version} aria-labelledby={`v-${v.version}`}>
            <h2 id={`v-${v.version}`} className="flex items-baseline gap-3">
              <span className="font-mono text-[17px] font-semibold">v{v.version}</span>
              <span className="text-[13px] text-ink-3">{new Date(`${v.date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-ink-2 marker:text-ink-3">
              {v.changes.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
