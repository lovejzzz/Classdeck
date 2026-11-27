// A whole course, clicked through in a real browser (Google Chrome, headless) against a running Questhand:
//   node tests/e2e-crawl.mjs [baseUrl] [videoFile]
// Makes a new course with every kind of card (Questhand 101's cards, plus a video with sound), three students, then as
// the teacher and as a student opens every page and card and presses the buttons that don't delete or send anything.
// Reports page errors, console errors, failed requests, layout shifts, and flicker (something shown for under a
// quarter of a second, then gone). Checks that a playing video fades out when it's closed (a sudden stop pops).
// Uses throwaway @example.test users; remove them afterwards with the server stopped: node tests/cleanup.mjs
import { chromium } from "playwright-core";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const B = process.argv[2] ?? "http://localhost:3000";
const VIDEO = process.argv[3];
const sample = JSON.parse(readFileSync(new URL("../lib/questhand101.json", import.meta.url)));
const results = [];
const check = (name, ok, detail) => { results.push([name, !!ok]); if (!ok) console.log("  ✗", name, detail ? JSON.stringify(detail).slice(0, 400) : ""); };
function jar() {
  let cookie = "";
  return {
    get cookie() { return cookie; },
    async post(p, b) { const r = await fetch(B + p, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(b) }); for (const c of r.headers.getSetCookie()) if (c.startsWith("cd_s=")) cookie = c.split(";")[0]; return r.json(); },
    async form(p, fd) { const r = await fetch(B + p, { method: "POST", headers: cookie ? { cookie } : {}, body: fd }); return r.json(); },
    async get(p) { return (await fetch(B + p, { headers: cookie ? { cookie } : {} })).json(); },
  };
}
const run = randomBytes(3).toString("hex");
const settle = (ms = 500) => new Promise((r) => setTimeout(r, ms));

// ---- The course: three weeks of Questhand 101's cards, a video with sound, due dates, three students.
const T = jar();
await T.post("/api/auth", { action: "signup", email: `t-crawl-${run}@example.test`, name: "Ms Crawl", password: randomBytes(12).toString("hex") });
const { id: cid } = await T.post("/api/courses", { title: `Studio Practice ${run}`, start: "blank" });
const op = (b) => T.post(`/api/course/${cid}`, { ...b });
const state = async () => (await T.get(`/api/course/${cid}`)).course;
for (let i = 0; i < sample.weeks.length; i++) {
  let c = await state();
  if (!c.weeks[i]) { await op({ op: "addWeek" }); c = await state(); }
  const w = c.weeks[i];
  await op({ op: "renameWeek", weekId: w.id, title: sample.weeks[i].title });
  for (let j = w.lessons.length; j < sample.weeks[i].lessons.length; j++) await op({ op: "addLesson", weekId: w.id });
}
let video;
if (VIDEO) {
  const fd = new FormData();
  fd.append("file", new Blob([readFileSync(VIDEO)], { type: "video/mp4" }), "tone.mp4");
  const up = await T.form("/api/upload", fd);
  check("a video uploads", up.ok, up);
  video = { id: "a-tone", kind: "video", url: up.url, name: "Tone (sound check)", size: up.size };
}
const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
const past = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
{
  const c = await state();
  for (const [i, sw] of sample.weeks.entries()) for (const [j, sl] of sw.lessons.entries()) {
    const L = c.weeks[i].lessons[j];
    let modules = structuredClone(sl.modules);
    if (i === 0 && j === 0 && video) modules = [{ id: "m-tone", type: "read", kind: "content", suit: "learn", title: "Sound check video", body: "Play it, then close it.", audience: { kind: "all" }, tools: [], attachments: [video] }, ...modules];
    // Due dates: some soon, one already past (late work).
    modules = modules.map((m, k) => (m.kind !== "content" && m.kind !== "group" && k % 3 === 0 ? { ...m, due: i === 0 && j === 0 ? past : soon } : m));
    const rest = Object.fromEntries(Object.entries(sl).filter(([k]) => k !== "modules"));
    const r = await op({ op: "saveLesson", lesson: { ...L, ...rest, id: L.id, modules } });
    if (r.ok === false) check(`lesson ${sl.title} saved`, false, r);
  }
}
await op({ op: "addStudents", names: "Ana Park\nBo Chen\nCy Diaz" });
const links = (await op({ op: "setupLinks" })).links;
const S = jar();
await S.post("/api/auth", { action: "signup", email: `t-crawl-s-${run}@example.test`, name: "Ana Park", password: randomBytes(12).toString("hex"), as: "student" });
const inv = await S.post("/api/auth", { action: "invite", courseId: cid, token: links[0].link.split("#")[1] });
const ana = inv.studentId;
const built = await state();
const cards = built.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules));
check("the course has every kind of card", ["content", "choice", "answer", "worksheet", "discussion", "group"].every((k) => cards.some((m) => m.kind === k)), [...new Set(cards.map((m) => m.kind))]);
console.log(`course ${cid}: ${built.weeks.length} weeks, ${cards.length} cards`);

