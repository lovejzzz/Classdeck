import crypto from "crypto";
import { uid } from "./profile";
import { db, logEvent } from "./store";
import type { Attachment, Course, ExternalUpdate, Module, Student } from "./types";

// Student invitation links, and updates posted onto a student's card (a teacher's form, class session notes).

const INVITE_DAYS = 120;
/** Links kept per student: a new one (sent again, copied) doesn't break the ones already in their inbox. */
const KEEP_LINKS = 5;

/** A student's own sign-in link: opening it signs them in to their board, as often as they need, until it expires. */
export function issueInvite(st: Student): string {
  const token = crypto.randomBytes(24).toString("base64url");
  const now = Date.now();
  const live = liveInvites(st, now);
  st.invites = [...live, { hash: sha(token), exp: now + INVITE_DAYS * 86400_000 }].slice(-KEEP_LINKS);
  st.invite = undefined;
  return token;
}

/** The student's links that still work (including one from before links could be reused). */
export const liveInvites = (st: Student, now = Date.now()) => [...(st.invite ? [st.invite] : []), ...(st.invites ?? [])].filter((x) => x.exp > now);

/** Turn off every link a student has (their teacher reset their sign-in). */
export function revokeInvites(st: Student) {
  st.invite = undefined;
  st.invites = undefined;
}

export function findInvite(course: Course, token: string): Student | undefined {
  if (!token) return undefined;
  const h = Buffer.from(sha(token), "hex");
  return course.students.find((s) =>
    liveInvites(s).some((x) => {
      const b = Buffer.from(x.hash, "hex");
      return b.length === h.length && crypto.timingSafeEqual(b, h);
    }),
  );
}

export const inviteUrl = (origin: string, courseId: string, token: string) => `${origin}/learn/${courseId}/welcome#${token}`;

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
/**
 * Puts an update on one student's card: feedback, levels, a score, links (also added to their
 * work), and answers. A status of done / revise moves the card. An update with the same id is replaced.
 */
export function postUpdate(courseId: string, st: Student, m: Module, up: ExternalUpdate, rawStatus: string): { did: string[]; warnings: string[]; error?: string } {
  const did: string[] = [];
  const warnings: string[] = [];
  const prog = ((db().progress[courseId] ??= {})[st.id] ??= {});
  const has = !!(up.text || up.next || up.levels || up.score || up.links || up.answers?.length);
  if (!has && !rawStatus) return { did, warnings, error: "Nothing to post: add feedback, scores, links, or a status" };
  const p = (prog[m.id] ??= { status: "todo", updatedAt: Date.now() });
  const kept = (p.updates ?? []).filter((u) => u.id !== up.id);
  if (has) {
    p.updates = [...kept, up].slice(-30);
    did.push([up.text || up.next ? "feedback" : "", up.levels ? "skill levels" : "", up.score ? "score" : "", up.links ? `${up.links.length} link${up.links.length === 1 ? "" : "s"}` : "", up.answers?.length ? "answers" : ""].filter(Boolean).join(", "));
  } else if (kept.length !== (p.updates ?? []).length) p.updates = kept;
  // Links also become part of the work on that card.
  for (const l of up.links ?? []) {
    if ((p.work ?? []).some((w) => w.url === l.url)) continue;
    const a: Attachment = { id: uid("w-"), kind: "link", url: l.url, name: l.title || `${up.source} link` };
    p.work = [...(p.work ?? []), a].slice(-12);
  }
  const status = norm(rawStatus);
  if (status) {
    if (/revis|redo|again/.test(status)) {
      // Keep any rubric levels already given; the update's own levels are on the update.
      p.review = { verdict: "revise", text: up.text || up.next || "Please revise this one.", at: Date.now(), levels: p.review?.levels };
      if (p.status === "done") p.status = "doing";
      did.push("asked to revise");
    } else if (/^(done|complete|completed|yes|finished|pass|passed|attended|true)/.test(status)) {
      if (p.status !== "done") logEvent(courseId, { kind: "done", studentId: st.id, moduleId: m.id, text: `Finished “${m.title}” (${up.source})` });
      p.status = "done";
      did.push("marked done");
    } else if (/progress|started|doing/.test(status)) {
      if (p.status === "todo") p.status = "doing";
    } else warnings.push(`Unknown status “${rawStatus}”`);
  } else if (p.status === "todo") p.status = "doing";
  p.updatedAt = Date.now();
  return { did, warnings };
}
