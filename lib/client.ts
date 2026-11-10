"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ConnectorInfo, ToolResult } from "./connectors/types";
import type { CourseState } from "./types";

export async function op<T = Record<string, unknown>>(courseId: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/course/${courseId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** 读取课程，并每隔几秒刷新一次（原型用轮询代替实时推送）。 */
export function useCourse(courseId: string, as?: string, everyMs = 4000) {
  const [state, setState] = useState<CourseState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const last = useRef("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/course/${courseId}${as ? (as.startsWith("guest:") ? `?guest=${encodeURIComponent(as.slice(6))}` : `?as=${as}`) : ""}`, { cache: "no-store" });
      const raw = await res.text();
      if (!alive.current) return;
      const data = JSON.parse(raw);
      if (!res.ok) setError(data.error ?? "Couldn't load");
      else {
        // 内容没变就不更新，避免每次轮询都让整页重画
        if (raw !== last.current) {
          last.current = raw;
          setState(data);
        }
        setError(null);
      }
    } catch {
      if (alive.current) setError("Can't reach the server");
    }
  }, [courseId, as]);

  useEffect(() => {
    alive.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 取数据后才更新状态
    refresh();
    // Live updates: the server pushes a message on every change. Polling stays on as a slow fallback.
    let pending: ReturnType<typeof setTimeout> | null = null;
    const es = typeof EventSource !== "undefined" ? new EventSource(`/api/course/${courseId}/stream`) : null;
    es?.addEventListener("change", () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        refresh();
      }, 120);
    });
    const t = setInterval(refresh, es ? Math.max(everyMs, 20000) : everyMs);
    return () => {
      alive.current = false;
      es?.close();
      if (pending) clearTimeout(pending);
      clearInterval(t);
    };
  }, [refresh, everyMs, courseId]);

  return { state, error, refresh };
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

export async function uploadFile(file: File): Promise<UploadReply> {
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/upload", { method: "POST", body: form });
    return await res.json();
  } catch {
    return { ok: false, error: "Upload failed. Check your connection." };
  }
}
