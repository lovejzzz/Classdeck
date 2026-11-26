"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, CONNECTOR_ICON, Icon } from "@/components/Icon";
import { ToolRunner } from "@/components/ToolTray";
import { uploadFile, useConnectors } from "@/lib/client";
import { CATEGORIES, type ConnectorInfo } from "@/lib/connectors/types";
import { toast } from "@/lib/toast";
import { ask } from "@/components/Confirm";
import { SiteFooter } from "@/components/SiteFooter";
import { AiSettings } from "@/components/teacher/AiSettings";

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

type Tab = "tools" | "account";
const TABS: [Tab, string][] = [["tools", "Tools for cards"], ["account", "Your account"]];

/** Settings: the tools students can use on cards (the teacher's AI first), and their account. */
export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("tools");
  // The tab in the address (#account; #ai and #tools open the first), so a link can open it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the address
    if (window.location.hash === "#account") setTab("account");
  }, []);
  const go = (t: Tab) => { setTab(t); history.replaceState(null, "", t === "account" ? "#account" : "#tools"); };
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
        <Icon name="back" size={13} /> Your courses
      </Link>
      <h1 className="rise mt-4 text-[24px] font-semibold tracking-tight">Settings</h1>
      <div className="rise mt-5 flex gap-1 border-b border-line" role="tablist" aria-label="Settings">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)}
            className={`press -mb-px border-b-2 px-3 py-2 text-[14px] ${tab === k ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>{label}</button>
        ))}
      </div>
      {tab === "tools" ? <ToolsTab /> : <AccountTab />}
      <SiteFooter />
    </main>
  );
}

/** The tools students can use on cards: the teacher's AI (and what it unlocks) first, then every other tool. */
function ToolsTab() {
  const { connectors, refresh, loaded, canAdd } = useConnectors();
  const ai = connectors.find((c) => c.usesAi);
  const others = connectors.filter((c) => !c.usesAi);
  const [shelf, setShelf] = useState<string>("All");
  const [open, setOpen] = useState<string | null>(null);
  const shown = others.filter((c) => shelf === "All" || c.category === shelf);
  return (
    <div className="mt-6 space-y-8">
      <AiSettings aiTools={ai?.actions ?? []} />

      <section>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[16px] font-semibold">Other tools</h2>
          <p className="text-[13px] text-ink-3">Free to use, no key needed. Add them to a card in the card editor; students use them right on the card.</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["All", ...CATEGORIES.filter((cat) => others.some((c) => c.category === cat))].map((cat) => (
            <button key={cat} onClick={() => setShelf(cat)} aria-pressed={shelf === cat}
              className={`press h-7 rounded-full border px-3 text-[12.5px] ${shelf === cat ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:border-line-strong"}`}>
              {cat}{cat !== "All" && <span className={`ml-1.5 font-mono text-[11px] ${shelf === cat ? "text-white/60" : "text-ink-3"}`}>{others.filter((c) => c.category === cat).length}</span>}
            </button>
          ))}
        </div>
        <div className="card mt-3 divide-y divide-line overflow-hidden" aria-busy={!loaded}>
          {!loaded && Array.from({ length: 6 }, (_, i) => <div key={i} className="flex h-12 items-center px-4"><div className="skeleton h-3 w-1/2" /></div>)}
          {shown.map((c) => <ToolRow key={c.id} c={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} onRemoved={refresh} />)}
        </div>
      </section>

      {canAdd && <AddApi onAdded={async (id) => { await refresh(); setShelf("All"); setOpen(id); }} />}
    </div>
  );
}

