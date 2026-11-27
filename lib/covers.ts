// Covers from the teacher's own AI: four paper covers it picks from what the course teaches (any AI service can, since
// it only chooses from our motifs and colours), words to search photos with, and, with a Google key, a drawn picture.
import fs from "fs/promises";
import path from "path";
import { aiOf, ask, openKey } from "./aifeedback";
import { presignPut, r2Ready } from "./blob";
import { autoCover, COVER_COLORS, isCoverColor, isMotif, MOTIFS } from "./coverlib";
import { db, save, type User } from "./store";
import type { Course } from "./types";
import { storedName, UPLOAD_DIR } from "./uploads";

export type CoverIdea = { motif: string; color: string; seed: number };

/** What the course is about, briefly: its name, and its weeks' and lessons' titles. */
function outline(c: Course) {
  const lines = [`Course: ${c.title}${c.subtitle ? ` (${c.subtitle})` : ""}`];
  for (const w of c.weeks.slice(0, 12)) lines.push(`- ${w.title}: ${w.lessons.slice(0, 6).map((l) => l.title).join("; ")}`);
  return lines.join("\n").slice(0, 3000);
}

/** Four paper covers for a course, words to search photos with, and a picture to draw. Without AI: from its name. */
export async function suggestCovers(c: Course, user: User | undefined): Promise<{ covers: CoverIdea[]; photo: string; scene: string; byAi: boolean }> {
  const auto = autoCover(c);
  const fallback = () => {
    const others = COVER_COLORS.filter((x) => x !== auto.color);
    const motifs = MOTIFS.filter((m) => m.words.test(`${c.title} ${c.subtitle ?? ""}`)).map((m) => m.id);
    return [auto, ...[0, 1, 2].map((i) => ({ motif: motifs[(i + 1) % motifs.length] ?? auto.motif, color: others[(auto.seed + i * 3) % others.length], seed: (auto.seed + 97 * (i + 1)) % 1000 }))];
  };
  const plain = { covers: fallback(), photo: c.title, scene: c.title, byAi: false };
  const ai = aiOf(user);
  if (!ai) return plain;
  const system = "You choose cover art for a course on a learning site. Answer with JSON only, no prose.";
  const text = `${outline(c)}

Pick four different covers. Each is a paper-cut scene: one motif and one paper colour.
Motifs: ${MOTIFS.map((m) => `${m.id} (${m.name})`).join(", ")}.
Colours: ${COVER_COLORS.join(", ")}.
Choose motifs that fit what this course teaches (the closest ones; repeat one in a second colour if only one fits), and colours that suit the subject.
Also give "photo": 2 to 4 words to search for a photo that fits the course, and "scene": one sentence describing a simple picture for its cover, with no words or letters in it.
Answer as {"covers":[{"motif":"…","color":"#…"}, …4], "photo":"…", "scene":"…"}`;
  try {
    const out = await ask(ai.provider, ai.key, ai.model, system, text);
    const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as { covers?: { motif?: string; color?: string }[]; photo?: string; scene?: string };
    const covers = (j.covers ?? []).filter((x) => isMotif(x.motif) && isCoverColor(x.color)).slice(0, 4).map((x, i) => ({ motif: x.motif!, color: x.color!.toLowerCase(), seed: (auto.seed + 131 * i) % 1000 }));
    if (!covers.length) return plain;
    while (covers.length < 4) covers.push(fallback()[covers.length]);
    return { covers, photo: String(j.photo ?? c.title).slice(0, 60), scene: String(j.scene ?? c.title).slice(0, 300), byAi: true };
  } catch {
    return plain;
  }
}

/** The teacher's Google key, if they have one saved (in use or not). */
export function googleKey(user: User | undefined): string | null {
  if (!user?.ai) return null;
  if (user.ai.provider === "gemini") return user.ai.key ? openKey(user.ai.key) : null;
  const g = user.ai.saved?.gemini;
  return g ? openKey(g.key) : null;
}

/** A Google model that draws pictures, if the key has one. */
async function drawingModel(key: string): Promise<string | null> {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  const j = r?.ok ? ((await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }) : {};
  const ok = (j.models ?? []).filter((m) => /gemini.*image/.test(m.name) && !/tts|preview-tts/.test(m.name) && m.supportedGenerationMethods?.includes("generateContent"));
  // The newest that isn't a preview, else the newest.
  const sorted = ok.sort((a, b) => b.name.localeCompare(a.name));
  return (sorted.find((m) => !/preview|exp/.test(m.name)) ?? sorted[0])?.name ?? null;
}

export class CoverError extends Error {}

/** Draw a cover with the teacher's Google key and keep it as an upload of theirs. */
export async function drawCover(c: Course, user: User, scene: string): Promise<{ url: string; by: string }> {
  const key = googleKey(user);
  if (!key) throw new CoverError("Drawing a cover needs a Google (Gemini) key in Settings → AI.");
  const model = await drawingModel(key);
  if (!model) throw new CoverError("Your Google key doesn’t offer a model that draws pictures.");
  const prompt = `A wide cover illustration for a course called “${c.title}”${c.subtitle ? ` (${c.subtitle})` : ""}: ${scene}. Soft, friendly, uncluttered, plenty of calm space, gentle colours. No words, letters or numbers anywhere in the picture.`;
  const call = (withShape: boolean) => fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"], ...(withShape ? { imageConfig: { aspectRatio: "16:9" } } : {}) } }),
  }).catch(() => null);
  let r = await call(true);
  if (r?.status === 400) r = await call(false);
  if (!r) throw new CoverError("Google didn’t answer in time. Try again.");
  if (!r.ok) throw new CoverError(r.status === 429 ? "Your Google key is over its limit or out of credit." : `Google couldn’t draw it (${r.status}).`);
  const j = (await r.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] };
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!part?.data) throw new CoverError("Google sent no picture back (it may have been stopped by its safety rules). Try again.");
  const bytes = Buffer.from(part.data, "base64");
  const ext = /jpe?g/.test(part.mimeType ?? "") ? "jpg" : /webp/.test(part.mimeType ?? "") ? "webp" : "png";
  const type = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  const stored = storedName(ext);
  if (r2Ready()) {
    const put = await fetch(await presignPut(stored, type, bytes.length), { method: "PUT", headers: { "content-type": type }, body: new Uint8Array(bytes) });
    if (!put.ok) throw new CoverError("The picture couldn’t be stored. Try again.");
  } else {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, stored), bytes);
  }
  db().uploads[stored] = { by: `u:${user.id}`, size: bytes.length, at: Date.now() };
  save();
  return { url: `/api/upload/${stored}`, by: `Drawn by ${model.replace("models/", "")}` };
}
