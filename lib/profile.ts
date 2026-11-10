import type { Lesson, Module, PresetId, Profile } from "./types";

export const PRESETS: Record<PresetId, Omit<Profile, "preset">> = {
  primary: { density: "spacious", autonomy: "sequential", horizon: "lesson", entry: "code" },
  secondary: { density: "comfortable", autonomy: "free", horizon: "week", entry: "code" },
  higher: { density: "compact", autonomy: "free", horizon: "term", entry: "account" },
};

export const PRESET_LABELS: Record<PresetId, string> = {
  primary: "Elementary",
  secondary: "Middle & high school",
  higher: "College & adult",
};

export function fromPreset(id: PresetId): Profile {
  return { preset: id, ...PRESETS[id] };
}

/**
 * The cards one student actually sees in a lesson.
 * Teacher-assigned versions show only the assigned one. In a choice slot the student sees every
 * version until they pick one; after that, only their pick.
 */
export function visibleModules(lesson: Lesson, studentId: string, chosen: Record<string, string> = {}): Module[] {
  const firstVariant: Record<string, string> = {};
  const counts: Record<string, number> = {};
  for (const m of lesson.modules) {
    if (m.audience.kind !== "branch") continue;
    if (!(m.audience.slot in firstVariant)) firstVariant[m.audience.slot] = m.audience.variant;
    counts[m.audience.slot] = (counts[m.audience.slot] ?? 0) + 1;
  }
  const out: Module[] = [];
  for (const m of lesson.modules) {
    const a = m.audience;
    if (a.kind === "all") out.push(m);
    else if (a.kind === "student") {
      if (a.studentId === studentId) out.push(m);
    } else {
      const recommended = lesson.branches[a.slot]?.[studentId] ?? firstVariant[a.slot];
      if (lesson.choiceSlots?.includes(a.slot)) {
        const pick = chosen[a.slot];
        const suggested = lesson.branches[a.slot]?.[studentId];
        if (!pick) out.push({ ...m, choice: { slot: a.slot, variant: a.variant, recommended: a.variant === suggested, count: counts[a.slot] } });
        else if (pick === a.variant) out.push({ ...m, picked: true });
      } else if (a.variant === recommended) out.push(m);
    }
  }
  return out;
}

export function slotVariants(lesson: Lesson): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of lesson.modules) {
    if (m.audience.kind !== "branch") continue;
    const list = (out[m.audience.slot] ??= []);
    if (!list.includes(m.audience.variant)) list.push(m.audience.variant);
  }
  return out;
}

export function findLesson(course: { weeks: { lessons: Lesson[] }[] }, lessonId: string) {
  for (const w of course.weeks) for (const l of w.lessons) if (l.id === lessonId) return l;
  return undefined;
}

export function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 9);
}

import type { WallSettings } from "./types";
export const DEFAULT_WALL: WallSettings = { posting: "students", comments: true, reactions: "likes", anonymous: false, approval: false };
export const wallOf = (m: { wall?: WallSettings }): WallSettings => ({ ...DEFAULT_WALL, ...m.wall });
