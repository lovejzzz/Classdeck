// Plays a course as one student in a real browser (headless Chrome), the way a student would: opens each card it has
// in order from All cards, reads, votes, answers (right or wrong, as asked), hands in work, and moves through card
// groups. Run against a local Questhand with a teacher's session cookie; demo students keep what they do.
//   node tests/play-student.mjs <courseId> <studentId> <cookie cd_s=…> [--lessons 1-4] [--wrong] [--shots dir]
// Prints each card and what it did, and any page errors. Cards it can't play (discussions, drawings) are listed.
import fs from "node:fs";
import { chromium } from "playwright-core";

const [courseId, studentId, cookieArg, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] ?? true : undefined; };
const BASE = process.env.BASE ?? "http://localhost:3000";
const [from, to] = String(opt("--lessons") ?? "1-99").split("-").map(Number);
const wrong = !!opt("--wrong");
const shots = opt("--shots");
const say = JSON.parse(opt("--say") ? fs.readFileSync(opt("--say"), "utf8") : "{}");
const cookie = cookieArg.replace(/^cd_s=/, "");

const api = async (path) => (await fetch(BASE + path, { headers: { cookie: `cd_s=${cookie}` } })).json();
// The answer keys: students never get them, so they come from the teacher's view of the course.
const keys = new Map();
{ const t = await api(`/api/course/${courseId}`); for (const m of (t.course ?? t).weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules))) keys.set(m.id, m.questions?.[0]); }
const view = async () => { const s = await api(`/api/course/${courseId}?as=${studentId}`); return { c: s.course ?? s, p: s.progress?.[studentId] ?? {} }; };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await ctx.addCookies([{ name: "cd_s", value: cookie, domain: new URL(BASE).hostname, path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/hmr|WebSocket/i.test(m.text())) errors.push(m.text()); });
const log = [];
const wait = (ms) => page.waitForTimeout(ms);
let n = 0;
const shot = async (name) => { if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: `${shots}/${String(++n).padStart(3, "0")}-${name.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.png` }); } };

await page.goto(`${BASE}/learn/${courseId}/${studentId}?preview=1#all`, { waitUntil: "load" });
await wait(2500);

const dialog = () => page.locator(".pointer-events-auto.relative.my-auto").last();
async function handle(m, tries = 0) {
  const d = dialog();
  await d.waitFor({ timeout: 8000 });
  await wait(700);
  const q = keys.get(m.id) ?? m.questions?.[0];
  const pick = async (text) => { await d.getByRole("button", { name: text, exact: false }).first().click(); await wait(400); };
  if (m.poll && q) {
    const choice = say[m.title] ?? q.options[(studentId.charCodeAt(studentId.length - 1) + 0) % q.options.length];
    await pick(choice);
    await d.getByRole("button", { name: "Submit vote" }).click();
    await wait(1200);
    return `voted “${choice}”`;
  }
  if (q && m.kind === "choice" || q && !m.poll && (q.kind || q.options?.length)) {
    if (q.kind === "short") {
      await d.locator("input[type=text], input:not([type])").last().fill(wrong ? "board" : q.accept[0]);
      await d.getByRole("button", { name: "Check" }).click();
    } else if (q.kind === "multi") {
      const right = q.answerSet ?? [];
      const set = wrong ? [right[0], q.options.findIndex((_, i) => !right.includes(i))] : right;
      for (const i of set) await pick(q.options[i]);
      await d.getByRole("button", { name: "Check" }).click();
    } else if (q.kind === "order") {
      // Put the items in the teacher's order with the up/down buttons.
      for (let target = 0; target < q.options.length; target++) {
        const items = await d.locator("li").allInnerTexts();
        const at = items.findIndex((t) => t.includes(q.options[target]));
        for (let k = at; k > target; k--) { await d.getByRole("button", { name: `Move “${q.options[target]}” up` }).click(); await wait(150); }
      }
      if (wrong) await d.getByRole("button", { name: `Move “${q.options[0]}” down` }).click();
      await d.getByRole("button", { name: "Check" }).click();
    } else {
      const right = q.answer ?? 0;
      const i = wrong ? (right + 1) % q.options.length : right;
      await pick(q.options[i]);
      const check = d.getByRole("button", { name: "Check" });
      if (await check.count()) await check.first().click();
    }
    await wait(1200);
    return wrong ? "answered (wrong)" : "answered";
  }
  if (m.kind === "answer" || m.type === "submit") {
    const text = say[m.title] ?? `My plan: start the lesson with a short story card, then one question that branches, so students who aren't sure get an extra example.`;
    await d.locator("textarea").first().fill(text);
    await d.getByRole("button", { name: /^Hand in/ }).first().click();
    await wait(1500);
    return "handed in";
  }
  if (m.kind === "worksheet") {
    const ed = d.locator("[contenteditable=true]").first();
    if (await ed.count()) { await ed.click(); await page.keyboard.press("End"); await page.keyboard.type(say[m.title] ?? " Fractions with pizza slices"); await wait(1500); }
    const b = d.getByRole("button", { name: /^(Hand in|Done)$/ });
    if (await b.count()) { await b.first().click(); await wait(1200); return "filled in and handed in"; }
    return "filled in";
  }
  if (m.kind === "discussion") return "skipped (discussion)";
  const done = d.getByRole("button", { name: /^(Done|Mark done)$/ });
  if (await done.count()) { await done.first().click(); await wait(900); return "done"; }
  if (tries < 1) { await wait(1000); return handle(m, tries + 1); }
  return "no button to press";
}

