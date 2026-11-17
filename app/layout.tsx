import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SkipLink } from "@/components/SkipLink";
import { Toaster } from "@/components/Toaster";
import { ConfirmHost } from "@/components/Confirm";
import Link from "next/link";
import { VERSION } from "@/lib/version";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Questhand",
  description: "Lessons as decks of cards. Teachers deal each week; every student gets a hand of their own.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SkipLink />
        {children}
        {/* Every page ends with the same quiet line: the legal pages and the version, which opens the changelog. */}
        <footer className="no-print mt-auto flex justify-center gap-4 px-4 pb-6 pt-10 text-[12px] text-ink-3">
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/changelog" className="font-mono hover:text-ink" title="What’s new">v{VERSION}</Link>
        </footer>
        <Toaster />
        <ConfirmHost />
      </body>
    </html>
  );
}
