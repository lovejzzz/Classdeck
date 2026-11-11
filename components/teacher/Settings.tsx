"use client";

import Link from "next/link";
import { op } from "@/lib/client";
import { CATEGORIES, type ConnectorInfo } from "@/lib/connectors/types";
import { PRESETS, PRESET_LABELS, fromPreset } from "@/lib/profile";
import { download } from "@/lib/download";
import { toast } from "@/lib/toast";
import { DocImport } from "./DocImport";
import type { Course, PresetId, Profile } from "@/lib/types";
import { Cover } from "../Cover";
import { Avatar, CONNECTOR_ICON, Icon } from "../Icon";
import { uid } from "@/lib/profile";
import type { Group } from "@/lib/types";

const DIMS: { key: keyof Omit<Profile, "preset">; label: string; options: [string, string, string][] }[] = [
  { key: "density", label: "Card size", options: [["spacious", "Large", "Big cards, big text"], ["comfortable", "Medium", "A fanned hand of cards"], ["compact", "Small", "Many cards at a glance"]] },
  { key: "autonomy", label: "Order", options: [["sequential", "In order", "Each card unlocks the next"], ["free", "Any order", "Students choose the order"]] },
  { key: "horizon", label: "Shows", options: [["lesson", "Today", "Just today’s hand of cards"], ["week", "This week", "This week’s lessons in a row"], ["term", "Whole term", "Every week, one row each"]] },
  { key: "entry", label: "Joining", options: [["code", "Class code", "No account needed"], ["account", "Account", "Prototype still uses name picking"]] },
];

const PRESET_COVER: Record<PresetId, "practice" | "read" | "quiz"> = { primary: "practice", secondary: "read", higher: "quiz" };

