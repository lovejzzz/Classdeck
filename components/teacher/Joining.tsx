"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { op } from "@/lib/client";
import { toast } from "@/lib/toast";
import type { Course } from "@/lib/types";
import { Avatar, Icon } from "../Icon";
import { QR, qrSvg } from "../QR";

type SetupLink = { id: string; name: string; email?: string; link: string };

const MODES: [string, string, string][] = [
  ["off", "Only my list", "Students pick their name from your class list."],
  ["approve", "Anyone, with my OK", "Students not on the list add themselves; you let each one in."],
  ["open", "Anyone, straight in", "Students not on the list add themselves and start right away."],
];

/**
 * How students get in without any outside tool: a join link and QR code for the class,
 * students adding themselves (optionally waiting for the teacher), and private setup links.
 */
export function Joining({ course, onChanged, setSelfJoin }: { course: Course; onChanged: () => void; setSelfJoin: (mode: "open" | "approve" | undefined) => Promise<void> }) {
  const [origin, setOrigin] = useState("");
  const [show, setShow] = useState(false);
  const [links, setLinks] = useState<SetupLink[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only known in the browser
  useEffect(() => setOrigin(window.location.origin), []);
  const joinUrl = origin ? `${origin}/learn/${course.id}?code=${course.joinCode}` : "";
  const mode = course.access?.selfJoin ?? "off";
  const waiting = course.waiting ?? [];
  const closed = course.access?.joinOpen === false;
  const local = /^https?:\/\/(localhost|127\.|\[::1\])/.test(origin);

  const letIn = async (ids: string[], allow: boolean, label: string) => {
    await op(course.id, { op: "letIn", studentIds: ids, allow });
    onChanged();
    toast(allow ? `Let in ${label}` : `Turned away ${label}`, { icon: allow ? "check" : "x", tone: allow ? "ok" : "plain" });
  };

  async function makeLinks() {
    setBusy(true);
    const r = await op<{ links?: SetupLink[] }>(course.id, { op: "setupLinks" });
    setBusy(false);
    setLinks(r.links ?? []);
    if (!r.links?.length) toast("Everyone on your list has signed in already", { tone: "plain" });
  }

  function printSlips(list: SetupLink[]) {
    const w = window.open("", "_blank");
    if (!w) return toast("Allow pop-ups to print the slips", { tone: "plain" });
    const until = new Date(now + 14 * 86400_000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(course.title)} · setup slips</title><style>
      body{font:14px system-ui,sans-serif;margin:24px;color:#111}
      .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:0}
      .slip{border:1px dashed #999;padding:16px;display:flex;gap:14px;align-items:center;break-inside:avoid}
      h2{margin:0 0 4px;font-size:18px} p{margin:2px 0;font-size:12px;color:#444} code{font-size:9px;word-break:break-all;color:#666}
      @media print{body{margin:0}}
    </style></head><body><div class="grid">${list.map((l) => `<div class="slip">${qrSvg(l.link, 120)}<div><h2>${esc(l.name)}</h2><p>${esc(course.title)}</p><p>Scan to open your board and choose a PIN. Only for you: it works once, until ${until}.</p><code>${esc(l.link)}</code></div></div>`).join("")}</div>
    <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  return (
    <section className="card p-6">
      <h3 className="text-[15px] font-medium">Students joining</h3>
      <p className="mt-1 text-[13px] text-ink-3">Show the code in class. Students scan it, find their name or add themselves, and choose a 4-digit PIN. No email or outside form needed.</p>
      {closed && <p className="mt-3 rounded-lg bg-[#fbf3ee] px-3 py-2 text-[12.5px] text-ink-2">Joining is closed in Access, so new students can’t get in until you turn on “Accept new students”.</p>}

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        {joinUrl && <button onClick={() => setShow(true)} aria-label="Show the join code full screen" className="press w-fit rounded-xl border border-line p-1.5 hover:border-line-strong"><QR value={joinUrl} size={112} label={`QR code to join ${course.title}`} /></button>}
        <div className="min-w-0 flex-1 space-y-2">
          <code className="block truncate rounded-md bg-lane px-2 py-1 font-mono text-[12px] text-ink-2">{joinUrl || "…"}</code>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShow(true)} className="btn btn-dark press h-8"><Icon name="board" size={13} /> Show to the class</button>
            <button onClick={() => { navigator.clipboard?.writeText(joinUrl).catch(() => {}); toast("Join link copied"); }} className="btn btn-ghost press h-8">Copy link</button>
          </div>
          {local && <p className="text-[12px] text-ink-3">This address only works on this computer. Once Classdeck is online, the code points to the public address.</p>}
        </div>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <div className="text-[13px] font-medium">Who can join</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {MODES.map(([v, label, hint]) => (
            <button key={v} onClick={() => v !== mode && setSelfJoin(v === "off" ? undefined : (v as "open" | "approve"))} aria-pressed={mode === v}
              className={`press rounded-xl border px-3 py-2.5 text-left ${mode === v ? "border-ink bg-white ring-1 ring-ink" : "border-line hover:border-line-strong"}`}>
              <span className="block text-[13px] font-medium">{label}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      {waiting.length > 0 && (
        <div className="rise mt-5 border-t border-line pt-4" aria-live="polite">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-medium">Waiting to be let in</span><span className="mono">{waiting.length}</span>
            <span className="flex-1" />
            {waiting.length > 1 && <button onClick={() => letIn(waiting.map((s) => s.id), true, `${waiting.length} students`)} className="btn btn-ghost press h-7 px-2 text-[12px]">Let everyone in</button>}
          </div>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {waiting.map((st) => (
              <li key={st.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
                <Avatar name={st.name} size={22} />
                <span className="min-w-0 flex-1 font-medium">{st.name}{st.joinedAt && <span className="ml-1.5 font-normal text-ink-3">· {ago(now, st.joinedAt)}</span>}</span>
                <button onClick={() => letIn([st.id], true, st.name)} className="btn btn-dark press h-7 px-2.5 text-[12px]">Let in</button>
                <button onClick={() => letIn([st.id], false, st.name)} className="btn btn-quiet press h-7 px-2 text-[12px] hover:!text-bad">Turn away</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <div className="text-[13px] font-medium">Private setup links</div>
        <p className="mt-0.5 text-[12.5px] text-ink-3">For students on your list who haven’t signed in yet. Each gets a one-time link to their own board, and no one else can claim their name with the class code. Print them as slips with QR codes, or copy them into an email.</p>
        <button onClick={makeLinks} disabled={busy} className="btn btn-ghost press mt-2 h-8"><Icon name="link" size={13} /> {busy ? "Making…" : links ? "Make new links" : "Make links"}</button>
        {links && links.length > 0 && (
          <div className="rise mt-3">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => printSlips(links)} className="btn btn-dark press h-8"><Icon name="download" size={13} /> Print slips</button>
              <button onClick={() => { navigator.clipboard?.writeText(links.map((l) => [l.name, l.email ?? "", l.link].join("\t")).join("\n")).catch(() => {}); toast(`Copied ${links.length} links`); }} className="btn btn-ghost press h-8">Copy all</button>
            </div>
            <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {links.map((l) => (
                <li key={l.id} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]">
                  <span className="w-32 flex-none truncate font-medium">{l.name}</span>
                  <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-3">{l.link}</code>
                  <button onClick={() => { navigator.clipboard?.writeText(l.link).catch(() => {}); toast(`Copied ${l.name}’s link`); }} className="btn btn-quiet press h-7 px-2 text-[12px]">Copy</button>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[12px] text-ink-3">Making links again replaces these. Each works once, for 14 days.</p>
          </div>
        )}
      </div>

      {show && joinUrl && <JoinScreen title={course.title} code={course.joinCode} url={joinUrl} onClose={() => setShow(false)} />}
    </section>
  );
}

function ago(now: number, t: number) {
  const m = Math.max(0, Math.round((now - t) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

/** Full screen, for the projector: a big QR code and the class code. */
function JoinScreen({ title, code, url, onClose }: { title: string; code: string; url: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Join ${title}`} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6 text-center" style={{ animation: "panel-in 0.3s var(--ease-out) both" }}>
      <button onClick={onClose} aria-label="Close" autoFocus className="btn btn-quiet press absolute right-4 top-4 h-9 w-9 justify-center px-0"><Icon name="x" size={18} /></button>
      <p className="eyebrow">{title}</p>
      <h2 className="text-[clamp(22px,4vw,40px)] font-semibold tracking-tight">Scan to join</h2>
      <QR value={url} size={Math.min(440, typeof window !== "undefined" ? Math.min(window.innerWidth - 48, window.innerHeight * 0.55) : 360)} label={`QR code to join ${title}`} />
      <p className="text-[clamp(14px,1.6vw,18px)] text-ink-2">Or go to <span className="font-mono">{url.replace(/^https?:\/\//, "").split("/")[0]}</span> and enter the class code</p>
      <p className="font-mono text-[clamp(32px,6vw,64px)] font-semibold tracking-[0.3em]">{code}</p>
    </div>,
    document.body,
  );
}
