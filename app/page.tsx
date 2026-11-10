"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Cover } from "@/components/Cover";
import { Icon } from "@/components/Icon";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [needPass, setNeedPass] = useState(false);
  const [courses, setCourses] = useState<{ id: string; title: string; weeks: number; cards: number; students: number }[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [start, setStart] = useState<"blank" | "template" | "caps">("template");
  useEffect(() => {
    fetch("/api/courses").then((r) => r.json()).then((d) => setCourses(d.courses)).catch(() => setCourses([]));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const r = await fetch("/api/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, subtitle, start }) }).then((x) => x.json());
    if (r.ok) router.push(`/teach/${r.id}`);
    else {
      setBusy(false);
      setError(r.error);
    }
  }
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
        Teachers lay out cards week by week, with paths for different students. Students open today’s hand: cards with text, images, video, audio, files, links, and tools that look things up, pull live data, or ask a tutor.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="rise card overflow-hidden" style={{ "--i": 3 } as React.CSSProperties}>
          <Cover type="read" label="Teacher" height={88} />
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-medium">Your courses</span>
              {!creating && <button onClick={() => setCreating(true)} className="btn btn-ghost press h-7 px-2.5 text-[12px]"><Icon name="plus" size={12} /> New course</button>}
            </div>
            {creating ? (
              <form onSubmit={create} className="rise mt-3 space-y-2.5">
                <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course name, e.g. Debate Club" aria-label="Course name" className="field" />
                <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtitle (optional), e.g. Spring 2027 · Tuesdays" aria-label="Subtitle" className="field" />
                <div className="grid gap-1.5">
                  {([
                    ["blank", "Start blank", "One empty week. Build every card yourself."],
                    ["template", "Standard weeks", "Three weeks from the CaPS weekly template, ready to rename."],
                    ["caps", "Copy the CaPS course", "All seven weeks and cards, with no students or work."],
                  ] as const).map(([k, label, hint]) => (
                    <label key={k} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors ${start === k ? "border-ink" : "border-line hover:border-line-strong"}`}>
                      <input type="radio" name="start" checked={start === k} onChange={() => setStart(k)} className="mt-0.5 accent-[#1b1b1a]" />
                      <span><span className="font-medium">{label}</span><span className="block text-[12px] text-ink-3">{hint}</span></span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={!title.trim() || busy} className="btn btn-dark press">{busy ? "Creating…" : "Create course"}</button>
                  <button type="button" onClick={() => setCreating(false)} className="btn btn-quiet press">Cancel</button>
                </div>
              </form>
            ) : (
              <div className="mt-2 divide-y divide-line">
                {courses === null && <div className="skeleton my-2 h-10" />}
                {courses?.map((c) => (
                  <Link key={c.id} href={`/teach/${c.id}`} className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-[#fafaf9]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{c.title}</span>
                      <span className="mono block">{c.weeks} weeks · {c.cards} cards · {c.students} students</span>
                    </span>
                    <Icon name="arrow" size={14} className="text-ink-3 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

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