export function Settings({ course, connectors, onChanged }: { course: Course; connectors: ConnectorInfo[]; onChanged: () => void }) {
  const p = course.profile;
  const setProfile = async (profile: Profile, note?: string) => {
    await op(course.id, { op: "setProfile", profile });
    onChanged();
    if (note) toast(note);
  };
  const toggle = async (c: ConnectorInfo) => {
    const on = course.enabledConnectors.includes(c.id);
    const ids = on ? course.enabledConnectors.filter((x) => x !== c.id) : [...course.enabledConnectors, c.id];
    await op(course.id, { op: "setEnabledConnectors", ids });
    onChanged();
    toast(on ? `Turned off ${c.name}` : `Turned on ${c.name}`, { icon: on ? "x" : "check", tone: on ? "plain" : "ok" });
  };
  const first = course.students[0];
  const info = async (patch: { title?: string; subtitle?: string }) => {
    await op(course.id, { op: "setCourseInfo", title: patch.title ?? course.title, subtitle: patch.subtitle ?? course.subtitle ?? "" });
    onChanged();
    toast("Saved");
  };
  const removeStudent = async (studentId: string, name: string) => {
    await op(course.id, { op: "removeStudent", studentId });
    onChanged();
    toast(`Removed ${name}`, { icon: "x", tone: "plain" });
  };
  const access = { joinOpen: course.access?.joinOpen !== false, passcode: course.access?.passcode, guestToken: course.access?.guestToken };
  const guestUrl = access.guestToken && typeof window !== "undefined" ? `${window.location.origin}/guest/${course.id}?t=${access.guestToken}` : "";
  const setAccess = async (patch: Record<string, unknown>, newCode: boolean, note: string) => {
    await op(course.id, { op: "setAccess", access: { joinOpen: access.joinOpen, passcode: access.passcode, ...patch }, newCode });
    onChanged();
    toast(note);
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
      <section className="card p-6">
        <h3 className="text-[15px] font-medium">Who this course is for</h3>
        <p className="mt-1 text-[13px] text-ink-3">Pick a preset to set all four options at once. You can still change any one of them afterward.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {(Object.keys(PRESETS) as PresetId[]).map((id) => {
            const on = p.preset === id;
            return (
              <button
                key={id}
                onClick={() => setProfile(fromPreset(id), `Switched to ${PRESET_LABELS[id]}`)}
                aria-pressed={on}
                className={`card press overflow-hidden text-left ${on ? "!border-ink ring-1 ring-ink" : "card-hover"}`}
              >
                <Cover type={PRESET_COVER[id]} height={44} />
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-[14px] font-medium">{PRESET_LABELS[id]}</span>
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full border transition-colors ${on ? "border-ink bg-ink text-white" : "border-line-strong"}`}>
                      {on && <Icon name="check" size={10} strokeWidth={3} />}
                    </span>
                  </div>
                  <div className="mt-1 text-[12px] text-ink-3">
                    {DIMS.map((d) => d.options.find((o) => o[0] === PRESETS[id][d.key])?.[1]).join(" · ")}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-6 divide-y divide-line border-t border-line">
          {DIMS.map((d) => {
            const idx = d.options.findIndex((o) => o[0] === p[d.key]);
            const hint = d.options[idx]?.[2];
            return (
              <div key={d.key} className="flex flex-wrap items-center gap-3 py-3">
                <div className="w-20 text-[13px] text-ink-2">{d.label}</div>
                <div className="relative inline-flex rounded-lg bg-lane p-0.5">
                  <span
                    className="absolute inset-y-0.5 left-0.5 rounded-md bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-[var(--ease-out)]"
                    style={{ width: "6.5rem", transform: `translateX(${idx * 6.5}rem)` }}
                  />
                  {d.options.map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setProfile({ ...p, preset: "custom", [d.key]: value } as Profile)}
                      aria-pressed={p[d.key] === value}
                      className={`relative h-7 w-[6.5rem] rounded-md text-[12.5px] transition-colors duration-300 ${p[d.key] === value ? "font-medium text-ink" : "text-ink-2 hover:text-ink"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span key={hint} className="fade text-[12.5px] text-ink-3">{hint}</span>
              </div>
            );
          })}
        </div>
        {p.preset === "custom" && <p className="mt-2 text-[12.5px] text-ink-3">This is a custom combination.</p>}

        {first && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-lane px-4 py-3 text-[13px]">
            <Icon name="eye" size={14} className="text-ink-3" />
            <span className="mr-1 text-ink-2">Preview the same lesson for each age group</span>
            {(Object.keys(PRESETS) as PresetId[]).map((id) => (
              <Link key={id} href={`/learn/${course.id}/${first.id}?preview=1&preset=${id}`} target="_blank" className="btn btn-ghost press h-7 px-2.5 text-[12.5px]">
                {PRESET_LABELS[id]} <Icon name="external" size={11} className="text-ink-3" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="card p-6">
        <h3 className="text-[15px] font-medium">Back up and share</h3>
        <p className="mt-1 text-[13px] text-ink-3">Export the course (weeks, cards, media links, rubric, session agendas) as a file, or as a Common Cartridge for another LMS. Import adds weeks after your current ones, from a Classdeck file or straight from a course plan document; nothing is replaced.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => {
              const { weeks, skills, levels, title, subtitle } = course;
              download(`${course.title} course.json`, JSON.stringify({ format: "classdeck-course", version: 1, title, subtitle, skills, levels, weeks }, null, 2), "application/json");
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
                  toast("That file isn’t a Classdeck course export", { icon: "x", tone: "bad" });
                }
              }} />
          </label>
        </div>
      </section>

      <section className="card p-6">
        <h3 className="text-[15px] font-medium">Access</h3>
        <p className="mt-1 text-[13px] text-ink-3">Who can join, and a read-only link for guests. Real sign-in comes with deployment; these settings already apply to the class code.</p>
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
        <h3 className="text-[15px] font-medium">Course and students</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-[13px]"><span className="text-ink-2">Course name</span>
            <input defaultValue={course.title} onBlur={(e) => e.target.value.trim() && e.target.value !== course.title && info({ title: e.target.value })} className="field mt-1" />
          </label>
          <label className="block text-[13px]"><span className="text-ink-2">Subtitle</span>
            <input defaultValue={course.subtitle ?? ""} placeholder="e.g. Spring 2027 · Tuesdays" onBlur={(e) => e.target.value !== (course.subtitle ?? "") && info({ subtitle: e.target.value })} className="field mt-1" />
          </label>
        </div>
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-[13px]"><span className="font-medium">Students</span><span className="mono">{course.students.length}</span></div>
          {course.students.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {course.students.map((st) => (
                <span key={st.id} className="pop inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-white pl-1 pr-1 text-[12.5px]">
                  <Avatar name={st.name} size={20} />{st.name}
                  <button onClick={async () => { await op(course.id, { op: "resetPin", studentId: st.id }); toast(`${st.name} will choose a new PIN next time`, { icon: "lock", tone: "plain" }); }}
                    title="Reset PIN" aria-label={`Reset ${st.name}’s PIN`} className="press rounded-full p-1 text-ink-3 hover:bg-lane hover:text-ink"><Icon name="lock" size={11} /></button>
                  <button onClick={() => confirm(`Remove ${st.name} from the class? Their work stays saved.`) && removeStudent(st.id, st.name)} aria-label={`Remove ${st.name}`} className="press rounded-full p-1 text-ink-3 hover:bg-lane hover:text-bad"><Icon name="x" size={11} /></button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">No students yet. Add names below; students pick their name after entering the class code, then choose a 4-digit PIN.</p>
          )}
          <form className="mt-3 flex flex-wrap items-start gap-2" onSubmit={async (e) => {
            e.preventDefault();
            const ta = e.currentTarget.elements.namedItem("names") as HTMLTextAreaElement;
            if (!ta.value.trim()) return;
            const r = await op<{ added?: number }>(course.id, { op: "addStudents", names: ta.value });
            ta.value = "";
            onChanged();
            toast(`Added ${r.added ?? 0} student${r.added === 1 ? "" : "s"}`, { icon: "users" });
          }}>
            <textarea name="names" rows={2} placeholder={"Paste names, one per line\nMia Chen\nLeo Park"} aria-label="Student names" className="field min-w-0 flex-1 resize-y" />
            <button type="submit" className="btn btn-dark press">Add students</button>
          </form>
        </div>
      </section>

      <section className="card p-6">
        <div className="flex items-center">
          <h3 className="flex-1 text-[15px] font-medium">Collab Studio groups</h3>
          <button onClick={async () => { await op(course.id, { op: "autoGroup", size: 6 }); onChanged(); toast("Split the class into balanced groups", { icon: "users" }); }} className="btn btn-ghost press mr-2 h-8"><Icon name="users" size={13} /> Auto-group</button>
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

      <section className="card p-6">
        <div className="flex items-center">
          <h3 className="flex-1 text-[15px] font-medium">Connectors for this course</h3>
          <Link href="/connectors" className="btn btn-quiet press h-7 px-2 text-[12.5px]">Manage connectors <Icon name="arrow" size={12} /></Link>
        </div>
        <p className="mt-1 text-[13px] text-ink-3">Turn a connector on to put its tools on cards. Students can only use tools that are on a card.</p>
        {CATEGORIES.filter((cat) => connectors.some((c) => c.category === cat)).map((cat) => (
        <div key={cat} className="mt-5">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">
          {cat}<span className="font-mono normal-case tracking-normal">{connectors.filter((c) => c.category === cat && course.enabledConnectors.includes(c.id)).length}/{connectors.filter((c) => c.category === cat).length} on</span>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {connectors.filter((c) => c.category === cat).map((c) => {
            const on = course.enabledConnectors.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggle(c)}
                aria-pressed={on}
                className="card card-hover press flex items-start gap-3 p-3.5 text-left"
              >
                <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg transition-colors ${on ? "bg-ink text-white" : "bg-lane text-ink-2"}`}>
                  <Icon name={CONNECTOR_ICON[c.id] ?? "plug"} size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13.5px] font-medium">
                    {c.name}
                    {!c.configured && <span className="chip h-5 text-[11px] text-warn">needs key</span>}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-ink-3">{c.description}</span>
                </span>
                <span className={`mt-1 h-[18px] w-8 flex-none rounded-full p-[2px] transition-colors duration-300 ${on ? "bg-ok" : "bg-line-strong"}`}>
                  <span className={`block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-300 ease-[var(--ease-spring)] ${on ? "translate-x-[14px]" : ""}`} />
                </span>
              </button>
            );
          })}
        </div>
        </div>
        ))}
      </section>
    </div>
  );
}
