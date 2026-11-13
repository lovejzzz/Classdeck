import crypto from "crypto";
import { PURPOSES, SCENARIOS } from "./onboarding";
import { findLesson, uid } from "./profile";
import { db, logEvent } from "./store";
import type { Attachment, Course, ExternalUpdate, Lesson, Module, Plan, Student } from "./types";

// Updates from outside tools: a Google Form (through a small Apps Script), a CSV of form
// responses, or any script that can send JSON. One item either sets a student's choices
// (electives, path, plan) or posts feedback, scores, and links to one of their cards, or both.

export interface HookItem {
  /** Your own id for this response (e.g. the form response id). Sending it twice changes nothing. */
  id?: string;
  student?: { id?: string; email?: string; name?: string };
  studentId?: string; email?: string; name?: string;
  /** Add the student to the class if no one matches. Default: yes for choices, no for card updates. */
  create?: boolean;
  electives?: string[] | string;
  path?: string;
  paths?: Record<string, string>;
  plan?: { purposes?: string[] | string; purposeNote?: string; goal?: string; objectives?: ({ lo: string; lm?: string } | string)[] | string; confidence?: Record<string, number | string> };
  card?: string;
  source?: string;
  feedback?: string;
  next?: string;
  scores?: Record<string, number | string>;
  score?: number | string | { value: number; max?: number };
  max?: number | string;
  links?: (string | { title?: string; url: string })[] | string;
  status?: string;
}

export interface HookResult {
  ok: boolean; student?: string; card?: string; did: string[]; warnings: string[]; error?: string;
  /** For a student who hasn't signed in yet: their one-time link to set a PIN and open their board. */
  link?: string; email?: string;
}

const INVITE_DAYS = 14;

/** A one-time link for a student to set their PIN. Replaces any earlier link for them. */
export function issueInvite(st: Student): string {
  const token = crypto.randomBytes(24).toString("base64url");
  st.invite = { hash: sha(token), exp: Date.now() + INVITE_DAYS * 86400_000 };
  return token;
}

export function findInvite(course: Course, token: string): Student | undefined {
  if (!token) return undefined;
  const h = Buffer.from(sha(token), "hex");
  return course.students.find((s) => {
    if (!s.invite || s.invite.exp < Date.now()) return false;
    const b = Buffer.from(s.invite.hash, "hex");
    return b.length === h.length && crypto.timingSafeEqual(b, h);
  });
}

export const inviteUrl = (origin: string, courseId: string, token: string) => `${origin}/learn/${courseId}/welcome#${token}`;

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map(String) : String(v ?? "").split(/\s*[\n;]\s*|,\s+(?=[A-Z0-9])/)).map((x) => x.trim()).filter(Boolean);

/** A new key for outside tools. The full key is shown to the teacher once; we keep only its hash. */
export function newHookKey() {
  const token = `cdk_${crypto.randomBytes(24).toString("base64url")}`;
  return { token, hook: { hash: sha(token), hint: token.slice(-4), createdAt: Date.now() } };
}

