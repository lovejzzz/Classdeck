// Two tabs saving the same lesson (lib/merge.ts), checked without a server: npx tsx tests/merge.test.ts
export {};
async function main() {
  const { baseOf, mergeLesson, optionMap, moveAnswers } = await import("../lib/merge");
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

  // Options changed after students answered.
  check("same options: nothing moves", optionMap(["a", "b", "c"], ["a", "b", "c"]) === null);
  check("first option removed: the rest move up", JSON.stringify(optionMap(["a", "b", "c"], ["b", "c"])) === "[-1,0,1]");
  check("an option reworded in place keeps its place", optionMap(["a", "b", "c"], ["a", "B!", "c"]) === null);
  check("an option added at the end: nothing moves", JSON.stringify(optionMap(["a", "b"], ["a", "b", "c"])) === "[0,1]");
  const q = (options: string[], answer: number) => ({ id: "q", text: "?", options, answer });
  const mod = (options: string[], answer: number) => ({ id: "m", title: "Q", type: "practice", kind: "choice", body: "", questions: [q(options, answer)] }) as unknown as L["modules"][number];
  const prog = () => ({ s1: { m: { status: "done", answers: { q: 1 }, dealt: { q: 1 }, first: { q: false } } }, s2: { m: { status: "done", answers: { q: 0 }, dealt: { q: 0 }, first: { q: true } } } }) as never;
  let p = prog() as Record<string, Record<string, { answers: Record<string, unknown>; dealt: Record<string, unknown>; first: Record<string, boolean> }>>;
  moveAnswers([mod(["A", "B", "C"], 0)], [mod(["B", "C"], 0)], p as never);
  check("a chosen option that moved: the answer follows it", p.s1.m.answers.q === 0 && p.s1.m.dealt.q === 0, p.s1.m);
  check("a chosen option that was removed: the answer is dropped", !("q" in p.s2.m.answers) && !("q" in p.s2.m.dealt), p.s2.m);
  p = prog() as typeof p;
  moveAnswers([mod(["A", "B", "C"], 0)], [mod(["A", "B", "C"], 1)], p as never);
  check("the right answer fixed: first answers are marked again", p.s1.m.first.q === true && p.s2.m.first.q === false, [p.s1.m.first, p.s2.m.first]);

  // What changed between two versions of a student's work.
  const { wordDiff } = await import("../lib/diff");
  const dd = wordDiff("¿Dónde está hotel? Gracias.", "¿Dónde está el hotel? Muchas gracias.")!;
  const show = dd.map((x) => (x.k === "same" ? x.t : x.k === "add" ? `[+${x.t.trim()}]` : `[-${x.t.trim()}]`)).join("");
  check("word diff: added and removed words", show.includes("[+el]") && show.includes("[-Gracias.]") && show.includes("[+Muchas"), show);
  check("word diff: unchanged text is one piece", wordDiff("a b c", "a b c")!.length === 1);
  check("word diff: too long to compare says so", wordDiff("x ".repeat(3000), "y") === null);

  let failed = 0;
  for (const [name, ok, extra] of rows) { if (!ok) failed++; console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`); }
  console.log(`\n${rows.length - failed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
main();
