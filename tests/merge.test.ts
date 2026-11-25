// Two tabs saving the same lesson (lib/merge.ts), checked without a server: npx tsx tests/merge.test.ts
export {};
async function main() {
  const { baseOf, mergeLesson } = await import("../lib/merge");
  const rows: [string, boolean, unknown?][] = [];
  const check = (name: string, ok: boolean, extra?: unknown) => rows.push([name, ok, extra]);
  type L = Parameters<typeof mergeLesson>[0];
  const card = (id: string, title: string) => ({ id, title, type: "read", body: "" }) as unknown as L["modules"][number];
  const lesson = (mods: L["modules"], title = "Lesson") => ({ id: "l1", title, modules: mods }) as L;
  const titles = (l: L) => l.modules.map((m) => m.title).join(",");

  const start = lesson([card("a", "A"), card("b", "B"), card("c", "C")]);
  const base = baseOf(start);
  // Tab 1 changed A and saved; tab 2 (still showing the start) changes C.
  const now = lesson([card("a", "A1"), card("b", "B"), card("c", "C")]);
  const mine = lesson([card("a", "A"), card("b", "B"), card("c", "C2")]);
  check("both changes kept", titles(mergeLesson(now, mine, base)) === "A1,B,C2", titles(mergeLesson(now, mine, base)));
  check("without a base, the page's copy is taken (as before)", titles(mergeLesson(now, mine, undefined)) === "A,B,C2");
  check("a card both changed: this save's wins", titles(mergeLesson(now, lesson([card("a", "A2"), card("b", "B"), card("c", "C")]), base)) === "A2,B,C");
  // Added elsewhere: stays, after the card it followed.
  const added = lesson([card("a", "A"), card("n", "New"), card("b", "B"), card("c", "C")]);
  check("a card added elsewhere stays in its place", titles(mergeLesson(added, mine, base)) === "A,New,B,C2", titles(mergeLesson(added, mine, base)));
  // Deleted here: goes, even if changed elsewhere.
  check("a card deleted here goes", titles(mergeLesson(now, lesson([card("b", "B"), card("c", "C")]), base)) === "B,C");
  // Deleted elsewhere, untouched here: stays deleted.
  check("a card deleted elsewhere stays deleted", titles(mergeLesson(lesson([card("b", "B"), card("c", "C")]), mine, base)) === "B,C2");
  // Lesson settings: renamed elsewhere, cards changed here.
  check("a lesson renamed elsewhere keeps its name", mergeLesson(lesson(now.modules, "Renamed"), mine, base).title === "Renamed");
  check("a lesson renamed here takes the new name", mergeLesson(now, lesson(mine.modules, "Mine"), base).title === "Mine");
  check("a malformed base is ignored", titles(mergeLesson(now, mine, { cards: null } as never)) === "A,B,C2");

  let failed = 0;
  for (const [name, ok, extra] of rows) { if (!ok) failed++; console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`); }
  console.log(`\n${rows.length - failed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
main();
