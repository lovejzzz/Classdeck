import type { Skill } from "@/lib/types";

export interface RadarSeries {
  label: string;
  values: Record<string, number | undefined>;
  /** "outline" for a baseline, "fill" for the current picture, "dash" for the teacher's view. */
  style: "outline" | "fill" | "dash";
  color: string;
}

/**
 * A radar chart of skill levels (1–4). Each series is one moment or one viewpoint:
 * where you started, where you are now, where your teacher places you.
 */
export function SkillRadar({ skills, series, size = 260, max = 4 }: { skills: Skill[]; series: RadarSeries[]; size?: number; max?: number }) {
  const n = skills.length;
  if (n < 3) return null;
  // Extra room left and right for the skill names.
  const padX = 56;
  const w = size + padX * 2;
  const c = size / 2;
  const cx = c + padX;
  const r = c - 30;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r * (v / max), c + Math.sin(a) * r * (v / max)] as const;
  };
  const poly = (vals: (number | undefined)[]) => vals.map((v, i) => pt(i, v ?? 0).join(",")).join(" ");
  const short = (name: string) => name.split(/ & | and /)[0];

  return (
    <figure className="flex flex-col items-center">
      <svg width={w} height={size} viewBox={`0 0 ${w} ${size}`} className="max-w-full" role="img" aria-label={`Skill levels: ${series.map((s) => `${s.label} ${skills.map((k) => `${k.name} ${s.values[k.id] ?? "not rated"}`).join(", ")}`).join("; ")}`}>
        {[1, 2, 3, 4].map((lv) => (
          <polygon key={lv} points={poly(skills.map(() => lv))} fill="none" stroke="var(--color-line)" strokeWidth={lv === max ? 1.2 : 1} />
        ))}
        {skills.map((_, i) => {
          const [x, y] = pt(i, max);
          return <line key={i} x1={cx} y1={c} x2={x} y2={y} stroke="var(--color-line)" />;
        })}
        {series.map((s, k) => {
          const vals = skills.map((sk) => s.values[sk.id]);
          const rated = vals.filter(Boolean).length;
          if (!rated) return null;
          return (
            <g key={k} className="pop" style={{ "--i": k } as React.CSSProperties}>
              {rated >= 3 && <polygon points={poly(vals)} fill={s.style === "fill" ? s.color : "none"} fillOpacity={0.14}
                stroke={s.color} strokeWidth={s.style === "fill" ? 2 : 1.6} strokeDasharray={s.style === "dash" ? "4 3" : undefined} strokeLinejoin="round" />}
              {vals.map((v, i) => {
                if (!v) return null;
                const [x, y] = pt(i, v);
                return <circle key={i} cx={x} cy={y} r={s.style === "fill" ? 3 : 2.4} fill={s.style === "outline" ? "white" : s.color} stroke={s.color} strokeWidth={1.4} />;
              })}
            </g>
          );
        })}
        {skills.map((sk, i) => {
          const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
          const x = cx + Math.cos(a) * (r + 12);
          const y = c + Math.sin(a) * (r + 12);
          return (
            <text key={sk.id} x={x} y={y} textAnchor={Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end"} dominantBaseline="middle" fontSize="11" fill="var(--color-ink-2)">
              {short(sk.name)}
            </text>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap justify-center gap-3 text-[11.5px] text-ink-3">
        {series.filter((s) => Object.values(s.values).some(Boolean)).map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true"><line x1="1" y1="4" x2="17" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.style === "dash" ? "4 3" : undefined} /></svg>
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** The teacher's latest rubric level per skill, from reviews on a student's work. */
export function teacherLevels(progress: Record<string, { review?: { at: number; levels?: Record<string, number> } }>): Record<string, number> {
  const out: Record<string, number> = {};
  const reviews = Object.values(progress).map((p) => p.review).filter((r): r is NonNullable<typeof r> => !!r?.levels).sort((a, b) => a.at - b.at);
  for (const r of reviews) Object.assign(out, r.levels);
  return out;
}
