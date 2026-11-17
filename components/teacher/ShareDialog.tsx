"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { op } from "@/lib/client";
import { toast } from "@/lib/toast";
import type { Course, CourseState } from "@/lib/types";
import { BackCloses } from "../BackCloses";
import { Avatar, Icon } from "../Icon";
import { QR } from "../QR";
import { Clearable } from "../Clearable";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const splitEmails = (s: string) => s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

type Row = { key: string; name: string; email?: string; picture?: string; right: React.ReactNode };

/**
 * A share box in the familiar shape: add people by email, see who has access, set general access, copy the link.
 * Used for inviting students and for inviting other teachers.
 */
function ShareBox({ title, placeholder, onAdd, rows, general, link, linkLabel, extra, note, onClose, addLabel = "Add", roleSelect, underInput }: {
  title: string; placeholder: string; onAdd?: (emails: string[]) => Promise<void> | void; rows: Row[]; general?: React.ReactNode;
  link: string; linkLabel: string; extra?: React.ReactNode; note?: React.ReactNode; onClose: () => void; addLabel?: string; roleSelect?: React.ReactNode;
  underInput?: React.ReactNode;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    input.current?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const emails = splitEmails(text);
  const bad = emails.filter((x) => !EMAIL.test(x));
  async function add() {
    if (!emails.length || bad.length || !onAdd) return;
    setBusy(true);
    await onAdd(emails);
    setBusy(false);
    setText("");
  }
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/25 p-4 pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="pop w-full max-w-lg rounded-2xl bg-white p-6 shadow-[0_30px_80px_-24px_rgba(20,20,18,0.45)]">
        <h2 className="text-[20px] font-medium tracking-tight">{title}</h2>
        {onAdd && (
          <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <label className="min-w-0 flex-1">
              <span className="sr-only">{placeholder}</span>
              <Clearable><input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} inputMode="email" autoComplete="off"
                className="field h-11 text-[14px]" aria-invalid={bad.length > 0} /></Clearable>
            </label>
            {roleSelect}
            <button type="submit" disabled={!emails.length || bad.length > 0 || busy} className="btn btn-dark press h-11 px-4">{busy ? "Adding…" : addLabel}</button>
          </form>
        )}
        {bad.length > 0 && <p className="mt-1.5 text-[12.5px] text-bad">{bad[0]} isn’t an email address.</p>}
        {underInput}

        <h3 className="mt-6 text-[14px] font-medium">People with access</h3>
        <ul className="mt-2 max-h-72 space-y-0.5 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
              {r.picture
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={r.picture} alt="" referrerPolicy="no-referrer" className="h-9 w-9 flex-none rounded-full object-cover" />
                : <Avatar name={r.name} size={36} />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px]">{r.name}</span>
                {r.email && <span className="block truncate text-[12.5px] text-ink-3">{r.email}</span>}
              </span>
              <span className="flex-none text-[13px] text-ink-3">{r.right}</span>
            </li>
          ))}
          {!rows.length && <li className="px-1 py-2 text-[13px] text-ink-3">No one yet.</li>}
        </ul>

        {general && (
          <>
            <h3 className="mt-5 text-[14px] font-medium">General access</h3>
            <div className="mt-2">{general}</div>
          </>
        )}
        {note && <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">{note}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button onClick={() => { navigator.clipboard?.writeText(link).then(() => toast("Link copied"), () => toast("Couldn’t copy. Select the link and copy it.", { tone: "plain" })); }}
            className="btn btn-ghost press h-10 rounded-full px-4"><Icon name="link" size={14} /> {linkLabel}</button>
          {extra}
          <span className="flex-1" />
          <button onClick={onClose} className="btn btn-dark press h-10 rounded-full px-6">Done</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const ACCESS: { v: "off" | "approve" | "open"; label: string; hint: string }[] = [
  { v: "off", label: "Restricted", hint: "Only students on the class list can join with the link" },
  { v: "approve", label: "Anyone with the link, after you let them in", hint: "New students wait until you say yes" },
  { v: "open", label: "Anyone with the link", hint: "New students join straight away" },
];

/** Invite students: add them by email, or share the class link or QR code. Students have no permissions to set. */
export function InviteStudents({ course, me, onClose, onChanged }: { course: Course; me?: CourseState["me"]; onClose: () => void; onChanged: () => void }) {
  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState(false);
  const mailOn = !!me?.mail;
  const [emailThem, setEmailThem] = useState(true);
  async function sendInvites(ids: string[], who: string) {
    const r = await op<{ ok?: boolean; sent?: number; failed?: number; overLimit?: number; error?: string }>(course.id, { op: "emailInvites", studentIds: ids });
    onChanged();
    if (r.ok === false) return toast(r.error ?? "Couldn’t send the invitations", { icon: "x", tone: "bad" });
    if (r.sent) toast(`Emailed ${r.sent === 1 ? who : `${r.sent} students`} an invitation`, { icon: "message" });
    if (r.failed) toast(`${r.failed} invitation${r.failed === 1 ? "" : "s"} couldn’t be sent. Check the address and try again.`, { icon: "x", tone: "bad" });
    if (r.overLimit) toast(`Today’s limit for invitations is reached; ${r.overLimit} weren’t sent. Try again tomorrow.`, { tone: "plain" });
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only known in the browser
  useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/learn/${course.id}?code=${course.joinCode}`;
  const mode = course.access?.selfJoin ?? "off";
  const waiting = course.waiting ?? [];
  const withEmail = course.students.filter((s) => s.email).map((s) => s.email!);

  async function setMode(v: "off" | "approve" | "open") {
    const a = course.access;
    const r = await op<{ ok?: boolean; error?: string }>(course.id, { op: "setAccess", access: { joinOpen: a?.joinOpen !== false, passcode: a?.passcode, selfJoin: v === "off" ? undefined : v } });
    onChanged();
    if (r.ok === false) toast(r.error ?? "That didn’t save", { icon: "x", tone: "bad" });
  }
  async function letIn(ids: string[], allow: boolean, label: string) {
    await op(course.id, { op: "letIn", studentIds: ids, allow });
    onChanged();
    toast(allow ? `Let in ${label}` : `Turned away ${label}`, { icon: allow ? "check" : "x", tone: allow ? "ok" : "plain" });
  }
  const mail = `mailto:?bcc=${encodeURIComponent(withEmail.join(","))}&subject=${encodeURIComponent(`Join ${course.title} on Questhand`)}&body=${encodeURIComponent(`Join ${course.title} here: ${link}\n\nOpen the link, pick your name, and choose a 4-digit PIN.`)}`;

  return (
    <>
      <ShareBox
        title={`Invite students to “${course.title}”`}
        placeholder="Add students by email"
        onAdd={async (emails) => {
          const before = new Set(course.students.map((s) => s.id));
          const r = await op<{ added?: number; error?: string }>(course.id, { op: "addStudentEmails", emails });
          onChanged();
          toast(r.added ? `Added ${r.added} student${r.added === 1 ? "" : "s"}` : "They’re already on the list", { tone: r.added ? "ok" : "plain" });
          if (mailOn && emailThem && r.added) {
            // The new students: everyone on the list now with one of these addresses who wasn't there before.
            const st = await fetch(`/api/course/${course.id}`).then((x) => x.json()).catch(() => null);
            const wanted = new Set(emails.map((e) => e.toLowerCase()));
            const fresh = ((st?.course?.students ?? []) as Course["students"]).filter((s) => !before.has(s.id) && s.email && wanted.has(s.email.toLowerCase()));
            if (fresh.length) await sendInvites(fresh.map((s) => s.id), fresh[0].name);
          }
        }}
        underInput={mailOn ? (
          <label className="mt-2 flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={emailThem} onChange={(e) => setEmailThem(e.target.checked)} className="accent-[#1b1b1a]" />
            Email each one a personal invitation from Questhand
          </label>
        ) : undefined}
        rows={[
          ...waiting.map((s) => ({ key: s.id, name: s.name, email: "Waiting to be let in", right: (
            <span className="flex gap-1">
              <button onClick={() => letIn([s.id], true, s.name)} className="btn btn-dark press h-7 px-2.5 text-[12px]">Let in</button>
              <button onClick={() => letIn([s.id], false, s.name)} className="btn btn-quiet press h-7 px-2 text-[12px] hover:!text-bad">Turn away</button>
            </span>
          ) })),
          ...course.students.map((s) => ({ key: s.id, name: s.name, email: s.email, right: mailOn && s.email ? (
            <span className="flex items-center gap-2">
              {s.invitedAt && <span className="text-[12px]">Invited {new Date(s.invitedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
              <button onClick={() => sendInvites([s.id], s.name)} className="btn btn-quiet press h-7 px-2 text-[12px]">{s.invitedAt ? "Send again" : "Send invite"}</button>
            </span>
          ) : "Student" })),
        ]}
        general={(
          <label className="flex items-start gap-3 rounded-xl bg-lane/70 px-3 py-2.5">
            <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-ink-2"><Icon name={mode === "off" ? "lock" : "globe"} size={15} /></span>
            <span className="min-w-0 flex-1">
              <select value={mode} onChange={(e) => setMode(e.target.value as "off" | "approve" | "open")} aria-label="General access" className="-ml-1 max-w-full rounded-md bg-transparent px-1 py-0.5 text-[14px] font-medium hover:bg-white">
                {ACCESS.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
              </select>
              <span className="block text-[12.5px] text-ink-3">{ACCESS.find((x) => x.v === mode)!.hint}</span>
            </span>
          </label>
        )}
        link={link}
        linkLabel="Copy link"
        extra={(
          <>
            <button onClick={() => setQr(true)} className="btn btn-quiet press h-10 rounded-full px-3"><Icon name="board" size={14} /> QR code</button>
            {withEmail.length > 0 && <a href={mail} className="btn btn-quiet press h-10 rounded-full px-3"><Icon name="message" size={14} /> Email the link</a>}
          </>
        )}
        note={mode === "off" && !course.students.length
          ? "The class list is empty and access is Restricted, so no one can join yet. Add students above, or open access to anyone with the link."
          : mailOn
            ? "An invitation from Questhand carries each student’s own one-time link to set up their board. Or share the class link: students open it, pick their name, and choose a 4-digit PIN."
            : "Sending email from Questhand isn’t set up on this site yet. Copy the link (or use Email the link) to send it yourself. Students open it, pick their name, and choose a 4-digit PIN."}
        onClose={onClose}
      />
      <BackCloses name="qr" value={qr ? "1" : null} onBack={() => setQr(false)} />
      {qr && origin && <JoinScreen title={course.title} code={course.joinCode} url={link} onClose={() => setQr(false)} />}
    </>
  );
}

/** Invite other teachers to the course: editors change it, viewers only look. Only the owner can change this. */
export function InviteTeachers({ course, me, onClose, onChanged }: { course: Course; me?: CourseState["me"]; onClose: () => void; onChanged: () => void }) {
  const [origin, setOrigin] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only known in the browser
  useEffect(() => setOrigin(window.location.origin), []);
  const owner = me?.role === "owner";
  const people = course.people ?? [];
  async function save(next: NonNullable<Course["people"]>, note: string) {
    const r = await op<{ ok?: boolean; error?: string }>(course.id, { op: "setPeople", people: next });
    onChanged();
    if (r.ok === false) toast(r.error ?? "That didn’t save", { icon: "x", tone: "bad" });
    else toast(note);
  }
  const link = `${origin}/teach/${course.id}`;
  const mail = `mailto:${encodeURIComponent(people.map((p) => p.email).join(","))}?subject=${encodeURIComponent(`${course.title} on Questhand`)}&body=${encodeURIComponent(`I’ve shared ${course.title} with you on Questhand: ${link}\n\nSign in with Google using this email address to open it.`)}`;
  return (
    <ShareBox
      title={`Share “${course.title}” with teachers`}
      placeholder="Add teachers by email"
      onAdd={owner ? async (emails) => {
        const have = new Set(people.map((p) => p.email.toLowerCase()));
        const fresh = emails.map((e) => e.toLowerCase()).filter((e) => !have.has(e));
        await save([...people, ...fresh.map((email) => ({ email, role, at: Date.now() }))], fresh.length ? `Shared with ${fresh.join(", ")}` : "They already have access");
      } : undefined}
      roleSelect={owner ? (
        <select value={role} onChange={(e) => setRole(e.target.value as "editor" | "viewer")} aria-label="Access for the people you add" className="field h-11 w-auto py-0 text-[13px]">
          <option value="editor">Can edit</option>
          <option value="viewer">Can view</option>
        </select>
      ) : undefined}
      rows={[
        ...(me?.owner ? [{ key: "owner", name: me.owner.name, email: me.owner.email, picture: me.owner.picture, right: "Owner" }] : []),
        ...people.map((p) => ({ key: p.email, name: p.email.split("@")[0], email: p.email, right: owner ? (
          <select value={p.role} aria-label={`Access for ${p.email}`} className="rounded-md bg-transparent px-1 py-1 text-[13px] text-ink-2 hover:bg-lane"
            onChange={(e) => e.target.value === "remove"
              ? save(people.filter((x) => x.email !== p.email), `Removed ${p.email}`)
              : save(people.map((x) => (x.email === p.email ? { ...x, role: e.target.value as "editor" | "viewer" } : x)), `${p.email} can now ${e.target.value === "viewer" ? "view" : "edit"}`)}>
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
            <option value="remove">Remove access</option>
          </select>
        ) : p.role === "viewer" ? "Can view" : "Can edit" })),
      ]}
      general={(
        <div className="flex items-start gap-3 rounded-xl bg-lane/70 px-3 py-2.5">
          <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-ink-2"><Icon name="lock" size={15} /></span>
          <span><span className="block text-[14px] font-medium">Restricted</span><span className="block text-[12.5px] text-ink-3">Only the people above can open the course with the link</span></span>
        </div>
      )}
      link={link}
      linkLabel="Copy link"
      extra={people.length > 0 ? <a href={mail} className="btn btn-quiet press h-10 rounded-full px-3"><Icon name="message" size={14} /> Email the link</a> : undefined}
      note={owner
        ? "Each teacher signs in with Google using the address you add here. Questhand doesn’t send emails, so send them the link yourself."
        : "Only the course’s owner can change who has access."}
      onClose={onClose}
    />
  );
}

/** Full screen, for the projector: a big QR code and the class code. */
export function JoinScreen({ title, code, url, onClose }: { title: string; code: string; url: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Join ${title}`} className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-white p-6 text-center" style={{ animation: "panel-in 0.3s var(--ease-out) both" }}>
      <button onClick={onClose} autoFocus className="btn btn-ghost press absolute left-4 top-4 h-9 px-3"><Icon name="back" size={15} /> Back</button>
      <p className="eyebrow">{title}</p>
      <h2 className="text-[clamp(22px,4vw,40px)] font-semibold tracking-tight">Scan to join</h2>
      <QR value={url} size={Math.min(440, typeof window !== "undefined" ? Math.min(window.innerWidth - 48, window.innerHeight * 0.55) : 360)} label={`QR code to join ${title}`} />
      <p className="text-[clamp(14px,1.6vw,18px)] text-ink-2">Or go to <span className="font-mono">{url.replace(/^https?:\/\//, "").split("/")[0]}</span> and enter the class code</p>
      <p className="font-mono text-[clamp(32px,6vw,64px)] font-semibold tracking-[0.3em]">{code}</p>
    </div>,
    document.body,
  );
}
