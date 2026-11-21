// Card trees, end to end in a real browser (Google Chrome, headless) against a running Questhand:
//   node tests/e2e-card-tree.mjs [baseUrl]      (needs the dev dependency playwright-core and Google Chrome)
// Deletes a card that deals follow-ups (one in a later lesson) from the Deck, from the editor and by press-and-hold,
// then Undo (the message's and the toolbar's) and Redo; deletes a follow-up alone; makes a Lesson 2 card from a
// Lesson 1 answer in the tree. After each step it checks the server's copy and what a student can see.
// Uses throwaway @example.test users; remove them afterwards with the server stopped: node tests/cleanup.mjs
import { chromium } from "playwright-core";
import { randomBytes } from "node:crypto";

const B = process.argv[2] ?? "http://localhost:3000";
const results = [];
const check = (name, ok, detail) => { results.push([name, !!ok]); if (!ok) console.log("  ✗", name, detail ? JSON.stringify(detail).slice(0, 300) : ""); };
function jar() {
  let cookie = "";
  return {
    get cookie() { return cookie; },
    async post(p, b) { const r = await fetch(B + p, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(b) }); for (const c of r.headers.getSetCookie()) if (c.startsWith("cd_s=")) cookie = c.split(";")[0]; return r.json(); },
    async get(p) { return (await fetch(B + p, { headers: cookie ? { cookie } : {} })).json(); },
  };
}
const run = randomBytes(3).toString("hex");
const T = jar();
await T.post("/api/auth", { action: "signup", email: `t-e2e-${run}@example.test`, name: "Ms E2E", password: randomBytes(12).toString("hex") });
const { id: cid } = await T.post("/api/courses", { title: `Delete test ${run}`, start: "blank" });
let s = await T.get(`/api/course/${cid}`);
await T.post(`/api/course/${cid}`, { op: "addLesson", weekId: s.course.weeks[0].id });
await T.post(`/api/course/${cid}`, { op: "addStudents", names: "Sam Student" });
s = await T.get(`/api/course/${cid}`);
const [L1, L2] = s.course.weeks[0].lessons;
const card = (id, type, title, extra = {}) => ({ id, type, suit: type === "read" ? "learn" : "do", title, body: "", audience: { kind: "all" }, tools: [], attachments: [], ...extra });
const ask = (id, next) => ({ id, text: "Which?", options: next.map((_, i) => `Option ${i + 1}`), answer: 0, next });
await T.post(`/api/course/${cid}`, { op: "saveLesson", lesson: { ...L2, modules: [card("m-all2", "read", "Lesson 2 for everyone"), card("m-y", "practice", "Follow-up in Lesson 2", { questions: [ask("qy", ["m-z", null])] }), card("m-z", "read", "Follow-up of the follow-up")] } });
await T.post(`/api/course/${cid}`, { op: "saveLesson", lesson: { ...L1, modules: [card("m-all1", "read", "Lesson 1 for everyone"), card("m-src", "practice", "Source question", { questions: [ask("q", ["m-x", "m-y"])] }), card("m-x", "read", "Follow-up in Lesson 1")] } });
const sam = (await T.get(`/api/course/${cid}`)).course.students[0];
const link = (await T.post(`/api/course/${cid}`, { op: "setupLinks" })).links[0].link;
const S = jar();
await S.post("/api/auth", { action: "invite", courseId: cid, token: link.split("#")[1] });

const server = async () => {
  const c = (await T.get(`/api/course/${cid}`)).course;
  const [a, b] = c.weeks[0].lessons;
  return { l1: a.modules.map((m) => m.id), l2: b.modules.map((m) => m.id), src: a.modules.find((m) => m.id === "m-src") };
};
const studentSees = async () => (await S.get(`/api/course/${cid}?as=${sam.id}`)).course.weeks.flatMap((w) => w.lessons.flatMap((l) => l.modules.map((m) => m.id)));
const settle = (ms = 2200) => new Promise((r) => setTimeout(r, ms));

