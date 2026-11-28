// Records the short screen clips Questhand 101 shows (how to make a card, draw a branch, make a card group, try the
// course as a student, give feedback, pick a cover, invite a class), in a real browser against a local Questhand, with a
// visible pointer. Re-run it when the screens change.
//   node scripts/record-101.mjs <teacher cookie cd_s=…> <Questhand 101 course id> <out dir> [clip …]
// The clips play in a practice course it makes ("Fractions · Year 5"); the feedback clip uses the Questhand 101 class.
// Writes <clip>.mp4 (H.264, no sound) with ffmpeg.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const [cookieArg, courseId, outDir, ...only] = process.argv.slice(2);
const cookie = cookieArg.replace(/^cd_s=/, "");
const BASE = process.env.BASE ?? "http://localhost:3000";
fs.mkdirSync(outDir, { recursive: true });
const raw = path.join(outDir, "raw");
fs.mkdirSync(raw, { recursive: true });

const call = async (method, p, body) => (await fetch(BASE + p, { method, headers: { cookie: `cd_s=${cookie}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A practice course to film in, made fresh each run (the last run's goes first).
for (const c of (await call("GET", "/api/courses")).courses ?? []) if (c.title === "Fractions · Year 5") await call("DELETE", "/api/courses", { id: c.id, confirm: c.title });
const made = await call("POST", "/api/courses", { title: "Fractions · Year 5", subtitle: "Spring term", start: "blank" });
const practice = made.id;
const stateOf = async (id) => (await call("GET", `/api/course/${id}`)).course;
{
  const c = await stateOf(practice);
  const l = c.weeks[0].lessons[0];
  await call("POST", `/api/course/${practice}`, { op: "saveLesson", lesson: { ...l, title: "Comparing fractions" } });
}

// A pointer that follows the mouse and rings on a click (headless video shows no cursor of its own).
const POINTER = `
  addEventListener("DOMContentLoaded", () => {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:2147483647;pointer-events:none;transition:transform .08s";
    d.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l15 9-6.5 1.5L8.6 19z" fill="#1b1b1a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(d);
    addEventListener("mousemove", (e) => { d.style.left = e.clientX + "px"; d.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.style.cssText = "position:fixed;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;border:2px solid rgba(75,86,168,.7);z-index:2147483646;pointer-events:none;transition:transform .45s ease-out,opacity .45s ease-out";
      r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px";
      document.body.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(1.8)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 500);
      d.style.transform = "scale(.85)";
    }, true);
    addEventListener("mouseup", () => { d.style.transform = ""; }, true);
  });`;

const browser = await chromium.launch({ channel: "chrome", headless: true });

async function clip(name, url, act) {
  if (only.length && !only.includes(name)) return;
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 750 } });
  await ctx.addCookies([{ name: "cd_s", value: cookie, domain: new URL(BASE).hostname, path: "/" }]);
  await ctx.addInitScript(POINTER);
  const page = await ctx.newPage();
  // Frames from Chrome's screencast (sent when the screen changes), timed, then put together by ffmpeg.
  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on("Page.screencastFrame", async (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  let x = 600, y = 400;
  const moveTo = async (loc, dx = 0, dy = 0) => {
    if (loc.scrollIntoViewIfNeeded) { await loc.scrollIntoViewIfNeeded({ timeout: 8000 }); await sleep(250); }
    const b = await loc.boundingBox({ timeout: 8000 });
    if (!b) throw new Error(`${name}: nothing to point at`);
    const tx = b.x + b.width / 2 + dx, ty = b.y + b.height / 2 + dy;
    await page.mouse.move(tx, ty, { steps: Math.max(8, Math.round(Math.hypot(tx - x, ty - y) / 14)) });
    x = tx; y = ty;
  };
  const click = async (loc, dx, dy) => { await moveTo(loc, dx, dy); await sleep(180); await page.mouse.down(); await sleep(70); await page.mouse.up(); await sleep(500); };
  const drag = async (from, to) => {
    await moveTo(from); await sleep(200); await page.mouse.down();
    const b = await to.boundingBox();
    const tx = b.x + b.width / 2, ty = b.y + b.height / 2;
    await page.mouse.move(tx, ty, { steps: 30 }); x = tx; y = ty;
    await sleep(250); await page.mouse.up(); await sleep(700);
  };
  const type = async (text) => { await page.keyboard.type(text, { delay: 38 }); await sleep(300); };
  await page.goto(BASE + url, { waitUntil: "load" });
  await sleep(2200);
  await page.mouse.move(x, y);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1200, maxHeight: 750, everyNthFrame: 1 });
  try {
    await act({ page, click, drag, moveTo, type, sleep });
    await sleep(1200);
  } finally {
    await cdp.send("Page.stopScreencast").catch(() => {});
    await ctx.close();
    const dir = path.join(raw, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const list = [];
    frames.forEach((f, i) => {
      const file = path.join(dir, `${String(i).padStart(5, "0")}.jpg`);
      fs.writeFileSync(file, Buffer.from(f.data, "base64"));
      const dur = i + 1 < frames.length ? Math.max(0.01, frames[i + 1].t - f.t) : 0.8;
      list.push(`file '${file}'`, `duration ${dur.toFixed(3)}`);
    });
    if (frames.length) list.push(`file '${path.join(dir, `${String(frames.length - 1).padStart(5, "0")}.jpg`)}'`);
    fs.writeFileSync(path.join(dir, "list.txt"), list.join("\n"));
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"), "-vf", "fps=30,scale=1200:-2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "28", "-preset", "slow", "-movflags", "+faststart", "-an", path.join(outDir, `${name}.mp4`)]);
    console.log(`${name}.mp4 (${frames.length} frames)`);
  }
}

// 1. Make a card: + Card, Question, a title, two choices.
await clip("make-card", `/teach/${practice}`, async ({ page, click, type, sleep }) => {
  await click(page.getByRole("button", { name: "Card", exact: true }).first());
  await click(page.getByText("Question", { exact: true }).last());
  await sleep(600);
  const title = page.getByLabel("Title", { exact: true });
  await click(title); await page.keyboard.press("Meta+a"); await type("Which is bigger?");
  await click(page.getByLabel("Option 1", { exact: true })); await type("1/2");
  await click(page.getByLabel("Option 2", { exact: true })); await type("1/3");
  await sleep(500);
  await page.keyboard.press("Escape");
  await sleep(1200);
});

// 2. Draw a branch: drag an answer's dot to empty space, make the card it deals.
await clip("branch", `/teach/${practice}`, async ({ page, click, drag, type, sleep }) => {
  const dot = page.getByLabel(/deal a card for answer B$/i).first();
  const card = page.locator('[aria-label^="Edit Which is bigger?"]').first();
  const b = await card.boundingBox();
  await page.evaluate(() => 0);
  const spot = page.locator("body");
  await drag(dot, { boundingBox: async () => ({ x: b.x + b.width + 120, y: b.y + b.height + 60, width: 2, height: 2 }) });
  await click(page.getByText("Content", { exact: true }).last());
  await sleep(600);
  await click(page.getByLabel("Title", { exact: true })); await page.keyboard.press("Meta+a"); await type("Halves and thirds, side by side");
  await page.keyboard.press("Escape");
  await sleep(1500);
  void spot;
});

// Three quick questions to group.
{
  const c = await stateOf(practice);
  const l = c.weeks[0].lessons[0];
  const q = (i, text, options, answer) => ({ id: `m-rec-q${i}`, type: "practice", kind: "choice", suit: "question", title: `Quick check ${i}`, body: "", audience: { kind: "all" }, tools: [], attachments: [], questions: [{ id: `q-rec-${i}`, text, options, answer }] });
  await call("POST", `/api/course/${practice}`, { op: "saveLesson", lesson: { ...l, modules: [...l.modules, q(1, "Which is more: 2/4 or 1/2?", ["2/4", "1/2", "They're the same"], 2), q(2, "Which is less: 3/5 or 3/4?", ["3/5", "3/4"], 0), q(3, "Put 1/4 in words", ["One quarter", "One fourth", "Both"], 2)] } });
}

// 3. A card group: three questions, a box around them, Make a card group, then its score ranges.
await clip("card-group", `/teach/${practice}`, async ({ page, click, drag, sleep }) => {
  const cards = page.locator('[aria-label^="Edit Quick check"]');
  const first = await cards.first().boundingBox(), last = await cards.last().boundingBox();
  await drag({ boundingBox: async () => ({ x: first.x - 24, y: first.y - 18, width: 1, height: 1 }) }, { boundingBox: async () => ({ x: last.x + last.width + 10, y: last.y + last.height + 10, width: 1, height: 1 }) });
  await click(page.getByRole("button", { name: "Make a card group" }));
  await sleep(1200);
  await page.keyboard.press("Escape");
  await sleep(800);
  await click(page.getByRole("button", { name: "Branch by score" }).first());
  await sleep(1500);
}).catch((e) => console.log("card-group:", e.message));

// 4. Student View: try the course as a new student; an answer deals a card.
await clip("student-view", `/teach/${practice}`, async ({ page, click, sleep }) => {
  await click(page.getByRole("button", { name: /Student View/ }));
  await click(page.getByText("New student", { exact: true }));
  await page.waitForURL(/\/learn\//);
  await sleep(2200);
  await click(page.locator('[aria-label^="Which is bigger?"]').first());
  await sleep(900);
  await click(page.getByRole("button", { name: "1/3" }).first());
  await sleep(1800);
  await page.keyboard.press("Escape");
  await sleep(1800);
});

// 5. Feedback: a student's handed-in work, a few words back, Looks good.
await clip("feedback", `/teach/${courseId}?tab=students`, async ({ page, click, type, sleep }) => {
  await click(page.getByRole("button", { name: /Maya Lin \(demo student\)/ }).first());
  await sleep(1500);
  await click(page.getByText("Review", { exact: false }).first());
  await sleep(1500);
  const box = page.getByPlaceholder(/did well, and one thing to try next/);
  await click(box);
  await type("Lovely start: the story card will hook them. Try making the branch question about the story itself.");
  await click(page.getByRole("button", { name: "Looks good" }).first());
  await sleep(1500);
}).catch((e) => console.log("feedback:", e.message));

// 6. A cover: Settings → Course, a paper cover, then open photos.
await clip("cover", `/teach/${practice}?tab=settings`, async ({ page, click, sleep }) => {
  await page.waitForFunction(() => /Picked by your AI|From the course/.test(document.body.innerText), null, { timeout: 90000 });
  await click(page.getByRole("button", { name: /Use paper cover 2/ }));
  await sleep(1200);
  await click(page.getByRole("button", { name: "Photo", exact: true }));
  await sleep(5000);
  await click(page.getByRole("button", { name: /Use photo/ }).first());
  await sleep(1500);
}).catch((e) => console.log("cover:", e.message));

// 7. Invite: the invite box, the class code, who can join.
await clip("invite", `/teach/${practice}?tab=students`, async ({ page, click, sleep }) => {
  await click(page.getByRole("button", { name: "Invite students" }).first());
  await sleep(1500);
  const access = page.getByText("General access").first();
  await page.mouse.wheel(0, 200);
  await sleep(600);
  await click(access, 0, 30);
  await sleep(1500);
}).catch((e) => console.log("invite:", e.message));

await browser.close();
console.log(`practice course: ${practice}`);
