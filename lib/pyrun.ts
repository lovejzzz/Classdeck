"use client";
// Running a student's Python in the browser: Pyodide (Python built for the web) in its own worker, so the code can't
// reach the page, the site or anyone's data, and never runs on our server. Loaded only when someone presses Run.

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
const LIMIT = 10_000;

const WORKER = `
importScripts("${PYODIDE}pyodide.js");
const ready = loadPyodide({ indexURL: "${PYODIDE}" });
onmessage = async (e) => {
  const { id, code, input } = e.data;
  let py;
  try { py = await ready; } catch (err) { postMessage({ id, type: "error", text: "Python couldn't load. Check your connection and try again." }); return; }
  postMessage({ id, type: "start" });
  const answers = (input || "").split("\\n");
  let next = 0;
  py.setStdin({ stdin: () => (next < answers.length && answers[next] !== "" ? answers[next++] : null) });
  py.setStdout({ batched: (s) => postMessage({ id, type: "out", text: s }) });
  py.setStderr({ batched: (s) => postMessage({ id, type: "out", text: s }) });
  try {
    await py.loadPackagesFromImports(code);
    const ns = py.globals.get("dict")();
    try { await py.runPythonAsync(code, { globals: ns }); } finally { ns.destroy(); }
    postMessage({ id, type: "done" });
  } catch (err) {
    postMessage({ id, type: "error", text: String((err && err.message) || err) });
  }
};`;

export type RunEvent = { type: "loading" } | { type: "start" } | { type: "out"; text: string } | { type: "done"; secs: number } | { type: "error"; text: string } | { type: "timeout" } | { type: "stopped" };

let worker: Worker | null = null;
let seq = 0;
let current: { id: number; stop: () => void } | null = null;

function fresh(): Worker {
  if (!worker) worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" })));
  return worker;
}
/** A worker that may be stuck (an endless loop) is thrown away; the next run starts a new one. */
function kill() {
  worker?.terminate();
  worker = null;
}

/**
 * Python's error, said about the student's code only: the line it stopped on (the innermost one in their code) and
 * the error. "Line 2 (in area): NameError: name 'w' is not defined".
 */
export function tidyError(text: string): string {
  const lines = text.split("\n").map((l) => l.trimEnd()).filter(Boolean);
  // "line 3, in area" in a traceback; a syntax error names only the line.
  const frames = [...text.matchAll(/File "<exec>", line (\d+)(?:, in (\S+))?/g)];
  const last = lines[lines.length - 1] ?? text;
  if (!frames.length) return last.trim();
  const [, line, where] = frames[frames.length - 1];
  return `Line ${line}${!where || where === "<module>" ? "" : ` (in ${where})`}: ${last.trim()}`;
}

/**
 * Run some Python; events come as it goes (its printing, then done or an error). Stops itself after 10 seconds of
 * running (the first load, which downloads Python, doesn't count). Returns a function that stops it.
 */
export function runPython(code: string, input: string, on: (e: RunEvent) => void): () => void {
  current?.stop();
  const id = ++seq;
  const w = fresh();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let started = 0;
  let over = false;
  const finish = () => { over = true; clearTimeout(timer); w.removeEventListener("message", listen); if (current?.id === id) current = null; };
  const listen = (e: MessageEvent) => {
    const m = e.data as { id: number; type: string; text?: string };
    if (m.id !== id || over) return;
    if (m.type === "start") { started = performance.now(); timer = setTimeout(() => { finish(); kill(); on({ type: "timeout" }); }, LIMIT); on({ type: "start" }); }
    else if (m.type === "out") on({ type: "out", text: m.text ?? "" });
    else if (m.type === "done") { finish(); on({ type: "done", secs: (performance.now() - started) / 1000 }); }
    else if (m.type === "error") { finish(); on({ type: "error", text: tidyError(m.text ?? "") }); }
  };
  w.addEventListener("message", listen);
  on({ type: "loading" });
  w.postMessage({ id, code, input });
  const stop = () => { if (over) return; finish(); kill(); on({ type: "stopped" }); };
  current = { id, stop };
  return stop;
}