const before = await server();
check("set up: both lessons have their cards", before.l1.join() === "m-all1,m-src,m-x" && before.l2.join() === "m-all2,m-y,m-z", before);
check("set up: the student sees only the cards everyone gets", (await studentSees()).sort().join() === "m-all1,m-all2,m-src");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addCookies([{ name: "cd_s", value: T.cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
// The List view (rows of cards) for the delete steps; the map is checked further down.
await page.goto(`${B}/teach/${cid}?tab=plan`);
await page.getByRole("button", { name: "Edit Source question" }).waitFor();
await settle(800);

// 1) Delete from the card editor.
await page.getByRole("button", { name: "Edit Source question" }).click();
await page.getByRole("button", { name: "Delete", exact: true }).waitFor();
await settle(600);
await page.getByRole("button", { name: "Delete", exact: true }).click();
await settle();
let now = await server();
check("editor delete: the source and its Lesson 1 follow-up are gone", !now.l1.includes("m-src") && !now.l1.includes("m-x") && now.l1.includes("m-all1"), now);
check("editor delete: its Lesson 2 follow-up and that card's follow-up are gone too", now.l2.join() === "m-all2", now);
let sees = await studentSees();
check("editor delete: no follow-up became visible to the student", !sees.some((x) => ["m-x", "m-y", "m-z"].includes(x)), sees);

// Undo from the message brings everything back, wired as before.
const toastUndo = () => page.locator('[aria-live="polite"]').getByRole("button", { name: "Undo" }).first().click();
await toastUndo();
await settle();
now = await server();
check("undo: every card is back in its lesson", now.l1.join() === "m-all1,m-src,m-x" && now.l2.join() === "m-all2,m-y,m-z", now);
check("undo: the wiring is back", JSON.stringify(now.src?.questions?.[0]?.next) === JSON.stringify(["m-x", "m-y"]), now.src?.questions);
sees = await studentSees();
check("undo: the follow-ups are hidden again", (await studentSees()).sort().join() === "m-all1,m-all2,m-src", sees);

// 2) Delete by press-and-hold, with the confirm dialog.
await page.reload();
const srcCard = page.getByRole("button", { name: "Edit Source question" });
await srcCard.waitFor();
await settle(800);
const box = await srcCard.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await settle(800);
await page.mouse.up();
await page.getByRole("button", { name: "Delete Source question" }).dispatchEvent("click");
const dialog = page.locator("[data-confirm]");
await dialog.waitFor();
const text = await dialog.innerText();
check("hold to delete: the dialog says the follow-ups go with it", /3 follow-up cards/.test(text), text);
await dialog.getByRole("button", { name: "Delete", exact: true }).click();
await settle();
now = await server();
check("hold to delete: same result across both lessons", now.l1.join() === "m-all1" && now.l2.join() === "m-all2", now);
check("hold to delete: no follow-up visible to the student", !(await studentSees()).some((x) => ["m-x", "m-y", "m-z"].includes(x)));

// The Deck's own Undo (top right, also ⌘Z) undoes the whole delete as one step, both lessons together.
await page.getByRole("button", { name: "Undo", exact: true }).first().click();
await settle();
now = await server();
check("toolbar undo: one step restores both lessons", now.l1.join() === "m-all1,m-src,m-x" && now.l2.join() === "m-all2,m-y,m-z", now);
check("toolbar undo: wiring back, nothing exposed", JSON.stringify(now.src?.questions?.[0]?.next) === JSON.stringify(["m-x", "m-y"]) && (await studentSees()).sort().join() === "m-all1,m-all2,m-src", now.src?.questions);
// Redo deletes them again, together.
await page.getByRole("button", { name: "Redo", exact: true }).first().click();
await settle();
now = await server();
check("toolbar redo: deletes across both lessons again", now.l1.join() === "m-all1" && now.l2.join() === "m-all2", now);
await page.getByRole("button", { name: "Undo", exact: true }).first().click();
await settle();

// 3) Deleting a follow-up only: it goes, the answer that dealt it is unhooked, nothing else moves.
await page.reload();
await page.getByRole("button", { name: "Edit Follow-up in Lesson 1" }).waitFor();
await settle(600);
await page.getByRole("button", { name: "Edit Follow-up in Lesson 1" }).click();
await page.getByRole("button", { name: "Delete", exact: true }).waitFor();
await settle(600);
await page.getByRole("button", { name: "Delete", exact: true }).click();
await settle();
now = await server();
check("deleting a follow-up removes only it", now.l1.join() === "m-all1,m-src" && now.l2.join() === "m-all2,m-y,m-z", now);
check("…and unhooks its answer, keeping the other wire", JSON.stringify(now.src?.questions?.[0]?.next) === JSON.stringify([null, "m-y"]), now.src?.questions);

// 4) A new card in Lesson 2, made from a Lesson 1 answer on the course map: the card and its wire are saved together.
await page.getByRole("button", { name: "Lesson 1 actions" }).click();
await page.getByRole("menuitem", { name: /Show on the map/ }).click();
await page.getByRole("button", { name: "Deal a card for answer A" }).waitFor();
await settle(800);
// The map opens folded (each lesson's main path); show every card for the steps below.
await page.getByRole("button", { name: "Unfold all", exact: true }).click();
await settle(600);
await page.getByRole("button", { name: "Deal a card for answer A" }).click();
await page.locator(".pop").getByRole("button", { name: /^Week 1: Lesson 2$/ }).click();
await page.locator(".pop").getByRole("button", { name: "Content", exact: true }).click();
await settle();
await page.keyboard.press("Escape");
await settle(1200);
now = await server();
const made = now.src?.questions?.[0]?.next?.[0];
check("tree: a new Lesson 2 card wired from a Lesson 1 answer is saved, wire and all", !!made && now.l2.includes(made) && now.l2.length === 4, now);
check("tree: the new card is hidden from the student until dealt", !(await studentSees()).includes(made));

// 5) On the map: rename a card and an answer in place (double-click), then drag cards between lessons.
const titleOnMap = page.locator('[data-node="m-all1"] span', { hasText: "Lesson 1 for everyone" }).first();
await titleOnMap.dblclick();
const box1 = page.getByRole("textbox", { name: "Edit text" });
await box1.fill("Warm-up for everyone");
await box1.press("Enter");
await settle();
let c1 = (await T.get(`/api/course/${cid}`)).course;
check("map: a title edited in place is saved", c1.weeks[0].lessons[0].modules.find((m) => m.id === "m-all1")?.title === "Warm-up for everyone");
await page.locator('[data-node="m-src"] span', { hasText: "Option 2" }).first().dblclick();
const box2 = page.getByRole("textbox", { name: "Edit text" });
await box2.fill("Go to lesson two");
await box2.press("Enter");
await settle();
c1 = (await T.get(`/api/course/${cid}`)).course;
check("map: an answer edited in place is saved, its wire kept", c1.weeks[0].lessons[0].modules.find((m) => m.id === "m-src")?.questions?.[0]?.options?.[1] === "Go to lesson two" && c1.weeks[0].lessons[0].modules.find((m) => m.id === "m-src")?.questions?.[0]?.next?.[1] === "m-y");
// Drag "Lesson 2 for everyone" (wired to nothing) into Lesson 1: allowed.
const dragTo = async (id, toLessonTitle) => {
  const head = page.locator(`[data-node="${id}"] button[aria-label^="Edit"]`).first();
  // Lessons are rows, one under another: bring this card into view, then drag up to the map's edge (it scrolls) until
  // the other lesson's row shows, and drop the card in it.
  await page.locator(".tree-canvas").evaluate((el) => el.scrollTo({ top: 0 }));
  await head.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await settle(300);
  const hb = await head.boundingBox();
  const map = await page.locator(".tree-canvas").boundingBox();
  const region = page.locator(".font-semibold", { hasText: new RegExp(`^${toLessonTitle}$`) }).first();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 20);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 30, hb.y + 40, { steps: 5 });
  let rb = await region.boundingBox();
  if (rb.y < map.y + 10) {
    await page.mouse.move(hb.x + hb.width / 2, map.y + 12, { steps: 10 });
    for (let i = 0; i < 80 && (rb = await region.boundingBox()).y < map.y + 20; i++) await settle(100);
  }
  await page.mouse.move(rb.x + 40, rb.y + 140, { steps: 15 });
  await settle(300);
  await page.mouse.up();
  await settle();
};
const l1Title = c1.weeks[0].lessons[0].title, l2Title = c1.weeks[0].lessons[1].title;
await dragTo("m-all2", l1Title);
c1 = (await T.get(`/api/course/${cid}`)).course;
check("map: a card dragged to another lesson moves there", c1.weeks[0].lessons[0].modules.some((m) => m.id === "m-all2") && !c1.weeks[0].lessons[1].modules.some((m) => m.id === "m-all2"));
// "Follow-up of the follow-up" is dealt by a Lesson 2 card, so it can't move back to Lesson 1 (wires only run forward).
await dragTo("m-z", l1Title);
c1 = (await T.get(`/api/course/${cid}`)).course;
check("map: a card can't move before the card that deals it", c1.weeks[0].lessons[1].modules.some((m) => m.id === "m-z") && !c1.weeks[0].lessons[0].modules.some((m) => m.id === "m-z"));
check("map: the refusal says why", await page.getByText(/Can’t move it there/).first().isVisible());

// 6) Card groups: shift-click two cards on the map, make a group, then ungroup.
const head = (id) => page.locator(`[data-node="${id}"] button[aria-label^="Edit"]`).first();
await head("m-all1").click({ modifiers: ["Shift"] });
await head("m-all2").click({ modifiers: ["Shift"] });
await page.getByRole("button", { name: "Make a card group" }).click();
await settle();
let c6 = (await T.get(`/api/course/${cid}`)).course;
const g6 = c6.weeks[0].lessons[0].modules.find((m) => m.type === "group");
check("map: two picked cards become a card group, in their lesson order", !!g6 && g6.members?.length === 2 && g6.members.includes("m-all1") && g6.members.includes("m-all2"), g6);
await page.keyboard.press("Escape");
await settle(800);
check("map: the group is one node listing its cards", (await page.locator(`[data-node="${g6?.id}"]`).count()) === 1 && (await page.locator(`[data-node="m-all1"]`).count()) === 0);
await page.locator(`[data-node="${g6?.id}"] button[aria-label^="Edit"]`).first().click();
await page.getByRole("button", { name: "Ungroup (keep the cards)" }).click();
await settle();
c6 = (await T.get(`/api/course/${cid}`)).course;
check("ungroup keeps the cards and drops the group", !c6.weeks[0].lessons[0].modules.some((m) => m.type === "group") && c6.weeks[0].lessons[0].modules.some((m) => m.id === "m-all1") && c6.weeks[0].lessons[0].modules.some((m) => m.id === "m-all2"));

check("no errors in the page", errors.length === 0, errors);
await browser.close();
const failed = results.filter(([, ok]) => !ok).length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
