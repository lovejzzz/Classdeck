import Link from "next/link";
import { VERSION } from "@/lib/version";

/** The legal pages and the version (which opens the changelog). Shown on Settings only, out of the way of the work. */
export function SiteFooter() {
  return (
    <footer className="no-print mt-10 flex justify-center gap-4 px-4 pb-6 text-[12px] text-ink-3">
      <Link href="/privacy" className="hover:text-ink">Privacy</Link>
      <Link href="/terms" className="hover:text-ink">Terms</Link>
      <Link href="/changelog" className="font-mono hover:text-ink" title="What’s new">v{VERSION}</Link>
    </footer>
  );
}
