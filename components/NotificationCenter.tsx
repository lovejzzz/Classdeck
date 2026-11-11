"use client";

import { useEffect, useRef, useState } from "react";
import { ago } from "@/lib/time";
import { AutoHeight } from "./AutoHeight";
import { Avatar, Icon } from "./Icon";
import { Stack } from "./Stack";

export interface Note {
  id: string;
  at: number;
  /** 分组用，比如学生 id */
  group: string;
  groupLabel: string;
  /** 卡片第一行的小字，比如模块名 */
  source: string;
  icon: string;
  tint?: string;
  title: string;
  text: string;
}

export interface Mode {
  id: string;
  label: string;
  /** 不传就是全部叠成一叠；传了就按它分组 */
  groupBy?: (n: Note) => { key: string; label: string; avatar?: boolean };
}

function NoteCard({ n, onPick, front = true, interactive = true, grouped = false }: { n: Note; onPick?: (n: Note) => void; front?: boolean; interactive?: boolean; grouped?: boolean }) {
  // 叠着的时候，点卡片是展开整叠；展开之后点单条才跳过去
  return (
    <button
      onClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        onPick?.(n);
      }}
      tabIndex={front && interactive ? 0 : -1}
      className={`card press flex h-full w-full items-start gap-3 px-3.5 py-2.5 text-left ${front ? "card-hover" : "!bg-[#f7f7f5] !shadow-none"}`}
    >
      <span className={`flex w-full items-start gap-3 transition-opacity duration-300 ${front ? "opacity-100" : "opacity-0"}`}>
      <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md bg-[#f3f3f1]" style={{ color: n.tint }}>
        <Icon name={n.icon} size={13} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[11.5px] text-ink-3">{grouped ? "" : n.source}</span>
          <span className="flex-1" />
          <span className="mono flex-none text-[11px]">{ago(n.at)}</span>
          <span className="h-1.5 w-1.5 flex-none rounded-full bg-[#4f7cf2]" />
        </span>
        <span className={`block truncate text-[13.5px] font-medium ${grouped ? "-mt-3.5" : "mt-0.5"}`}>{grouped ? n.source : n.title}</span>
        <span className="block truncate text-[12.5px] text-ink-2">{n.text}</span>
      </span>
      </span>
    </button>
  );
}

/**
 * 通知中心：铃铛按钮加一个弹出面板。
 * 面板里有两种视图，叠放和分组；清空时卡片先滑走，再显示“都看过了”。
 */