/** One tool, one row: what it is and whether it's ready; open it to try what it does. */
function ToolRow({ c, open, onToggle, onRemoved }: { c: ConnectorInfo; open: boolean; onToggle: () => void; onRemoved: () => void }) {
  const [action, setAction] = useState(c.actions[0]?.id);
  async function remove() {
    if (!(await ask({ title: `Delete “${c.name}”?`, body: "Cards that use it lose this tool.", confirm: "Delete", danger: true }))) return;
    await fetch(`/api/connectors?id=${c.id}`, { method: "DELETE" });
    onRemoved();
    toast(`Deleted “${c.name}”`, { icon: "trash", tone: "plain" });
  }
  return (
    <div id={`c-${c.id}`}>
      <button onClick={onToggle} aria-expanded={open} className="press flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#fafaf9]">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-lane text-ink-2"><Icon name={CONNECTOR_ICON[c.id] ?? "plug"} size={15} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[13.5px] font-medium">{c.name}{c.kind === "custom" && <span className="chip h-5 text-[10.5px] font-normal">Your API</span>}</span>
          <span className="block truncate text-[12.5px] text-ink-3">{c.description}</span>
        </span>
        {/* Only a tool that isn't ready says so (the rest just work). */}
        {!c.configured && <span className="flex flex-none items-center gap-1.5 text-[11.5px] text-warn"><span className="h-1.5 w-1.5 rounded-full bg-warn" />Needs setup</span>}
        <Icon name="chevron" size={12} className={`flex-none text-ink-3 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`fold ${open ? "fold-open" : ""}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-line bg-[#fafaf9] px-4 py-3">
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[12px] text-ink-3">Try</span>
              {c.actions.map((a) => (
                <button key={a.id} onClick={() => setAction(a.id)} aria-pressed={action === a.id}
                  className={`press h-7 rounded-md px-2.5 text-[12.5px] ${action === a.id ? "bg-ink text-white" : "text-ink-2 hover:bg-lane hover:text-ink"}`}>
                  {a.title}{a.teacherOnly && <span className={action === a.id ? "text-white/60" : "text-ink-3"}> · teachers</span>}
                </button>
              ))}
              <span className="flex-1" />
              {c.host && <span className="mono text-[11px]">{c.host}</span>}
              {c.kind === "custom" && <button onClick={remove} className="btn btn-quiet press h-7 px-2 text-[12px] hover:!text-bad"><Icon name="trash" size={12} /> Delete</button>}
            </div>
            {open && action && <ToolRunner key={action} connector={c} actionId={action} context={{ courseId: "demo" }} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The site owner connects a new API from a short description (folded away until wanted). */
function AddApi({ onAdded }: { onAdded: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState(EXAMPLE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function add() {
    setError(null);
    let manifest: unknown;
    try { manifest = JSON.parse(json); } catch { setError("That isn’t valid JSON. Check the commas and quotes."); return; }
    setBusy(true);
    const data = await fetch("/api/connectors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manifest }) }).then((r) => r.json()).catch(() => ({ ok: false, error: "Can’t reach the server" }));
    setBusy(false);
    if (!data.ok) return setError(data.error);
    toast("Added. It’s in the list, ready to try.", { icon: "plug" });
    setOpen(false);
    onAdded(data.id);
  }
  return (
    <section className="card overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="press flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#fafaf9]">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-lane text-ink-2"><Icon name="plus" size={15} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium">Add your own API</span>
          <span className="block text-[12.5px] text-ink-3">Site owner only. Turn any web API into a tool for cards, with a short description and no code.</span>
        </span>
        <Icon name="chevron" size={12} className={`flex-none text-ink-3 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`fold ${open ? "fold-open" : ""}`}>
        <div className="min-h-0 overflow-hidden">
          <p className="border-t border-line px-4 py-3 text-[12.5px] leading-relaxed text-ink-3">
            The description says three things: the URL, what the student types in, and which fields to show from the reply. The example works as it is.
            For an API that needs a key, add an <code className="rounded bg-lane px-1 font-mono text-[12px] text-ink-2">auth</code> field and put the key in a server environment variable whose name starts with <code className="rounded bg-lane px-1 font-mono text-[12px] text-ink-2">LMS_</code>.
          </p>
          <textarea value={json} onChange={(e) => { setJson(e.target.value); setError(null); }} spellCheck={false} rows={14} aria-label="Connector description (JSON)"
            className="block w-full resize-y border-y border-line bg-[#fafaf9] px-4 py-3 font-mono text-[12px] leading-relaxed text-ink outline-none focus:bg-white" />
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <button onClick={add} disabled={busy} className="btn btn-dark press"><Icon name="plus" size={13} /> {busy ? "Adding…" : "Add the tool"}</button>
            {error && <span key={error} className="rise text-[13px] text-bad">{error}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

type Me = { kind: "teacher"; name: string; email: string; picture: string | null; signIn?: { password: boolean; google: boolean }; since?: number };

/** The account: photo, name, email, how they sign in, and signing out. */
function AccountTab() {
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/auth").then((r) => r.json()).then((j) => { if (j.kind === "teacher") { setMe(j); setName(j.name); } }).catch(() => {});
  }, []);
  if (!me) return <div className="card skeleton mt-6 h-64" aria-busy="true" />;
  const post = (body: object) => fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Can’t reach the server" }));
  async function saveName() {
    const n = name.trim();
    if (n === me!.name) return;
    const r = await post({ action: "setName", name: n });
    if (!r.ok) { toast(r.error ?? "Couldn’t change your name", { icon: "x", tone: "bad" }); setName(me!.name); return; }
    setMe({ ...me!, name: r.name }); toast("Name saved", { icon: "check" });
  }
  async function photo(f?: File) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast("Pick a picture (JPEG, PNG, WebP or GIF)", { icon: "x", tone: "bad" });
    setBusy(true);
    const up = await uploadFile(f, () => {});
    const r = up.ok ? await post({ action: "setPicture", url: up.url }) : { ok: false, error: up.error };
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "Couldn’t use that picture", { icon: "x", tone: "bad" });
    setMe({ ...me!, picture: r.picture }); toast("Photo changed", { icon: "check" });
  }
  async function signOut() {
    await post({ action: "logout" });
    window.location.href = "/";
  }
  const methods = [me.signIn?.google && "Google", me.signIn?.password && "email and password"].filter(Boolean).join(" or ") || "email";
  const row = "flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-line px-5 py-4";
  const label = "w-36 flex-none text-[13px] text-ink-3";
  return (
    <section className="card mt-6 overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-5">
        <label className={`group relative flex-none cursor-pointer rounded-full ${busy ? "opacity-60" : ""}`} title="Change photo">
          {me.picture
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={me.picture} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full object-cover" />
            : <Avatar name={me.name} size={64} />}
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true"><Icon name="camera" size={16} /></span>
          <input type="file" accept="image/*" aria-label="Change photo" className="sr-only" disabled={busy} onChange={(e) => { void photo(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <div className="min-w-0">
          <div className="truncate text-[17px] font-semibold">{me.name}</div>
          <div className="truncate text-[13px] text-ink-3">{me.email}</div>
        </div>
        <span className="flex-1" />
        {me.picture && <button onClick={async () => { const r = await post({ action: "setPicture", url: null }); if (r.ok) setMe({ ...me, picture: r.picture }); }} className="btn btn-quiet press h-8 text-[12.5px]">Remove photo</button>}
      </div>
      <div className={row}>
        <span className={label}>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} aria-label="Your name" className="field h-9 w-full max-w-sm py-0" />
        <span className="basis-full text-[12px] text-ink-3 sm:pl-[10.5rem]">Saved when you leave the field. Co-teachers see this name.</span>
      </div>
      <div className={row}>
        <span className={label}>Email</span>
        <span className="text-[13.5px]">{me.email}</span>
      </div>
      <div className={row}>
        <span className={label}>Signs in with</span>
        <span className="text-[13.5px]">{methods[0].toUpperCase() + methods.slice(1)}</span>
      </div>
      {me.since && (
        <div className={row}>
          <span className={label}>Member since</span>
          <span className="text-[13.5px]">{new Date(me.since).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
        </div>
      )}
      <div className={row}>
        <span className={label} />
        <button onClick={signOut} className="btn btn-ghost press h-9">Sign out</button>
      </div>
    </section>
  );
}
