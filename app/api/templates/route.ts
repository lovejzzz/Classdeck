import { canTeach, getSession, isAdmin, teacherOf, unauthorized } from "@/lib/auth";
import { db, save } from "@/lib/store";
import { uid } from "@/lib/profile";
import { fromCourse, info, MAX_TEMPLATE_BYTES, MAX_TEMPLATES, seedCaps } from "@/lib/mytemplates";

// The signed-in teacher's templates.
//   GET                                   → { templates: TemplateInfo[] } (newest first; the files themselves stay here)
//   POST { action: "save", courseId }     → a copy of the course as it is now, named after it
//   POST { action: "rename", id, name }   ·   POST { action: "delete", id }
//   POST { action: "share", id }          → { share } a copy of the template as it is now, kept once, to send in
//                                           messages (POST /api/inbox { action: "send", person, share })

const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

function mine(request: Request) {
  const session = getSession(request);
  const u = teacherOf(session);
  if (!u) return null;
  const d = db();
  const list = ((d.templates ??= {})[u.id] ??= []);
  // The site owner's CaPS flows move into their templates the first time they look.
  if (seedCaps(u, list, isAdmin(session))) save();
  return { session, u, list, d };
}

export async function GET(request: Request) {
  const m = mine(request);
  if (!m) return unauthorized("teacher", "Sign in first");
  return Response.json({ templates: [...m.list].sort((a, b) => b.at - a.at).map(info) });
}

export async function POST(request: Request) {
  const m = mine(request);
  if (!m) return unauthorized("teacher", "Sign in first");
  const body = await request.json().catch(() => ({}));
  const { list, u } = m;
  if (body.action === "save") {
    const course = m.d.courses[String(body.courseId ?? "")];
    if (!course || course.sample || !canTeach(m.session, course) || course.id === "demo") return fail("You can save a template from a course you teach", 403);
    if (list.length >= MAX_TEMPLATES) return fail(`You have ${MAX_TEMPLATES} templates, the most there can be. Delete one in Settings → Templates first.`);
    const t = fromCourse(course);
    if (JSON.stringify(t).length > MAX_TEMPLATE_BYTES) return fail("This course is too big to keep as a template");
    list.push(t);
    save(u.id);
    return Response.json({ ok: true, template: info(t) });
  }
  const t = list.find((x) => x.id === String(body.id ?? ""));
  if (!t) return fail("That template isn’t there any more", 404);
  if (body.action === "share") {
    const d = m.d;
    d.shares ??= {};
    const id = uid("sh-");
    d.shares[id] = { id, by: u.id, at: Date.now(), template: structuredClone(t) };
    save(id);
    return Response.json({ ok: true, share: id });
  }
  if (body.action === "rename") {
    const name = String(body.name ?? "").trim().slice(0, 80);
    if (!name) return fail("Give the template a name");
    t.name = name;
  } else if (body.action === "delete") {
    m.d.templates[u.id] = list.filter((x) => x !== t);
  } else return fail("Unknown action");
  save(u.id);
  return Response.json({ ok: true });
}
