"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { op } from "@/lib/client";
import { DEFAULT_GROUPING, GROUP_COLORS, GROUP_ROLES, groupBase, groupingsOf, rotateRoles, signupGroupingId } from "@/lib/shared";
import { toast } from "@/lib/toast";
import type { Course, Group, Grouping } from "@/lib/types";
import { Avatar, Icon } from "../Icon";
import { ask } from "../Confirm";

const newId = () => `g-${Math.random().toString(36).slice(2, 9)}`;
/** A colour no group here has yet, for a new group's name (the word Group is added to every name). */
const freeColor = (taken: string[]) => GROUP_COLORS.find((c) => !taken.some((x) => x.trim().toLowerCase() === c.toLowerCase())) ?? `${taken.length + 1}`;
/** How many cards use a grouping. */
/** How many cards use a grouping: written in groups, discussed in groups, or the sign-up poll that makes it. */
const usedBy = (course: Course, id: string) => course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules)).filter((m) =>
  ((m.grouping ?? DEFAULT_GROUPING) === id && (m.writers === "group" || !!m.wall?.byGroup)) || (!!m.signup && signupGroupingId(m.id) === id)).length;

/**
 * Make or change a grouping: its name, its named groups, and who is in each. Tap a group to choose it, then tap
 * students to put them in it (tap one in a group to take them out). Or split the class at random.
 */
