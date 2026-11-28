"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { toast } from "@/lib/toast";
import { ask } from "../Confirm";

type Where = "claude" | "chatgpt" | "other";
const STEPS: Record<Where, { name: string; steps: (string | [string, string])[]; note?: string }> = {
  claude: {
    name: "Claude",
    steps: [
      ["In Claude, open ", "Customize → Connectors"],
      ["Click ", "+ Add → Add custom connector"],
      ["Name it Questhand, paste your link, click ", "Continue"],
      ["For sign-in choose ", "No sign in", ],
      ["In a chat: ", "+ → Connectors → Questhand on"],
    ],
    note: "Works on every Claude plan (Free: one custom connector). Team and Enterprise: an owner adds it in Organization settings → Connectors.",
  },
  chatgpt: {
    name: "ChatGPT",
    steps: [
      ["Go to ", "chatgpt.com/plugins"],
      ["Click ", "+ → Add custom MCP server"],
      ["Name it Questhand, paste your link as the ", "Server URL"],
      ["Authentication: ", "No authentication"],
      ["Accept the notice, ", "Create as a plugin", ],
      ["Install it, then type ", "@Questhand"],
    ],
    note: "ChatGPT asks before each change to your courses; you can let it remember for a chat.",
  },
  other: {
    name: "Other apps",
    steps: [
      ["Cursor, VS Code and other MCP apps: add a server of type ", "http", ],
      ["Use your link as its ", "URL"],
    ],
  },
};
const TRY = [
  "Make a 6-week course on persuasive writing for 15-year-olds, with a quiz each week",
  "Go through the work waiting for my feedback and draft feedback for each, for me to check",
  "Who hasn’t started this week’s cards? Draft a kind reminder",
  "Add a discussion card to next week’s lesson about their best take",
];

/**
 * Use Questhand from your own AI (Claude, ChatGPT…), through MCP: a personal link to paste into it, and how. The AI then
 * works in your courses as you: builds courses and cards, reads work, drafts feedback (it asks before sending).
 */
export function McpSettings({ bare }: { bare?: boolean } = {}) {
  const [state, setState] = useState<{ link: string | null; used: number | null } | null>(null);
  const [where, setWhere] = useState<Where>("claude");
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/mcp-link").then((r) => (r.ok ? r.json() : null)).then((j) => setState(j ? { link: j.link, used: j.used } : null)).catch(() => {}); }, []);
  if (!state) return null;
  async function make(again: boolean) {
    if (again && !(await ask({ title: "Make a new link?", body: "The old link stops working. Any AI using it will need the new one.", confirm: "Make a new link" }))) return;
    setBusy(true);
    const j = await fetch("/api/mcp-link", { method: "POST" }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (j?.link) { setState({ link: j.link, used: null }); if (again) toast("New link made; the old one stopped", { icon: "check" }); }
  }
  async function off() {
    if (!(await ask({ title: "Turn off your link?", body: "Any AI using it loses access to your courses straight away.", confirm: "Turn off", danger: true }))) return;
    await fetch("/api/mcp-link", { method: "DELETE" });
    setState({ link: null, used: null });
  }
  async function copy(text: string, what = "Link copied") {
    try { await navigator.clipboard.writeText(text); toast(what, { icon: "check" }); } catch { toast("Couldn’t copy; select it and copy", { icon: "x", tone: "bad" }); }
  }
  const shown = state.link ? state.link.replace(/(qh_.{4}).+(.{4})$/, "$1••••••••$2") : "";
  const s = STEPS[where];
  return (
    <section id="mcp" className={bare ? "" : "card mt-6 p-6"}>
      {/* Inside a Settings row the row already names it and says its state. */}
      {!bare && (
        <div className="flex items-center gap-2">
        <Icon name="plug" size={16} />
        <h2 className="flex-1 text-[16px] font-semibold">Use your own AI</h2>
        <span className="flex items-center gap-1.5 text-[12.5px] text-ink-2"><span className={`h-2 w-2 rounded-full ${state.used ? "bg-ok" : "bg-line-strong"}`} />{state.used ? "Connected" : state.link ? "Not used yet" : "Off"}</span>
      </div>
      )}
      <p className={`${bare ? "" : "mt-1 "}text-[13px] text-ink-3`}>Connect Claude or ChatGPT to Questhand, and ask it to build a course, add cards, or go through work waiting for feedback. It uses your own subscription.</p>

      {state.link ? (
        <div className="mt-4">
          <div className="flex h-9 items-center gap-3 rounded-[10px] border border-line bg-[#fafaf9] px-3">
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-2">{shown}</span>
            <button onClick={() => copy(state.link!)} className="press flex items-center gap-1.5 text-[12.5px] font-medium text-[#4b56a8] hover:underline"><Icon name="link" size={12} />Copy link</button>
            <button onClick={() => make(true)} disabled={busy} className="text-[12px] text-ink-3 hover:text-ink">New link</button>
            <button onClick={off} className="text-[12px] text-ink-3 hover:text-bad">Turn off</button>
          </div>
          <p className="mt-1.5 text-[12px] text-ink-3">This link works like a password: whoever has it can work in your courses as you. Make a new one if it’s ever shared.</p>
        </div>
      ) : (
        <button onClick={() => make(false)} disabled={busy} className="btn btn-quiet press mt-4 h-9 gap-1.5 text-[13px]"><Icon name="link" size={13} />Make my link</button>
      )}

      {state.link && (
        <>
          <div className="mt-5 inline-flex rounded-[10px] border border-line-strong p-0.5" role="tablist" aria-label="Where to add it">
            {(Object.keys(STEPS) as Where[]).map((k) => (
              <button key={k} role="tab" aria-selected={where === k} onClick={() => setWhere(k)}
                className={`press h-8 rounded-[8px] px-3.5 text-[13px] ${where === k ? "bg-[#eef0fb] font-medium text-[#3d4796]" : "text-ink-2 hover:text-ink"}`}>{STEPS[k].name}</button>
            ))}
          </div>
          <ol className="mt-3 space-y-1.5 text-[13px] text-ink-2">
            {s.steps.map((x, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mono mt-px grid h-5 w-5 flex-none place-items-center rounded-full bg-lane text-[11px] text-ink-3">{i + 1}</span>
                {typeof x === "string" ? <span>{x}</span>
                  : <span>{x[0]}<span className="font-medium text-ink">{x[1]}</span></span>}
              </li>
            ))}
          </ol>
          {s.note && <p className="mt-2 text-[12px] text-ink-3">{s.note}</p>}
          {where === "other" && (
            // Claude Code: one command, with the link in it.
            <div className="mt-3">
              <div className="mb-1 text-[12px] text-ink-3">In Claude Code, run:</div>
              <div className="flex items-center gap-3 rounded-lg bg-[#1f2024] px-3 py-2">
                <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-[#e9e9e4]">claude mcp add --transport http questhand {shown}</code>
                <button onClick={() => copy(`claude mcp add --transport http questhand ${state.link}`, "Command copied")} className="text-[12px] text-[#c9cdf5] hover:underline">Copy</button>
              </div>
            </div>
          )}

          <div className="mt-5 border-t border-line pt-3.5">
            <div className="mb-2 text-[12px] text-ink-3">Try asking</div>
            <div className="flex flex-wrap gap-2">
              {TRY.map((t) => (
                <button key={t} onClick={() => copy(t, "Copied: paste it into your AI")} className="press rounded-full border border-line px-3 py-1.5 text-left text-[12.5px] text-ink-2 hover:border-line-strong hover:text-ink">{t}</button>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
