"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { op } from "@/lib/client";
import { DEFAULT_GROUPING, groupingsOf, signupGroupingId } from "@/lib/shared";
import { toast } from "@/lib/toast";
import type { Course, Group, Grouping } from "@/lib/types";
import { Avatar, Icon } from "../Icon";

const newId = () => `g-${Math.random().toString(36).slice(2, 9)}`;
/** How many cards use a grouping. */
/** How many cards use a grouping: written in groups, discussed in groups, or the sign-up poll that makes it. */
const usedBy = (course: Course, id: string) => course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules)).filter((m) =>
  ((m.grouping ?? DEFAULT_GROUPING) === id && (m.writers === "group" || m.type === "studio" || !!m.wall?.byGroup)) || (!!m.signup && signupGroupingId(m.id) === id)).length;

/**
 * Make or change a grouping: its name, its named groups, and who is in each. Tap a group to choose it, then tap
 * students to put them in it (tap one in a group to take them out). Or split the class at random.
 */
export function GroupingEditor({ course, grouping, onClose, onSaved }: { course: Course; grouping?: Grouping; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState(grouping?.name ?? "");
  const [groups, setGroups] = useState<Group[]>(grouping?.groups.map((g) => ({ ...g, studentIds: [...g.studentIds] })) ?? [{ id: newId(), name: "Group 1", studentIds: [] }, { id: newId(), name: "Group 2", studentIds: [] }]);
  const [active, setActive] = useState(groups[0]?.id ?? "");
  const [split, setSplit] = useState(Math.max(2, groups.length));
  const [busy, setBusy] = useState(false);
  const placed = new Set(groups.flatMap((g) => g.studentIds));
  const free = course.students.filter((s) => !placed.has(s.id));
  const nameOf = (id: string) => course.students.find((s) => s.id === id)?.name ?? "";
  const move = (sid: string, to: string | null) => setGroups((gs) => gs.map((g) => ({ ...g, studentIds: g.id === to ? [...g.studentIds.filter((x) => x !== sid), sid] : g.studentIds.filter((x) => x !== sid) })));
  function randomSplit(n: number) {
    const ids = [...course.students.map((s) => s.id)].sort(() => Math.random() - 0.5);
    const next = Array.from({ length: n }, (_, i) => ({ id: groups[i]?.id ?? newId(), name: groups[i]?.name ?? `Group ${i + 1}`, studentIds: ids.filter((_, k) => k % n === i) }));
    setGroups(next);
    setActive(next[0].id);
  }
  async function save() {
    if (!groups.length) return toast("Make at least one group", { icon: "users", tone: "plain" });
    setBusy(true);
    const r = await op<{ ok?: boolean; id?: string; error?: string }>(course.id, { op: "saveGrouping", grouping: { id: grouping?.id, name: name.trim() || "Groups", groups } });
    setBusy(false);
    if (!r.id) return toast(r.error ?? "Couldn’t save the groups", { icon: "x", tone: "bad" });
    onSaved(r.id);
  }
  const uses = grouping ? usedBy(course, grouping.id) : 0;
  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/25 p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-label={grouping ? `Groups: ${grouping.name}` : "New groups"} className="pop flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-[0_30px_80px_-30px_rgba(20,20,18,0.5)]">
        <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          {grouping?.id === DEFAULT_GROUPING
            ? <span className="flex-1 text-[15px] font-semibold">Discussion groups</span>
            : <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name these groups, e.g. Lab partners, week 3" aria-label="Name of these groups" className="field h-9 flex-1 text-[14px] font-medium" />}
          <button onClick={onClose} aria-label="Close" className="btn btn-quiet press h-9 w-9 justify-center px-0"><Icon name="x" size={16} /></button>
        </header>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5 text-[12.5px]">
          <span className="text-ink-2">Split the class at random into</span>
          <input type="number" min={1} max={20} value={split} onChange={(e) => setSplit(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} aria-label="How many groups" className="field h-8 w-16 py-0 font-mono" />
          <button onClick={() => randomSplit(split)} className="btn btn-ghost press h-8 px-2.5 text-[12.5px]"><Icon name="users" size={12} /> groups</button>
          <span className="flex-1" />
          <button onClick={() => { const g = { id: newId(), name: `Group ${groups.length + 1}`, studentIds: [] }; setGroups([...groups, g]); setActive(g.id); }} className="btn btn-ghost press h-8 px-2.5 text-[12.5px]"><Icon name="plus" size={12} /> Group</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-[12.5px] text-ink-3">Tap a group, then tap students to put them in it. Tap a student in a group to take them out.</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {groups.map((g) => (
              <div key={g.id} onClick={() => setActive(g.id)} className={`cursor-pointer rounded-xl border p-2.5 transition-colors ${active === g.id ? "border-[#4b56a8] bg-[#eef0fb]/60" : "border-line hover:border-line-strong"}`}>
                <div className="flex items-center gap-1.5">
                  <input value={g.name} onClick={(e) => e.stopPropagation()} onFocus={() => setActive(g.id)} onChange={(e) => setGroups(groups.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)))} aria-label="Group name" className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-[13.5px] font-medium outline-none hover:bg-white focus:bg-white" />
                  <span className="mono text-[11px] text-ink-3">{g.studentIds.length}</span>
                  <button onClick={(e) => { e.stopPropagation(); setGroups(groups.filter((x) => x.id !== g.id)); if (active === g.id) setActive(groups.find((x) => x.id !== g.id)?.id ?? ""); }} aria-label={`Remove ${g.name}`} className="press flex h-6 w-6 items-center justify-center rounded-md text-ink-3 hover:bg-white hover:text-bad"><Icon name="x" size={11} /></button>
                </div>
                <div className="mt-1.5 flex min-h-[2rem] flex-wrap gap-1">
                  {g.studentIds.map((sid) => (
                    <button key={sid} onClick={(e) => { e.stopPropagation(); move(sid, null); }} title="Take out of this group" className="press flex items-center gap-1.5 rounded-full bg-white py-0.5 pl-0.5 pr-2 text-[12.5px] ring-1 ring-line hover:ring-bad/40">
                      <Avatar name={nameOf(sid)} size={18} />{nameOf(sid)}
                    </button>
                  ))}
                  {!g.studentIds.length && <span className="px-1 text-[12px] text-ink-3">{active === g.id ? "Tap students below to add them" : "No one yet"}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">Not in a group · {free.length}</div>
            {free.length ? (
              <div className="flex flex-wrap gap-1">
                {free.map((s) => (
                  <button key={s.id} disabled={!active} onClick={() => move(s.id, active)} title={active ? `Put in ${groups.find((g) => g.id === active)?.name}` : "Make a group first"}
                    className="press flex items-center gap-1.5 rounded-full bg-lane py-0.5 pl-0.5 pr-2 text-[12.5px] hover:bg-[#eef0fb] disabled:opacity-50">
                    <Avatar name={s.name} size={18} />{s.name}
                  </button>
                ))}
              </div>
            ) : <p className="text-[12.5px] text-ink-3">{course.students.length ? "Everyone is in a group." : "No students in the class yet. You can still make the groups and fill them later."}</p>}
          </div>
        </div>
        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <span className="flex-1 text-[12px] text-ink-3">{uses > 1 ? `${uses} cards use these groups; a change applies to all of them.` : free.length && course.students.length ? "Students not in a group write (or post) on their own." : ""}</span>
          <button onClick={onClose} className="btn btn-quiet press h-9">Cancel</button>
          <button onClick={save} disabled={busy} className="btn btn-dark press h-9">{busy ? "Saving…" : "Save groups"}</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

/**
 * On a card set to Each group: which groups it uses. Pick groups made before in this course, make new ones, or
 * change the ones picked.
 */
export function GroupingPicker({ course, value, onPick, onChanged }: { course: Course; value?: string; onPick: (id: string | undefined) => void; onChanged: () => unknown }) {
  const all = groupingsOf(course);
  const current = (value && all.find((g) => g.id === value)) || all.find((g) => g.id === DEFAULT_GROUPING);
  const [editing, setEditing] = useState<Grouping | "new" | null>(null);
  const ungrouped = current ? course.students.filter((s) => !current.groups.some((g) => g.studentIds.includes(s.id))).length : 0;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
      <span className="text-ink-2">Groups</span>
      {all.length ? (
        <select value={current?.id ?? ""} onChange={(e) => (e.target.value === "__new" ? setEditing("new") : onPick(e.target.value === DEFAULT_GROUPING ? undefined : e.target.value))} aria-label="Which groups" className="field h-8 w-auto max-w-[16rem] py-0">
          {!current && <option value="" disabled>Choose groups…</option>}
          {all.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.groups.length})</option>)}
          <option value="__new">New groups…</option>
        </select>
      ) : null}
      {current ? (
        <button onClick={() => setEditing(current)} className="btn btn-quiet press h-8 px-2 text-[12.5px]"><Icon name="users" size={12} /> Edit groups</button>
      ) : (
        <button onClick={() => setEditing("new")} className="btn btn-ghost press h-8 px-2.5 text-[12.5px]"><Icon name="plus" size={12} /> Make groups</button>
      )}
      {current && <span className="basis-full text-[12px] text-ink-3">{current.groups.map((g) => `${g.name} (${g.studentIds.length})`).join(" · ")}{ungrouped ? ` · ${ungrouped} not in a group` : ""}</span>}
      {editing && (
        <GroupingEditor course={course} grouping={editing === "new" ? undefined : editing} onClose={() => setEditing(null)}
          onSaved={async (id) => { setEditing(null); await onChanged(); onPick(id === DEFAULT_GROUPING ? undefined : id); toast("Groups saved", { icon: "users" }); }} />
      )}
    </div>
  );
}

