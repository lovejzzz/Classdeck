"use client";

import { useState } from "react";
import type { ConnectorInfo, ToolResult } from "@/lib/connectors/types";
import { invokeTool } from "@/lib/client";
import { resultToText } from "@/lib/ui";
import type { ToolRef } from "@/lib/types";
import { CONNECTOR_ICON, Icon } from "./Icon";
import { ToolResultView } from "./ToolResultView";

/** One tool's form and result. Shared by students and the connector test bench. */
export function ToolRunner({
  connector, actionId, defaults, context, onUse,
}: {
  connector: ConnectorInfo;
  actionId: string;
  defaults?: Record<string, string>;
  context: Record<string, unknown>;
  onUse?: (text: string) => void;
}) {
  const action = connector.actions.find((a) => a.id === actionId);
  const [input, setInput] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries((action?.inputs ?? []).filter((i) => i.type === "select" && i.options?.length).map((i) => [i.name, i.options![0][0]])),
    ...defaults,
  }));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState(false);
  if (!action) return null;

  async function run() {
    setBusy(true);
    setError(null);
    setUsed(false);
    const reply = await invokeTool({ ...context, connector: connector.id, action: actionId, input });
    setBusy(false);
    if (reply.ok) setResult(reply.result);
    else {
      setResult(null);
      setError(reply.error);
    }
  }

  return (
    <div className="space-y-2">
      {action.description && <p className="text-[12px] text-ink-3">{action.description}</p>}
      {action.inputs.map((spec) =>
        spec.type === "select" ? (
          <label key={spec.name} className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <span className="w-20 flex-none">{spec.label}</span>
            <select value={input[spec.name] ?? ""} onChange={(e) => setInput({ ...input, [spec.name]: e.target.value })} aria-label={spec.label} className="field h-9 min-w-0 flex-1 py-0">
              {spec.options?.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </label>
        ) : spec.type === "textarea" ? (
          <textarea
            key={spec.name}
            aria-label={spec.label}
            placeholder={spec.placeholder ?? spec.label}
            value={input[spec.name] ?? ""}
            onChange={(e) => setInput({ ...input, [spec.name]: e.target.value })}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && run()}
            rows={3}
            className="field resize-none"
          />
        ) : (
          <div key={spec.name} className="relative">
            <input
              aria-label={spec.label}
              placeholder={spec.placeholder ?? spec.label}
              value={input[spec.name] ?? ""}
              onChange={(e) => setInput({ ...input, [spec.name]: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && run()}
              className="field pr-9"
            />
            <Icon name="search" size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />
          </div>
        ),
      )}
      <button onClick={run} disabled={busy} className="btn btn-dark press w-full justify-center">
        {busy ? "Working…" : action.title}
      </button>
      {error && <p className="rise rounded-lg border border-bad/20 bg-bad/5 px-3 py-2 text-[13px] text-bad">{error}</p>}
      {busy && !result && <div className="skeleton h-20" />}
      {result && (
        <div key={JSON.stringify(result).slice(0, 80)} className={`rise card p-3 ${busy ? "opacity-50" : ""}`}>
          <ToolResultView result={result} />
          {onUse && (
            <button
              onClick={() => {
                onUse(resultToText(result));
                setUsed(true);
              }}
              disabled={used}
              className="btn btn-quiet press mt-2 h-7 px-2 text-[12px]"
            >
              <Icon name={used ? "check" : "insert"} size={13} />
              {used ? "Added to your answer" : "Add to my answer"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The tools a teacher attached to this card. */
export function ToolTray({
  tools, connectors, context, onUse,
}: {
  tools: ToolRef[];
  connectors: ConnectorInfo[];
  context: Record<string, unknown>;
  onUse?: (text: string) => void;
}) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-2">
      <div className="eyebrow mb-1 flex items-center gap-1.5"><Icon name="tool" size={12} /> Tools</div>
      {tools.map((t, i) => {
        const c = connectors.find((x) => x.id === t.connector);
        if (!c) return null;
        const isOpen = open === i;
        return (
          <div key={i} className={`card overflow-hidden ${isOpen ? "" : "card-hover"}`}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className="press flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
              aria-expanded={isOpen}
            >
              <Icon name={CONNECTOR_ICON[c.id] ?? "plug"} className="text-ink-2" />
              <span className="flex-1 text-[13.5px] font-medium">{t.label ?? c.actions.find((a) => a.id === t.action)?.title ?? c.name}</span>
              {!c.configured && <span className="chip h-5 text-[11px] text-warn">needs key</span>}
              <Icon name="chevron" size={14} className={`text-ink-3 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
            </button>
            <div className={`fold ${isOpen ? "fold-open" : ""}`}>
              <div className="min-h-0 overflow-hidden">
                <div className="border-t border-line p-3">
                  <ToolRunner connector={c} actionId={t.action} defaults={t.defaults} context={context} onUse={onUse} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
