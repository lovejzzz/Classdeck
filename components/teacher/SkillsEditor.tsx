"use client";

import { useState } from "react";
import { op } from "@/lib/client";
import { uid } from "@/lib/profile";
import { DEFAULT_LEVELS, SKILL_SETS } from "@/lib/skillsets";
import { toast } from "@/lib/toast";
import type { Course, Level, Skill } from "@/lib/types";
import { Icon } from "../Icon";

/** Settings: the skills this course practises and rates, and the names of the four levels. */
export function SkillsEditor({ course, onChanged }: { course: Course; onChanged: () => void }) {
  const [skills, setSkills] = useState<Skill[]>(course.skills ?? []);
  const [levels, setLevels] = useState<Level[]>(course.levels?.length === 4 ? course.levels : DEFAULT_LEVELS);
  const [busy, setBusy] = useState(false);
  const changed = JSON.stringify(skills) !== JSON.stringify(course.skills ?? []) || JSON.stringify(levels.map((l) => [l.name, l.description])) !== JSON.stringify((course.levels ?? []).map((l) => [l.name, l.description]));

  async function save() {
    setBusy(true);
    const r = await op<{ ok?: boolean; error?: string }>(course.id, { op: "setSkills", skills, levels });
    setBusy(false);
    if (r.ok === false) return toast(r.error ?? "That didn’t save", { icon: "x", tone: "bad" });
    toast("Skills saved");
    onChanged();
  }
  function applySet(id: string) {
    const set = SKILL_SETS.find((x) => x.id === id);
    if (!set) return;
    if (skills.length && !confirm(`Replace this course’s skills with the ${set.label} set? Ratings already given to skills that go away stay in the records but stop showing.`)) return;
    setSkills(set.skills.map((x) => ({ ...x })));
    if (id !== "speaking") setLevels(DEFAULT_LEVELS);
  }

  return (
    <section id="skills" className="card scroll-mt-20 p-6">
      <h3 className="text-[15px] font-medium">Skills and levels</h3>
      <p className="mt-1 text-[13px] text-ink-3">What students practise and get rated on. They show on cards, when students rate themselves, in your reviews, on each student’s skill chart, and in Grades.</p>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="mr-1 text-ink-2">Start from</span>
        {SKILL_SETS.map((x) => (
          <button key={x.id} onClick={() => applySet(x.id)} className="press h-7 rounded-full border border-line px-2.5 text-ink-2 hover:border-line-strong pointer-coarse:h-9">{x.label}</button>
        ))}
      </div>

      <ol className="mt-3 space-y-1.5">
        {skills.map((sk, i) => (
          <li key={sk.id} className="flex items-center gap-2">
            <span className="mono w-5 text-right">{i + 1}</span>
            <input value={sk.name} onChange={(e) => setSkills(skills.map((x) => (x.id === sk.id ? { ...x, name: e.target.value } : x)))} maxLength={40}
              aria-label={`Skill ${i + 1}`} className="field h-9 max-w-sm py-0" />
            <button onClick={() => setSkills(skills.filter((x) => x.id !== sk.id))} disabled={skills.length <= 1} aria-label={`Remove ${sk.name || `skill ${i + 1}`}`}
              className="btn btn-quiet press h-8 w-8 justify-center px-0 hover:!text-bad"><Icon name="x" size={13} /></button>
          </li>
        ))}
      </ol>
      <button onClick={() => setSkills([...skills, { id: uid("sk-"), name: "" }])} disabled={skills.length >= 10} className="btn btn-quiet press mt-1.5 h-8 px-2 text-[12.5px]"><Icon name="plus" size={12} /> Add a skill</button>

      <div className="mt-5 text-[13px] text-ink-2">Levels</div>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {levels.map((l, i) => (
          <div key={i} className="rounded-lg border border-line p-2.5">
            <div className="flex items-center gap-2">
              <span className="mono">{i + 1}</span>
              <input value={l.name} onChange={(e) => setLevels(levels.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} maxLength={30} aria-label={`Level ${i + 1} name`} className="field h-8 py-0 font-medium" />
            </div>
            <textarea value={l.description} onChange={(e) => setLevels(levels.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))} maxLength={200} rows={2}
              aria-label={`Level ${i + 1} description`} placeholder="What this level looks like" className="field mt-1.5 resize-none text-[12.5px]" />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={busy || !changed || skills.some((x) => !x.name.trim())} className="btn btn-dark press h-9">{busy ? "Saving…" : "Save skills"}</button>
        {changed && <button onClick={() => { setSkills(course.skills ?? []); setLevels(course.levels?.length === 4 ? course.levels : DEFAULT_LEVELS); }} className="btn btn-quiet press h-9">Undo changes</button>}
        {skills.some((x) => !x.name.trim()) && <span className="text-[12.5px] text-ink-3">Name every skill, or remove the empty one.</span>}
      </div>
    </section>
  );
}
