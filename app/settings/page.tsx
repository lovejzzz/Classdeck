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
import { providerMeta, type AiProvider } from "@/lib/aimeta";
import { McpSettings } from "@/components/teacher/McpSettings";
import { TemplatePreview } from "@/components/TemplatePreview";
import type { TemplateInfo } from "@/lib/mytemplates";

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

type Open = "ai" | "mcp" | "templates" | "tools" | null;

type Studying = { id: string; title: string; studentId: string; teacher?: string; done?: number; total?: number };

/**
 * Settings, on one page. Someone who teaches: their account, then one row each for their AI and for using Questhand
 * from Claude or ChatGPT (a row opens to change it); the site owner also has the tools and APIs. Someone who only
 * studies: one simple card (who they are, reminders, their classes).
 */
export default function SettingsPage() {
  const [open, setOpen] = useState<Open>(null);
  const [studying, setStudying] = useState<Studying[] | null | undefined>(undefined);
  const [out, setOut] = useState(false);
  // A row named in the address (#ai, #mcp, #tools) opens, so a link can lead straight to it.
  useEffect(() => {
    const h = window.location.hash.slice(1);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the address
    if (h === "ai" || h === "mcp" || h === "templates" || h === "tools") setOpen(h);
    fetch("/api/auth").then((r) => r.json()).then((j: { kind?: string | null }) => setOut(!j.kind)).catch(() => {});
    fetch("/api/courses").then((r) => r.json()).then((j: { courses?: unknown[]; studying?: Studying[] }) => {
      setStudying(!j.courses?.length && j.studying?.length ? j.studying : null);
    }).catch(() => setStudying(null));
  }, []);
  const go = (o: Open) => { setOpen(o); history.replaceState(null, "", o ? `#${o}` : " "); };
  const student = !!studying;
  // Signed out (or only visiting the demo): nothing here is theirs, so ask them to sign in rather than load forever.
  if (out) return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16 text-center">
      <h1 className="text-[20px] font-semibold tracking-tight">Sign in to see your settings</h1>
      <Link href="/login?next=%2Fsettings" className="btn btn-dark press mx-auto mt-5 h-9 px-5">Sign in</Link>
    </main>
  );
  return (
    <main className={`mx-auto min-h-screen w-full flex-1 px-4 py-8 ${student ? "max-w-2xl" : "max-w-3xl"}`}>
      <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
        <Icon name="back" size={13} /> {student ? "Your classes" : "Your courses"}
      </Link>
      <h1 className="rise mt-4 text-[24px] font-semibold tracking-tight">Settings</h1>
      {studying === undefined ? <div className="card skeleton mt-6 h-64" aria-busy="true" />
        : studying ? <StudentSettings studying={studying} />
        : (
          <>
            <AccountTab />
            <TeachingRows open={open} onOpen={(o) => go(open === o ? null : o)} />
          </>
        )}
      <SiteFooter />
    </main>
  );
}