// ---- The browser, watching for errors and flicker on every page.
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const problems = { errors: [], console: [], failed: [], shifts: [], flashes: [] };
async function contextFor(j) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addCookies([{ name: "cd_s", value: j.cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  await ctx.addInitScript(() => {
    const f = (window.__flick = { shifts: [], flashes: [] });
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput && e.value > 0.02) f.shifts.push({ v: +e.value.toFixed(3), src: (e.sources ?? []).map((s) => s.node ? `${s.node.nodeName}.${String(s.node.className ?? "").slice(0, 50)}` : "?").slice(0, 2) }); }).observe({ type: "layout-shift", buffered: true });
    } catch {}
    const born = new WeakMap();
    const seen = (n) => n.nodeType === 1 && n.isConnected && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== "hidden" && +getComputedStyle(n).opacity > 0.1;
    const mo = new MutationObserver((ms) => {
      const now = performance.now();
      for (const m of ms) {
        m.addedNodes.forEach((n) => { if (n.nodeType === 1) requestAnimationFrame(() => { if (seen(n)) born.set(n, now); }); });
        m.removedNodes.forEach((n) => {
          if (n.nodeType !== 1 || !born.has(n)) return;
          const age = now - born.get(n);
          const text = (n.textContent ?? "").trim().replace(/\s+/g, " ");
          if (age < 250 && text) f.flashes.push({ age: Math.round(age), text: text.slice(0, 70), el: `${n.nodeName}.${String(n.className ?? "").slice(0, 50)}` });
        });
      }
    });
    document.addEventListener("DOMContentLoaded", () => mo.observe(document.body, { childList: true, subtree: true }));
  });
  return ctx;
}
let lastPress = "";
let finished = false;
function watch(page, who) {
  page.on("crash", () => problems.errors.push(`${who}: the page crashed (last pressed: ${lastPress})`));
  page.on("close", () => { if (!finished) problems.console.push(`${who}: the page closed (last pressed: ${lastPress})`); });
  page.on("pageerror", (e) => problems.errors.push(`${who} ${page.url()}: ${String(e).slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR_ABORTED/.test(m.text())) problems.console.push(`${who} ${new URL(page.url()).pathname}: ${m.text().slice(0, 200)}`); });
  page.on("response", async (r) => {
    if (r.status() < 400 || r.url().includes("/_next/")) return;
    let op = "", err = "";
    try { op = JSON.parse(r.request().postData() ?? "{}").op ?? ""; } catch {}
    try { err = (await r.json()).error ?? ""; } catch {}
    problems.failed.push(`${who} ${r.status()} ${r.request().method()} ${r.url().replace(B, "").split("?")[0]} ${op} “${err}” (after: ${lastPress})`);
  });
}
async function harvest(page, where) {
  const f = await page.evaluate(() => { const x = window.__flick ?? { shifts: [], flashes: [] }; window.__flick = { shifts: [], flashes: [] }; return x; }).catch(() => ({ shifts: [], flashes: [] }));
  for (const s of f.shifts) problems.shifts.push({ where, ...s });
  for (const s of f.flashes) problems.flashes.push({ where, ...s });
}
// Buttons that change things for good, send things, or leave: not pressed.
const RISKY = /\bstar\b|unstar|delete|remove|sign out|log ?out|trash|leave|archive|reset|clear|ungroup|take (it )?out|discard|duplicate|copy|import|export|download|e-?mail|invite|send|publish|post\b|hand in|submit|merge|new course|undo|redo|rename|lock|unlock|regenerate|nudge|remind|approve|revise|mark|join|record|camera|upload|attach|full ?screen|print|unenroll|block|kick|end\b/i;
async function pressAll(page, scope, where, limit = 40) {
  // "a, b, body": the first of these that's on the page (an open editor covers the page behind it).
  if (scope.includes(",")) { for (const s of scope.split(",").map((x) => x.trim())) if (await page.locator(s).count().catch(() => 0)) { scope = s; break; } if (process.env.DEBUG) console.log("    scope:", scope); }
  const done = new Set();
  const start = page.url();
  for (let n = 0; n < limit; n++) {
    const list = page.locator(`${scope} button:visible`);
    const count = await list.count().catch(() => 0);
    let picked = -1, name = "";
    for (let i = 0; i < count; i++) {
      const b = list.nth(i);
      const label = ((await b.getAttribute("aria-label", { timeout: 500 }).catch(() => null)) || (await b.innerText({ timeout: 500 }).catch(() => "")) || "").trim().replace(/\s+/g, " ").slice(0, 50);
      const key = `${label}#${i}`;
      if (!label || done.has(label) || RISKY.test(label) || (await b.isDisabled({ timeout: 500 }).catch(() => true))) continue;
      picked = i; name = label; done.add(label); done.add(key); break;
    }
    if (picked < 0) break;
    lastPress = `${where} › ${name}`;
    try {
      await list.nth(picked).click({ timeout: 2000 });
      await settle(450);
      await harvest(page, `${where} › ${name}`);
      // A press that opened something modal (a confirm, the drawing canvas, a card picker): close it before the next.
      if (await page.locator('[data-confirm], canvas[aria-label="The page"], div.fixed.inset-0.z-\\[95\\]').count().catch(() => 0)) { await page.keyboard.press("Escape"); await settle(300); }
    } catch (e) {
      // Playwright's reason (something covering it, still moving, gone) is in its call log.
      const why = String(e).match(/ - (.*(?:intercepts|not stable|not visible|outside of the viewport|detached).*)/)?.[1].slice(0, 160);
      problems.console.push(`${where}: couldn't press “${name}”: ${String(e).split("\n")[0].slice(0, 120)}${why ? ` (${why})` : ""}`);
    }
    if (page.url().split("#")[0] !== start.split("#")[0]) { await page.goto(start); await settle(900); }
    // Inside a card (a dialog, or the editor panel), reopen it if a button closed it.
    if (scope !== "body") { if (!(await page.locator(scope).count())) { await page.goto(start); await settle(900); } }
    else { await page.keyboard.press("Escape").catch(() => {}); await settle(150); }
  }
  return done.size / 2;
}

