"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { useEffect, useState } from "react";
import { AccountMenu } from "@/components/AccountMenu";
import { GenArt } from "@/components/cards/GenArt";
import { SignInPanel } from "@/components/SignInPanel";
import { useQuery } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { Clearable } from "@/components/Clearable";
import { LogoMark, Wordmark } from "@/components/Logo";
import { CARD_SIZE } from "@/lib/cards";

type CourseTile = { id: string; title: string; subtitle?: string; weeks: number; cards: number; students: number; today?: string | null; toReview?: number; waiting?: number; role?: "owner" | "editor" | "viewer" };
const SIZE = CARD_SIZE.deck;

type Studying = { id: string; title: string; studentId: string; teacher: string | null; done?: number; total?: number; waiting?: boolean };

export default function Home() {
  const router = useRouter();
  const query = useQuery();
  // A class link (/?code=…) or the class code on a slide: sign in, then it's ready under As Student.
  const codeParam = (query?.get("code") ?? "").trim().toUpperCase();
  const [courses, setCourses] = useState<CourseTile[] | null>(null);
  const [studying, setStudying] = useState<Studying[]>([]);
  const [firstRole, setFirstRole] = useState<"teacher" | "student" | null>(null);
  const [unclaimed, setUnclaimed] = useState<{ id: string; title: string; students: number }[]>([]);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [me, setMe] = useState<{ kind: string | null; name?: string; courseId?: string; studentId?: string; courseTitle?: string } | null>(null);
  const load = () => {
    fetch("/api/courses").then((r) => r.json()).then((d) => { setCourses(d.courses ?? []); setStudying(d.studying ?? []); setFirstRole(d.firstRole ?? null); setUnclaimed(d.unclaimed ?? []); }).catch(() => setCourses([]));
    fetch("/api/auth").then((r) => r.json()).then(setMe).catch(() => setMe({ kind: null }));
  };
  useEffect(load, []);

  // Until we know who's here, show nothing: otherwise a signed-in person sees the sign-in page flash past.
  if (me === null) return <main className="flex-1" aria-busy="true" />;

  // Everyone signs in. Signed out, the home page is the way in: the name, one line, and signing in or making an account.
  if (me.kind !== "teacher") {
    return (
      <>
      <main className="flex w-full flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="rise"><Wordmark /></div>
        <p className="rise mt-6 max-w-xl text-center text-[clamp(18px,2.6vw,24px)] font-medium leading-snug tracking-tight text-ink" style={{ "--i": 1 } as React.CSSProperties}>
          Every answer opens a different door.
        </p>
        <div className="rise mt-8 w-full max-w-sm" style={{ "--i": 2 } as React.CSSProperties}>
          <SignInPanel as={codeParam ? "student" : undefined} startMode={codeParam ? "signup" : "login"} onDone={() => window.location.reload()}
            note={codeParam
              ? <p className="rounded-xl bg-white px-4 py-3 text-[13.5px] text-ink-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">Sign in, or make an account, to join the class with code <span className="font-mono font-medium tracking-[0.15em] text-ink">{codeParam}</span>.</p>
              : <p className="text-center text-[13.5px] text-ink-2">Sign in to your courses, or make an account to start one. Invited to a class? Open the link in your invitation email.</p>} />
          {me.kind === "student" && me.courseId && (
            // A student signed in the old way (before accounts) can still get to their board.
            <Link href={`/learn/${me.courseId}/${me.studentId}`} className="mt-6 flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-[13px] text-ink-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:text-ink">
              <span className="flex-1">Continue as <span className="font-medium text-ink">{me.name}</span> in {me.courseTitle}</span><Icon name="arrow" size={13} />
            </Link>
          )}
        </div>
      </main>
      <SiteFooter />
      </>
    );
  }

  // Signed in: the courses they teach and the ones they're a student in. Whichever way they first came leads.
  const list = courses ?? [];
  const studentFirst = (firstRole ?? (list.length ? "teacher" : studying.length ? "student" : "teacher")) === "student";
  const showStudent = studying.length > 0 || !!codeParam || joining;
  const grid = { gridTemplateColumns: `repeat(auto-fill, ${SIZE.w}px)` };
  const teacherPart = (
    <section key="t" className="mt-8">
      <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-ink-3">As Teacher</h2>
      <div className="mt-3 grid justify-start gap-5" style={grid}>
        {courses === null && [0, 1].map((i) => <div key={i} className="skeleton rounded-[14px]" style={{ width: SIZE.w, height: SIZE.h }} />)}
        {list.map((c) => <CourseCard key={c.id} c={c} />)}
        {courses !== null && (
          <button onClick={() => setCreating(true)} style={{ width: SIZE.w, height: SIZE.h }}
            className="press flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-line-strong px-4 text-center text-[13px] text-ink-2 hover:border-ink-3 hover:text-ink">
            <Icon name="plus" size={18} />{list.length ? "New course" : "Make your first course"}
          </button>
        )}
      </div>
    </section>
  );
  const studentPart = showStudent ? (
    <section key="s" className="mt-8">
      <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-ink-3">As Student</h2>
      <div className="mt-3 grid justify-start gap-5" style={grid}>
        {studying.map((c) => <StudyCard key={c.id} c={c} />)}
        <JoinTile code={codeParam} onJoined={(r) => { if (r.waiting) load(); else router.push(`/learn/${r.courseId}/${r.studentId}`); }} />
      </div>
    </section>
  ) : null;
  return (
    <>
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
      <header className="flex items-center gap-3">
        <span className="flex items-center gap-2 text-[13px] font-medium text-ink-2"><LogoMark size={15} />Questhand</span>
        <span className="flex-1" />
        <AccountMenu />
      </header>
      <h1 className="mt-8 text-[26px] font-semibold tracking-tight">Your courses</h1>
      {studentFirst ? <>{studentPart}{teacherPart}</> : <>{teacherPart}{studentPart}</>}
      {!showStudent && (
        <button onClick={() => setJoining(true)} className="mt-8 text-[13px] text-ink-2 hover:text-ink">Joining a class as a student? Enter its class code <Icon name="arrow" size={12} className="inline" /></button>
      )}

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
    <SiteFooter />
    </>
  );
}