/** A student's settings, on one card: who they are (photo, email, how they sign in), reminders, and their classes. */
function StudentSettings({ studying }: { studying: Studying[] }) {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  // Reminders are the browser's notifications: on, not asked yet, or blocked (only the browser can unblock them).
  const [notify, setNotify] = useState<NotificationPermission | "none">("default");
  useEffect(() => {
    fetch("/api/auth").then((r) => r.json()).then((j) => { if (j.kind === "teacher") setMe(j); }).catch(() => {});
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser
    setNotify(typeof Notification === "undefined" ? "none" : Notification.permission);
  }, []);
  if (!me) return <div className="card skeleton mt-6 h-64" aria-busy="true" />;
  const post = (body: object) => fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Can’t reach the server" }));
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
  const row = "flex items-center gap-3 border-t border-line px-5 py-4";
  return (
    <section className="card rise mt-6 overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-5">
        <label className={`group relative flex-none cursor-pointer rounded-full ${busy ? "opacity-60" : ""}`} title="Change photo">
          {me.picture
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={me.picture} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-full object-cover" />
            : <Avatar name={me.name} size={56} />}
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true"><Icon name="camera" size={15} /></span>
          <input type="file" accept="image/*" aria-label="Change photo" className="sr-only" disabled={busy} onChange={(e) => { void photo(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold">{me.name}</div>
          <div className="truncate text-[12.5px] text-ink-3" data-tip={`Signs in with ${methods}`}>{me.email}</div>
        </div>
        <button onClick={signOut} className="btn btn-ghost press h-8 text-[12.5px]">Sign out</button>
      </div>

      <div className={row}>
        <Icon name="clock" size={15} className="text-ink-3" />
        <span className="flex-1 text-[13.5px]">Reminders <span className="text-[12.5px] text-ink-3">· a notification when your teacher sends one</span></span>
        {notify === "granted" ? <span className="flex items-center gap-1.5 text-[12.5px] text-ink-2"><span className="h-2 w-2 rounded-full bg-ok" />On</span>
          : notify === "denied" ? <span className="text-[12.5px] text-ink-3" data-tip="Allow notifications for this site in your browser’s settings">Blocked in your browser</span>
          : notify === "none" ? <span className="text-[12.5px] text-ink-3">Not on this browser</span>
          : <button onClick={async () => setNotify(await Notification.requestPermission())} className="btn btn-quiet press h-8 text-[12.5px]">Turn on</button>}
      </div>

      <div className="border-t border-line px-5 py-4">
        <div className="mb-2 text-[12px] text-ink-3">Your classes</div>
        <ul className="space-y-1">
          {studying.map((c) => (
            <li key={c.id}>
              <Link href={`/learn/${c.id}/${c.studentId}`} className="press -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-lane">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px]">{c.title}</span>
                  {c.teacher && <span className="block truncate text-[12px] text-ink-3">{c.teacher}</span>}
                </span>
                {c.total ? <span className="mono text-[12px] text-ink-3">{c.done ?? 0}/{c.total}</span> : null}
                <Icon name="chevron" size={12} className="-rotate-90 text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

type AiState = { active: AiProvider | null } | null;

/** A teacher's two settings beyond their account, one row each: their AI, and using Questhand from Claude or ChatGPT.
 * The site owner also has a row for the tools and APIs. A row opens to change it. */
function TeachingRows({ open, onOpen }: { open: Open; onOpen: (o: Exclude<Open, null>) => void }) {
  const { canAdd } = useConnectors();
  const [ai, setAi] = useState<AiState | undefined>(undefined);
  const [mcp, setMcp] = useState<{ link?: string; used?: boolean } | null | undefined>(undefined);
  // The rows' summaries; read again when a row closes, since it may have changed.
  useEffect(() => {
    if (open === "ai") return;
    fetch("/api/ai").then((r) => (r.ok ? r.json() : null)).then((j) => setAi(j?.ai ? { active: j.ai.active ?? null } : null)).catch(() => setAi(null));
  }, [open]);
  useEffect(() => {
    if (open === "mcp") return;
    fetch("/api/mcp-link").then((r) => (r.ok ? r.json() : null)).then((j) => setMcp(j ? { link: j.link, used: j.used } : null)).catch(() => setMcp(null));
  }, [open]);
  // The templates row's summary: how many there are (read again when the row closes).
  const [tplCount, setTplCount] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (open === "templates") return;
    fetch("/api/templates").then((r) => (r.ok ? r.json() : null)).then((j) => setTplCount(j?.templates?.length ?? 0)).catch(() => {});
  }, [open]);
  const aiText = ai === undefined ? "" : ai?.active ? `${providerMeta(ai.active).name} · Ready` : "Not connected";
  const mcpText = mcp === undefined ? "" : mcp?.used ? "Connected" : mcp?.link ? "Link made" : "Off";
  const row = (id: Exclude<Open, null>, label: string, value: string, body: React.ReactNode, ok?: boolean) => (
    <div className="border-t border-line first:border-t-0">
      <button onClick={() => onOpen(id)} aria-expanded={open === id} className="press flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-[#fafaf9]">
        <span className="w-48 flex-none text-[13.5px] text-ink">{label}</span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 truncate text-[13px] text-ink-2">{ok !== undefined && value && <span className={`h-2 w-2 flex-none rounded-full ${ok ? "bg-ok" : "bg-line-strong"}`} />}{value}</span>
        <Icon name="chevron" size={12} className={`flex-none text-ink-3 transition-transform duration-300 ${open === id ? "rotate-180" : "-rotate-90"}`} />
      </button>
      {open === id && <div className="rise border-t border-line bg-[#fafaf9] px-5 py-5">{body}</div>}
    </div>
  );
  return (
    <section className="card rise mt-4 overflow-hidden">
      {row("ai", "AI", aiText, <AiSettings bare />, !!ai?.active)}
      {row("mcp", "Use from Claude or ChatGPT", mcpText, <McpSettings bare />, !!mcp?.used)}
      {row("templates", "Templates", tplCount === undefined ? "" : tplCount ? `${tplCount} template${tplCount === 1 ? "" : "s"}` : "None yet", <Templates />)}
      {canAdd && row("tools", "Tools and APIs · site owner", "", <ToolsList />)}
    </section>
  );
}

/** The teacher's templates: each drawn small, to rename or delete. New ones come from a course's Settings. */
function Templates() {
  const [list, setList] = useState<TemplateInfo[] | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const load = () => fetch("/api/templates").then((r) => r.json()).then((j) => setList(j.templates ?? [])).catch(() => setList([]));
  useEffect(() => { void load(); }, []);
  const act = async (body: Record<string, unknown>, note: string) => {
    const r = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Can’t reach the server" }));
    if (r.ok) { toast(note); await load(); } else toast(r.error ?? "That didn’t work", { icon: "x", tone: "bad" });
  };
  if (list === null) return <div className="skeleton h-24 rounded-xl" aria-busy="true" />;
  if (!list.length) return <p className="text-[13px] text-ink-2">No templates yet. In a course, open Settings → Course and press Save as template: a copy of it waits here, and in New course.</p>;
  return (
    <div className="space-y-4">
      {list.map((t) => (
        <div key={t.id}>
          <TemplatePreview t={t} />
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {renaming === t.id ? (
              <form className="flex flex-1 gap-1.5" onSubmit={(e) => { e.preventDefault(); const name = String(new FormData(e.currentTarget).get("name") ?? ""); setRenaming(null); if (name.trim() && name.trim() !== t.name) void act({ action: "rename", id: t.id, name }, "Renamed"); }}>
                <input name="name" defaultValue={t.name} autoFocus aria-label="Template name" onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} className="field h-8 min-w-0 flex-1 text-[13px]" />
                <button className="btn btn-dark press h-8 px-3 text-[12.5px]">Save</button>
              </form>
            ) : (
              <>
                <span className="flex-1 text-[12px] text-ink-3">Saved {new Date(t.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                <button onClick={() => setRenaming(t.id)} className="btn btn-quiet press h-7 px-2 text-[12px]"><Icon name="pencil" size={12} /> Rename</button>
                <button onClick={async () => (await ask({ title: `Delete “${t.name}”?`, body: "Courses already made from it stay as they are.", confirm: "Delete", danger: true })) && act({ action: "delete", id: t.id }, `Deleted “${t.name}”`)}
                  className="btn btn-quiet press h-7 px-2 text-[12px] hover:!text-bad"><Icon name="trash" size={12} /> Delete</button>
              </>
            )}
          </div>
        </div>
      ))}
      <p className="text-[12px] text-ink-3">To add one, open a course’s Settings → Course and press Save as template.</p>
    </div>
  );
}

/** The site owner's tools: each free tool, to try, and adding a new API. */
function ToolsList() {
  const { connectors, refresh, loaded, canAdd } = useConnectors();
  const others = connectors.filter((c) => !c.usesAi);
  const [shelf, setShelf] = useState<string>("All");
  const [open, setOpen] = useState<string | null>(null);
  const shown = others.filter((c) => shelf === "All" || c.category === shelf);
  return (
    <div className="space-y-6">
      <section>
        <p className="text-[13px] text-ink-3">Free tools, no key needed. Try them here.</p>
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
          <span className="block text-[12.5px] text-ink-3">Turn any web API into a tool, with a short description and no code.</span>
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
    <section className="card rise mt-6 overflow-hidden">
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
