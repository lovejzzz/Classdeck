import { toCourseFile } from "./coursefile";
import { capsFlow1, capsFlow2 } from "./capsflows";
import { kindOf, isPoll } from "./kinds";
import { uid } from "./profile";
import type { Template, User } from "./store";
import type { Course, Module } from "./types";

/** A teacher's templates (Settings → Templates, and New course): saved from a course, kept as course files. */

export const MAX_TEMPLATES = 40;
/** The largest template, as JSON (a big course is well within it). */
export const MAX_TEMPLATE_BYTES = 2_000_000;

/** One card on a template's preview: what kind it is, and whether it's dealt by an answer (a branch) or a group. */
export type OutlineCard = { title: string; kind: string; poll?: boolean; branch?: boolean; cards?: number };
export type Outline = { weeks: number; lessons: number; cards: number; rows: { week: string; lesson: string; cards: OutlineCard[] }[] };
/** What a browser gets: everything but the file itself. */
export type TemplateInfo = Omit<Template, "file"> & { outline: Outline };

/** A template's shape, for drawing its preview: each lesson as a row of cards (a card group's cards inside it). */
export function outline(file: Template["file"]): Outline {
  const rows: Outline["rows"] = [];
  let cards = 0;
  for (const w of file.weeks ?? []) for (const l of w.lessons ?? []) {
    const mods = (l.modules ?? []) as Module[];
    const inGroup = new Set(mods.flatMap((m) => (kindOf(m) === "group" ? m.members ?? [] : [])));
    cards += mods.filter((m) => kindOf(m) !== "group").length;
    rows.push({
      week: w.title, lesson: l.title,
      cards: mods.filter((m) => !inGroup.has(m.id)).map((m) => {
        const kind = kindOf(m);
        return { title: m.title, kind, ...(isPoll(m) ? { poll: true } : {}), ...(m.audience?.kind === "branch" ? { branch: true } : {}), ...(kind === "group" ? { cards: (m.members ?? []).length } : {}) };
      }),
    });
  }
  return { weeks: (file.weeks ?? []).length, lessons: rows.length, cards, rows };
}

export const info = (t: Template): TemplateInfo => { const { file, ...rest } = t; return { ...rest, outline: outline(file) }; };

/** A course as a template: a copy of its weeks, lessons and cards as they are now, its cover too. */
export function fromCourse(course: Course, name?: string): Template {
  const file = toCourseFile(course) as unknown as Template["file"];
  return { id: uid("tp-"), name: (name ?? course.title).trim().slice(0, 80) || course.title, ...(course.subtitle ? { subtitle: course.subtitle } : {}), ...(course.cover ? { cover: course.cover } : {}), file, at: Date.now(), from: course.id };
}

/**
 * The site owner's CaPS flows were built into New course. They become two ordinary templates in the owner's account,
 * once (afterwards they can be renamed, changed or deleted like any other). Returns whether anything was added.
 */
export function seedCaps(u: User, list: Template[], owner: boolean): boolean {
  if (!owner || u.capsSeeded) return false;
  u.capsSeeded = true;
  const now = Date.now();
  for (const [f, name] of [[capsFlow1(), "CaPS Flow 1: three tracks"], [capsFlow2(), "CaPS Flow 2: sequenced"]] as const) {
    list.push({ id: uid("tp-"), name, ...(f.subtitle ? { subtitle: f.subtitle } : {}), file: { format: "questhand-course", version: 1, ...f } as unknown as Template["file"], at: now });
  }
  return true;
}