export function GroupingEditor({ course, grouping, onClose, onSaved }: { course: Course; grouping?: Grouping; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState(grouping?.name ?? "");
  const [groups, setGroups] = useState<Group[]>(grouping?.groups.map((g) => ({ ...g, name: groupBase(g.name), studentIds: [...g.studentIds], roles: g.roles ? { ...g.roles } : undefined })) ?? [{ id: newId(), name: "Red", studentIds: [] }, { id: newId(), name: "Blue", studentIds: [] }]);
  const [active, setActive] = useState(groups[0]?.id ?? "");
  const [split, setSplit] = useState(Math.max(2, groups.length));
  const [busy, setBusy] = useState(false);
  const placed = new Set(groups.flatMap((g) => g.studentIds));
  const free = course.students.filter((s) => !placed.has(s.id));
  const nameOf = (id: string) => course.students.find((s) => s.id === id)?.name ?? "";
  const setRole = (gid: string, sid: string, role: string) => setGroups((gs) => gs.map((g) => (g.id === gid ? { ...g, roles: { ...g.roles, [sid]: role } } : g)));
  const hasRoles = groups.some((g) => Object.values(g.roles ?? {}).some((r) => r.trim()));
  const move = (sid: string, to: string | null) => setGroups((gs) => gs.map((g) => ({ ...g, studentIds: g.id === to ? [...g.studentIds.filter((x) => x !== sid), sid] : g.studentIds.filter((x) => x !== sid), roles: g.id === to ? g.roles : Object.fromEntries(Object.entries(g.roles ?? {}).filter(([k]) => k !== sid)) })));
  function randomSplit(n: number) {
    const ids = [...course.students.map((s) => s.id)].sort(() => Math.random() - 0.5);
    const names: string[] = [];
    for (let i = 0; i < n; i++) names.push(groups[i]?.name ?? freeColor([...groups.map((g) => g.name), ...names]));
    const next = Array.from({ length: n }, (_, i) => ({ id: groups[i]?.id ?? newId(), name: names[i], studentIds: ids.filter((_, k) => k % n === i) }));
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
          {hasRoles && <button onClick={() => { setGroups(groups.map(rotateRoles)); toast("Roles passed on to the next person in each group", { icon: "users" }); }} title="Each role goes to the next person in the group" className="btn btn-quiet press h-8 px-2.5 text-[12.5px]"><Icon name="reset" size={12} /> Rotate roles</button>}
          <button onClick={() => { const g = { id: newId(), name: freeColor(groups.map((x) => x.name)), studentIds: [] }; setGroups([...groups, g]); setActive(g.id); }} className="btn btn-ghost press h-8 px-2.5 text-[12.5px]"><Icon name="plus" size={12} /> Group</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-[12.5px] text-ink-3">Tap a group, then tap students to put them in it. Give anyone a role beside their name; students see it in their group.</p>
          <datalist id="group-roles">{GROUP_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {groups.map((g) => (
              <div key={g.id} onClick={() => setActive(g.id)} className={`cursor-pointer rounded-xl border p-2.5 transition-colors ${active === g.id ? "border-[#4b56a8] bg-[#eef0fb]/60" : "border-line hover:border-line-strong"}`}>
                <div className="flex items-center gap-1.5">
                  <input value={g.name} onClick={(e) => e.stopPropagation()} onFocus={() => setActive(g.id)} onChange={(e) => setGroups(groups.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)))} aria-label="Group name (the word Group is added)" placeholder="Name" style={{ width: `calc(${Math.max(4, g.name.length + 1)}ch + 0.5rem)` }} className="min-w-0 max-w-[70%] rounded-md bg-transparent px-1 py-0.5 text-[13.5px] font-medium outline-none hover:bg-white focus:bg-white" />
                  <span className="flex-1 text-[13.5px] font-medium text-ink-3">Group</span>
                  <span className="mono text-[11px] text-ink-3">{g.studentIds.length}</span>
                  <button onClick={(e) => { e.stopPropagation(); setGroups(groups.filter((x) => x.id !== g.id)); if (active === g.id) setActive(groups.find((x) => x.id !== g.id)?.id ?? ""); }} aria-label={`Remove ${g.name} Group`} className="press flex h-6 w-6 items-center justify-center rounded-md text-ink-3 hover:bg-white hover:text-bad"><Icon name="x" size={11} /></button>
                </div>
                <div className="mt-1.5 flex min-h-[2rem] flex-col gap-1">
                  {g.studentIds.map((sid) => (
                    <div key={sid} className="flex items-center gap-1.5 rounded-full bg-white py-0.5 pl-0.5 pr-1 text-[12.5px] ring-1 ring-line">
                      <Avatar name={nameOf(sid)} size={18} /><span className="min-w-0 truncate">{nameOf(sid)}</span>
                      <span className="flex-1" />
                      {/* A role beside the name (pick one or type your own). */}
                      <input value={g.roles?.[sid] ?? ""} list="group-roles" onClick={(e) => e.stopPropagation()} onFocus={() => setActive(g.id)}
                        onChange={(e) => setRole(g.id, sid, e.target.value)} placeholder="+ role" aria-label={`${nameOf(sid)}’s role`}
                        className={`h-5 w-[6.5rem] rounded-full px-2 text-[11.5px] outline-none placeholder:text-ink-3 focus:bg-lane ${g.roles?.[sid] ? "bg-[#eef0fb] font-medium text-[#4b56a8]" : "bg-transparent hover:bg-lane"}`} />
                      <button onClick={(e) => { e.stopPropagation(); move(sid, null); }} aria-label={`Take ${nameOf(sid)} out of this group`} className="press flex h-5 w-5 flex-none items-center justify-center rounded-full text-ink-3 hover:bg-lane hover:text-bad"><Icon name="x" size={10} /></button>
                    </div>
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
                      <button onClick={async () => { if (n && !(await ask({ title: `Remove “${g.name}”?`, body: `${n} card${n === 1 ? " uses" : "s use"} these groups. Worksheets that groups were filling in start again with new, empty copies for the other groups, and discussions in groups regroup.`, confirm: "Remove", danger: true }))) return; await op(course.id, { op: "deleteGrouping", id: g.id }); await onChanged(); toast(n ? `Removed “${g.name}”; its cards use the Discussion groups now` : `Removed “${g.name}”`, { icon: "users", tone: "plain" }); }}
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