export function NotificationCenter({
  notes, modes, onClear, onPick, emptyText = "You’re all caught up", title = "Activity", align = "right",
}: {
  notes: Note[];
  modes: Mode[];
  onClear: () => void;
  onPick?: (n: Note) => void;
  emptyText?: string;
  title?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(modes[0].id);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [leaving, setLeaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const count = notes.length;
  const current = modes.find((m) => m.id === mode) ?? modes[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function clear() {
    setLeaving(true);
    setTimeout(() => {
      onClear();
      setLeaving(false);
      setExpanded({});
    }, 320);
  }

  const sorted = [...notes].sort((a, b) => b.at - a.at);
  const groups: { key: string; label: string; avatar?: boolean; items: Note[] }[] = [];
  if (current.groupBy) {
    for (const n of sorted) {
      const g = current.groupBy(n);
      let entry = groups.find((x) => x.key === g.key);
      if (!entry) groups.push((entry = { ...g, items: [] }));
      entry.items.push(n);
    }
  }
  const toggle = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }));
  const pick = (n: Note) => {
    onPick?.(n);
    setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`${title}, ${count} unread`}
        aria-expanded={open}
        className={`btn press relative h-8 w-8 justify-center px-0 ${open ? "bg-black/[0.06] text-ink" : "btn-quiet"}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
          <path d="M3.3 15.3A1 1 0 0 0 4 17h16a1 1 0 0 0 .7-1.7C19.4 14 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.4 6-2.7 7.3" />
        </svg>
        {count > 0 && (
          <span key={count} className="pop absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#4f7cf2] px-1 font-mono text-[10px] font-medium text-white ring-2 ring-canvas">
            {count > 99 ? "99" : count}
          </span>
        )}
      </button>

      <div
        className={`absolute top-10 z-30 w-[23rem] max-w-[calc(100vw-2rem)] origin-top-right rounded-2xl border border-line bg-white p-3 shadow-[0_20px_50px_-18px_rgba(20,20,18,0.3)] transition-[opacity,transform] duration-300 ease-[var(--ease-out)] ${align === "right" ? "right-0" : "left-0 origin-top-left"} ${open ? "scale-100 opacity-100" : "pointer-events-none scale-95 -translate-y-1 opacity-0"}`}
        role="dialog"
        aria-label={title}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="flex items-center gap-2 px-1 pb-3">
          <span className="flex-1 text-[14px] font-medium">{title}</span>
          {modes.length > 1 && (
            <div className="relative flex rounded-full bg-lane p-0.5" role="tablist">
              <span
                className="absolute inset-y-0.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.1)] transition-transform duration-300 ease-[var(--ease-out)]"
                style={{ width: `calc((100% - 4px) / ${modes.length})`, transform: `translateX(${modes.findIndex((m) => m.id === mode) * 100}%)` }}
              />
              {modes.map((m) => (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={mode === m.id}
                  onClick={() => setMode(m.id)}
                  className={`relative w-16 rounded-full py-1 text-[12px] font-medium transition-colors duration-300 ${mode === m.id ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <AutoHeight>
          <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden px-1 pb-1">
            {count === 0 ? (
              <p className="fade py-10 text-center text-[13px] text-ink-3">{emptyText}</p>
            ) : (
              <div
                key={mode}
                className={`fade transition-[opacity,transform] duration-300 ease-[var(--ease-out)] ${leaving ? "translate-x-6 opacity-0" : ""}`}
              >
                {!current.groupBy && (
                  <Stack
                    items={sorted}
                    expanded={!!expanded.__all}
                    onExpand={() => toggle("__all")}
                    render={(n, _i, front, interactive) => <NoteCard n={n} onPick={pick} front={front} interactive={interactive} />}
                  />
                )}
                {current.groupBy && (
                  <div className="space-y-4">
                    {groups.map((g, gi) => (
                      <section key={g.key} className="rise" style={{ "--i": gi } as React.CSSProperties}>
                        <button onClick={() => toggle(g.key)} className="mb-2 flex w-full items-center gap-2 text-left text-[12.5px] text-ink-2">
                          {g.avatar && <Avatar name={g.label} size={16} />}
                          <span>{g.label}</span>
                          {g.items.length > 1 && <span className="mono">{g.items.length}</span>}
                          <span className="flex-1" />
                          {g.items.length > 1 && (
                            <Icon name="chevron" size={13} className={`text-ink-3 transition-transform duration-300 ${expanded[g.key] ? "rotate-180" : ""}`} />
                          )}
                        </button>
                        <Stack
                          items={g.items}
                          label={g.label}
                          expanded={!!expanded[g.key]}
                          onExpand={() => toggle(g.key)}
                          render={(n, _i, front, interactive) => <NoteCard n={n} onPick={pick} front={front} interactive={interactive} grouped />}
                        />
                      </section>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </AutoHeight>

        <div className="mt-2 flex items-center px-1 pt-1">
          <span className="flex-1 text-[12.5px] text-ink-3">
            {count > 0 ? <><span className="font-medium text-ink">{count}</span> unread</> : "Nothing new"}
          </span>
          {!current.groupBy && count > 1 && expanded.__all && (
            <button onClick={() => toggle("__all")} className="btn btn-quiet press mr-1 h-7 px-2.5 text-[12px]">Collapse</button>
          )}
          <button onClick={clear} disabled={count === 0 || leaving} className="btn press h-7 rounded-full bg-lane px-3 text-[12px] text-ink-2 hover:bg-[#e8e8e5] hover:text-ink">
            Clear all
          </button>
        </div>
      </div>
    </div>
  );
}
