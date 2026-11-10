"use client";

import { useEffect, useState } from "react";
import type { Note } from "../NotificationCenter";
import type { Course } from "@/lib/types";

// 学生端的通知：老师给你加了新卡片、换了今天的课。
// 在浏览器里记住上次看到的模块，和这次对比。这只是给这台设备的便利，丢了也不影响学习。

interface Saved {
  known: string[];
  lesson: string;
  notes: Note[];
  seenAt: number;
}

export function useInbox(course: Course | undefined, studentId: string) {
  const key = course ? `inbox:v2:${course.id}:${studentId}` : "";
  const [saved, setSaved] = useState<Saved | null>(null);

  useEffect(() => {
    if (!course) return;
    let prev: Saved | null = null;
    try {
      prev = JSON.parse(localStorage.getItem(key) ?? "null");
    } catch {}
    const lessons = course.weeks.flatMap((w) => w.lessons);
    const all = lessons.flatMap((l) => l.modules.map((m) => ({ m, l })));
    const now = Date.now();
    let next: Saved;
    // If most of what we remembered no longer exists, the course was reset or replaced:
    // start over quietly instead of announcing every card as new.
    const ids = new Set(all.map((x) => x.m.id));
    const stillThere = prev ? prev.known.filter((id) => ids.has(id)).length : 0;
    if (prev && prev.known.length > 0 && stillThere < prev.known.length / 2) prev = null;
    if (!prev) {
      next = { known: all.map((x) => x.m.id), lesson: course.currentLessonId, notes: [], seenAt: now };
    } else {
      const known = new Set(prev.known);
      const fresh: Note[] = all
        .filter((x) => !known.has(x.m.id))
        .map((x) => ({
          id: `m:${x.m.id}`, at: now, group: x.l.id, groupLabel: x.l.title, source: x.l.title,
          icon: x.m.type, title: "Your teacher added a card", text: x.m.title,
        }));
      if (prev.lesson !== course.currentLessonId) {
        const l = lessons.find((x) => x.id === course.currentLessonId);
        fresh.push({ id: `l:${course.currentLessonId}:${now}`, at: now, group: "lesson", groupLabel: "Course", source: "Course", icon: "layers", title: "Today’s lesson changed", text: l?.title ?? "" });
      }
      if (fresh.length === 0) return;
      next = { known: all.map((x) => x.m.id), lesson: course.currentLessonId, notes: [...fresh, ...prev.notes].slice(0, 30), seenAt: prev.seenAt };
    }
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 与浏览器存储同步
    setSaved(next);
  }, [course, key]);

  useEffect(() => {
    if (!key) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 首次读取浏览器存储
      setSaved(JSON.parse(localStorage.getItem(key) ?? "null"));
    } catch {}
  }, [key]);

  const unread = (saved?.notes ?? []).filter((n) => n.at > (saved?.seenAt ?? 0));
  function clear() {
    if (!saved) return;
    const next = { ...saved, seenAt: Date.now() };
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
    setSaved(next);
  }
  return { notes: unread, clear };
}
