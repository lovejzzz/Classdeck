"use client";

import { useState } from "react";
import { op } from "@/lib/client";
import { parseCsv } from "@/lib/csv";
import type { HookResult } from "@/lib/hooks";
import { ago } from "@/lib/time";
import { toast } from "@/lib/toast";
import type { Course } from "@/lib/types";
import { Icon } from "../Icon";

const DOCS = "https://github.com/lovejzzz/Classdeck/blob/main/docs/google-forms.md";

/** The Apps Script a teacher pastes into their Google Form. */
function appsScript(url: string, key: string, source: string, card: string) {
  const q = (s: string) => JSON.stringify(s);
  return `// Classdeck: sends each new response from this form to your class.
// 1. In the form: ⋮ menu → Apps Script. Replace everything with this, then Save.
// 2. Clock icon (Triggers) → Add Trigger → function sendToClassdeck,
//    event source "From form", event type "On form submit" → Save, and allow access.
const CLASSDECK_URL = ${q(url)};
const CLASSDECK_KEY = ${q(key || "PASTE YOUR KEY HERE")};
const SOURCE = ${q(source)}; // students see this as who sent the feedback
const CARD = ${q(card)}; // optional: the card every response is about
const EMAIL_LINKS = true; // email new students the private link to their board (needs "Collect email addresses")

function sendToClassdeck(e) {
  const row = {};
  e.response.getItemResponses().forEach(function (r) {
    const item = r.getItem();
    const answer = r.getResponse();
    const type = item.getType();
    if (type === FormApp.ItemType.GRID || type === FormApp.ItemType.CHECKBOX_GRID) {
      const rows = type === FormApp.ItemType.GRID ? item.asGridItem().getRows() : item.asCheckboxGridItem().getRows();
      rows.forEach(function (label, i) {
        if (answer[i]) row[item.getTitle() + " [" + label + "]"] = [].concat(answer[i]).join(", ");
      });
    } else {
      row[item.getTitle()] = Array.isArray(answer) ? answer.join("\\n") : String(answer);
    }
  });
  const email = e.response.getRespondentEmail();
  if (email) row["Email"] = email;
  const res = UrlFetchApp.fetch(CLASSDECK_URL, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + CLASSDECK_KEY },
    payload: JSON.stringify({ items: [{ row: row, id: e.response.getId(), source: SOURCE, card: CARD }] }),
  });
  console.log(res.getResponseCode() + " " + res.getContentText());
  if (res.getResponseCode() !== 200 || !EMAIL_LINKS) return;
  const reply = JSON.parse(res.getContentText());
  (reply.results || []).forEach(function (r) {
    const to = email || r.email;
    if (!r.link || !to) return;
    MailApp.sendEmail(to, "Your " + reply.course + " board is ready",
      "Hi " + r.student + ",\n\nThanks for filling in the form. Your practice board is set up from your answers.\n\n" +
      "Open it here and choose a 4-digit PIN: " + r.link + "\n\n" +
      "The link works once and expires in 14 days. After that, sign in with your class code, your name, and your PIN.");
  });
}
`;
}

const GUIDE: [string, string][] = [
  ["Name / Email", "Which student. Turn on “Collect email addresses” in the form, or ask for their name as it appears in Classdeck."],
  ["Electives", "Checkboxes with the elective titles. Sets exactly the ones ticked."],
  ["Path", "“Guided” or “Stretch”. Applies to every week that has both."],
  ["Why are you taking this course? / Goal / Objectives", "Fill in the student’s plan. One objective per line; “learn this — how I’ll know” splits the measure."],
  ["Confidence [A job interview] …", "A grid with 1–5 columns. Rows: job interview, class, meeting, unexpected question, research, English."],
  ["Card / Activity", "Title of the card the response is about (or set CARD in the script)."],
  ["Feedback / Try next", "Shown to the student in their feedback inbox and on the card."],
  ["Vocal delivery, Structure … (or a grid “Scores [skill]”)", "A level 1–4 per skill. Counts as evidence on the student’s skill chart."],
  ["Score / Out of", "A number, e.g. 8 and 10, or “8/10” in one answer."],
  ["Links", "https links, e.g. a recording. Added to the student’s work on that card."],
  ["Status", "“Done” marks the card done; “Revise” asks for another go."],
];

