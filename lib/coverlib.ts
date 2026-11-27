// A course's cover: a picture (uploaded, found, or drawn by the teacher's AI), or a paper-cut scene from a small set of
// motifs in one colour. With nothing chosen, the motif comes from the course's name and the colour from its id, so every
// course has a cover from the start.
import type { Course } from "./types";

export type CourseCover = NonNullable<Course["cover"]>;

/** The paper motifs, each with the words in a course's name that call for it. */
export const MOTIFS: { id: string; name: string; words: RegExp }[] = [
  { id: "leaf", name: "Leaves and sun", words: /ecolog|ecosystem|biolog|plant|nature|environment|climate|garden|earth science|life science|animal|forest/i },
  { id: "flask", name: "Lab flask", words: /chemi|lab\b|science|experiment|molecul/i },
  { id: "atom", name: "Atom", words: /physic|atom|quantum|energy|electric|astronom|space/i },
  { id: "code", name: "Code window", words: /python|code|coding|program|javascript|computer|software|web dev|data science|algorithm|\bai\b|machine learning/i },
  { id: "speech", name: "Speech bubbles", words: /spanish|french|german|chinese|mandarin|japanese|korean|italian|english as|esl|language|conversation|travel|communicat/i },
  { id: "mic", name: "Microphone and stage", words: /speak|speech|present|pitch|talk|debate|voice|podcast|interview|caps\b/i },
  { id: "pen", name: "Page and pen", words: /writ|essay|persuasi|english|literatur|poetry|story|journal|grammar|rhetoric/i },
  { id: "gear", name: "Gear and flag", words: /histor|revolution|industr|engineer|war\b|civiliz|politic|government|civics/i },
  { id: "globe", name: "Globe", words: /geograph|world|global|culture|international|map\b/i },
  { id: "shapes", name: "Shapes", words: /math|algebra|geometr|calcul|statistic|number|fraction|arithmetic/i },
  { id: "chart", name: "Chart", words: /business|econom|market|finance|account|management|entrepreneur|data\b/i },
  { id: "notes", name: "Music", words: /music|song|choir|piano|guitar|band\b|rhythm/i },
  { id: "brush", name: "Brush and palette", words: /\bart\b|arts\b|design|paint|draw|photograph|film|creative/i },
  { id: "heart", name: "Heart", words: /health|wellbeing|well-being|nurs|medic|fitness|\bpe\b|physical education|psycholog|mindful/i },
  { id: "book", name: "Open book", words: /./ },
];
export const isMotif = (m: unknown): m is string => typeof m === "string" && MOTIFS.some((x) => x.id === m);

/** Paper colours a cover can be cut from. */
export const COVER_COLORS = ["#3d68a6", "#3f7a52", "#a0561f", "#6a4fa8", "#ad4767", "#287670", "#8c6a10", "#55544f"];
export const isCoverColor = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);

function hashOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** The cover a course gets without choosing one: its motif from its name, its colour from its id. */
export function autoCover(c: { id: string; title: string; subtitle?: string }): Required<Pick<CourseCover, "motif" | "color" | "seed">> {
  const text = `${c.title} ${c.subtitle ?? ""}`;
  const motif = MOTIFS.find((m) => m.words.test(text))!.id;
  const h = hashOf(c.id);
  return { motif, color: COVER_COLORS[h % COVER_COLORS.length], seed: h % 1000 };
}
/** What to draw: the chosen cover, filled in from the automatic one. */
export function coverOf(c: { id: string; title: string; subtitle?: string; cover?: CourseCover }) {
  const a = autoCover(c);
  return { ...a, ...c.cover, motif: c.cover?.motif ?? a.motif, color: c.cover?.color ?? a.color, seed: c.cover?.seed ?? a.seed };
}
