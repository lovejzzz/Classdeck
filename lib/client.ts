"use client";

import { todayLessonId } from "./dates";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ConnectorInfo, ToolResult } from "./connectors/types";
import { toast } from "./toast";
import type { CourseState } from "./types";

/**
 * Student View: while a teacher tests the course as a student, every read and change says so, and the server runs it in
 * a sandbox (nothing is saved). Set by the student page from its address (?preview).
 */
let previewAs: string | null = null;
export function setPreview(studentId: string | null) { previewAs = studentId; }
/**
 * Who Student View is testing as, but only while on that student's own pages. Leaving them (Back to teaching is an
 * in-app link, so nothing reloads) must not leave the teacher's own saves marked as the student's.
 */
export const previewing = () => (previewAs && typeof location !== "undefined" && location.pathname.startsWith(`/learn/`) && location.pathname.includes(`/${previewAs}`) ? previewAs : null);

/** Fired when a request finds the session has ended, so the page can ask the person to sign in again. */
export const SIGNED_OUT = "qh:signed-out";

/**
 * Sends one change to the server. Never throws: on failure it resolves to { ok: false, error }.
 * Network trouble, an ended session, or a server error also show a toast, since many callers don't check;
 * ordinary refusals (400) are left to the caller to explain.
 */
export async function op<T = Record<string, unknown>>(courseId: string, body: Record<string, unknown>, opts: { keepalive?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    // keepalive: the request carries on if the page is closed or reloaded meanwhile (bodies up to 64 KB).
    res = await fetch(`/api/course/${courseId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(previewing() ? { ...body, preview: true, as: previewing() } : body), keepalive: opts.keepalive });
  } catch {
    toast("Can’t reach the server. Your last change wasn’t saved; check your connection and try again.", { icon: "x", tone: "bad" });
    return { ok: false, error: "Can’t reach the server" } as T;
  }
  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    data = { error: `The server had a problem (${res.status}). Try again in a moment.` };
  }
  if (!res.ok) {
    data.ok = false;
    if (res.status === 401) {
      window.dispatchEvent(new Event(SIGNED_OUT));
      toast("You’ve been signed out, so that wasn’t saved. Sign in again to keep working.", { icon: "x", tone: "bad" });
    } else if (res.status >= 500 || res.status === 413 || res.status === 429) {
      toast(String(data.error ?? "That didn’t save. Try again."), { icon: "x", tone: "bad" });
    }
  }
  return data as T;
}

/** 读取课程，并每隔几秒刷新一次（原型用轮询代替实时推送）。 */
/**
 * A teacher's course, read ahead of time: pointing at it on Your courses starts loading it, so opening it shows the
 * course at once instead of a moment of grey placeholders. Kept for a minute (the page then loads it fresh anyway).
 */
const ahead = new Map<string, { at: number; done?: string | null }>();
export function prefetchCourse(courseId: string) {
  const had = ahead.get(courseId);
  if (had && Date.now() - had.at < 60_000) return;
  const entry: { at: number; done?: string | null } = { at: Date.now() };
  ahead.set(courseId, entry);
  fetch(`/api/course/${courseId}`, { cache: "no-store" }).then((r) => (r.ok ? r.text() : null)).catch(() => null).then((t) => { entry.done = t; });
}
/** What was read ahead for this course, if it has arrived and is fresh. */
function takeAhead(courseId: string): string | null {
  const had = ahead.get(courseId);
  if (!had || Date.now() - had.at > 60_000) return null;
  return had.done ?? null;
}

export function useCourse(courseId: string, as?: string, everyMs = 4000) {
  const [state, setState] = useState<CourseState | null>(() => {
    // Read ahead (a teacher's own view only): shown straight away, then refreshed as usual.
    if (as || typeof window === "undefined") return null;
    const raw = takeAhead(courseId);
    if (!raw) return null;
    try { const data = JSON.parse(raw); if (data?.course?.weeks) { data.course.currentLessonId = todayLessonId(data.course); return data; } } catch { /* fall through */ }
    return null;
  });
  const [error, setError] = useState<string | null>(null);
  const [needAuth, setNeedAuth] = useState<"teacher" | "student" | null>(null);
  // Why a signed-in visitor still can't open it (for example, a share that needs a Google sign-in).
  const [authDetail, setAuthDetail] = useState<string | undefined>(undefined);
  const alive = useRef(true);
  const last = useRef("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/course/${courseId}${as ? (as.startsWith("guest:") ? `?guest=${encodeURIComponent(as.slice(6))}` : `?as=${as}${previewing() === as ? "&preview=1" : ""}`) : ""}`, { cache: "no-store" });
      const raw = await res.text();
      if (!alive.current) return;
      const data = JSON.parse(raw);
      if (!res.ok) {
        setError(data.error ?? "Couldn't load");
        setNeedAuth(data.needAuth ?? null);
        setAuthDetail(data.detail);
        return false;
      }
      else {
        setNeedAuth(null);
        // 内容没变就不更新，避免每次轮询都让整页重画
        if (raw !== last.current) {
          last.current = raw;
          // Today's lesson follows the lesson dates, in this browser's own calendar day.
          if (data?.course?.weeks) data.course.currentLessonId = todayLessonId(data.course);
          setState(data);
        }
        setError(null);
        return true;
      }
    } catch {
      if (alive.current) setError("Can't reach the server");
    }
    return false;
  }, [courseId, as]);

  // A change that found the session over: check again, which shows the sign-in prompt.
  useEffect(() => {
    const again = () => void refresh();
    window.addEventListener(SIGNED_OUT, again);
    return () => window.removeEventListener(SIGNED_OUT, again);
  }, [refresh]);

  useEffect(() => {
    alive.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 取数据后才更新状态
    refresh();
    // Live updates: the server pushes a message on every change. Polling stays on as a slow fallback.
    let pending: ReturnType<typeof setTimeout> | null = null;
    // A guest link reads the course without signing in, so it has no live stream: it just checks now and then.
    const es = typeof EventSource !== "undefined" && !as?.startsWith("guest:") ? new EventSource(`/api/course/${courseId}/stream`) : null;
    // In a busy class every answer is a change, and every page re-reads the course on each one: 30 students answering
    // together meant 30 × 30 reads. Changes that come close together are read once, at most once a second on a
    // student's page (twice on the teacher's).
    const gap = as ? 1000 : 500;
    let lastRead = 0;
    es?.addEventListener("change", () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        lastRead = Date.now();
        refresh();
      }, Math.max(120, lastRead + gap - Date.now()));
    });
    const t = setInterval(refresh, es ? Math.max(everyMs, 20000) : everyMs);
    // Coming back to this tab (after working in another one, or after the computer slept): read the course at once,
    // before anything is changed on an old copy. A hidden tab's timers and live stream can be held back by the browser.
    const back = () => { if (document.visibilityState === "visible") { lastRead = Date.now(); void refresh(); } };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
      es?.close();
      if (pending) clearTimeout(pending);
      clearInterval(t);
    };
  }, [refresh, everyMs, courseId, as]);

  return { state, error, refresh, needAuth, authDetail };
}