/** A sign-up poll's groups: who has joined each, and a way for the teacher to move people. */
export function SignupGroups({ course, groupingId, onChanged }: { course: Course; groupingId: string; onChanged: () => unknown }) {
  const g = course.groupings?.find((x) => x.id === groupingId);
  const [editing, setEditing] = useState(false);
  if (!g) return <p className="text-ink-3">The groups appear here once students start joining.</p>;
  const name = (id: string) => course.students.find((s) => s.id === id)?.name ?? "";
  return (
    <div className="space-y-1">
      {g.groups.map((x) => <p key={x.id} className="text-ink-2"><span className="font-medium text-ink">{x.name}</span> ({x.studentIds.length}){x.studentIds.length ? `: ${x.studentIds.map(name).join(", ")}` : ""}</p>)}
      <button onClick={() => setEditing(true)} className="btn btn-quiet press h-8 px-2 text-[12.5px]"><Icon name="users" size={12} /> Move students</button>
      {editing && <GroupingEditor course={course} grouping={g} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await onChanged(); toast("Groups saved", { icon: "users" }); }} />}
    </div>
  );
}

/** Students tab: the course's groupings, to look over, change or remove. */
export function GroupingsList({ course, onChanged, readOnly }: { course: Course; onChanged: () => unknown; readOnly?: boolean }) {
  const all = groupingsOf(course);
  const [editing, setEditing] = useState<Grouping | "new" | null>(null);
  return (
    <section className="card p-6">
      <div className="flex items-center">
        <h3 className="flex-1 text-[15px] font-medium">Groups</h3>
        {!readOnly && <button onClick={() => setEditing("new")} className="btn btn-ghost press h-8"><Icon name="plus" size={13} /> New groups</button>}
      </div>
      <p className="mt-1 text-[13px] text-ink-3">Groups are made on a card (a worksheet for Each group, or a discussion in groups) and kept here, for other cards to use. Make new ones whenever the groups change.</p>
      {all.length ? (
        <ul className="mt-3 divide-y divide-line">
          {all.map((g) => {
            const n = usedBy(course, g.id);
            return (
              <li key={g.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px]">{g.name}</span>
                  <span className="block truncate text-[12.5px] text-ink-3">{g.groups.map((x) => `${x.name} (${x.studentIds.length})`).join(" · ")}{n ? ` · used by ${n} card${n === 1 ? "" : "s"}` : ""}</span>
                </span>
                {!readOnly && (
                  <>
                    <button onClick={() => setEditing(g)} className="btn btn-quiet press h-8 px-2 text-[12px]"><Icon name="users" size={12} /> Edit</button>
                    {g.id !== DEFAULT_GROUPING && (
                      <button onClick={async () => { await op(course.id, { op: "deleteGrouping", id: g.id }); await onChanged(); toast(n ? `Removed “${g.name}”; its cards use the Discussion groups now` : `Removed “${g.name}”`, { icon: "users", tone: "plain" }); }}
                        className="btn btn-quiet press h-8 px-2 text-[12px] hover:!text-bad"><Icon name="x" size={12} /> Remove</button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-3 text-[13px] text-ink-3">No groups yet.</p>}
      {editing && <GroupingEditor course={course} grouping={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await onChanged(); toast("Groups saved", { icon: "users" }); }} />}
    </section>
  );
}
