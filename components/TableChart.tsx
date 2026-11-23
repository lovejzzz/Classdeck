"use client";

import { chartData, type Block } from "@/lib/markdown";

const COLORS = ["#4b56a8", "#d18b2f", "#2f8f6b", "#b5542b", "#8a3fa0", "#0f7c8c"];

/** A chart of a table on a card: bars, a line, or a pie, drawn from its first column (names) and its columns of numbers. */
export function TableChart({ table, kind }: { table: Extract<Block, { k: "table" }>; kind: "bar" | "line" | "pie" }) {
  const { labels, series } = chartData(table);
  if (!series.length || !labels.length) return <p className="rounded-xl border border-dashed border-line px-4 py-3 text-[13px] text-ink-3">A chart appears here once the table has numbers in it.</p>;
  const W = 560, H = 240, padL = 44, padB = 34, padT = 14, padR = 12;
  const legend = series.length > 1 || kind === "pie";
  if (kind === "pie") {
    const s = series[0];
    const vals = s.values.map((v) => Math.max(0, v ?? 0));
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    const r = 90, cx = 120, cy = 110;
    // Each slice's start and end angle, from the top, clockwise.
    const angles = vals.map((v, i) => { const before = vals.slice(0, i).reduce((x, y) => x + y, 0); return [-Math.PI / 2 + (before / total) * Math.PI * 2, -Math.PI / 2 + ((before + v) / total) * Math.PI * 2]; });
    return (
      <figure className="rounded-xl border border-line bg-white p-3">
        <svg viewBox="0 0 520 220" className="w-full" role="img" aria-label={`Pie chart of ${s.name}`}>
          {vals.map((v, i) => {
            const [a0, a1] = angles[i];
            const large = a1 - a0 > Math.PI ? 1 : 0;
            const d = vals.filter((x) => x > 0).length === 1 && v > 0
              ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
              : `M ${cx} ${cy} L ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`;
            return v > 0 ? <path key={i} d={d} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth="1.5"><title>{`${labels[i]}: ${v}`}</title></path> : null;
          })}
          {labels.map((l, i) => (
            <g key={i} transform={`translate(250 ${24 + i * 22})`}>
              <rect width="12" height="12" rx="3" fill={COLORS[i % COLORS.length]} />
              <text x="18" y="10.5" fontSize="12.5" fill="#353532">{l} · {vals[i]} ({Math.round((vals[i] / total) * 100)}%)</text>
            </g>
          ))}
        </svg>
        <figcaption className="mt-1 text-center text-[11.5px] text-ink-3">{s.name}</figcaption>
      </figure>
    );
  }
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const max = Math.max(0, ...all), min = Math.min(0, ...all);
  const span = max - min || 1;
  const step = (() => { const raw = span / 4; const p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 5, 10].map((k) => k * p).find((k) => k >= raw) ?? raw; })();
  const top = Math.ceil(max / step) * step, bottom = Math.floor(min / step) * step;
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - bottom) / (top - bottom || 1));
  const band = (W - padL - padR) / labels.length;
  const ticks: number[] = [];
  for (let t = bottom; t <= top + 1e-9; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return (
    <figure className="rounded-xl border border-line bg-white p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${kind === "line" ? "Line" : "Bar"} chart of ${series.map((s) => s.name).join(", ")}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#bdbab3" : "#ecebe7"} />
            <text x={padL - 6} y={y(t) + 4} fontSize="11" textAnchor="end" fill="#8a8882">{t}</text>
          </g>
        ))}
        {labels.map((l, i) => <text key={i} x={padL + band * (i + 0.5)} y={H - padB + 18} fontSize="11.5" textAnchor="middle" fill="#55534e">{l.length > 12 ? `${l.slice(0, 11)}…` : l}</text>)}
        {kind === "bar" ? series.map((s, si) => s.values.map((v, i) => {
          if (v === null) return null;
          const w = Math.min(36, (band * 0.7) / series.length);
          const x = padL + band * i + (band - w * series.length) / 2 + w * si;
          return <rect key={`${si}-${i}`} x={x} y={Math.min(y(v), y(0))} width={w - 2} height={Math.max(1, Math.abs(y(v) - y(0)))} rx="3" fill={COLORS[si % COLORS.length]}><title>{`${l(labels, i)} · ${s.name}: ${v}`}</title></rect>;
        })) : series.map((s, si) => {
          const pts = s.values.map((v, i) => (v === null ? null : [padL + band * (i + 0.5), y(v)] as const)).filter((p): p is readonly [number, number] => !!p);
          return (
            <g key={si}>
              <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={COLORS[si % COLORS.length]} strokeWidth="2.5" strokeLinejoin="round" />
              {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill="#fff" stroke={COLORS[si % COLORS.length]} strokeWidth="2" />)}
            </g>
          );
        })}
      </svg>
      {legend && (
        <figcaption className="mt-1 flex flex-wrap justify-center gap-3 text-[11.5px] text-ink-2">
          {series.map((s, i) => <span key={i} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />{s.name}</span>)}
        </figcaption>
      )}
    </figure>
  );
}
const l = (labels: string[], i: number) => labels[i] ?? "";