export function useConnectors() {
  const [list, setList] = useState<ConnectorInfo[]>([]);
  const refresh = useCallback(async () => {
    const res = await fetch("/api/connectors", { cache: "no-store" });
    setList((await res.json()).connectors);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 取数据后才更新状态
    refresh();
  }, [refresh]);
  return { connectors: list, refresh };
}

export type InvokeReply = { ok: true; result: ToolResult } | { ok: false; error: string; code?: string };

export async function invokeTool(body: Record<string, unknown>): Promise<InvokeReply> {
  try {
    const res = await fetch("/api/connectors/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch {
    return { ok: false, error: "Can't reach the server" };
  }
}

const noop = () => () => {};

/** 读取网址里的查询参数。服务器渲染时返回 null，到浏览器里才有值。 */
export function useQuery(): URLSearchParams | null {
  const search = useSyncExternalStore(noop, () => window.location.search, () => null);
  return search === null ? null : new URLSearchParams(search);
}

export type UploadReply = { ok: true; url: string; name: string; size: number; kind: "image" | "video" | "audio" | "file" } | { ok: false; error: string };

/**
 * Uploads a file. Online, it goes straight from the browser to storage (Cloudflare R2), so big videos never pass
 * through our server; on a computer without storage set up, it's sent to the server as before.
 */
export async function uploadFile(file: File, onProgress?: (fraction: number) => void): Promise<UploadReply> {
  try {
    const start = await fetch("/api/upload/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, type: file.type, size: file.size }) }).then((r) => r.json());
    if (!start.ok) return start;
    if (start.mode === "direct") {
      const sent = await new Promise<boolean>((resolve) => {
        const x = new XMLHttpRequest();
        x.open("PUT", start.put);
        x.setRequestHeader("Content-Type", start.type);
        x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
        x.onload = () => resolve(x.status >= 200 && x.status < 300);
        x.onerror = () => resolve(false);
        x.send(file);
      });
      if (!sent) return { ok: false, error: "Upload failed. Check your connection." };
      return await fetch("/api/upload/finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: start.key }) }).then((r) => r.json());
    }
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    return await res.json();
  } catch {
    return { ok: false, error: "Upload failed. Check your connection." };
  }
}
