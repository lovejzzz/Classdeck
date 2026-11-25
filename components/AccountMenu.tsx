"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox, type InboxData } from "./MessageThread";
import { Icon } from "./Icon";
import { uploadFile } from "@/lib/client";
import { toast } from "@/lib/toast";

/** A photo made small and square (centred), as a JPEG, before it's uploaded: a profile photo needs no more. */
async function squarePhoto(file: File, size = 320): Promise<File> {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const c = document.createElement("canvas");
  c.width = c.height = Math.min(size, side);
  c.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.88));
  if (!blob) throw new Error("no image");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

type Me = { kind: "teacher" | "student" | null; name?: string; email?: string; picture?: string | null; courseId?: string; studentId?: string; courseTitle?: string };

/** The signed-in person's photo (or initial) with a small menu: who they are, and Sign out. Shows nothing when signed out. */
export function AccountMenu({ className = "", inboxElsewhere = false }: { className?: string; /** The page has its own Inbox button: no count on the photo, no Inbox in the menu. */ inboxElsewhere?: boolean }) {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const onBoard = usePathname()?.startsWith("/learn/") ?? false;
  // (Only drawn in the open menu, after the page has loaded, so reading it here is safe.)
  const [canAsk, setCanAsk] = useState(() => typeof Notification !== "undefined" && Notification.permission === "default");
  const [broken, setBroken] = useState(false);
  // A new photo being made small and uploaded.
  const [photoBusy, setPhotoBusy] = useState(false);
  // Messages: the unread count on the photo, and the inbox once it's opened.
  const [inbox, setInbox] = useState<InboxData | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const loadInbox = useCallback(() => { fetch("/api/inbox").then((r) => (r.ok ? r.json() : null)).then((d) => d && setInbox(d)).catch(() => {}); }, []);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fetch("/api/auth").then((r) => r.json()).then(setMe).catch(() => {});
  }, []);
  useEffect(() => {
    if (!me?.kind) return;
    loadInbox();
    const t = setInterval(() => { if (document.visibilityState === "visible") loadInbox(); }, 30_000);
    return () => clearInterval(t);
  }, [me?.kind, loadInbox]);
  const unread = inboxElsewhere ? 0 : inbox?.unread ?? 0;
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", off);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", off); window.removeEventListener("keydown", esc); };
  }, [open]);
  // Until we know who's signed in, the photo's place is kept, so nothing on the page moves when it arrives.
  if (!me) return <div aria-hidden="true" className={`h-9 w-9 flex-none ${className}`} />;
  // Signed out: nothing to show, but the row keeps its height.
  if (!me.kind || !me.name) return <div aria-hidden="true" className={`h-9 w-0 ${className}`} />;
  async function changePhoto(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast("Pick a picture (JPEG, PNG, WebP or GIF)", { icon: "x", tone: "bad" });
    setPhotoBusy(true);
    try {
      const up = await uploadFile(await squarePhoto(f));
      if (!up.ok) throw new Error(up.error);
      const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setPicture", url: up.url }) }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error ?? "");
      setBroken(false);
      setMe((m) => (m ? { ...m, picture: r.picture } : m));
      toast("Photo changed", { icon: "check" });
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : "Couldn’t change your photo", { icon: "x", tone: "bad" });
    } finally {
      setPhotoBusy(false);
    }
  }
  async function signOut() {
    await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    window.location.href = "/";
  }
  const face = (size: number) =>
    me.picture && !broken ? (
      // eslint-disable-next-line @next/next/no-img-element -- a small remote profile photo
      <img src={me.picture} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)} className="rounded-full object-cover" style={{ width: size, height: size }} />
    ) : (
      <span className="inline-flex items-center justify-center rounded-full bg-ink font-medium text-white" style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden="true">{me.name!.slice(0, 1).toUpperCase()}</span>
    );
  return (
    <div ref={box} className={`relative ${className}`}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`Account: ${me.name}`}
        className="press relative flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-line hover:ring-line-strong">
        {face(32)}
        {unread > 0 && <span className="mono absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d64545] px-1 text-[10px] font-semibold text-white ring-2 ring-white" aria-label={`${unread} unread messages`}>{unread}</span>}
      </button>
      {open && (
        <div role="menu" className="pop absolute right-0 top-11 z-40 w-60 rounded-xl border border-line bg-white p-1.5 shadow-[0_16px_40px_-16px_rgba(20,20,18,0.35)]">
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            {me.kind === "teacher" ? (
              // Press the photo to choose another.
              <label className={`group/photo relative flex-none cursor-pointer rounded-full ${photoBusy ? "opacity-60" : ""}`} title="Change photo">
                {face(36)}
                <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover/photo:opacity-100" aria-hidden="true"><Icon name="pencil" size={13} /></span>
                <input type="file" accept="image/*" aria-label="Change photo" className="sr-only" disabled={photoBusy} onChange={(e) => { void changePhoto(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            ) : face(36)}
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-medium">{me.name}</div>
              <div className="truncate text-[12px] text-ink-3">{me.kind === "teacher" ? me.email : `Student · ${me.courseTitle ?? ""}`}</div>
            </div>
          </div>
          <div className="my-1 border-t border-line" />
          {!inboxElsewhere && <button role="menuitem" onClick={() => { setOpen(false); setInboxOpen(true); loadInbox(); }} className="press flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-lane">
            <span className="flex-1">Inbox</span>
            {unread > 0 && <span className="mono rounded-full bg-[#4b56a8] px-1.5 text-[11px] text-white">{unread}</span>}
          </button>}
          {me.kind === "teacher" && <Link role="menuitem" href="/" onClick={() => setOpen(false)} className="press block rounded-lg px-2.5 py-2 text-[13px] hover:bg-lane">Your courses</Link>}
          {me.kind === "teacher" && <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="press block rounded-lg px-2.5 py-2 text-[13px] hover:bg-lane">Settings</Link>}
          {me.kind === "student" && <Link role="menuitem" href={`/learn/${me.courseId}/${me.studentId}`} onClick={() => setOpen(false)} className="press block rounded-lg px-2.5 py-2 text-[13px] hover:bg-lane">My cards</Link>}
          {onBoard && canAsk && (
            // On a student's board: a system notification when the teacher sends a reminder and the tab is in the background.
            <button role="menuitem" onClick={async () => { setOpen(false); setCanAsk((await Notification.requestPermission()) === "default"); }} className="press flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-lane">
              <Icon name="clock" size={13} className="text-ink-3" /> Turn on reminders
            </button>
          )}
          <button role="menuitem" onClick={signOut} className="press block w-full rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-lane">Sign out</button>
        </div>
      )}
      {inboxOpen && <Inbox data={inbox} onClose={() => { setInboxOpen(false); loadInbox(); }} onChanged={loadInbox} />}
    </div>
  );
}
