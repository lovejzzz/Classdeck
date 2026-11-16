"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountMenu } from "@/components/AccountMenu";
import { Cover } from "@/components/Cover";
import { GoogleButton } from "@/components/GoogleButton";
import { SKILL_SETS } from "@/lib/skillsets";
import { Icon } from "@/components/Icon";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [needPass, setNeedPass] = useState(false);
  const [courses, setCourses] = useState<{ id: string; title: string; subtitle?: string; weeks: number; cards: number; students: number; today?: string | null; toReview?: number; waiting?: number }[] | null>(null);
  const [unclaimed, setUnclaimed] = useState<{ id: string; title: string; students: number }[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [start, setStart] = useState<"blank" | "template" | "caps">("template");
  const [skillSet, setSkillSet] = useState("speaking");
  const [me, setMe] = useState<{ kind: string | null; name?: string; email?: string; courseId?: string; studentId?: string; courseTitle?: string } | null>(null);
  useEffect(() => {
    fetch("/api/courses").then((r) => r.json()).then((d) => { setCourses(d.courses); setUnclaimed(d.unclaimed ?? []); }).catch(() => setCourses([]));
    fetch("/api/auth").then((r) => r.json()).then(setMe).catch(() => setMe({ kind: null }));
  }, []);
  async function google(credential: string) {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "google", credential }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Can’t reach the server" }));
    if (r.ok) window.location.reload();
    else setError(r.error ?? "Google sign-in didn’t work. Try again.");
  }
  async function signOut() {
    await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    window.location.reload();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const r = await fetch("/api/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, subtitle, start, skillSet }) }).then((x) => x.json());
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
    if (res.ok) {
      try {
        if (pass) sessionStorage.setItem(`passcode:${data.courseId}`, pass);
      } catch {}
      router.push(`/learn/${data.courseId}?code=${encodeURIComponent(code)}`);
    }
    else {
      setBusy(false);
      if (data.needPasscode) setNeedPass(true);
      setError(data.error);
    }
  }

  const createForm = (
              <form onSubmit={create} className="rise mt-3 space-y-2.5">
                <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course name, e.g. Debate Club" aria-label="Course name" className="field" />
                <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtitle (optional), e.g. Spring 2027 · Tuesdays" aria-label="Subtitle" className="field" />
                <div className="grid gap-1.5">
                  {([
                    ["blank", "Start blank", "One empty week. Build every card yourself."],
                    ["template", "Standard weeks", "Three weeks with a ready-made rhythm: goal, practice, group feedback, reflection."],
                    ["caps", "Copy the CaPS course", "All seven weeks and cards, with no students or work."],
                  ] as const).map(([k, label, hint]) => (
                    <label key={k} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors ${start === k ? "border-ink" : "border-line hover:border-line-strong"}`}>
                      <input type="radio" name="start" checked={start === k} onChange={() => setStart(k)} className="mt-0.5 accent-[#1b1b1a]" />
                      <span><span className="font-medium">{label}</span><span className="block text-[12px] text-ink-3">{hint}</span></span>
                    </label>
                  ))}
                </div>
                {start !== "caps" && (
                  <label className="flex items-center gap-2 text-[13px] text-ink-2">Subject skills
                    <select value={skillSet} onChange={(e) => setSkillSet(e.target.value)} className="field h-9 w-auto py-0">
                      {SKILL_SETS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                    <span className="text-[12px] text-ink-3">You can change them later.</span>
                  </label>
                )}
                <div className="flex gap-2">
                  <button type="submit" disabled={!title.trim() || busy} className="btn btn-dark press">{busy ? "Creating…" : "Create course"}</button>
                  <button type="button" onClick={() => setCreating(false)} className="btn btn-quiet press">Cancel</button>
                </div>
              </form>
  );

  // A signed-in teacher lands on their courses, with what needs doing today, rather than the welcome page.
  if (me?.kind === "teacher") {
    const mine = (courses ?? []).filter((c) => c.id !== "demo");
    const demo = (courses ?? []).find((c) => c.id === "demo");
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        <header className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-[13px] font-medium text-ink-2"><span className="inline-block h-4 w-4 rounded-[5px] bg-ink" />Questhand</span>
          <span className="flex-1" />
          <AccountMenu />
        </header>
        <div className="mt-8 flex flex-wrap items-end gap-3">
          <h1 className="flex-1 text-[26px] font-semibold tracking-tight">Your courses</h1>
          {!creating && <button onClick={() => setCreating(true)} className="btn btn-dark press h-9"><Icon name="plus" size={13} /> New course</button>}
        </div>
        {creating && <div className="card mt-4 max-w-xl p-4">{createForm}</div>}
        {error && !creating && <p className="mt-3 text-[13px] text-bad">{error}</p>}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses === null && [0, 1].map((i) => <div key={i} className="skeleton h-36" />)}
          {mine.map((c) => (
            <Link key={c.id} href={`/teach/${c.id}`} className="card card-hover group flex flex-col p-4">
              <span className="truncate text-[15px] font-medium">{c.title}</span>
              {c.subtitle && <span className="truncate text-[12.5px] text-ink-3">{c.subtitle}</span>}
              {c.today && <span className="mt-3 text-[13px] text-ink-2"><span className="text-ink-3">Today · </span>{c.today}</span>}
              <span className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
                {!!c.toReview && <span className="chip bg-[#eef3f7] text-[#3d6f91]"><Icon name="message" size={11} />{c.toReview} to give feedback on</span>}
                {!!c.waiting && <span className="chip bg-warn/10 text-warn"><Icon name="users" size={11} />{c.waiting} waiting to join</span>}
                {!c.toReview && !c.waiting && <span className="chip">{c.students ? `${c.students} students` : "No students yet"}</span>}
              </span>
              <span className="mt-auto flex items-center gap-1 pt-4 text-[12.5px] text-ink-3 group-hover:text-ink">Open <Icon name="arrow" size={12} /></span>
            </Link>
          ))}
          {courses !== null && !mine.length && !creating && (
            <button onClick={() => setCreating(true)} className="card flex flex-col items-center justify-center gap-2 border-dashed p-6 text-[13.5px] text-ink-2 hover:text-ink">
              <Icon name="plus" size={16} /> Make your first course
            </button>
          )}
        </div>

        {unclaimed.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[13px] font-medium text-ink-2">Courses made before accounts</h2>
            <div className="mt-2 divide-y divide-line rounded-xl border border-line bg-white">
              {unclaimed.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 text-[13.5px]">{c.title} <span className="mono">· {c.students} students</span></span>
                  <button onClick={async () => {
                    const r = await fetch("/api/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim: c.id }) }).then((x) => x.json());
                    if (r.ok) router.push(`/teach/${c.id}`);
                  }} className="btn btn-ghost press h-8">Make it mine</button>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-2">
          {demo && <Link href="/teach/demo" className="hover:text-ink">Explore the CaPS demo course →</Link>}
          <Link href="/connectors" className="hover:text-ink">Connectors</Link>
          <Link href="/privacy" className="text-ink-3 hover:text-ink">Privacy</Link>
          <Link href="/terms" className="text-ink-3 hover:text-ink">Terms</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-16">
      <div className="rise flex items-center gap-2 text-[13px] font-medium text-ink-2">
        <span className="inline-block h-4 w-4 rounded-[5px] bg-ink" />
        Questhand
      </div>
      <AccountMenu className="!fixed right-4 top-4 z-30 sm:right-6 sm:top-5" />
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
              {!creating && me?.kind === "teacher" && <button onClick={() => setCreating(true)} className="btn btn-ghost press h-7 px-2.5 text-[12px]"><Icon name="plus" size={12} /> New course</button>}
            </div>
            {me?.kind === "teacher" ? (
              <p className="mt-0.5 text-[12px] text-ink-3">Signed in as {me.name} · <button onClick={signOut} className="underline-offset-2 hover:text-ink hover:underline">Sign out</button></p>
            ) : me && (
              <div className="mt-2 rounded-lg bg-lane px-3 py-3 text-[13px]">
                <p className="text-ink-2">Sign in to create and run your own courses.</p>
                <div className="mt-2.5"><GoogleButton onCredential={google} /></div>
                {error && !code && <p className="mt-2 text-bad" role="alert">{error}</p>}
                <Link href="/login" className="mt-2.5 inline-block text-[12.5px] text-ink-2 underline-offset-2 hover:text-ink hover:underline">Use email and password instead</Link>
              </div>
            )}
            {creating ? (
              createForm
            ) : (
              <div className="mt-2 divide-y divide-line">
                {courses === null && <div className="skeleton my-2 h-10" />}
                {courses?.map((c) => (
                  <Link key={c.id} href={`/teach/${c.id}`} className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-[#fafaf9]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{c.title}{c.id === "demo" && <span className="ml-1.5 rounded bg-lane px-1.5 py-0.5 text-[11px] font-normal text-ink-2">Demo</span>}</span>
                      <span className="mono block">{c.id === "demo" ? "Open to everyone · resets every night" : `${c.weeks} weeks · ${c.cards} cards · ${c.students} students`}</span>
                    </span>
                    <Icon name="arrow" size={14} className="text-ink-3 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </Link>
                ))}
                {unclaimed.map((c) => (
                  <div key={c.id} className="-mx-2 flex items-center gap-3 px-2 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{c.title}</span>
                      <span className="mono block">made before accounts · {c.students} students</span>
                    </span>
                    <button onClick={async () => {
                      const r = await fetch("/api/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim: c.id }) }).then((x) => x.json());
                      if (r.ok) router.push(`/teach/${c.id}`);
                    }} className="btn btn-ghost press h-7 px-2.5 text-[12px]">Claim</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* On a phone the student's box comes first: that's who arrives on a phone. */}
        <div className="rise card order-first overflow-hidden sm:order-none" style={{ "--i": 4 } as React.CSSProperties}>
          <Cover type="quiz" label="Student" height={88} />
          <div className="p-4">
            <span className="text-[15px] font-medium">Join with a class code</span>
            <p className="mt-1 text-[13px] text-ink-2">No account needed: your class code, your name, and a 4-digit PIN. The sample code is <span className="mono text-ink-2">CAPS26</span>.</p>
            {me?.kind === "student" && (
              <Link href={`/learn/${me.courseId}/${me.studentId}`} className="mt-3 flex items-center gap-2 rounded-lg bg-lane px-3 py-2.5 text-[13px] hover:bg-line/60">
                <span className="flex-1">Continue as <span className="font-medium">{me.name}</span> in {me.courseTitle}</span>
                <Icon name="arrow" size={13} />
              </Link>
            )}
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
      <p className="mt-10 flex gap-4 text-[12.5px] text-ink-3"><Link href="/privacy" className="hover:text-ink">Privacy</Link><Link href="/terms" className="hover:text-ink">Terms</Link></p>
    </main>
  );
}