// ---- Teacher (ONLY=student skips this part)
if (process.env.ONLY !== "student") {
const tctx = await contextFor(T);
const tp = await tctx.newPage();
watch(tp, "teacher");
for (const path of ["/teach", `/teach/${cid}`, "/settings", "/changelog"]) {
  await tp.goto(B + path); await settle(1500);
  await harvest(tp, `teacher ${path} (load)`);
}
await tp.goto(`${B}/teach/${cid}`); await settle(1500);
for (const tab of ["Students", "Settings", "Map"]) {
  const t = tp.getByRole("button", { name: tab, exact: true }).first();
  if (await t.count()) { await t.click(); await settle(900); await harvest(tp, `teacher tab ${tab}`); }
}
// Every card's editor: open, look, close.
let opened = 0;
const missed = [];
for (const m of cards) {
  await tp.goto(`${B}/teach/${cid}?card=${m.id}`); await settle(700);
  const open = async () => await tp.locator("text=Edit this card").count().catch(() => 0) || await tp.getByRole("button", { name: "Close" }).count();
  // A slow first render gets one more look before it counts as not opening.
  if (await open() || (await settle(1500), await open())) opened++;
  else missed.push(`${m.kind} “${m.title}”`);
  await harvest(tp, `teacher card ${m.kind} “${m.title}”`);
}
check("every card's editor opens", opened >= cards.length - 2, `${opened} of ${cards.length}; not open: ${missed.join(", ")}`);
if (missed.length) console.log("  editors that didn't open:", missed.join(", "));
// Buttons in a few editors (one of each kind).
const oneOfEach = ["content", "choice", "answer", "worksheet", "discussion", "group"].map((k) => cards.find((m) => m.kind === k)).filter(Boolean);
for (const m of oneOfEach) {
  await tp.goto(`${B}/teach/${cid}?card=${m.id}`); await settle(900);
  const n = await pressAll(tp, "[role=dialog], aside, body", `teacher editor ${m.kind}`, 30);
  console.log(`  teacher editor ${m.kind}: pressed ${n} buttons`);
}
await tp.goto(`${B}/teach/${cid}`); await settle(1200);
console.log(`  teacher map: pressed ${await pressAll(tp, "body", "teacher map", 50)} buttons`);
await tp.getByRole("button", { name: "Students", exact: true }).first().click().catch(() => {}); await settle(900);
console.log(`  teacher students: pressed ${await pressAll(tp, "body", "teacher students", 50)} buttons`);

}

