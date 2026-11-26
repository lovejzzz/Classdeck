"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { WEEK_TEMPLATES, type WeekTemplate } from "@/lib/templates";
import { wiresOf, SCORE } from "@/lib/branching";
import { bandTone, MAP_ADD, pathColor, suitOfCard } from "@/lib/ui";
import type { Module, Week } from "@/lib/types";

/**
 * The "+ Week" button at the foot of the course map: it asks one thing, a blank week or one from a template. A
 * template opens a window of ready-made weeks, each drawn as its card tree.
 */
export function AddWeek({ n, onBlank, onTemplate }: { n: number; onBlank: () => void; onTemplate: (week: Week, name: string) => void }) {
  const [menu, setMenu] = useState(false);
  const [picking, setPicking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const off = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("pointerdown", off);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", off); window.removeEventListener("keydown", esc); };
  }, [menu]);
  const choice = (icon: string, title: string, hint: string, go: () => void) => (
    <button role="menuitem" onClick={() => { setMenu(false); go(); }} className="press flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-lane">
      <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg bg-lane text-ink-2"><Icon name={icon} size={15} /></span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-ink">{title}</span>
        <span className="block text-[12px] text-ink-3">{hint}</span>
      </span>
    </button>
  );
  return (
    <div ref={ref} className="relative" onPointerDown={(e) => e.stopPropagation()}>
      <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu" className={`${MAP_ADD} ${menu ? "!border-solid !bg-white !text-ink" : ""}`}>
        <Icon name="plus" size={13} /> Week {n}
      </button>
      {menu && (
        <div role="menu" className="pop absolute bottom-full left-0 z-30 mb-2 w-72 rounded-2xl border border-line bg-white p-1.5 shadow-[0_16px_40px_-16px_rgba(20,20,18,0.35)]">
          {choice("plus", "Blank week", "One empty lesson to fill yourself", onBlank)}
          {choice("layers", "From a template…", "A ready-made week of cards to edit", () => setPicking(true))}
        </div>
      )}
      {picking && <TemplatePicker n={n} onClose={() => setPicking(false)} onPick={(w, name) => { setPicking(false); onTemplate(w, name); }} />}
    </div>
  );
}

