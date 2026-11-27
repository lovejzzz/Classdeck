// Finding code in students' work (lib/code.ts).   npx tsx tests/code.test.ts
import { codeKey, looksLikePython, previewOf, splitCode } from "../lib/code";
import { tidyError } from "../lib/pyrun";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { if (ok) passed++; else failures.push(`${name} — ${JSON.stringify(detail)?.slice(0, 300)}`); };

const dice = `import random\nscore = 0\nfor i in range(3):\n    roll = random.randint(1, 6)\n    print("You rolled", roll)\n    score = score + roll\nprint("Total:", score)\n\nIt's a dice game: three rolls, and it adds up your score.`;
const d = splitCode(dice);
check("the dice game: code, then the sentence", d.length === 2 && d[0].kind === "code" && d[0].kind === "code" && (d[0] as { lang: string }).lang === "python" && d[1].kind === "text" && d[1].text.startsWith("It's a dice game"), d);
check("indentation is kept", d[0].text.includes("\n    roll = random.randint(1, 6)"), d[0].text);
const glued = `x = 1\nfor i in range(2):\n    x += i\nprint(x)\nThat prints 2.`;
check("code and a sentence with no blank line between", splitCode(glued).map((p) => p.kind).join() === "code,text", splitCode(glued));
check("a fenced block is code", splitCode("Here:\n```python\nprint('hi')\n```\nDone.").map((p) => p.kind).join() === "text,code,text", splitCode("Here:\n```python\nprint('hi')\n```\nDone."));
check("a fenced block in another language isn't run", (splitCode("```js\nconsole.log(1)\n```")[0] as { lang: string }).lang === "other", null);

for (const prose of [
  "Takeaways: open with a story. Strength: my examples are concrete.",
  "My goal: they try one weekly data check-in.\nOpening: a patient who waited 2 hours.",
  "I learned that x = 5 is how you set a variable.",
  "If you're nervous: breathe. Else: keep going.",
  "Three points:\n1. Data is already there.\n2. Small checks beat big reports.",
]) check(`prose stays prose: ${prose.slice(0, 30)}`, splitCode(prose).every((p) => p.kind === "text"), splitCode(prose));
check("one line isn't enough", !looksLikePython(["print('hi')"]), null);
check("a two-line program is", looksLikePython(["name = input('Name? ')", "print('Hi', name)"]), null);
check("a function", looksLikePython(["def area(w, h):", "    return w * h", "", "print(area(2, 3))"]), null);

check("preview of code: its first lines", previewOf(dice).code === "import random  ⏎  score = 0", previewOf(dice));
check("preview of prose: squeezed text", previewOf("Hello **there**\nfriend").text === "Hello there friend", previewOf("Hello **there**\nfriend"));
check("the same code, the same key; changed code, a new key", codeKey("print(1)") === codeKey("print(1)") && codeKey("print(1)") !== codeKey("print(2)"), null);

// Python's errors, said about the student's code only.
check("an error: its line and the error", tidyError('Traceback (most recent call last):\n  File "/lib/python312.zip/_pyodide/_base.py", line 573, in eval_code_async\n  File "<exec>", line 3, in <module>\nZeroDivisionError: division by zero') === "Line 3: ZeroDivisionError: division by zero", null);
check("inside a function: the innermost line", tidyError('Traceback:\n  File "<exec>", line 5, in <module>\n  File "<exec>", line 2, in area\nNameError: name \'w\' is not defined') === "Line 2 (in area): NameError: name 'w' is not defined", null);
check("a syntax error keeps its line", tidyError('  File "<exec>", line 3\n    for i in range(3)\n                     ^\nSyntaxError: expected \':\'') === "Line 3: SyntaxError: expected ':'", null);

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log("  ✗ " + f);
process.exit(failures.length ? 1 : 0);
