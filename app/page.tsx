"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountMenu } from "@/components/AccountMenu";
import { GenArt } from "@/components/cards/GenArt";
import { GoogleButton } from "@/components/GoogleButton";
import { Icon } from "@/components/Icon";
import { Clearable } from "@/components/Clearable";
import { LogoMark, Wordmark } from "@/components/Logo";
import { HeroTree } from "@/components/HeroTree";
import { CARD_SIZE } from "@/lib/cards";

type CourseTile = { id: string; title: string; subtitle?: string; weeks: number; cards: number; students: number; today?: string | null; toReview?: number; waiting?: number; role?: "owner" | "editor" | "viewer" };
const SIZE = CARD_SIZE.deck;

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needPass, setNeedPass] = useState(false);
  const [pass, setPass] = useState("");
  const [courses, setCourses] = useState<CourseTile[] | null>(null);
  const [unclaimed, setUnclaimed] = useState<{ id: string; title: string; students: number }[]>([]);
  const [creating, setCreating] = useState(false);
  const [me, setMe] = useState<{ kind: string | null; name?: string; courseId?: string; studentId?: string; courseTitle?: string } | null>(null);
  useEffect(() => {
    fetch("/api/courses").then((r) => r.json()).then((d) => { setCourses(d.courses ?? []); setUnclaimed(d.unclaimed ?? []); }).catch(() => setCourses([]));
    fetch("/api/auth").then((r) => r.json()).then(setMe).catch(() => setMe({ kind: null }));
  }, []);

  async function google(credential: string) {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "google", credential }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Can’t reach the server" }));
    if (r.ok) window.location.reload();
    else setError(r.error ?? "Google sign-in didn’t work. Try again.");
  }

  // A private copy of the sample course, signed in as its one student.
  const [trying, setTrying] = useState(false);
  const [tryError, setTryError] = useState("");
  async function trySample() {
    setTrying(true);
    setTryError("");
    const r = await fetch("/api/try", { method: "POST" }).then((x) => x.json()).catch(() => ({ ok: false, error: "Couldn’t reach Questhand. Check your connection." }));
    if (!r.ok) { setTrying(false); setTryError(r.error ?? "Couldn’t start the sample"); return; }
    router.push(`/learn/${r.courseId}/${r.studentId}`);
  }

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
    } else {
      setBusy(false);
      if (data.needPasscode) setNeedPass(true);
      setError(data.error);
    }
  }

  // Until we know who's here, show nothing: otherwise a signed-in teacher sees the class-code page flash past.
  if (me === null) return <main className="flex-1" aria-busy="true" />;

  // A signed-in teacher lands on their courses: one card per course, and a card-shaped slot for a new one.
  if (me?.kind === "teacher") {
    const list = courses ?? [];
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        <header className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-[13px] font-medium text-ink-2"><LogoMark size={15} />Questhand</span>
          <span className="flex-1" />
          <AccountMenu />
        </header>
        <h1 className="mt-8 text-[26px] font-semibold tracking-tight">Your courses</h1>
        {error && <p className="mt-3 text-[13px] text-bad">{error}</p>}

        <div className="mt-6 grid justify-start gap-5" style={{ gridTemplateColumns: `repeat(auto-fill, ${SIZE.w}px)` }}>
          {courses === null && [0, 1].map((i) => <div key={i} className="skeleton rounded-[14px]" style={{ width: SIZE.w, height: SIZE.h }} />)}
          {list.map((c) => <CourseCard key={c.id} c={c} />)}
          {courses !== null && (
            <button onClick={() => setCreating(true)} style={{ width: SIZE.w, height: SIZE.h }}
              className="press flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-line-strong px-4 text-center text-[13px] text-ink-2 hover:border-ink-3 hover:text-ink">
              <Icon name="plus" size={18} />{list.length ? "New course" : "Make your first course"}
            </button>
          )}
        </div>

        {unclaimed.length > 0 && (
          <section className="mt-10">
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
        {creating && <NewCourse onClose={() => setCreating(false)} />}
      </main>
    );
  }

  // Everyone else: the name, then a way in for teachers and for students. Nothing else.
  return (
    <main className="flex w-full flex-1 flex-col items-center justify-center px-4 py-16">
      <AccountMenu className="!fixed right-4 top-4 z-30 sm:right-6 sm:top-5" />
      <div className="rise"><Wordmark /></div>
      <p className="rise mt-6 max-w-xl text-center text-[clamp(18px,2.6vw,24px)] font-medium leading-snug tracking-tight text-ink" style={{ "--i": 1 } as React.CSSProperties}>
        Every answer opens a different door.
      </p>
      <p className="rise mt-2 max-w-lg text-center text-[14.5px] leading-relaxed text-ink-2" style={{ "--i": 2 } as React.CSSProperties}>
        Build a course as a map of cards. Students who struggle get help, students who fly get a challenge, and you see every path.
      </p>
      <div className="rise mt-8 w-full max-w-[600px]" style={{ "--i": 3 } as React.CSSProperties}><HeroTree /></div>
      {me?.kind !== "teacher" && (
        <div className="rise mt-6 flex flex-col items-center gap-1.5" style={{ "--i": 3 } as React.CSSProperties}>
          <button onClick={trySample} disabled={trying} className="btn press h-10 gap-2 rounded-full border border-[#4b56a8]/25 bg-[#eef0fb] px-5 text-[14px] font-medium text-[#4b56a8] hover:bg-[#e3e6f8]">
            <Icon name="play" size={14} /> {trying ? "Dealing your cards…" : "Try a sample course as a student"}
          </button>
          <span className="text-[12px] text-ink-3">No sign-up. Your own copy, gone after a day.</span>
          {tryError && <span className="text-[12.5px] text-bad" role="alert">{tryError}</span>}
        </div>
      )}

      <div className="rise mt-10 grid w-full max-w-md gap-6" style={{ "--i": 4 } as React.CSSProperties}>
        {me?.kind === "student" && (
          <Link href={`/learn/${me.courseId}/${me.studentId}`} className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-[13.5px] shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:bg-[#fafaf9]">
            <span className="flex-1">Continue as <span className="font-medium">{me.name}</span> in {me.courseTitle}</span>
            <Icon name="arrow" size={13} />
          </Link>
        )}
        <div className="flex flex-col items-center gap-2">
          <span className="text-[12px] uppercase tracking-[0.12em] text-ink-3">Students</span>
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && join()}
              placeholder="Class code" aria-label="Class code" className="field h-11 w-40 text-center font-mono tracking-[0.2em]" />
            <button onClick={join} disabled={busy || !code.trim()} className="btn btn-dark press h-11 px-5">{busy ? "Joining…" : "Join"}</button>
          </div>
          {needPass && (
            <input autoFocus type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && join()}
              placeholder="Class passcode" aria-label="Class passcode" className="rise field h-11 w-[15.5rem] text-center" />
          )}
          {error && code && <p className="text-[13px] text-bad" role="alert">{error}</p>}
        </div>
        {me && me.kind !== "student" && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-[12px] uppercase tracking-[0.12em] text-ink-3">Teachers</span>
            <GoogleButton onCredential={google} />
            {error && !code && <p className="text-[13px] text-bad" role="alert">{error}</p>}
            <Link href="/login" className="text-[12.5px] text-ink-3 underline-offset-2 hover:text-ink hover:underline">Use email and password instead</Link>
          </div>
        )}
      </div>

      <ul className="rise mt-16 grid w-full max-w-3xl gap-3 sm:grid-cols-3" style={{ "--i": 5 } as React.CSSProperties}>
        {[
          ["split", "Branch by answer or score", "What a student picks, or how they score, decides the card they get next."],
          ["layers", "Paths across lessons", "Today’s answer can choose next week’s card."],
          ["eye", "See every path", "The map shows how many students took each branch, and who is stuck."],
        ].map(([icon, title, text]) => (
          <li key={title} className="rounded-2xl border border-line bg-white px-4 py-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef0fb] text-[#4b56a8]"><Icon name={icon} size={15} /></span>
            <div className="mt-3 text-[14px] font-semibold text-ink">{title}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{text}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}

/** A course, as a card the same shape as every other card on the site. */
function CourseCard({ c }: { c: CourseTile }) {
  return (
    <Link href={`/teach/${c.id}`} style={{ width: SIZE.w, height: SIZE.h }}
      className="group relative flex flex-col overflow-hidden rounded-[14px] border border-line bg-white transition-transform duration-300 ease-[var(--ease-spring)] hover:-translate-y-1 hover:shadow-[0_16px_30px_-18px_rgba(20,20,18,0.45)]">
      <span className="pointer-events-none absolute inset-[5px] rounded-[10px] border border-line/70" />
      <span className="relative mx-2.5 mt-2.5 h-[42%] flex-none overflow-hidden rounded-[8px] border border-line/80">
        <GenArt id={c.id} tint="#55544f" cover="radial-gradient(55% 90% at 25% 30%, #dcdad3 0%, transparent 70%), radial-gradient(50% 80% at 80% 80%, #eceae4 0%, transparent 70%), #efeee9" />
      </span>
      <span className="relative px-3 pt-2.5 text-[14px] font-medium leading-tight line-clamp-2">{c.title}</span>
      {c.subtitle && <span className="relative truncate px-3 pt-0.5 text-[11.5px] text-ink-3">{c.subtitle}</span>}
      <span className="flex-1" />
      <span className="relative flex flex-wrap gap-1 px-3 pb-3 text-[11px]">
        {!!c.toReview && <span className="chip h-5 bg-[#eef3f7] text-[#3d6f91]">{c.toReview} to review</span>}
        {!!c.waiting && <span className="chip h-5 bg-warn/10 text-warn">{c.waiting} waiting</span>}
        {!c.toReview && !c.waiting && <span className="chip h-5">{c.students ? `${c.students} student${c.students === 1 ? "" : "s"}` : "No students yet"}</span>}
        {c.role && c.role !== "owner" && <span className="chip h-5">{c.role === "viewer" ? "Shared · view" : "Shared · edit"}</span>}
      </span>
    </Link>
  );
}

/** Make a course: a name, an optional subtitle, and whether to start blank or from the standard weeks. */
function NewCourse({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [start, setStart] = useState<"blank" | "template">("blank");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const r = await fetch("/api/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, subtitle, start }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Can’t reach the server" }));
    if (r.ok) router.push(`/teach/${r.id}`);
    else { setBusy(false); setError(r.error ?? "That didn’t work"); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/25 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form role="dialog" aria-modal="true" aria-label="New course" onSubmit={create} className="pop w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-[0_30px_80px_-24px_rgba(20,20,18,0.45)]">
        <h2 className="text-[20px] font-medium tracking-tight">New course</h2>
        <Clearable><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course name" aria-label="Course name" className="field h-11 text-[14px]" /></Clearable>
        <Clearable><input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtitle (optional), e.g. Spring 2027 · Tuesdays" aria-label="Subtitle" className="field" /></Clearable>
        <div className="grid gap-1.5">
          {([["blank", "Start blank", "One empty week."], ["template", "Standard weeks", "Three weeks with a ready-made rhythm: goal, example, quick check, task, discussion, reflection."]] as const).map(([k, label, hint]) => (
            <label key={k} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors ${start === k ? "border-ink" : "border-line hover:border-line-strong"}`}>
              <input type="radio" name="start" checked={start === k} onChange={() => setStart(k)} className="mt-0.5 accent-[#1b1b1a]" />
              <span><span className="font-medium">{label}</span><span className="block text-[12px] text-ink-3">{hint}</span></span>
            </label>
          ))}
        </div>
        {error && <p className="text-[13px] text-bad">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-quiet press">Cancel</button>
          <button type="submit" disabled={!title.trim() || busy} className="btn btn-dark press">{busy ? "Creating…" : "Create course"}</button>
        </div>
      </form>
    </div>
  );
}
