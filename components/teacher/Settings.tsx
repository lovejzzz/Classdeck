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
      <section className="card p-6">
        <h3 className="text-[15px] font-medium">Course</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-[13px]"><span className="text-ink-2">Course name</span>
            <Clearable className="mt-1"><input defaultValue={course.title} placeholder="Course name" onBlur={(e) => e.target.value.trim() && e.target.value !== course.title && info({ title: e.target.value })} className="field" /></Clearable>
          </label>
          <label className="block text-[13px]"><span className="text-ink-2">Subtitle</span>
            <Clearable className="mt-1"><input defaultValue={course.subtitle ?? ""} placeholder="e.g. Spring 2027 · Tuesdays" onBlur={(e) => e.target.value !== (course.subtitle ?? "") && info({ subtitle: e.target.value })} className="field" /></Clearable>
          </label>
        </div>
      </section>

      {/* Messages (in Settings):  students write to the teacher (always), and to each other (the teacher's choice, on by default). */}
      <section className="card flex flex-wrap items-center gap-3 p-6">
        <span className="min-w-[14rem] flex-1">
          <span className="block text-[15px] font-medium">Messages</span>
          <span className="block text-[13px] text-ink-3">Students can always message you from the Inbox under their photo. Messages between students are private to them.</span>
        </span>
        <label className="inline-flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" disabled={readOnly} checked={course.peerMessages !== false} aria-label="Students can message each other"
            onChange={async (e) => { await op(course.id, { op: "setPeerMessages", on: e.target.checked }); onChanged(); toast(e.target.checked ? "Students can message each other" : "Students can only message you now", { icon: "message" }); }}
            className="h-4 w-4 accent-[#1b1b1a]" />
          Students can message each other
        </label>
      </section>

      {/* The course map (in Settings): where students are shows on it unless the teacher turns it off. */}
      <section className="card flex flex-wrap items-center gap-3 p-6">
        <span className="min-w-[14rem] flex-1">
          <span className="block text-[15px] font-medium">Course map</span>
          <span className="block text-[13px] text-ink-3">The map shows who is working on which card, and how many students went down each answer.</span>
        </span>
        <label className="inline-flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" disabled={readOnly} checked={course.mapLive !== false} aria-label="Show where students are on the map"
            onChange={async (e) => { await op(course.id, { op: "setMapLive", on: e.target.checked }); onChanged(); toast(e.target.checked ? "The map shows where students are" : "The map shows only the cards now", { icon: "users" }); }}
            className="h-4 w-4 accent-[#1b1b1a]" />
          Show where students are
        </label>
      </section>

      {course.weeks.some((w) => w.lessons.some((l) => l.elective)) && (
        <section className="card flex flex-wrap items-center gap-3 p-6">
          <span className="min-w-[14rem] flex-1">
            <span className="block text-[15px] font-medium">Electives</span>
            <span className="block text-[13px] text-ink-3">How many elective lessons each student chooses.</span>
          </span>
          <label className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
            Each student takes at least
            <input type="number" min={0} max={10} defaultValue={course.electiveMin ?? 2} aria-label="Minimum electives" disabled={readOnly}
              onBlur={async (e) => { await op(course.id, { op: "setElectiveMin", min: Number(e.target.value) }); onChanged(); }}
              className="field h-8 w-14 py-0 text-center" />
            electives
          </label>
        </section>
      )}

      <section className="card p-6">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-[15px] font-medium">Teachers</h3>
          <button onClick={() => setSharing(true)} className="btn btn-ghost press h-8"><Icon name="users" size={13} /> {owner ? "Share with teachers" : "See who has access"}</button>
        </div>
        <p className="mt-1 text-[13px] text-ink-3">Invite other teachers by email. Editors can change the course; viewers can only look. Students never see this list.</p>
        <ul className="mt-3 divide-y divide-line">
          {me?.owner && (
            <li className="flex items-center gap-3 py-2">
              {me.owner.picture
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={me.owner.picture} alt="" referrerPolicy="no-referrer" className="h-[34px] w-[34px] rounded-full object-cover" />
                : <Avatar name={me.owner.name} size={34} />}
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px]">{me.owner.name}</span><span className="block truncate text-[12.5px] text-ink-3">{me.owner.email}</span></span>
              <span className="text-[13px] text-ink-3">Owner</span>
            </li>
          )}
          {(course.people ?? []).map((p) => (
            <li key={p.email} className="flex items-center gap-3 py-2">
              <Avatar name={p.email} size={34} />
              <span className="min-w-0 flex-1 truncate text-[14px]">{p.email}</span>
              <span className="text-[13px] text-ink-3">{p.role === "viewer" ? "Can view" : "Can edit"}</span>
            </li>
          ))}
        </ul>
        {sharing && <InviteTeachers course={course} me={me} onClose={() => setSharing(false)} onChanged={onChanged} />}
      </section>

      <section className="card p-6">
        <h3 className="text-[15px] font-medium">Class code and guest link</h3>
        <p className="mt-1 text-[13px] text-ink-3">Turn joining on or off, change the code, add a passcode, or share a read-only link.</p>
        <div className="mt-4 divide-y divide-line border-t border-line text-[13px]">
          <div className="flex flex-wrap items-center gap-3 py-3">
            <span className="w-32 text-ink-2">Class code</span>
            <span className="font-mono text-[15px] tracking-[0.2em]">{course.joinCode}</span>
            <button onClick={() => setAccess({}, true, "New class code made. The old one stops working.")} className="btn btn-quiet press h-7 px-2 text-[12px]"><Icon name="reset" size={12} /> New code</button>
            <span className="flex-1" />
            <label className="flex items-center gap-2 text-ink-2">
              <span className={`relative h-[18px] w-8 rounded-full p-[2px] transition-colors duration-300 ${access.joinOpen ? "bg-ok" : "bg-line-strong"}`}>
                <span className={`block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-300 ease-[var(--ease-spring)] ${access.joinOpen ? "translate-x-[14px]" : ""}`} />
              </span>
              <input type="checkbox" className="sr-only" checked={access.joinOpen} onChange={(e) => setAccess({ joinOpen: e.target.checked }, false, e.target.checked ? "Joining is open" : "Joining is closed")} />
              Accept new students
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 py-3">
            <span className="w-32 text-ink-2">Join passcode</span>
            <input defaultValue={access.passcode ?? ""} placeholder="None" aria-label="Join passcode" className="field h-8 w-40 py-0"
              onBlur={(e) => (e.target.value || undefined) !== access.passcode && setAccess({ passcode: e.target.value || undefined }, false, e.target.value ? "Passcode set" : "Passcode removed")} />
            <span className="text-[12px] text-ink-3">Students enter it after the class code.</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 py-3">
            <span className="w-32 text-ink-2">Guest link</span>
            {access.guestToken ? (
              <>
                <code className="min-w-0 flex-1 truncate rounded-md bg-lane px-2 py-1 font-mono text-[12px] text-ink-2">{guestUrl}</code>
                <button onClick={() => { navigator.clipboard?.writeText(guestUrl).catch(() => {}); toast("Guest link copied"); }} className="btn btn-ghost press h-8">Copy</button>
                <a href={guestUrl} target="_blank" rel="noreferrer" className="btn btn-quiet press h-8">Open <Icon name="external" size={11} /></a>
                <button onClick={() => setAccess({ guestToken: null }, false, "Guest link turned off")} className="btn btn-quiet press h-8 hover:!text-bad">Turn off</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-[12.5px] text-ink-3">Read-only: guests browse the cards but see no students or their work.</span>
                <button onClick={() => setAccess({ guestToken: true }, false, "Guest link created")} className="btn btn-ghost press h-8"><Icon name="link" size={13} /> Create link</button>
              </>
            )}
          </div>
        </div>
      </section>


      <section className="card p-6">
        <h3 className="text-[15px] font-medium">Back up and share</h3>
        <p className="mt-1 text-[13px] text-ink-3">Export the course (weeks, cards, media links, rubric, session agendas) as a file, or as a Common Cartridge for another LMS. Import adds weeks after your current ones, from a Questhand file or straight from a course plan document; nothing is replaced. To make a whole new course from a file, use New course → From a course file on your courses page.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/api/course/${course.id}/file`} download className="btn btn-ghost press" title="A Questhand course file: make a new course from it with New course → From a course file">
            <Icon name="download" size={13} /> Export course (.json)
          </a>
          <a href={`/api/course/${course.id}/export`} className="btn btn-ghost press" title="IMS Common Cartridge: imports into Canvas, Moodle, Blackboard, Brightspace, and Schoology">
            <Icon name="download" size={13} /> Export for Canvas / Moodle (.imscc)
          </a>
          <DocImport courseId={course.id} onDone={onChanged} />
          <label className="btn btn-ghost press cursor-pointer">
            <Icon name="upload" size={13} /> Import weeks…
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
        </div>
      </section>

      {course.id !== "demo" && owner && <DeleteCourse course={course} />}
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