const seen = new Set();
for (let guard = 0; guard < 160; guard++) {
  const { c } = await view();
  const lessons = c.weeks.flatMap((w) => w.lessons);
  const allowed = new Set(lessons.slice(from - 1, to).flatMap((l) => l.modules.map((m) => m.id)));
  const cards = await page.locator('[aria-label$=", not started"]').evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label").replace(/, not started$/, "")));
  const title = cards.find((t) => !seen.has(t) && lessons.slice(from - 1, to).some((l) => l.modules.some((m) => m.title === t && allowed.has(m.id))));
  if (!title) break;
  seen.add(title);
  const m = lessons.flatMap((l) => l.modules).find((x) => x.title === title && allowed.has(x.id));
  try {
    await page.locator(`[aria-label="${title.replace(/"/g, '\\"')}, not started"]`).first().scrollIntoViewIfNeeded();
    await page.locator(`[aria-label="${title.replace(/"/g, '\\"')}, not started"]`).first().click();
    let did = await handle(m);
    await shot(title);
    // Through a card group: "Next: …" until the group is finished.
    for (let k = 0; k < 8; k++) {
      const next = dialog().getByRole("button", { name: /^Next: / });
      if (!(await next.count())) break;
      const nextTitle = (await next.first().innerText()).replace(/^Next: /, "").trim();
      await next.first().click();
      await wait(900);
      const nm = lessons.flatMap((l) => l.modules).find((x) => x.title === nextTitle);
      seen.add(nextTitle);
      did += ` → ${nextTitle}: ${nm ? await handle(nm) : "unknown card"}`;
    }
    const fin = dialog().getByRole("button", { name: "Finish the group" });
    if (await fin.count()) { await fin.first().click(); await wait(1000); did += " → finished the group"; }
    log.push(`${title}: ${did}`);
  } catch (e) {
    log.push(`${title}: FAILED ${String(e.message).split("\n")[0]}`);
    await shot(`failed-${title}`);
  }
  if (await dialog().count()) { await page.keyboard.press("Escape"); await wait(900); }
}

const { p } = await view();
console.log(log.join("\n"));
console.log(`\n${Object.values(p).filter((x) => x.status === "done").length} cards done · page errors: ${errors.length ? errors.join(" | ") : "none"}`);
await browser.close();
