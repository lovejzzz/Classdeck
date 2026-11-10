"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Cover } from "@/components/Cover";
import { Icon } from "@/components/Icon";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [needPass, setNeedPass] = useState(false);
  const [pass, setPass] = useState("");

  async function join() {
    if (!code.trim()) return;
    setError("");
    setBusy(true);
    const res = await fetch(`/api/join?code=${encodeURIComponent(code)}${needPass ? `&passcode=${encodeURIComponent(pass)}` : ""}`);
    const data = await res.json();
    if (res.ok) router.push(`/learn/${data.courseId}`);
    else {
      setBusy(false);
      if (data.needPasscode) setNeedPass(true);
      setError(data.error);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-16">
      <div className="rise flex items-center gap-2 text-[13px] font-medium text-ink-2">
        <span className="inline-block h-4 w-4 rounded-[5px] bg-ink" />
        Classdeck
      </div>
      <h1 className="rise mt-6 max-w-xl text-[34px] font-semibold leading-[1.15] tracking-tight" style={{ "--i": 1 } as React.CSSProperties}>
        Every lesson is a deck. Every student gets their own hand.
      </h1>
      <p className="rise mt-3 max-w-lg text-[15px] leading-relaxed text-ink-2" style={{ "--i": 2 } as React.CSSProperties}>
        Teachers lay out cards week by week, with versions for different students. Students open today’s hand: cards with text, images, video, audio, files, links, and tools that look things up, pull live data, or ask a tutor.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link href="/teach/demo" className="rise card card-hover press group overflow-hidden" style={{ "--i": 3 } as React.CSSProperties}>
          <Cover type="read" label="Teacher" height={88} />
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-medium">Open the sample course</span>
              <Icon name="arrow" className="text-ink-3 transition-transform duration-300 group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1 text-[13px] text-ink-2">Build the deck, follow the class, and choose which tools students get.</p>
          </div>
        </Link>

        <div className="rise card overflow-hidden" style={{ "--i": 4 } as React.CSSProperties}>
          <Cover type="quiz" label="Student" height={88} />
          <div className="p-4">
            <span className="text-[15px] font-medium">Join with a class code</span>
            <p className="mt-1 text-[13px] text-ink-2">No sign-up needed. The sample code is <span className="mono text-ink-2">CAPS26</span>.</p>
            <div className="mt-3 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && join()}
                placeholder="Class code"
                aria-label="Class code"
                className="field w-36 font-mono tracking-[0.2em]"
              />
              <button onClick={join} disabled={busy || !code.trim()} className="btn btn-dark press">
                {busy ? "Joining…" : "Join"}
              </button>
            </div>
            {needPass && (
              <input autoFocus type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && join()}
                placeholder="Class passcode" aria-label="Class passcode" className="rise field mt-2 w-[13.5rem]" />
            )}
            {error && <p className="rise mt-2 text-[13px] text-bad">{error}</p>}
          </div>
        </div>
      </div>

      <Link href="/connectors" className="rise mt-6 inline-flex w-fit items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink" style={{ "--i": 5 } as React.CSSProperties}>
        <Icon name="plug" size={14} />
        Connectors: plug in outside APIs
      </Link>
    </main>
  );
}
