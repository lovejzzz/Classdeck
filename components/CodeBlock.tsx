"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { splitCode } from "@/lib/code";
import { runPython, type RunEvent } from "@/lib/pyrun";

export type RunResult = { output: string; error?: string };

/**
 * A Run button for some Python, and what it printed. It asks for typed answers only when the code uses input().
 * `onRan` hears each finished run (a student's own card saves it, so AI feedback knows what the code did).
 */
export function CodeRun({ code, onRan, label = "Run", compact = false }: { code: string; onRan?: (r: RunResult) => void; label?: string; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "running" | "done" | "error" | "timeout" | "stopped">("idle");
  const [out, setOut] = useState("");
  const [err, setErr] = useState("");
  const [secs, setSecs] = useState(0);
  const [answers, setAnswers] = useState("");
  const stop = useRef<(() => void) | null>(null);
  const asks = /\binput\s*\(/.test(code);
  useEffect(() => () => stop.current?.(), []);
  function run() {
    let printed = "";
    setOut(""); setErr("");
    stop.current = runPython(code, answers, (e: RunEvent) => {
      if (e.type === "loading") setState("loading");
      else if (e.type === "start") setState("running");
      else if (e.type === "out") { printed += `${e.text}\n`; setOut(printed); }
      else if (e.type === "done") { setState("done"); setSecs(e.secs); onRan?.({ output: printed }); }
      else if (e.type === "error") {
        const msg = /EOFError/.test(e.text) ? "It asked for more input than was typed. Add one answer per line above." : e.text;
        setErr(msg); setState("error"); onRan?.({ output: printed, error: msg });
      } else setState(e.type);
    });
  }
  const busy = state === "loading" || state === "running";
  const shown = state !== "idle";
  return (
    <div data-code onClick={(e) => e.stopPropagation()}>
      {asks && (
        <textarea value={answers} onChange={(e) => setAnswers(e.target.value)} rows={2} aria-label="Answers for input(), one per line"
          placeholder="It asks for input: type the answers here, one per line" className="field mt-2 w-full resize-y py-1.5 font-mono text-[12.5px]" />
      )}
      <div className={`flex items-center gap-2 ${compact ? "mt-1.5" : "mt-2"}`}>
        {busy ? (
          <button onClick={() => stop.current?.()} className="btn btn-quiet press h-7 gap-1.5 px-2.5 text-[12px]"><Icon name="stop" size={11} />Stop</button>
        ) : (
          <button onClick={run} className="btn btn-quiet press h-7 gap-1.5 px-2.5 text-[12px]"><Icon name="play" size={11} />{shown ? "Run again" : label}</button>
        )}
        <span className="text-[11.5px] text-ink-3" role="status">
          {state === "loading" ? "Getting Python ready (the first run takes a few seconds)…"
            : state === "running" ? "Running…"
            : state === "done" ? `Ran in ${secs < 1 ? "under a second" : `${secs.toFixed(1)}s`}`
            : state === "timeout" ? "Stopped after 10 seconds. Is there a loop that never ends?"
            : state === "stopped" ? "Stopped" : ""}
        </span>
      </div>
      {shown && (out || err || state === "done") && (
        <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-[#1f2024] px-3 py-2 font-mono text-[12.5px] leading-relaxed text-[#e9e9e4]">
          {out || (state === "done" && !err ? <span className="text-[#9a9a94]">(It ran, and printed nothing.)</span> : null)}
          {err && <span className="text-[#ff9a8a]">{out && !out.endsWith("\n") ? "\n" : ""}{err}</span>}
        </pre>
      )}
    </div>
  );
}

/** Code as code: monospace, indentation kept, scrolls sideways if long; Python gets a Run button. */
export function CodeBlock({ code, lang, runnable = true, onRan }: { code: string; lang: "python" | "other"; runnable?: boolean; onRan?: (r: RunResult) => void }) {
  return (
    <div data-code className="my-1">
      <pre className="overflow-x-auto rounded-lg border border-line bg-white px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-ink">{code}</pre>
      {runnable && lang === "python" && <CodeRun code={code} onRan={onRan} compact />}
    </div>
  );
}

/**
 * A student's work, with any code in it shown as code (and Python runnable). Everything else is drawn by `text`
 * (plain, keeping line breaks, unless a page draws it its own way).
 */
export function WorkText({ text, runnable = true, className = "", renderText }: { text: string; runnable?: boolean; className?: string; renderText?: (t: string) => ReactNode }) {
  const pieces = splitCode(text);
  if (!pieces.some((p) => p.kind === "code")) return <div className={className}>{renderText ? renderText(text) : <p className="whitespace-pre-wrap">{text}</p>}</div>;
  return (
    <div className={`space-y-2 ${className}`}>
      {pieces.map((p, i) => p.kind === "code"
        ? <CodeBlock key={i} code={p.text} lang={p.lang} runnable={runnable} />
        : <div key={i}>{renderText ? renderText(p.text) : <p className="whitespace-pre-wrap">{p.text}</p>}</div>)}
    </div>
  );
}
