"use client";

import { createContext, Fragment, useContext, useMemo } from "react";
import { blocks, computed, inline, type Block } from "@/lib/markdown";
import { TableChart } from "./TableChart";
import { MathText } from "./MathText";

/** Passages to mark (the words a comment is about), found within a run of text. */
const Marks = createContext<string[]>([]);

function Marked({ text, marks }: { text: string; marks: string[] }) {
  const found = marks.map((m) => ({ m, at: m ? text.indexOf(m) : -1 })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at);
  if (!found.length || text.includes("$")) return <MathText text={text} />;
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const f of found) {
    if (f.at < at) continue;
    if (f.at > at) out.push(text.slice(at, f.at));
    out.push(<mark key={f.at} className="rounded-sm bg-[#fff1b8] px-0.5 text-inherit">{f.m}</mark>);
    at = f.at + f.m.length;
  }
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

/** One line, with bold, italic, code, links and math. */
function Line({ text }: { text: string }) {
  const marks = useContext(Marks);
  return (
    <>
      {inline(text).map((x, i) => {
        let el: React.ReactNode = x.code ? <code className="rounded bg-lane px-1 py-px font-mono text-[0.9em]">{x.t}</code> : marks.length ? <Marked text={x.t} marks={marks} /> : <MathText text={x.t} />;
        if (x.b) el = <strong className="font-semibold text-ink">{el}</strong>;
        if (x.i) el = <em>{el}</em>;
        if (x.s) el = <s>{el}</s>;
        if (x.href) el = <a href={x.href} target="_blank" rel="noopener noreferrer" className="text-[#4b56a8] underline underline-offset-2 hover:text-ink">{el}</a>;
        return <Fragment key={i}>{el}</Fragment>;
      })}
    </>
  );
}

/** Lines kept as written (a single line break stays a line break, as in a plain-text card). */
const Lines = ({ lines }: { lines: string[] }) => <>{lines.map((l, i) => <Fragment key={i}>{i > 0 && <br />}<Line text={l} /></Fragment>)}</>;

function BlockView({ b }: { b: Block }) {
  switch (b.k) {
    case "p": return <p><Lines lines={b.lines} /></p>;
    case "h": {
      const cls = b.level === 1 ? "text-[1.35em] font-semibold tracking-tight" : b.level === 2 ? "text-[1.18em] font-semibold tracking-tight" : "text-[1.05em] font-semibold";
      return b.level === 1 ? <h3 className={`${cls} text-ink`}><Line text={b.text} /></h3> : b.level === 2 ? <h4 className={`${cls} text-ink`}><Line text={b.text} /></h4> : <h5 className={`${cls} text-ink`}><Line text={b.text} /></h5>;
    }
    case "ul": case "ol": {
      // Items of a list inside the list (indented) sit further in, with a hollow bullet.
      const List = b.k === "ol" ? "ol" : "ul";
      return (
        <List start={b.start} className={`${b.k === "ol" ? "list-decimal" : "list-disc"} space-y-1 pl-6 marker:text-ink-3`}>
          {(() => {
            // Only the list's own items are numbered; items of a list inside it don't count.
            let n = (b.start ?? 1) - 1;
            return b.items.map((x, i) => x.d
              ? <li key={i} className="list-[circle]" style={{ marginLeft: `${x.d * 1.25}rem` }}><Lines lines={x.t.split("\n")} /></li>
              : <li key={i} value={b.k === "ol" ? ++n : undefined}><Lines lines={x.t.split("\n")} /></li>);
          })()}
        </List>
      );
    }
    case "quote": return <div className="rounded-xl border-l-4 border-[#4b56a8]/50 bg-[#eef0fb]/70 px-4 py-2.5"><Lines lines={b.lines} /></div>;
    case "hr": return <hr className="border-line" />;
    case "chart": return <TableChart table={b.table} kind={b.kind} />;
    case "table": {
      // Cells that add up (=SUM, =AVERAGE…) show their result, in bold.
      const { rows, formula } = computed(b);
      return (
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse text-[0.92em]">
          <thead className="bg-lane/70">
            <tr>{b.head.map((c, i) => <th key={i} className="border-b border-line px-3 py-2 text-left font-semibold text-ink" style={{ textAlign: b.align[i] ?? undefined }}><Line text={c} /></th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className={formula[ri].some(Boolean) ? "bg-lane/60" : "even:bg-lane/30"}>
                {r.map((c, i) => <td key={i} className={`border-t border-line/70 px-3 py-1.5 align-top ${formula[ri][i] ? "font-semibold text-ink" : ""}`} style={{ textAlign: b.align[i] ?? undefined }} title={formula[ri][i] ? b.rows[ri][i].trim().toUpperCase().replace("=", "") + " of the column above" : undefined}><Line text={c} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      );
    }
  }
}

/**
 * A card's text, formatted: headings, lists, callouts, dividers, links, tables and math. Plain text shows as it was
 * written. Nothing in it is ever treated as HTML.
 */
export function RichText({ text, className, marks = [] }: { text: string; className?: string; marks?: string[] }) {
  const bs = useMemo(() => blocks(text ?? ""), [text]);
  return <Marks.Provider value={marks}><div className={`space-y-3 ${className ?? ""}`}>{bs.map((b, i) => <BlockView key={i} b={b} />)}</div></Marks.Provider>;
}
