"use client";

import { Fragment, useState } from "react";
import { download, toCsv } from "@/lib/download";
import { isLate } from "@/lib/grading";
import { visibleModules } from "@/lib/profile";
import type { CourseState, Module } from "@/lib/types";
import { Avatar, Icon } from "../Icon";
import { SkillRadar } from "../SkillRadar";

const WORK = new Set(["explore", "practice", "submit", "reflect"]);

/**
 * The whole course per student: where the teacher placed them on each skill (from rubric
 * reviews) next to where they placed themselves, plus completion, late work, and quizzes.
 */
export function Gradebook({ state }: { state: CourseState }) {
  const { course, progress } = state;
  const skills = course.skills ?? [];
  const levels = course.levels ?? [];
  const [now] = useState(() => Date.now());
  const [open, setOpen] = useState<string | null>(null);
  const all = course.weeks.flatMap((w) => w.lessons.map((l) => ({ w, l })));

  const rows = course.students.map((st) => {
    const mine = progress[st.id] ?? {};
    const cards: { m: Module; week: string }[] = [];
    for (const { w, l } of all) {
      const seen = new Set<string>();
      for (const m of visibleModules(l, st.id, state.choices[st.id])) {
        if (m.choice) {
          if (seen.has(m.choice.slot)) continue;
          seen.add(m.choice.slot);
        }
        cards.push({ m, week: w.title });
      }
    }
    const done = cards.filter(({ m }) => mine[m.id]?.status === "done").length;
    const late = cards.filter(({ m }) => isLate(m, mine[m.id], now)).length;
    const quizzes = cards.filter(({ m }) => m.type === "quiz" && m.questions?.length && mine[m.id]?.status === "done");
    const quizPct = quizzes.length ? quizzes.reduce((t, { m }) => t + (mine[m.id].best ?? mine[m.id].score ?? 0) / m.questions!.length, 0) / quizzes.length : undefined;
    const reviews = cards.filter(({ m }) => mine[m.id]?.review).map(({ m, week }) => ({ m, week, r: mine[m.id].review! })).sort((a, b) => b.r.at - a.r.at);
    const waiting = cards.filter(({ m }) => WORK.has(m.type) && !m.questions?.length && mine[m.id]?.status === "done" && !mine[m.id]?.review).length;
    // Latest teacher level per skill, and the student's latest self-rating.
    const teacher: Record<string, number> = {};
    for (const { r } of [...reviews].reverse()) for (const [k, v] of Object.entries(r.levels ?? {})) teacher[k] = v;
    const self: Record<string, number> = {};
    const checks = cards.filter(({ m }) => m.type === "selfcheck" && mine[m.id]?.ratings).sort((a, b) => mine[a.m.id].updatedAt - mine[b.m.id].updatedAt);
    for (const { m } of checks) Object.assign(self, mine[m.id].ratings);
    return { st, total: cards.length, done, late, quizPct, reviews, waiting, teacher, self };
  });

  function exportCsv() {
    const head = ["Student", "Group", "Cards done", "Cards total", "Late", "Quiz average %", ...skills.flatMap((s) => [`${s.name} (teacher)`, `${s.name} (self)`]), "Reviews given"];
    const group = (id: string) => course.groups?.find((g) => g.studentIds.includes(id))?.name ?? "";
    const body = rows.map((r) => [
      r.st.name, group(r.st.id), r.done, r.total, r.late, r.quizPct === undefined ? "" : Math.round(r.quizPct * 100),
      ...skills.flatMap((s) => [r.teacher[s.id] ?? "", r.self[s.id] ?? ""]), r.reviews.length,
    ]);
    download(`${course.title} - gradebook.csv`, toCsv([head, ...body]), "text/csv");
  }

  const cell = (n?: number) => (n ? levels.find((l) => l.n === n)?.name ?? String(n) : "");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-[13px] text-ink-3">
          Skill levels come from your rubric reviews (latest per skill), shown next to each student’s own latest self-check. Click a student for their reviewed work.
        </p>
        <button onClick={exportCsv} className="btn btn-ghost press h-8"><Icon name="download" size={13} /> Export CSV</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-ink-3">
              <th className="sticky left-0 z-10 border-b border-line bg-white px-4 py-3 font-normal">Student</th>
              <th className="border-b border-line px-2 py-3 font-normal">Done</th>
              <th className="border-b border-line px-2 py-3 font-normal">Late</th>
              <th className="border-b border-line px-2 py-3 font-normal">Quizzes</th>
              {skills.map((s) => <th key={s.id} className="min-w-[7.5rem] border-b border-line px-2 py-3 font-normal"><span className="line-clamp-2 text-ink">{s.name}</span><span className="text-[11px]">teacher · self</span></th>)}
              <th className="border-b border-line px-2 py-3 font-normal">To review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.st.id}>
                <tr className="group cursor-pointer hover:bg-[#fafaf9]" onClick={() => setOpen(open === r.st.id ? null : r.st.id)}>
                  <td className="sticky left-0 z-10 whitespace-nowrap border-b border-line/70 bg-white px-4 py-2 group-hover:bg-[#fafaf9]">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <Icon name="chevron" size={12} className={`text-ink-3 transition-transform ${open === r.st.id ? "" : "-rotate-90"}`} />
                      <Avatar name={r.st.name} size={20} />{r.st.name}
                    </span>
                  </td>
                  <td className="border-b border-line/70 px-2 py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-lane"><span className="block h-full rounded-full bg-ok" style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%` }} /></span>
                      <span className="mono text-[11.5px]">{r.done}/{r.total}</span>
                    </span>
                  </td>
                  <td className={`border-b border-line/70 px-2 py-2 font-mono text-[12px] ${r.late ? "text-bad" : "text-ink-3"}`}>{r.late || "–"}</td>
                  <td className="border-b border-line/70 px-2 py-2 font-mono text-[12px]">{r.quizPct === undefined ? <span className="text-ink-3">–</span> : `${Math.round(r.quizPct * 100)}%`}</td>
                  {skills.map((s) => {
                    const t = r.teacher[s.id];
                    const me = r.self[s.id];
                    const gap = t && me ? me - t : 0;
                    return (
                      <td key={s.id} className="border-b border-line/70 px-2 py-2">
                        <span className="flex items-center gap-1.5" title={`Teacher: ${cell(t) || "not rated"} · Self: ${cell(me) || "not rated"}`}>
                          <span className={`flex h-6 w-6 items-center justify-center rounded-md font-mono text-[12px] ${t ? "bg-ink text-white" : "bg-lane text-ink-3"}`}>{t || "–"}</span>
                          <span className={`flex h-6 w-6 items-center justify-center rounded-md border font-mono text-[12px] ${me ? "border-line-strong" : "border-line text-ink-3"}`}>{me || "–"}</span>
                          {Math.abs(gap) >= 2 && <span className="text-[11px] text-warn" title={gap > 0 ? "Rates themselves well above you" : "Rates themselves well below you"}>{gap > 0 ? "↑" : "↓"}</span>}
                        </span>
                      </td>
                    );
                  })}
                  <td className={`border-b border-line/70 px-2 py-2 font-mono text-[12px] ${r.waiting ? "text-[#287670]" : "text-ink-3"}`}>{r.waiting || "–"}</td>
                </tr>
                {open === r.st.id && (
                  <tr>
                    <td colSpan={5 + skills.length} className="border-b border-line bg-[#fafaf9] px-6 py-4">
                      <div className="grid items-start gap-6 lg:grid-cols-[22rem_1fr]">
                      <SkillRadar skills={skills} size={240} series={[
                        { label: "Self", values: r.self, style: "fill", color: "#1b1b1a" },
                        { label: "You", values: r.teacher, style: "dash", color: "#ae502f" },
                      ]} />
                      <div>
                      {r.reviews.length === 0 ? (
                        <p className="text-[13px] text-ink-3">No reviewed work yet. Review work from the Class tab.</p>
                      ) : (
                        <ul className="rise space-y-2.5">
                          {r.reviews.map(({ m, week, r: rv }) => (
                            <li key={m.id} className="flex gap-3 text-[13px]">
                              <span className={`mt-0.5 flex-none ${rv.verdict === "revise" ? "text-warn" : "text-ok"}`}><Icon name={rv.verdict === "revise" ? "reset" : "check"} size={14} /></span>
                              <span className="min-w-0 flex-1">
                                <span className="font-medium">{m.title}</span> <span className="text-ink-3">· {week} · {new Date(rv.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                {rv.text && <span className="block text-ink-2">{rv.text}</span>}
                                {rv.levels && <span className="mt-1 flex flex-wrap gap-1">{Object.entries(rv.levels).map(([k, v]) => <span key={k} className="chip h-5 bg-white text-[11px]">{skills.find((s) => s.id === k)?.name} · {cell(v)}</span>)}</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-ink-3">Levels: {levels.map((l) => `${l.n} ${l.name}`).join(" · ")}. An arrow marks a self-rating two or more levels away from yours.</p>
    </div>
  );
}
