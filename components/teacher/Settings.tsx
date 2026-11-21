"use client";

import { op } from "@/lib/client";
import type { ConnectorInfo } from "@/lib/connectors/types";
import { download } from "@/lib/download";
import { toast } from "@/lib/toast";
import { DocImport } from "./DocImport";
import { InviteTeachers } from "./ShareDialog";
import { useState } from "react";
import { ask } from "../Confirm";
import { Clearable } from "../Clearable";
import { DeleteCourse } from "./DeleteCourse";
import type { Course, CourseState } from "@/lib/types";
import { Avatar, Icon } from "../Icon";
import { uid } from "@/lib/profile";
import type { Group } from "@/lib/types";

/** The Settings tab (part "settings") and the Students tab (part "students") share this component and its helpers. */
export function Settings({ course, onChanged, part = "settings", readOnly = false, onInvite, me }: {
  course: Course; connectors?: ConnectorInfo[]; onChanged: () => void; part?: "settings" | "students"; readOnly?: boolean; onInvite?: () => void; me?: CourseState["me"];
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
  const groups = course.groups ?? [];
  const unassigned = course.students.filter((s) => !groups.some((g) => g.studentIds.includes(s.id)));
  const saveGroups = async (next: Group[]) => {
    await op(course.id, { op: "setGroups", groups: next });
    onChanged();
  };
  /** Tapping a student moves them to the next group (and from the last group to unassigned). */
  const moveOn = (sid: string) => {
    const from = groups.findIndex((g) => g.studentIds.includes(sid));
    const to = from + 1 < groups.length ? from + 1 : -1;
    saveGroups(groups.map((g, i) => ({ ...g, studentIds: i === from ? g.studentIds.filter((x) => x !== sid) : i === to ? [...g.studentIds, sid] : g.studentIds })));
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
                  <span className="block truncate text-[14px]">{st.name}</span>
                  <span className="block truncate text-[12.5px] text-ink-3">{st.email ?? "No email · joins by picking their name"}</span>
                </span>
                {!readOnly && (
                  <span className="flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
                    <button onClick={async () => { await op(course.id, { op: "resetPin", studentId: st.id }); toast(st.email ? `${st.name}’s links stopped working. Send a new invitation.` : `${st.name} will choose a new PIN next time`, { icon: "lock", tone: "plain" }); }}
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
        {!readOnly && (
          <details className="mt-3 text-[13px]">
            <summary className="cursor-pointer text-ink-3 hover:text-ink-2">Add students without email</summary>
            <form className="mt-2 flex flex-wrap items-start gap-2" onSubmit={async (e) => {
              e.preventDefault();
              const ta = e.currentTarget.elements.namedItem("names") as HTMLTextAreaElement;
              if (!ta.value.trim()) return;
              const r = await op<{ added?: number }>(course.id, { op: "addStudents", names: ta.value });
              ta.value = "";
              onChanged();
              toast(`Added ${r.added ?? 0} student${r.added === 1 ? "" : "s"}`, { icon: "users" });
            }}>
              <textarea name="names" rows={2} placeholder={"One name per line\nMia Chen\nLeo Park"} aria-label="Student names" className="field min-w-0 flex-1 resize-y" />
              <button type="submit" className="btn btn-ghost press">Add</button>
            </form>
          </details>
        )}
      </section>

      {/* Groups matter only to a discussion run in groups: show them once a course has one, or already has groups. */}
      {(course.weeks.some((w) => w.lessons.some((l) => l.modules.some((m) => m.type === "studio"))) || (course.groups?.length ?? 0) > 1) && (
      <section className="card p-6">
        <div className="flex items-center">
          <h3 className="flex-1 text-[15px] font-medium">Discussion groups</h3>
          <button onClick={async () => { await op(course.id, { op: "autoGroup", size: 6 }); onChanged(); toast("Split the class into balanced groups", { icon: "users" }); }} className="btn btn-ghost press mr-2 h-8"><Icon name="users" size={13} /> Auto-group</button>
          {course.weeks.some((w) => w.lessons.some((l) => l.elective)) && (
            <button onClick={async () => { await op(course.id, { op: "autoGroup", size: 6, by: "elective" }); onChanged(); toast("Grouped students who share an elective", { icon: "users" }); }}
              title="Students who chose the same elective share a group, so early feedback uses the same rubric" className="btn btn-ghost press mr-2 h-8"><Icon name="layers" size={13} /> Group by elective</button>
          )}
          {course.weeks.some((w) => w.lessons.some((l) => l.elective)) && (
            <label className="mr-2 inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
              Each student takes at least
              <input type="number" min={0} max={10} defaultValue={course.electiveMin ?? 2} aria-label="Minimum electives"
                onBlur={async (e) => { await op(course.id, { op: "setElectiveMin", min: Number(e.target.value) }); onChanged(); }}
                className="field h-8 w-14 py-0 text-center" />
              electives
            </label>
          )}
          <button onClick={() => saveGroups([...groups, { id: uid("g-"), name: `Studio ${String.fromCharCode(65 + groups.length)}`, studentIds: [] }])} className="btn btn-ghost press h-8"><Icon name="plus" size={13} /> Add group</button>
        </div>
        <p className="mt-1 text-[13px] text-ink-3">Groups of 4–6 work best. Tap a student to move them to the next group. Students see and give feedback only within their own group.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.id} className="rounded-xl bg-lane p-3">
              <div className="mb-2 flex items-center gap-2">
                <input defaultValue={g.name} onBlur={(e) => e.target.value !== g.name && saveGroups(groups.map((x) => (x.id === g.id ? { ...x, name: e.target.value || x.name } : x)))}
                  aria-label="Group name" className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-[13.5px] font-medium hover:border-line focus:border-line-strong focus:bg-white focus:outline-none" />
                <span className={`mono ${g.studentIds.length > 6 || (g.studentIds.length > 0 && g.studentIds.length < 3) ? "text-warn" : ""}`}>{g.studentIds.length}</span>
                {g.studentIds.length === 0 && (
                  <button onClick={() => saveGroups(groups.filter((x) => x.id !== g.id))} aria-label={`Delete ${g.name}`} className="btn btn-quiet press h-6 w-6 justify-center px-0"><Icon name="x" size={12} /></button>
                )}
              </div>
              <div className="flex min-h-8 flex-wrap gap-1.5">
                {g.studentIds.map((sid) => {
                  const st = course.students.find((x) => x.id === sid);
                  return st && (
                    <button key={sid} onClick={() => moveOn(sid)} className="pop press inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-white pl-1 pr-2.5 text-[12.5px] hover:border-line-strong">
                      <Avatar name={st.name} size={20} />{st.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {unassigned.length > 0 && (
            <div className="rounded-xl border border-dashed border-line-strong p-3">
              <div className="mb-2 text-[13.5px] font-medium text-ink-2">Not in a group <span className="mono">{unassigned.length}</span></div>
              <div className="flex flex-wrap gap-1.5">
                {unassigned.map((st) => (
                  <button key={st.id} onClick={() => groups[0] && saveGroups(groups.map((g, i) => (i === 0 ? { ...g, studentIds: [...g.studentIds, st.id] } : g)))}
                    className="pop press inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-white pl-1 pr-2.5 text-[12.5px] hover:border-line-strong">
                    <Avatar name={st.name} size={20} />{st.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
      )}
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
        <p className="mt-1 text-[13px] text-ink-3">Export the course (weeks, cards, media links, rubric, session agendas) as a file, or as a Common Cartridge for another LMS. Import adds weeks after your current ones, from a Questhand file or straight from a course plan document; nothing is replaced.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => {
              const { weeks, skills, levels, title, subtitle } = course;
              download(`${course.title} course.json`, JSON.stringify({ format: "questhand-course", version: 1, title, subtitle, skills, levels, weeks }, null, 2), "application/json");
              toast("Course exported", { icon: "download" });
            }}
            className="btn btn-ghost press"
          >
            <Icon name="download" size={13} /> Export course (.json)
          </button>
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