// ---- Student
const sctx = await contextFor(S);
let sp = await sctx.newPage();
watch(sp, "student");
const alive = async () => { if (sp.isClosed()) { sp = await sctx.newPage(); watch(sp, "student"); } };
const board = `${B}/learn/${cid}/${ana}`;
for (const path of [board, `${board}/board`]) { await sp.goto(path); await settle(1500); await harvest(sp, `student ${path.replace(B, "")} (load)`); }
console.log(`  student board: pressed ${await pressAll(sp, "body", "student board", 50)} buttons`);
console.log(`  student My work: ${await (async () => { await sp.goto(`${board}/board`); await settle(1000); return pressAll(sp, "body", "student My work", 30); })()} buttons`);
// Every card the student has: open it, press its buttons, close it.
const mine = (await S.get(`/api/course/${cid}?as=${ana}`)).course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules));
let cardsOpened = 0;
for (const m of mine.filter((x) => x.kind !== "group")) {
  await alive();
  await sp.goto(`${board}?card=${m.id}`); await settle(1000);
  const dialog = sp.locator("[role=dialog]");
  if (!(await dialog.count())) continue;
  cardsOpened++;
  await harvest(sp, `student card ${m.kind} “${m.title}” (open)`);
  await pressAll(sp, "[role=dialog]", `student card ${m.kind} “${m.title}”`, 12);
}
check("the student's cards open", cardsOpened >= Math.min(10, mine.length - 5), `${cardsOpened} of ${mine.length}`);

// ---- A playing video, closed: it fades out instead of stopping at once.
if (video) {
  await alive();
  await sp.goto(`${board}?card=m-tone`); await settle(1200);
  const play = sp.locator("[role=dialog] button:has(video), [role=dialog] [aria-label*=Play], [role=dialog] button:has-text('Play')").first();
  if (await play.count()) { await play.click(); await settle(1200); }
  const v = sp.locator("video:not([muted])").last();
  await v.evaluate((el) => el.play()).catch(() => {});
  await settle(800);
  const before = await v.evaluate((el) => ({ paused: el.paused, t: el.currentTime, volume: el.volume })).catch(() => null);
  check("the video plays", before && !before.paused && before.t > 0.2, before);
  // Sample the volume every frame from the moment Close is pressed.
  await sp.evaluate(() => {
    const el = [...document.querySelectorAll("video")].filter((x) => !x.muted).pop();
    window.__vol = [];
    const t0 = performance.now();
    const tick = () => { if (!el) return; window.__vol.push([Math.round(performance.now() - t0), +el.volume.toFixed(2), el.paused]); if (!el.paused && performance.now() - t0 < 1500) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await sp.keyboard.press("Escape");
  await settle(900);
  const vol = await sp.evaluate(() => window.__vol);
  const between = vol.filter(([, v, p]) => !p && v > 0 && v < 1);
  check("closing a playing video fades it out before it stops", between.length >= 3 && vol.at(-1)?.[2] === true, vol.slice(0, 20));
  await harvest(sp, "student video close");
}

finished = true;
await browser.close();

// ---- Report
const uniq = (xs) => [...new Map(xs.map((x) => [JSON.stringify(x), x])).values()];
console.log(`\nPage errors (${problems.errors.length}):`); for (const e of uniq(problems.errors).slice(0, 30)) console.log("  ", e);
console.log(`Console errors (${problems.console.length}):`); for (const e of uniq(problems.console).slice(0, 30)) console.log("  ", e);
console.log(`Failed requests (${problems.failed.length}):`); for (const e of uniq(problems.failed).slice(0, 30)) console.log("  ", e);
console.log(`Layout shifts over 0.02 (${problems.shifts.length}):`); for (const e of problems.shifts.sort((a, b) => b.v - a.v).slice(0, 25)) console.log("  ", JSON.stringify(e));
const flashes = uniq(problems.flashes.map(({ where, ...x }) => ({ ...x, where: where.split(" › ")[0] })));
console.log(`Flicker: shown under 250 ms (${flashes.length}):`); for (const e of flashes.slice(0, 40)) console.log("  ", JSON.stringify(e));
check("no page errors", problems.errors.length === 0);
const passed = results.filter((r) => r[1]).length;
console.log(`\n${passed} passed, ${results.length - passed} failed  (course ${cid})`);
process.exit(results.length - passed ? 1 : 0);
