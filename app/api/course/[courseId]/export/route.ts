import { publicOrigin } from "@/lib/origin";
import { canTeach, getSession, unauthorized } from "@/lib/auth";
import { db } from "@/lib/store";
import { TYPE_META } from "@/lib/ui";
import { zip } from "@/lib/zip";
import type { Attachment, Lesson, Module, Week } from "@/lib/types";

// Export a course as an IMS Common Cartridge (1.1): one web page per lesson, organised into
// one module per week. Canvas, Moodle, Blackboard, Brightspace, and Schoology import these.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function mediaHtml(a: Attachment, origin: string) {
  const url = a.url.startsWith("/") ? origin + a.url : a.url;
  const label = esc(a.name || a.kind);
  if (a.kind === "image") return `<p><img src="${esc(url)}" alt="${label}" style="max-width:100%"></p>`;
  return `<p><a href="${esc(url)}">${label}</a> (${a.kind})</p>`;
}

function cardHtml(m: Module, origin: string) {
  const parts = [`<h2>${esc(m.title)} <small style="color:#777">· ${TYPE_META[m.type].name}${m.minutes ? ` · ${m.minutes} min` : ""}</small></h2>`];
  if (m.audience.kind === "branch") parts.push(`<p><em>Path: ${esc(m.audience.variant)}</em></p>`);
  if (m.body) parts.push(...m.body.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`));
  for (const a of m.attachments ?? []) parts.push(mediaHtml(a, origin));
  if (m.checklist?.length) parts.push(`<ul>${m.checklist.map((c) => `<li>☐ ${esc(c)}</li>`).join("")}</ul>`);
  if (m.prompts?.length) parts.push(`<ol>${m.prompts.map((c) => `<li>${esc(c)}</li>`).join("")}</ol>`);
  if (m.questions?.length) {
    parts.push(`<ol>${m.questions.map((q) => `<li>${esc(q.text)}${q.options.length && q.kind !== "short" ? `<ul>${q.options.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ol>`);
  }
  if (m.criteria) parts.push(`<p><strong>Done when:</strong> ${esc(m.criteria)}</p>`);
  if (m.due) parts.push(`<p><strong>Due:</strong> ${esc(m.due)}</p>`);
  return parts.join("\n");
}

function lessonPage(w: Week, l: Lesson, origin: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(`${w.title}: ${l.title}`)}</title></head>
<body style="font-family:system-ui,sans-serif;line-height:1.55;max-width:760px">
<h1>${esc(l.title)}</h1>
${l.goal ? `<p><strong>Goal:</strong> ${esc(l.goal)}</p>` : ""}
${l.session ? `<p><strong>Group session (${l.session.minutes} min):</strong> ${l.session.agenda.map((a) => `${esc(a.label)} ${a.minutes}`).join(" · ")}</p>` : ""}
${l.modules.map((m) => cardHtml(m, origin)).join("\n<hr>\n")}
</body></html>`;
}

export async function GET(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const course = db().courses[courseId];
  if (!course) return new Response("No such course", { status: 404 });
  if (!canTeach(getSession(request), course)) return unauthorized("teacher");
  const origin = publicOrigin(request);
  const files: { name: string; data: string }[] = [];
  const items: string[] = [];
  const resources: string[] = [];
  course.weeks.forEach((w, wi) => {
    const children: string[] = [];
    w.lessons.forEach((l, li) => {
      const id = `res_${wi}_${li}`;
      const href = `web_resources/week${wi}/lesson${li}.html`;
      files.push({ name: href, data: lessonPage(w, l, origin) });
      resources.push(`<resource identifier="${id}" type="webcontent" href="${href}"><file href="${href}"/></resource>`);
      children.push(`<item identifier="item_${wi}_${li}" identifierref="${id}"><title>${esc(l.title)}</title></item>`);
    });
    items.push(`<item identifier="week_${wi}"><title>${esc(w.title)}</title>${children.join("")}</item>`);
  });
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="questhand_${esc(course.id)}" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest">
  <metadata><schema>IMS Common Cartridge</schema><schemaversion>1.1.0</schemaversion>
    <lomimscc:lom><lomimscc:general><lomimscc:title><lomimscc:string>${esc(course.title)}</lomimscc:string></lomimscc:title></lomimscc:general></lomimscc:lom>
  </metadata>
  <organizations><organization identifier="org_1" structure="rooted-hierarchy"><item identifier="root">${items.join("")}</item></organization></organizations>
  <resources>${resources.join("")}</resources>
</manifest>`;
  files.unshift({ name: "imsmanifest.xml", data: manifest });
  const body = zip(files);
  const filename = `${course.title.replace(/[^\w\- ]+/g, "").trim() || "course"}.imscc`;
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