/** A course they're a student in, as a card: opens their board (or says they're waiting to be let in). */
function StudyCard({ c }: { c: Studying }) {
  const body = (
    <>
      <span className="pointer-events-none absolute inset-[5px] rounded-[10px] border border-line/70" />
      <span className="relative mx-2.5 mt-2.5 h-[42%] flex-none overflow-hidden rounded-[8px] border border-line/80">
        <GenArt id={c.id} tint="#4b56a8" cover="radial-gradient(55% 90% at 25% 30%, #dfe2f4 0%, transparent 70%), radial-gradient(50% 80% at 80% 80%, #eceefa 0%, transparent 70%), #f1f2fa" />
      </span>
      <span className="relative px-3 pt-2.5 text-[14px] font-medium leading-tight line-clamp-2">{c.title}</span>
      {c.teacher && <span className="relative truncate px-3 pt-0.5 text-[11.5px] text-ink-3">{c.teacher}</span>}
      <span className="flex-1" />
      <span className="relative flex flex-wrap gap-1 px-3 pb-3 text-[11px]">
        {c.waiting ? <span className="chip h-5 bg-warn/10 text-warn">Waiting for your teacher</span> : <span className="chip h-5">{c.done ?? 0}/{c.total ?? 0} cards done</span>}
      </span>
    </>
  );
  const cls = "group relative flex flex-col overflow-hidden rounded-[14px] border border-line bg-white";
  return c.waiting
    ? <div style={{ width: SIZE.w, height: SIZE.h }} className={`${cls} opacity-80`} title="Your teacher needs to let you in">{body}</div>
    : <Link href={`/learn/${c.id}/${c.studentId}`} style={{ width: SIZE.w, height: SIZE.h }} className={`${cls} transition-transform duration-300 ease-[var(--ease-spring)] hover:-translate-y-1 hover:shadow-[0_16px_30px_-18px_rgba(20,20,18,0.45)]`}>{body}</Link>;
}

/** Join a class with its code (and passcode, if it has one), as the signed-in account. */
function JoinTile({ code: start, onJoined }: { code: string; onJoined: (r: { courseId: string; studentId: string; waiting?: boolean }) => void }) {
  const [code, setCode] = useState(start);
  const [pass, setPass] = useState("");
  const [needPass, setNeedPass] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError("");
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "joinCode", code, passcode: pass || undefined }) })
      .then((x) => x.json()).catch(() => ({ ok: false, error: "Couldn’t reach Questhand. Check your connection." }));
    setBusy(false);
    if (r.ok) { setCode(""); onJoined(r); return; }
    if (r.needPasscode) setNeedPass(true);
    setError(r.error ?? "That didn’t work");
  }
  return (
    <form onSubmit={join} style={{ width: SIZE.w, height: SIZE.h }} className="flex flex-col justify-center gap-2 rounded-[14px] border border-dashed border-line-strong px-4 text-center">
      <span className="text-[13px] font-medium text-ink-2">Join a class</span>
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Class code" aria-label="Class code" autoFocus={!!start}
        className="field h-10 text-center font-mono tracking-[0.2em]" />
      {needPass && <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Passcode" aria-label="Class passcode" className="field h-9 text-center" />}
      <button disabled={busy || !code.trim()} className="btn btn-dark press h-9 justify-center">{busy ? "Joining…" : "Join"}</button>
      {error && <span className="text-[12px] leading-snug text-bad" role="alert">{error}</span>}
    </form>
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
