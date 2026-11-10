"use client";

import Link from "next/link";
import { useState } from "react";
import { CONNECTOR_ICON, Icon } from "@/components/Icon";
import { ToolRunner } from "@/components/ToolTray";
import { useConnectors } from "@/lib/client";
import { CATEGORIES } from "@/lib/connectors/types";
import { toast } from "@/lib/toast";

const EXAMPLE = `{
  "id": "holidays",
  "name": "Public holidays",
  "description": "Public holidays in a country for a given year (from Nager.Date).",
  "baseUrl": "https://date.nager.at",
  "actions": [
    {
      "id": "list",
      "title": "List holidays",
      "inputs": [
        { "name": "year", "label": "Year", "placeholder": "e.g. 2026" },
        { "name": "country", "label": "Country code", "placeholder": "e.g. US, FR, JP" }
      ],
      "path": "/api/v3/PublicHolidays/{year}/{country}",
      "output": {
        "render": "table",
        "rows": "",
        "limit": 20,
        "columns": [
          { "label": "Date", "path": "date" },
          { "label": "Holiday", "path": "name" },
          { "label": "Local name", "path": "localName" }
        ]
      }
    }
  ]
}`;

export default function ConnectorsPage() {
  const { connectors, refresh } = useConnectors();
  const [testing, setTesting] = useState<string | null>(null);
  const [json, setJson] = useState(EXAMPLE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shelf, setShelf] = useState<string>("All");

  async function add() {
    setError(null);
    let manifest: unknown;
    try {
      manifest = JSON.parse(json);
    } catch {
      setError("That isn’t valid JSON. Check the commas and quotes.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/connectors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manifest }) });
    const data = await res.json();
    setBusy(false);
    if (data.ok) {
      await refresh();
      setTesting(data.id);
      toast("Connector added. Turn it on in a course’s Settings.");
      document.getElementById(`c-${data.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else setError(data.error);
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete “${name}”? Cards that use it will lose this tool.`)) return;
    await fetch(`/api/connectors?id=${id}`, { method: "DELETE" });
    refresh();
    toast(`Deleted “${name}”`, { icon: "trash", tone: "plain" });
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <Link href="/teach/demo" className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
        <Icon name="back" size={13} /> Teacher view
      </Link>
      <h1 className="rise mt-4 text-[24px] font-semibold tracking-tight">Connectors</h1>
      <p className="rise mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
        A connector turns an outside API into a tool students can use on a card. Requests go out from the server, so keys never reach a student’s browser, and students can only use the tools a teacher put on a card.
      </p>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {["All", ...CATEGORIES.filter((cat) => connectors.some((c) => c.category === cat))].map((cat) => (
          <button key={cat} onClick={() => setShelf(cat)} aria-pressed={shelf === cat}
            className={`press h-8 rounded-full border px-3 text-[12.5px] ${shelf === cat ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:border-line-strong"}`}>
            {cat}{cat !== "All" && <span className={`ml-1.5 font-mono text-[11px] ${shelf === cat ? "text-white/60" : "text-ink-3"}`}>{connectors.filter((c) => c.category === cat).length}</span>}
          </button>
        ))}
      </div>
      {CATEGORIES.filter((cat) => (shelf === "All" || shelf === cat) && connectors.some((c) => c.category === cat)).map((cat) => (
      <section key={cat} className="mt-7">
      <h2 className="mb-2.5 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">{cat}</h2>
      <div className="grid items-start gap-3 md:grid-cols-2">
        {connectors.filter((c) => c.category === cat).map((c, i) => (
          <section key={c.id} id={`c-${c.id}`} className={`rise card overflow-hidden ${testing?.startsWith(c.id) ? "" : "card-hover"}`} style={{ "--i": i } as React.CSSProperties}>
            <div className="flex items-start gap-3 p-4">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-lane text-ink-2">
                <Icon name={CONNECTOR_ICON[c.id] ?? "plug"} size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[14px] font-medium">{c.name}</h2>
                  <span className={`chip h-5 text-[11px] ${c.configured ? "" : "text-warn"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${c.configured ? "bg-ok" : "bg-warn"}`} />
                    {c.configured ? "Ready" : `Needs ${c.requiresEnv.join(", ")}`}
                  </span>
                  {c.kind === "custom" && <span className="chip h-5 text-[11px]">Custom</span>}
                </div>
                <p className="mt-1 text-[12.5px] text-ink-3">{c.description}</p>
                <p className="mono mt-1.5 text-[11.5px]">{c.host}</p>
              </div>
              {c.kind === "custom" && (
                <button onClick={() => remove(c.id, c.name)} aria-label={`Delete ${c.name}`} className="btn btn-quiet press h-7 w-7 justify-center px-0 hover:!text-bad">
                  <Icon name="trash" size={13} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 border-t border-line px-4 py-2.5">
              {c.actions.map((a) => {
                const key = `${c.id}.${a.id}`;
                const on = testing === key || testing === c.id && a === c.actions[0];
                return (
                  <button
                    key={a.id}
                    onClick={() => setTesting(on ? null : key)}
                    className={`press inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] ${on ? "bg-ink text-white" : "text-ink-2 hover:bg-lane hover:text-ink"}`}
                  >
                    Try: {a.title}
                    {a.teacherOnly && <span className={on ? "text-white/60" : "text-ink-3"}>· teachers only</span>}
                  </button>
                );
              })}
            </div>
            {c.actions.map((a) => {
              const on = testing === `${c.id}.${a.id}` || (testing === c.id && a === c.actions[0]);
              return (
                <div key={a.id} className={`fold ${on ? "fold-open" : ""}`}>
                  <div className="min-h-0 overflow-hidden">
                    <div className="border-t border-line bg-[#fafaf9] p-4">
                      <ToolRunner connector={c} actionId={a.id} context={{ courseId: "demo" }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
      </section>
      ))}

      <section className="card mt-8 overflow-hidden">
        <div className="p-5">
          <h2 className="text-[15px] font-medium">Connect a new API</h2>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-ink-3">
            No code needed. A short JSON description says three things: the URL, what the student types in, and which fields to show from the response. The example below works as is.
            For an API that needs a key, add an <code className="rounded bg-lane px-1 font-mono text-[12px] text-ink-2">auth</code> field and put the key in a server environment variable whose name starts with <code className="rounded bg-lane px-1 font-mono text-[12px] text-ink-2">LMS_</code>.
          </p>
        </div>
        <textarea
          value={json}
          onChange={(e) => {
            setJson(e.target.value);
            setError(null);
          }}
          spellCheck={false}
          rows={18}
          aria-label="Connector JSON"
          className="block w-full resize-y border-y border-line bg-[#fafaf9] px-5 py-4 font-mono text-[12px] leading-relaxed text-ink outline-none focus:bg-white"
        />
        <div className="flex flex-wrap items-center gap-3 px-5 py-3">
          <button onClick={add} disabled={busy} className="btn btn-dark press"><Icon name="plus" size={13} /> {busy ? "Adding…" : "Add connector"}</button>
          {error && <span key={error} className="rise text-[13px] text-bad">{error}</span>}
        </div>
      </section>
    </main>
  );
}
