"use client";

import { op } from "@/lib/client";
import type { ConnectorInfo } from "@/lib/connectors/types";
import { toast } from "@/lib/toast";
import { DocImport } from "./DocImport";
import { InviteTeachers } from "./ShareDialog";
import { useState } from "react";
import { ask } from "../Confirm";
import { Clearable } from "../Clearable";
import { DeleteCourse } from "./DeleteCourse";
import { CoverPicker } from "./CoverPicker";
import type { Course, CourseState, Nudge } from "@/lib/types";
import { Avatar, Icon } from "../Icon";
import { GroupingsList } from "./Groupings";
import { nextDemoName } from "@/lib/shared";

/** The Settings tab (part "settings") and the Students tab (part "students") share this component and its helpers. */
export function Settings({ course, onChanged, part = "settings", readOnly = false, onInvite, me, nudges = [], onMessage }: {
  course: Course; connectors?: ConnectorInfo[]; onChanged: () => void; part?: "settings" | "students"; readOnly?: boolean; onInvite?: () => void; me?: CourseState["me"];
  /** The class's messages, for the unread count beside each student; and opening a conversation with one. */
  nudges?: Nudge[]; onMessage?: (studentId: string) => void;
}) {
  const [sharing, setSharing] = useState(false);
  const owner = me?.role === "owner" || course.id === "demo";
  const info = async (patch: { title?: string; subtitle?: string }) => {
    const r = await op<{ ok?: boolean }>(course.id, { op: "setCourseInfo", title: patch.title ?? course.title, subtitle: patch.subtitle ?? course.subtitle ?? "" });
    onChanged();
    if (r.ok !== false) toast("Saved");
  };
  const removeStudent = async (studentId: string, name: string) => {
    const r = await op<{ ok?: boolean }>(course.id, { op: "removeStudent", studentId });
    onChanged();
    if (r.ok !== false) toast(`Removed ${name}`, { icon: "x", tone: "plain" });
  };
  const access = { joinOpen: course.access?.joinOpen !== false, passcode: course.access?.passcode, guestToken: course.access?.guestToken, selfJoin: course.access?.selfJoin };
  const guestUrl = access.guestToken && typeof window !== "undefined" ? `${window.location.origin}/guest/${course.id}?t=${access.guestToken}` : "";
  const setAccess = async (patch: Record<string, unknown>, newCode: boolean, note: string) => {
    const r = await op<{ ok?: boolean; error?: string }>(course.id, { op: "setAccess", access: { joinOpen: access.joinOpen, passcode: access.passcode, selfJoin: access.selfJoin, ...patch }, newCode });
    onChanged();
    if (r.ok === false) toast(r.error ?? "That didn’t save", { icon: "x", tone: "bad" });
    else toast(note);
  };
  return (
    <div className="space-y-6">
      {part === "students" ? (
        <>
      <section className="card p-6">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-medium">Class list</h3>
          <span className="mono">{course.students.length}</span>
          <span className="flex-1" />
          {!readOnly && onInvite && <button onClick={onInvite} className="btn btn-ghost press h-8"><Icon name="plus" size={13} /> Invite students</button>}
        </div>
        {course.students.length > 0 ? (
          <ul className="mt-3 divide-y divide-line">
            {course.students.map((st) => (
              <li key={st.id} className="group flex items-center gap-3 py-2">
                <Avatar name={st.name} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-[14px]">{st.name}{st.demo && <span className="chip h-5 flex-none bg-[#fff2c7] text-[10.5px] font-medium text-[#7a5a00]">Demo</span>}</span>
                  <span className="block truncate text-[12.5px] text-ink-3">{st.demo ? "For you to try the course as. What you do as them is kept." : st.userId ? `${st.email ?? "Has an account"} · joined` : `${st.email ? `${st.email} · ` : ""}not joined yet`}</span>
                </span>
                {st.demo && <a href={`/learn/${course.id}/${st.id}?preview=1`} className="btn btn-ghost press h-8 px-2.5 text-[12px]"><Icon name="eye" size={12} /> Try as them</a>}
                {st.demo && !readOnly && (
                  <button onClick={async () => (await ask({ title: `Remove ${st.name}?`, body: "A demo student’s work goes with them.", confirm: "Remove", danger: true })) && removeStudent(st.id, st.name)}
                    className="btn btn-quiet press h-8 px-2 text-[12px] hover:!text-bad" aria-label={`Remove ${st.name}`}><Icon name="x" size={12} /> Remove</button>
                )}
                {onMessage && (() => {
                  const unread = nudges.filter((n) => n.studentId === st.id && n.from === "student" && !n.read).length;
                  return (
                    <button onClick={() => onMessage(st.id)} aria-label={`Message ${st.name}${unread ? ` (${unread} new)` : ""}`}
                      className={`btn press h-8 px-2.5 text-[12px] ${unread ? "btn-dark" : "btn-quiet"}`}>
                      <Icon name="message" size={12} /> Message{unread ? <span className="mono ml-0.5 rounded-full bg-white/20 px-1.5">{unread}</span> : null}
                    </button>
                  );
                })()}
                {!readOnly && !st.demo && (
                  <span className="flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
                    {!st.userId && (
                      // Their own invitation link, to send however you like: opening it signed in links their account.
                      <button onClick={async () => {
                        const r = await op<{ links?: { id: string; link: string }[] }>(course.id, { op: "setupLinks", studentIds: [st.id] });
                        const link = r.links?.find((x) => x.id === st.id)?.link;
                        if (!link) return toast("Couldn’t make a link", { icon: "x", tone: "bad" });
                        try { await navigator.clipboard.writeText(link); toast(`Copied ${st.name}’s invitation link. Only send it to them.`, { icon: "link" }); }
                        catch { window.prompt(`${st.name}’s invitation link`, link); }
                      }} className="btn btn-quiet press h-8 px-2 text-[12px]" aria-label={`Copy ${st.name}’s invitation link`}><Icon name="link" size={12} /> Invitation link</button>
                    )}
                    <button onClick={async () => { await op(course.id, { op: "resetPin", studentId: st.id }); toast(`${st.name}’s account is unlinked and their invitation links stopped working. Send a new invitation.`, { icon: "lock", tone: "plain" }); }}
                      className="btn btn-quiet press h-8 px-2 text-[12px]" aria-label={`Reset ${st.name}’s sign-in`}><Icon name="lock" size={12} /> Reset sign-in</button>
                    <button onClick={async () => (await ask({ title: `Remove ${st.name} from the class?`, body: "Their work stays saved.", confirm: "Remove", danger: true })) && removeStudent(st.id, st.name)}
                      className="btn btn-quiet press h-8 px-2 text-[12px] hover:!text-bad" aria-label={`Remove ${st.name}`}><Icon name="x" size={12} /> Remove</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-ink-3">No students yet.</p>
        )}
      </section>

      {/* Demo students: made-up students on the class list, for the teacher to try the course as. As many as they like. */}
      {!readOnly && <DemoStudents course={course} onChanged={onChanged} />}

      {/* Groups: made on cards, kept here to look over, change or remove. */}
      <GroupingsList course={course} onChanged={onChanged} readOnly={readOnly} />

        </>
      ) : (
        <>
      <SettingsPage course={course} onChanged={onChanged} readOnly={readOnly} me={me} owner={owner} info={info} access={access} guestUrl={guestUrl} setAccess={setAccess} sharing={sharing} setSharing={setSharing} />
        </>
      )}
    </div>
  );
}

/** Demo students: add one with a name of your choice (or the next Demo Student letter), or remove them all. */
function DemoStudents({ course, onChanged }: { course: Course; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const demos = course.students.filter((x) => x.demo);
  const placeholder = nextDemoName([...course.students, ...(course.waiting ?? [])].map((x) => x.name));
  async function add() {
    setBusy(true);
    const r = await op<{ ok?: boolean; error?: string }>(course.id, { op: "addDemoStudent", name: name.trim() });
    setBusy(false);
    if (r.ok === false) return toast(String(r.error ?? "That didn’t work"), { icon: "x", tone: "bad" });
    toast(`Added ${name.trim() || placeholder}`, { icon: "users" });
    setName("");
    onChanged();
  }
  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start gap-3">
        <span className="min-w-[14rem] flex-1">
          <span className="block text-[15px] font-medium">Demo students</span>
          <span className="block text-[13px] text-ink-3">Made-up students on your class list, to try the course as in Student View. Add as many as you need and name them as you like. What you do as them is kept, like a real student’s: it shows in Students, in groups and discussions. They never get email, and once real students join, class numbers leave them out.</span>
        </span>
        {demos.length > 0 && (
          <button onClick={async () => {
            if (!(await ask({ title: `Remove all ${demos.length} demo student${demos.length === 1 ? "" : "s"}?`, body: "Their work goes with them.", confirm: "Remove", danger: true }))) return;
            await op(course.id, { op: "setDemoStudents", on: false });
            onChanged();
            toast("Removed the demo students", { icon: "x", tone: "plain" });
          }} className="btn btn-quiet press h-9 hover:!text-bad"><Icon name="x" size={13} /> Remove all</button>
        )}
      </div>
      <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (!busy) void add(); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={placeholder} aria-label="Demo student’s name" className="field h-9 min-w-0 max-w-xs flex-1 py-0" />
        <button type="submit" disabled={busy} className="btn btn-ghost press h-9"><Icon name="plus" size={13} /> Add a demo student</button>
        {demos.length > 0 && <span className="text-[12.5px] text-ink-3">{demos.length} on the class list</span>}
      </form>
    </section>
  );
}

type Part = "course" | "class" | "sharing" | "files" | "delete";

/** A switch, for a setting that's on or off. */
function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-[22px] w-[38px] flex-none rounded-full p-[3px] transition-colors duration-300 disabled:opacity-50 ${on ? "bg-ok" : "bg-line-strong"}`}>
      <span className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300 ease-[var(--ease-spring)] ${on ? "translate-x-4" : ""}`} />
    </button>
  );
}
/** One line of a list: what it is, a few words more if needed, and its control. */
function Row({ label, hint, children }: { label: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3 first:border-t-0">
      <span className="min-w-0 flex-1 text-[14px]">{label}{hint && <span className="text-[12.5px] text-ink-3"> · {hint}</span>}</span>
      {children}
    </div>
  );
}

/**
 * The Settings tab: a short list on the left, one part at a time on the right. Course (its cover, name and subtitle),
 * Class (how it runs for students), Sharing (other teachers, and a read-only guest link), Files (export and import).
 * Who joins and how is on the Students tab, with the class list.
 */
function SettingsPage({ course, onChanged, readOnly, me, owner, info, access, guestUrl, setAccess, sharing, setSharing }: {
  course: Course; onChanged: () => void; readOnly: boolean; me?: CourseState["me"]; owner: boolean;
  info: (p: { title?: string; subtitle?: string }) => Promise<void>;
  access: { guestToken?: string }; guestUrl: string;
  setAccess: (patch: Record<string, unknown>, newCode: boolean, note: string) => Promise<void>;
  sharing: boolean; setSharing: (v: boolean) => void;
}) {
  const [part, setPart] = useState<Part>("course");
  const parts: { id: Part; label: string }[] = [
    { id: "course", label: "Course" }, { id: "class", label: "Class" }, { id: "sharing", label: "Sharing" }, { id: "files", label: "Files" },
    ...(course.id !== "demo" && owner ? [{ id: "delete" as const, label: "Delete" }] : []),
  ];
  const toggle = async (o: string, on: boolean, note: string, icon: string, extra: Record<string, unknown> = {}) => {
    await op(course.id, { op: o, on, ...extra });
    onChanged();
    toast(note, { icon });
  };
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-start">
      <nav aria-label="Settings" className="flex gap-1 overflow-x-auto md:sticky md:top-4 md:w-44 md:flex-none md:flex-col">
        {parts.map((p) => (
          <button key={p.id} type="button" onClick={() => setPart(p.id)} aria-current={part === p.id ? "page" : undefined}
            className={`press whitespace-nowrap rounded-[9px] px-3 py-2 text-left text-[14px] ${part === p.id ? "border border-line bg-white font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04)]" : "border border-transparent text-ink-2 hover:bg-white/60"} ${p.id === "delete" ? "text-bad md:mt-4" : ""}`}>
            {p.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 max-w-3xl flex-1">
        {part === "course" && (
          <section className="card p-5">
            <CoverPicker course={course} onChanged={onChanged} readOnly={readOnly} />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block text-[12.5px]"><span className="text-ink-3">Name</span>
                <Clearable className="mt-1"><input key={course.title} defaultValue={course.title} disabled={readOnly} placeholder="Course name" onBlur={(e) => e.target.value.trim() && e.target.value !== course.title && info({ title: e.target.value })} className="field" /></Clearable>
              </label>
              <label className="block text-[12.5px]"><span className="text-ink-3">Subtitle</span>
                <Clearable className="mt-1"><input key={course.subtitle} defaultValue={course.subtitle ?? ""} disabled={readOnly} placeholder="e.g. Spring 2027 · Tuesdays" onBlur={(e) => e.target.value !== (course.subtitle ?? "") && info({ subtitle: e.target.value })} className="field" /></Clearable>
              </label>
            </div>
            {!readOnly && course.id !== "demo" && (
              // A copy of the course as it is now (no students), to start new courses from: New course → Your templates.
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <span className="min-w-0 flex-1 text-[12.5px] text-ink-3">Start new courses from a copy of this one, without its students.</span>
                <button type="button" onClick={async () => {
                  const r = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", courseId: course.id }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Can’t reach the server" }));
                  if (r.ok) toast(`Saved “${r.template.name}” as a template. Start a course from it in New course.`, { icon: "star" });
                  else toast(r.error ?? "That didn’t save", { icon: "x", tone: "bad" });
                }} className="btn btn-ghost press h-8"><Icon name="star" size={13} /> Save as template</button>
              </div>
            )}
          </section>
        )}

        {part === "class" && (
          <section className="card overflow-hidden p-0">
            <Row label="Students can message each other" hint="they can always message you">
              <Switch on={course.peerMessages !== false} label="Students can message each other" disabled={readOnly}
                onChange={(on) => toggle("setPeerMessages", on, on ? "Students can message each other" : "Students can only message you now", "message")} />
            </Row>
            <Row label="Certificate when they finish" hint={course.certificate ? undefined : "to print or save"}>
              {course.certificate && (
                <label className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
                  at
                  <input key={course.certificate.percent} type="number" min={1} max={100} defaultValue={course.certificate.percent} aria-label="Share of cards that earns the certificate" disabled={readOnly}
                    onBlur={async (e) => { if (Number(e.target.value) === course.certificate?.percent) return; await op(course.id, { op: "setCertificate", percent: Number(e.target.value) }); onChanged(); }}
                    className="field h-7 w-14 py-0 text-center text-[12.5px]" />
                  % of their cards
                </label>
              )}
              <Switch on={!!course.certificate} label="Give a certificate of completion" disabled={readOnly}
                onChange={async (on) => { await op(course.id, { op: "setCertificate", ...(on ? { percent: 80 } : { on: false }) }); onChanged(); toast(on ? "Students who finish 80% of their cards get a certificate" : "No certificate for this course", { icon: "graduation" }); }} />
            </Row>
            <Row label="Show students’ paths on the map">
              <Switch on={course.mapLive !== false} label="Show students' paths on the map" disabled={readOnly}
                onChange={(on) => toggle("setMapLive", on, on ? "The map shows students’ paths" : "The map shows only the cards now", "users")} />
            </Row>
            {course.weeks.some((w) => w.lessons.some((l) => l.elective)) && (
              <Row label="Electives each student takes">
                <input type="number" min={0} max={10} defaultValue={course.electiveMin ?? 1} aria-label="Minimum electives" disabled={readOnly}
                  onBlur={async (e) => { await op(course.id, { op: "setElectiveMin", min: Number(e.target.value) }); onChanged(); }}
                  className="field h-7 w-14 py-0 text-center text-[12.5px]" />
              </Row>
            )}
          </section>
        )}

        {part === "sharing" && (
          <section className="card overflow-hidden p-0">
            {me?.owner && (
              <Row label={<span className="flex items-center gap-2.5">{me.owner.picture
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={me.owner.picture} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full object-cover" />
                : <Avatar name={me.owner.name} size={28} />}<span className="truncate">{me.owner.name}</span></span>}>
                <span className="text-[12.5px] text-ink-3">Owner</span>
              </Row>
            )}
            {(course.people ?? []).map((p) => (
              <Row key={p.email} label={<span className="flex items-center gap-2.5"><Avatar name={p.email} size={28} /><span className="truncate">{p.email}</span></span>}>
                <span className="text-[12.5px] text-ink-3">{p.role === "viewer" ? "Can view" : "Can edit"}</span>
              </Row>
            ))}
            <Row label="Other teachers" hint="students never see this">
              <button onClick={() => setSharing(true)} className="btn btn-ghost press h-8"><Icon name="users" size={13} /> {owner ? "Invite" : "See who has access"}</button>
            </Row>
            <Row label="Guest link" hint="read-only, no students or their work">
              {access.guestToken ? (
                <>
                  <button onClick={() => { navigator.clipboard?.writeText(guestUrl).catch(() => {}); toast("Guest link copied"); }} className="btn btn-ghost press h-8"><Icon name="link" size={12} /> Copy</button>
                  <a href={guestUrl} target="_blank" rel="noreferrer" className="btn btn-quiet press h-8">Open <Icon name="external" size={11} /></a>
                  {!readOnly && <button onClick={() => setAccess({ guestToken: null }, false, "Guest link turned off")} className="btn btn-quiet press h-8 hover:!text-bad">Turn off</button>}
                </>
              ) : !readOnly && <button onClick={() => setAccess({ guestToken: true }, false, "Guest link created")} className="btn btn-ghost press h-8"><Icon name="link" size={13} /> Create</button>}
            </Row>
            {sharing && <InviteTeachers course={course} me={me} onClose={() => setSharing(false)} onChanged={onChanged} />}
          </section>
        )}

        {part === "files" && (
          <section className="card overflow-hidden p-0">
            <Row label="Export" hint="for a new course, or for another LMS">
              <a href={`/api/course/${course.id}/file`} download className="btn btn-ghost press h-8" title="A Questhand course file: make a new course from it with New course → From a course file">
                <Icon name="download" size={12} /> Questhand (.json)
              </a>
              <a href={`/api/course/${course.id}/export`} className="btn btn-ghost press h-8" title="IMS Common Cartridge: imports into Canvas, Moodle, Blackboard, Brightspace and Schoology">
                <Icon name="download" size={12} /> Canvas / Moodle
              </a>
            </Row>
            {!readOnly && (
              <Row label="Import" hint="adds weeks after yours; nothing is replaced">
                <DocImport courseId={course.id} onDone={onChanged} />
                <label className="btn btn-ghost press h-8 cursor-pointer">
                  <Icon name="upload" size={12} /> Weeks from a file…
                  <input type="file" accept="application/json,.json" className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      try {
                        const data = JSON.parse(await f.text());
                        const weeks = Array.isArray(data?.weeks) ? data.weeks : [];
                        if (!weeks.length) throw new Error();
                        for (const w of weeks) await op(course.id, { op: "insertWeek", week: w });
                        onChanged();
                        toast(`Imported ${weeks.length} week${weeks.length === 1 ? "" : "s"}`, { icon: "upload" });
                      } catch {
                        toast("That file isn’t a Questhand course export", { icon: "x", tone: "bad" });
                      }
                    }} />
                </label>
              </Row>
            )}
          </section>
        )}

        {part === "delete" && <DeleteCourse course={course} />}
      </div>
    </div>
  );
}