export function checkHookKey(course: Course, token: string | null): boolean {
  const h = course.access?.hook?.hash;
  if (!h || !token) return false;
  const a = Buffer.from(sha(token), "hex");
  const b = Buffer.from(h, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Levels as numbers 1–4 from "3", "3 · Meeting the goal", or a level name. */
function parseLevel(course: Course, v: unknown): number | undefined {
  const s = String(v ?? "").trim();
  const n = s.match(/^([1-4])(?:\b|$)/)?.[1];
  if (n) return Number(n);
  const lv = course.levels?.find((l) => s && norm(s).startsWith(norm(l.name)));
  return lv?.n;
}

function skillOf(course: Course, key: string) {
  const k = norm(key);
  return course.skills?.find((s) => norm(s.id) === k || norm(s.name) === k || k.includes(norm(s.name)) || (k.length >= 4 && norm(s.name).startsWith(k)));
}

/**
 * Turns one response row (column header → answer), as Google Forms or its CSV export gives it,
 * into an item. Headers are matched loosely, so teachers only need to word questions sensibly.
 */
export function rowToItem(course: Course, row: Record<string, unknown>): HookItem {
  const item: HookItem = {};
  const plan: NonNullable<HookItem["plan"]> = {};
  const scores: Record<string, number> = {};
  let stamp = "";
  for (const [rawKey, rawVal] of Object.entries(row)) {
    const val = (Array.isArray(rawVal) ? rawVal.join(", ") : String(rawVal ?? "")).trim();
    const key = norm(rawKey);
    if (/^(timestamp|submitted at)$/.test(key)) { stamp = val; continue; }
    if (!val || !key) continue;
    const bracket = rawKey.match(/\[([^\]]+)\]\s*$/)?.[1];
    // Grid questions arrive as "Question [Row]".
    if (/confiden/.test(key)) {
      const label = norm(bracket ?? rawKey);
      const sc = SCENARIOS.find(([k, l]) => label.includes(k) || label.includes(norm(l)) || (k === "impromptu" && label.includes("unexpected")));
      const n = Number(val.match(/[1-5]/)?.[0]);
      if (sc && n) (plan.confidence ??= {})[sc[0]] = n;
      continue;
    }
    const sk = skillOf(course, bracket ?? rawKey);
    const lvl = parseLevel(course, val);
    if (sk && lvl && (bracket || !/feedback|comment|note|observ/.test(key))) { scores[sk.id] = lvl; continue; }
    if (/questhand id|classdeck id|student id/.test(key)) item.studentId = val;
    else if (/e ?mail/.test(key)) item.email = val;
    else if (/^(your |student |full )?name\b|^name$|^student$/.test(key)) item.name = val;
    else if (/elective/.test(key)) item.electives = val;
    else if (/\b(path|track|version)\b/.test(key)) item.path = val;
    else if (/why|purpose|brings you|reason/.test(key)) plan.purposes = val;
    else if (/objective|learn to/.test(key)) plan.objectives = val;
    else if (/\bgoal\b/.test(key)) plan.goal = val;
    else if (/^(card|activity|which card|which activity|session|workshop)\b/.test(key)) item.card = val;
    else if (/source|form name/.test(key)) item.source = val;
    else if (/try next|next step|to try/.test(key)) item.next = val;
    else if (/feedback|comment|observ|note/.test(key)) item.feedback = item.feedback ? `${item.feedback}\n${val}` : val;
    else if (/^(total )?(score|points|mark)s?$|^grade$/.test(key)) item.score = val;
    else if (/out of|max(imum)? (score|points)/.test(key)) item.max = val;
    else if (/link|url|recording|slides/.test(key)) item.links = [...list(item.links ?? []), ...val.split(/\s+/)];
    else if (/status|complete|finished/.test(key)) item.status = val;
    else if (/^id$|response id/.test(key)) item.id = val;
  }
  // A CSV export has no response ids; timestamp + person makes importing the same file twice harmless.
  if (!item.id && stamp) item.id = `t:${stamp}:${item.email ?? item.name ?? item.studentId ?? ""}`.slice(0, 80);
  if (Object.keys(plan).length) item.plan = plan;
  if (Object.keys(scores).length) item.scores = scores;
  return item;
}

function findStudent(course: Course, item: HookItem): Student | undefined {
  const s = { id: item.studentId, email: item.email, name: item.name, ...item.student };
  if (s.id) { const hit = course.students.find((x) => x.id === s.id); if (hit) return hit; }
  if (s.email) { const hit = course.students.find((x) => x.email && x.email.toLowerCase() === s.email!.trim().toLowerCase()); if (hit) return hit; }
  if (s.name) {
    const hits = course.students.filter((x) => norm(x.name) === norm(s.name!));
    if (hits.length === 1) return hits[0];
  }
}

function findCard(course: Course, ref: string): { lesson: Lesson; m: Module } | undefined {
  const cards = course.weeks.flatMap((w) => w.lessons.flatMap((lesson) => lesson.modules.map((m) => ({ w, lesson, m }))));
  const byId = cards.find((c) => c.m.id === ref.trim());
  if (byId) return byId;
  // "Week 2 · Build my talk" narrows to that week.
  const [weekPart, titlePart] = ref.includes("·") ? ref.split("·").map((x) => x.trim()) : ["", ref];
  const pool = weekPart ? cards.filter((c) => norm(c.w.title).startsWith(norm(weekPart))) : cards;
  const t = norm(titlePart);
  const exact = pool.filter((c) => norm(c.m.title) === t);
  if (exact.length === 1) return exact[0];
  const part = pool.filter((c) => norm(c.m.title).includes(t) || (t.length > 6 && t.includes(norm(c.m.title))));
  return part.length === 1 ? part[0] : undefined;
}

/** Applies one item to the course. Call save() after a batch. */
export function applyItem(courseId: string, raw: HookItem, origin = ""): HookResult {
  const d = db();
  const course = d.courses[courseId];
  const did: string[] = [];
  const warnings: string[] = [];
  const res = (r: Partial<HookResult>): HookResult => ({ ok: true, did, warnings, ...r });
  if (!course) return res({ ok: false, error: "No such course" });
  const item = raw ?? {};
  const wantsChoices = item.electives !== undefined || !!item.path || !!item.paths || !!item.plan;
  const name = String(item.student?.name ?? item.name ?? "").trim().slice(0, 60);
  const email = String(item.student?.email ?? item.email ?? "").trim().toLowerCase().slice(0, 120) || undefined;

  let st = findStudent(course, item);
  if (!st) {
    if ((item.create ?? wantsChoices) && name && course.students.length < 500) {
      st = { id: uid("s-"), name, email };
      course.students.push(st);
      const g = course.groups?.length ? [...course.groups].sort((a, b) => a.studentIds.length - b.studentIds.length)[0] : undefined;
      g?.studentIds.push(st.id);
      did.push(`added ${name} to the class${g ? ` (${g.name})` : ""}`);
    } else {
      return res({ ok: false, error: name || email ? `No student matches ${name || email}` : "Say which student: name, email, or Questhand id" });
    }
  } else if (email && !st.email) st.email = email;

  // A student who hasn't set a PIN yet gets a private link to their board from the form that set it up.
  let link: string | undefined;
  if (wantsChoices && origin && !d.pins[courseId]?.[st.id]) {
    link = inviteUrl(origin, courseId, issueInvite(st));
    did.push("made a sign-in link");
  }
  const who = { student: st.name, link, email: link ? st.email : undefined };

  const prog = ((d.progress[courseId] ??= {})[st.id] ??= {});
  const choices = ((d.choices[courseId] ??= {})[st.id] ??= {});

  // —— choices ——
  if (item.electives !== undefined) {
    const electives = course.weeks.flatMap((w) => w.lessons).filter((l) => l.elective);
    const picked = new Set<string>();
    for (const want of list(item.electives)) {
      const w = norm(want);
      const hit = electives.find((l) => l.id === want || norm(l.title) === w) ?? electives.find((l) => w.includes(norm(l.title)) || norm(l.title).includes(w));
      if (hit) picked.add(hit.id);
      else warnings.push(`No elective called “${want}”`);
    }
    for (const l of electives) {
      if (picked.has(l.id)) choices[`elective:${l.id}`] = "yes";
      else delete choices[`elective:${l.id}`];
    }
    did.push(`electives: ${electives.filter((l) => picked.has(l.id)).map((l) => l.title).join(", ") || "none"}`);
  }
  const variantsOf = (l: Lesson, slot: string) => [...new Set(l.modules.flatMap((m) => (m.audience.kind === "branch" && m.audience.slot === slot ? [m.audience.variant] : [])))];
  const setPath = (l: Lesson, slot: string, want: string) => {
    const v = variantsOf(l, slot).find((x) => norm(want).includes(norm(x)));
    if (v) choices[slot] = v;
    return v;
  };
  if (item.path) {
    const set = new Set<string>();
    for (const l of course.weeks.flatMap((w) => w.lessons)) for (const slot of l.choiceSlots ?? []) { const v = setPath(l, slot, item.path); if (v) set.add(v); }
    if (set.size) did.push(`path: ${[...set].join(", ")}`);
    else warnings.push(`No path called “${item.path}”`);
  }
  for (const [where, want] of Object.entries(item.paths ?? {})) {
    const w = course.weeks.find((x) => norm(x.title).startsWith(norm(where)) || x.id === where);
    const lessons = w ? w.lessons : [findLesson(course, where)].filter((x): x is Lesson => !!x);
    const ok = lessons.some((l) => (l.choiceSlots ?? []).some((slot) => setPath(l, slot, want)));
    if (ok) did.push(`path in ${where}: ${want}`);
    else warnings.push(`Couldn’t set the path in “${where}”`);
  }
  if (item.plan) {
    const plans = (d.plans[courseId] ??= {});
    const prev: Plan = plans[st.id] ?? { purposes: [], objectives: [], confidence: {}, updatedAt: Date.now() };
    const p = item.plan;
    const purposes = p.purposes !== undefined ? list(p.purposes) : undefined;
    const known = purposes?.filter((x) => PURPOSES.some((y) => norm(y) === norm(x))).map((x) => PURPOSES.find((y) => norm(y) === norm(x))!);
    const other = purposes?.filter((x) => !PURPOSES.some((y) => norm(y) === norm(x)));
    const conf: Record<string, number> = { ...prev.confidence };
    for (const [k, v] of Object.entries(p.confidence ?? {})) {
      const n = Number(String(v).match(/[1-5]/)?.[0]);
      if (SCENARIOS.some(([sk]) => sk === k) && n) conf[k] = n;
    }
    const objectives = p.objectives === undefined ? prev.objectives
      : (typeof p.objectives === "string" ? list(p.objectives) : p.objectives).slice(0, 3).map((o, i) => {
        const [lo, lm] = typeof o === "string" ? o.split(/\s+(?:—|–|-|\|)\s+|\s*\bmeasure:\s*/i) : [o.lo, o.lm];
        return { id: `lo-${i + 1}`, lo: String(lo ?? "").slice(0, 300), lm: String(lm ?? "").slice(0, 300) };
      }).filter((o) => o.lo);
    plans[st.id] = {
      ...prev,
      purposes: known ?? prev.purposes,
      purposeNote: other?.length ? [p.purposeNote, ...other].filter(Boolean).join("; ").slice(0, 400) : p.purposeNote?.slice(0, 400) ?? prev.purposeNote,
      goal: p.goal?.slice(0, 400) ?? prev.goal,
      objectives,
      confidence: conf,
      confidenceStart: prev.confidenceStart ?? (Object.keys(conf).length ? conf : undefined),
      updatedAt: Date.now(),
    };
    did.push("plan");
  }

  // —— an update to one card ——
  if (!item.card) {
    if (item.feedback || item.scores || item.links || item.score !== undefined) return res({ ok: wantsChoices, ...who, error: wantsChoices ? undefined : "Say which card this is for (its title or id)" });
    if (!did.length) return res({ ok: false, ...who, error: "Nothing to do: no choices or card update found" });
    return res(who);
  }
  const found = findCard(course, item.card);
  if (!found) return res({ ok: false, ...who, error: `No card matches “${item.card}”` });
  const upId = String(item.id ?? "").slice(0, 80) || uid("u-");
  if (prog[found.m.id]?.updates?.some((u) => u.id === upId)) return res({ student: st.name, card: found.m.title, did: ["already received"] });

  const levels: Record<string, number> = {};
  for (const [k, v] of Object.entries(item.scores ?? {})) {
    const sk = skillOf(course, k);
    const n = parseLevel(course, v);
    if (sk && n) levels[sk.id] = n;
    else warnings.push(`Skipped score “${k}: ${v}”`);
  }
  let score: ExternalUpdate["score"];
  if (item.score !== undefined && item.score !== "") {
    const s = typeof item.score === "object" ? item.score : { value: Number(String(item.score).match(/-?\d+(\.\d+)?/)?.[0]), max: Number(String(item.score).match(/\/\s*(\d+(\.\d+)?)/)?.[1] ?? item.max) || undefined };
    if (Number.isFinite(s.value)) score = { value: s.value, max: Number(s.max) > 0 ? Number(s.max) : undefined };
  }
  const links = (typeof item.links === "string" ? item.links.split(/\s+/) : item.links ?? []).map((l) => (typeof l === "string" ? { url: l } : l))
    .filter((l) => /^https:\/\//i.test(l?.url ?? "")).slice(0, 8).map((l) => ({ url: l.url.slice(0, 1000), title: l.title?.slice(0, 120) }));
  const up: ExternalUpdate = {
    id: upId, source: String(item.source ?? "Form").slice(0, 80), at: Date.now(),
    text: item.feedback ? String(item.feedback).slice(0, 3000) : undefined,
    next: item.next ? String(item.next).slice(0, 1000) : undefined,
    levels: Object.keys(levels).length ? levels : undefined, score, links: links.length ? links : undefined,
  };
  const r = postUpdate(courseId, st, found.m, up, item.status ?? "");
  if (r.error) return res({ ok: false, student: st.name, card: found.m.title, error: r.error });
  did.push(...r.did);
  warnings.push(...r.warnings);
  return res({ ...who, card: found.m.title });
}

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

/** Up to 300 per call. Each is a form row (header → answer), { row, id?, source?, card? }, or a HookItem. */
export function applyMany(courseId: string, course: Course, rows: unknown[], origin = ""): HookResult[] {
  const ITEM_KEYS = ["card", "student", "studentId", "electives", "plan", "path", "paths", "feedback", "scores"];
  return rows.slice(0, 300).map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    let item: HookItem;
    if (o.row && typeof o.row === "object") {
      item = rowToItem(course, o.row as Record<string, unknown>);
      // Fixed values set in the Apps Script (e.g. this form is always "Workshop 2") fill any gaps.
      item.id ??= o.id ? String(o.id) : undefined;
      item.source ??= o.source ? String(o.source) : undefined;
      item.card ??= o.card ? String(o.card) : undefined;
      item.status ??= o.status ? String(o.status) : undefined;
    } else item = ITEM_KEYS.some((k) => k in o) ? (o as HookItem) : rowToItem(course, o);
    try {
      return applyItem(courseId, item, origin);
    } catch {
      return { ok: false, did: [], warnings: [], error: "Couldn’t read this one" };
    }
  });
}