/** Settings: connect a Google Form (or any tool) to this class, or import a CSV of responses. */
export function FormsIntegration({ course, onChanged }: { course: Course; onChanged: () => void }) {
  const hook = course.access?.hook;
  const [key, setKey] = useState("");
  const [source, setSource] = useState("Workshop form");
  const [card, setCard] = useState("");
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState<HookResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}/api/hooks/${course.id}`;
  const local = /localhost|127\.0\.0\.1|\[::1\]/.test(origin);
  const copy = (text: string, note: string) => { navigator.clipboard?.writeText(text).catch(() => {}); toast(note); };
  const cards = course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules.filter((m) => m.audience.kind === "all" || m.audience.kind === "branch").map((m) => ({ w, m }))));

  async function makeKey() {
    if (hook && !confirm("Create a new key? Forms using the old key will stop working until you paste the new one.")) return;
    const r = await op<{ ok: boolean; key?: string; error?: string }>(course.id, { op: "hookKey" });
    if (!r.ok || !r.key) return toast(r.error ?? "Couldn’t create a key");
    setKey(r.key);
    onChanged();
  }
  async function revoke() {
    if (!confirm("Turn off the key? Forms using it will stop sending updates.")) return;
    await op(course.id, { op: "hookKey", revoke: true });
    setKey("");
    onChanged();
    toast("Key turned off", { icon: "x", tone: "plain" });
  }
  async function importRows() {
    if (!rows?.length) return;
    setBusy(true);
    const r = await op<{ ok: boolean; results?: HookResult[]; error?: string }>(course.id, { op: "importRows", rows, source, card });
    setBusy(false);
    if (!r.ok || !r.results) return toast(r.error ?? "Import failed");
    setResults(r.results);
    onChanged();
    const ok = r.results.filter((x) => x.ok).length;
    if (r.results.some((x) => x.link)) toast("New students got sign-in links: copy them below", { icon: "link" });
    toast(`Imported ${ok} of ${r.results.length} rows`, { icon: ok ? "check" : "x", tone: ok ? "ok" : "plain" });
  }

  return (
    <section className="card p-6" aria-labelledby="forms-h">
      <div className="flex items-center gap-2">
        <h3 id="forms-h" className="min-w-0 flex-1 text-[15px] font-medium">Google Forms and other tools</h3>
        <a href={DOCS} target="_blank" rel="noreferrer" className="btn btn-quiet press h-8 text-[12.5px]">How it works <Icon name="external" size={11} /></a>
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
        Let a form set each student’s electives, path, and plan, or post feedback, scores, and links to a card after an activity or workshop. Responses arrive within seconds; students see them on the card and in their feedback inbox.
      </p>

      <div className="mt-4 divide-y divide-line text-[13px]">
        <div className="flex flex-wrap items-center gap-3 py-3">
          <span className="w-full text-ink-2 sm:w-32">Key</span>
          {key ? (
            <>
              <code className="min-w-0 flex-1 truncate rounded-md bg-[#fbf3dd] px-2 py-1 font-mono text-[12px]">{key}</code>
              <button onClick={() => copy(key, "Key copied")} className="btn btn-ghost press h-8">Copy</button>
              <span className="basis-full sm:pl-[8.75rem] text-[12px] text-warn">Copy it now: it won’t be shown again. Treat it like a password.</span>
            </>
          ) : hook ? (
            <>
              <span className="min-w-0 flex-1 basis-56 text-ink-2"><span className="font-mono">cdk_••••{hook.hint}</span> <span className="text-ink-3">· created {ago(hook.createdAt)}{hook.lastUsed ? ` · last used ${ago(hook.lastUsed)} · ${hook.uses ?? 0} request${hook.uses === 1 ? "" : "s"}` : " · not used yet"}</span></span>
              <button onClick={makeKey} className="btn btn-quiet press h-8">Replace</button>
              <button onClick={revoke} className="btn btn-quiet press h-8 hover:!text-bad">Turn off</button>
            </>
          ) : (
            <>
              <span className="flex-1 text-[12.5px] text-ink-3">No key yet. A form needs one to send updates to this class.</span>
              <button onClick={makeKey} className="btn btn-ghost press h-8"><Icon name="plus" size={13} /> Create key</button>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 py-3">
          <span className="w-full text-ink-2 sm:w-32">Address</span>
          <code className="min-w-0 flex-1 truncate rounded-md bg-lane px-2 py-1 font-mono text-[12px] text-ink-2">{url}</code>
          <button onClick={() => copy(url, "Address copied")} className="btn btn-ghost press h-8">Copy</button>
          {local && <span className="basis-full sm:pl-[8.75rem] text-[12px] text-warn">This is a local address, so Google can’t reach it. Use the address of your deployed Classdeck, or import a CSV below.</span>}
        </div>
      </div>

      <details className="group mt-3 rounded-xl border border-line">
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-[13.5px] font-medium"><Icon name="file" size={14} /> Connect a Google Form <span className="ml-auto text-[12px] font-normal text-ink-3">Apps Script, about 3 minutes</span></summary>
        <div className="border-t border-line px-4 py-4 text-[13px]">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="text-ink-2">Shown to students as</span>
              <input value={source} onChange={(e) => setSource(e.target.value)} className="field mt-1" placeholder="Workshop 2 form" />
            </label>
            <label className="block"><span className="text-ink-2">Every response is about (optional)</span>
              <select value={card} onChange={(e) => setCard(e.target.value)} className="field mt-1">
                <option value="">The card named in each response</option>
                {cards.map(({ w, m }) => <option key={m.id} value={m.id}>{w.title.split(" · ")[0]} · {m.title}</option>)}
              </select>
            </label>
          </div>
          <div className="relative mt-3">
            <pre className="max-h-72 overflow-auto rounded-lg bg-ink p-3 font-mono text-[11.5px] leading-relaxed text-white/90">{appsScript(url, key, source, card)}</pre>
            <button onClick={() => copy(appsScript(url, key, source, card), key ? "Script copied, with your key" : "Script copied. Paste your key into it.")} className="btn btn-ghost press absolute right-2 top-2 h-7 px-2 text-[12px]">Copy script</button>
          </div>
          {!key && <p className="mt-2 text-[12px] text-ink-3">Create a key first and the script will include it.</p>}

          <h4 className="mt-5 text-[13px] font-medium">How to word your questions</h4>
          <p className="mt-0.5 text-[12.5px] text-ink-3">Classdeck reads answers by question title. Titles only need to contain these words; anything else is ignored.</p>
          <dl className="mt-2 divide-y divide-line rounded-lg border border-line">
            {GUIDE.map(([q, a]) => (
              <div key={q} className="grid gap-1 px-3 py-2 sm:grid-cols-[14rem_1fr] sm:gap-3">
                <dt className="font-medium">{q}</dt><dd className="text-ink-2">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>

      <details className="group mt-3 rounded-xl border border-line">
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-[13.5px] font-medium"><Icon name="download" size={14} /> Import a CSV of responses <span className="ml-auto text-[12px] font-normal text-ink-3">No setup</span></summary>
        <div className="border-t border-line px-4 py-4 text-[13px]">
          <p className="text-ink-2">In Google Forms: Responses → ⋮ → Download responses (.csv). The same question wording applies.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="text-ink-2">Shown to students as</span>
              <input value={source} onChange={(e) => setSource(e.target.value)} className="field mt-1" />
            </label>
            <label className="block"><span className="text-ink-2">Every response is about (optional)</span>
              <select value={card} onChange={(e) => setCard(e.target.value)} className="field mt-1">
                <option value="">The card named in each row</option>
                {cards.map(({ w, m }) => <option key={m.id} value={m.id}>{w.title.split(" · ")[0]} · {m.title}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="btn btn-ghost press h-8 cursor-pointer">
              <Icon name="file" size={13} /> Choose CSV
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const parsed = parseCsv(await f.text());
                setRows(parsed); setFileName(f.name); setResults(null);
                if (!parsed.length) toast("No rows found in that file");
              }} />
            </label>
            {rows && <span className="text-ink-2">{fileName} · {rows.length} row{rows.length === 1 ? "" : "s"} · {Object.keys(rows[0] ?? {}).length} columns</span>}
            <span className="flex-1" />
            <button onClick={importRows} disabled={busy || !rows?.length} className="btn btn-dark press h-8">{busy ? "Importing…" : "Import"}</button>
          </div>
          {results && (<>
            {results.some((r) => r.link) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-[#fbf3dd] px-3 py-2 text-[12.5px]">
                <span className="min-w-0 flex-1">New students need their private link to open their board. Each link works once and expires in 14 days.</span>
                <button onClick={() => copy(results.filter((r) => r.link).map((r) => [r.student, r.email ?? "", r.link].join("\t")).join("\n"), "Links copied: paste into a sheet or mail merge")} className="btn btn-ghost press h-7 px-2 text-[12px]">Copy all links</button>
              </div>
            )}
            <ul className="mt-3 max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line" aria-label="Import results">
              {results.map((r, i) => (
                <li key={i} className="flex items-start gap-2 px-3 py-2">
                  <span className={`mt-0.5 ${r.ok ? "text-ok" : "text-bad"}`}><Icon name={r.ok ? "check" : "x"} size={13} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">Row {i + 2}{r.student ? ` · ${r.student}` : ""}{r.card ? ` · ${r.card}` : ""}</span>
                    <span className="block text-[12px] text-ink-2">{r.error ?? (r.did.join("; ") || "no changes")}</span>
                    {r.warnings.length > 0 && <span className="block text-[12px] text-warn">{r.warnings.join("; ")}</span>}
                    {r.link && (
                      <span className="mt-1 flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded bg-lane px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">{r.link}</code>
                        <button onClick={() => copy(r.link!, `Link for ${r.student} copied`)} className="btn btn-quiet press h-6 px-1.5 text-[11.5px]">Copy</button>
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>)}
        </div>
      </details>
    </section>
  );
}