/** The window of week templates: pick one (each drawn as its card tree), name the week's theme, add it. */
function TemplatePicker({ n, onClose, onPick }: { n: number; onClose: () => void; onPick: (week: Week, name: string) => void }) {
  const [sel, setSel] = useState(WEEK_TEMPLATES[0].id);
  const [theme, setTheme] = useState("");
  const tpl = WEEK_TEMPLATES.find((t) => t.id === sel)!;
  // Built once per template for the pictures (with a placeholder theme); the real one is built on Add.
  const previews = useMemo(() => new Map(WEEK_TEMPLATES.map((t) => [t.id, t.build("Lesson 1", n)])), [n]);
  const add = (t: WeekTemplate) => onPick(t.build(theme.trim() || "Lesson 1", n), t.name);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const rows = outline(previews.get(sel)!.lessons[0].modules);
  return createPortal(
    <div className="fade fixed inset-0 z-[70] flex items-center justify-center bg-ink/30 p-3 backdrop-blur-[2px] sm:p-6" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={`New Week ${n} from a template`} className="pop flex max-h-[92vh] w-full max-w-[980px] flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_30px_80px_-30px_rgba(20,20,18,0.5)]">
        <div className="flex items-start gap-3 border-b border-line px-6 pb-4 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] font-semibold text-ink">Start Week {n} from a template</h2>
            <p className="mt-0.5 text-[13px] text-ink-3">Each one is a small card tree. Every card is yours to edit after.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn btn-quiet press h-8 w-8 justify-center px-0"><Icon name="x" size={15} /></button>
        </div>
        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[1fr_300px]">
          <div className="grid content-start gap-3 p-5 sm:grid-cols-2">
            {WEEK_TEMPLATES.map((t, i) => (
              <button key={t.id} onClick={() => setSel(t.id)} onDoubleClick={() => add(t)} aria-pressed={sel === t.id}
                className={`hero-card press group flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition-[border-color,box-shadow] duration-200 ${sel === t.id ? "border-[#4b56a8] shadow-[0_0_0_3px_rgba(75,86,168,0.18)]" : "border-line hover:border-line-strong"}`}
                style={{ animationDelay: `${i * 40}ms` }}>
                <div className="tree-canvas grid h-[132px] place-items-center px-3">
                  <TreePicture modules={previews.get(t.id)!.lessons[0].modules} />
                </div>
                <div className="border-t border-line px-4 pb-3.5 pt-3">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{t.name}</span>
                    {sel === t.id && <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-[#4b56a8] text-white"><Icon name="check" size={11} /></span>}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-3">{t.fits}</div>
                </div>
              </button>
            ))}
          </div>
          <aside className="flex flex-col gap-3 border-t border-line bg-[#fafaf8] p-5 md:border-l md:border-t-0">
            <div className="text-[15px] font-semibold text-ink">{tpl.name}</div>
            <p className="text-[12.5px] leading-relaxed text-ink-2">{tpl.blurb}</p>
            <ol className="flex flex-col gap-1">
              {rows.map(({ m, depth, why }) => (
                <li key={m.id} className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-2" style={{ paddingLeft: depth * 16 }}>
                  {depth > 0 && <span className="flex-none text-ink-3">↳</span>}
                  <span className={`h-2.5 w-2.5 flex-none rounded-[3px] ${m.type === "group" ? "shadow-[2px_-2px_0_-0.5px_#fff,2px_-2px_0_0.5px_#c9cdee]" : ""}`} style={{ background: suitOfCard(m).tint }} />
                  <span className="min-w-0 truncate">{m.title}</span>
                  {why && <span className="flex-none text-[11px] text-ink-3">{why}</span>}
                </li>
              ))}
            </ol>
            <label className="mt-auto block pt-2">
              <span className="mb-1 block text-[12.5px] font-medium text-ink-2">What is Week {n} about? <span className="font-normal text-ink-3">(optional)</span></span>
              <input autoFocus value={theme} onChange={(e) => setTheme(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add(tpl)} placeholder="e.g. Fractions" className="field h-9 w-full py-0" />
            </label>
            <button onClick={() => add(tpl)} className="btn btn-dark press h-10 justify-center">Add Week {n}</button>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The template's cards in order, as a short outline: a group's questions under it, and the cards an answer or a score
 *  deals under the card that deals them, with why ("score under 60%", "answer: I agree"). */
function outline(modules: Module[]): { m: Module; depth: number; why?: string }[] {
  const wires = wiresOf(modules);
  const members = new Set(modules.flatMap((m) => (m.type === "group" ? m.members ?? [] : [])));
  const dealt = new Set(wires.map((w) => w.to));
  const byId = new Map(modules.map((m) => [m.id, m]));
  const out: { m: Module; depth: number; why?: string }[] = [];
  for (const m of modules) {
    if (members.has(m.id) || dealt.has(m.id)) continue;
    out.push({ m, depth: 0, why: m.type === "group" ? `${m.members?.length ?? 0} questions${(m.attempts ?? 1) > 1 ? ` · ${m.attempts} tries` : ""}` : undefined });
    const seen = new Set<string>();
    for (const w of wires.filter((x) => x.from === m.id)) {
      const k = byId.get(w.to);
      if (!k || seen.has(k.id)) continue;
      seen.add(k.id);
      const q = m.questions?.find((x) => x.id === w.q);
      const why = w.score ? (w.score.min > 0 ? `${w.score.min}%+` : `under ${m.bands?.[(m.bands.findIndex((b) => b.next === w.to)) + 1]?.min ?? 100}%`) : q ? `“${q.options[w.option]}”` : undefined;
      out.push({ m: k, depth: 1, why });
    }
  }
  return out;
}

/**
 * A lesson's card tree in miniature: the main path as a row of little cards (a card group as a small stack), and the
 * cards each one deals hanging below it on wires in their answer's (or score range's) colour.
 */
function TreePicture({ modules }: { modules: Module[] }) {
  const wires = wiresOf(modules);
  const members = new Set(modules.flatMap((m) => (m.type === "group" ? m.members ?? [] : [])));
  const dealt = new Set(wires.map((w) => w.to));
  const main = modules.filter((m) => !members.has(m.id) && !dealt.has(m.id));
  const byId = new Map(modules.map((m) => [m.id, m]));
  const CW = 20, CH = 28, GAP = 9, KID = 24;
  // Each main card's column is as wide as the cards it deals.
  const cols = main.map((m) => {
    const out = wires.filter((w) => w.from === m.id);
    const seen = new Set<string>();
    const kids = out.filter((w) => !seen.has(w.to) && seen.add(w.to));
    return { m, kids, w: Math.max(CW, kids.length * KID - (KID - CW)) };
  });
  const width = cols.reduce((s, c) => s + c.w, 0) + GAP * (cols.length - 1);
  const anyKids = cols.some((c) => c.kids.length);
  const height = anyKids ? CH * 2 + 30 : CH;
  const lefts = cols.map((_, i) => cols.slice(0, i).reduce((s, c) => s + c.w + GAP, 0));
  const placed = cols.map((c, i) => ({ ...c, x: lefts[i] + (c.w - CW) / 2, left: lefts[i] }));
  const mini = (m: Module, cx: number, cy: number, key: string) => {
    const tint = suitOfCard(m).tint;
    return (
      <g key={key}>
        {m.type === "group" && <>
          <rect x={cx + 4} y={cy - 4} width={CW} height={CH} rx={3.5} fill="#fff" stroke="#d9dcf1" />
          <rect x={cx + 2} y={cy - 2} width={CW} height={CH} rx={3.5} fill="#fff" stroke="#c9cdee" />
        </>}
        <rect x={cx} y={cy} width={CW} height={CH} rx={3.5} fill="#fff" stroke="rgba(20,20,18,0.16)" />
        <path d={`M${cx + 0.5} ${cy + 6} V${cy + 3.5} a3 3 0 0 1 3 -3 H${cx + CW - 3.5} a3 3 0 0 1 3 3 V${cy + 6} Z`} fill={tint} />
        <rect x={cx + 4} y={cy + 11} width={CW - 8} height={2} rx={1} fill="rgba(20,20,18,0.12)" />
        <rect x={cx + 4} y={cy + 16} width={CW - 11} height={2} rx={1} fill="rgba(20,20,18,0.12)" />
      </g>
    );
  };
  return (
    <svg viewBox={`-6 -8 ${width + 12} ${height + 14}`} className="h-full max-h-[112px] w-full" aria-hidden="true">
      {/* The main path: a thin line through the row. */}
      {placed.length > 1 && <line x1={placed[0].x + CW / 2} y1={CH / 2} x2={placed[placed.length - 1].x + CW / 2} y2={CH / 2} stroke="rgba(20,20,18,0.18)" strokeWidth={1.2} />}
      {placed.map((c) => c.kids.map((w, i) => {
        const kx = c.left + (c.w - (c.kids.length * KID - (KID - CW))) / 2 + i * KID;
        const color = w.q === SCORE ? bandTone(byId.get(c.m.id)?.bands?.findIndex((b) => b.next === w.to) ?? 0, byId.get(c.m.id)?.bands?.length ?? 1) : pathColor(w.option);
        const y1 = CH, y2 = CH + 30, mx = c.x + CW / 2, tx = kx + CW / 2;
        return <path key={`${c.m.id}-${w.to}`} d={`M${mx} ${y1} C${mx} ${y1 + 16}, ${tx} ${y2 - 16}, ${tx} ${y2}`} fill="none" stroke={color} strokeWidth={1.6} />;
      }))}
      {placed.map((c) => mini(c.m, c.x, 0, c.m.id))}
      {placed.map((c) => c.kids.map((w, i) => {
        const kx = c.left + (c.w - (c.kids.length * KID - (KID - CW))) / 2 + i * KID;
        const k = byId.get(w.to);
        return k ? mini(k, kx, CH + 30, `k-${w.to}`) : null;
      }))}
    </svg>
  );
}
