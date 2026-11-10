import fs from "fs";
import os from "os";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { ConnectorError, type Connector } from "./types";

const MODEL = process.env.LMS_AI_MODEL || "claude-opus-5-5";
// 这些模型支持服务器端的拒答回退：主模型拒答时由 API 自动换一个模型重试。
const SUPPORTS_FALLBACK = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1"]);

const TUTOR = `You are a teaching assistant helping one student during a lesson. Answer in plain English with short sentences and no jargon pile-ups.
Your goal is to help the student figure things out, not to do the work for them:
- If they ask about a concept, explain it clearly and give one everyday example.
- If they ask for the answer to a practice question or assignment, don't give it. Offer a hint, or ask a question that moves them one step forward.
- If you're not sure about a fact, say so and suggest they ask their teacher.
Keep answers under 100 words.`;

const SUMMARIZER = `You're helping a teacher quickly understand what the class posted on a shared wall. Write in English, no pleasantries.
Use these three parts, one or two sentences each:
1. Main ideas: group similar posts into two to four themes and say how many posts are in each.
2. Worth noticing: any clear misconceptions, and which post shows it.
3. Missing: one important angle on this topic that nobody mentioned.`;

const COACH = `You're giving a student feedback on a draft for one card in their course. Be warm, specific, and brief.
Write three short parts, no headings beyond the labels:
Works well: one concrete strength, quoting a few words from the draft.
Try next: the two changes that would help most, each tied to the card's goal or "done when" criteria.
Check: one question the student should ask themselves before finishing.
Never rewrite the draft for them and never write whole sentences they could paste in. Under 130 words.`;

const QUIZZER = `You write quick practice questions so a student can check their understanding of one card.
Write exactly three questions about the card's content (or the student's topic, if given), from easiest to hardest.
Format each as: the question on one line, then "Answer:" with a one-sentence answer on the next line, then a blank line.
The last question should ask them to apply the idea to their own situation; its answer should say what a good answer includes.`;

const SIMPLIFIER = `Rewrite the text so a student who finds it hard can understand it. Keep every important idea and keep the meaning exact.
Use short sentences, everyday words, and one concrete example if it helps. If there's a key term, keep it and explain it in brackets.
Don't add new information. Plain text only.`;

const QUESTION_WRITER = `You help a teacher write quiz questions for one card. Write four multiple-choice questions and one short-answer question.
For each multiple-choice question: the question, four options labelled A–D with exactly one correct, the correct letter, and a one-sentence explanation of why.
For the short-answer question: the question, two or three accepted answers, and an explanation.
Test understanding, not recall of exact wording. Make wrong options plausible misconceptions. Plain text, numbered.`;

const cardContext = (ctx: { moduleTitle?: string; moduleBody?: string; moduleCriteria?: string }) =>
  ctx.moduleTitle ? `Card: “${ctx.moduleTitle}”\n${ctx.moduleBody ?? ""}${ctx.moduleCriteria ? `\nDone when: ${ctx.moduleCriteria}` : ""}\n\n` : "";

async function complete(system: string, user: string): Promise<string> {
  let client: Anthropic;
  try {
    client = new Anthropic();
  } catch {
    throw new ConnectorError("not_configured", "The AI key (ANTHROPIC_API_KEY) isn't set on the server");
  }
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { effort: "low" },
      ...(SUPPORTS_FALLBACK.has(MODEL)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    });
    if (res.stop_reason === "refusal") return "The tutor can't answer that one. Try asking another way, or ask your teacher.";
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    return text || "The tutor didn't answer. Please try again.";
  } catch (e) {
    if (e instanceof ConnectorError) throw e;
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      throw new ConnectorError("not_configured", "The AI key is invalid or lacks permission");
    }
    if (e instanceof Anthropic.RateLimitError) throw new ConnectorError("rate_limited", "Lots of people are asking right now. Try again in a moment.");
    if (e instanceof Anthropic.APIError) throw new ConnectorError("upstream", `The AI service had an error (${e.status ?? "network"})`);
    throw new ConnectorError("not_configured", "The AI key (ANTHROPIC_API_KEY) isn't set on the server");
  }
}

export const ai: Connector = {
  id: "ai",
  name: "AI tutor",
  description: "Hints instead of answers, feedback on drafts, practice questions, and simpler explanations, all aware of the card a student is on. Teachers can draft quiz questions and summarize walls.",
  icon: "🧑‍🏫",
  kind: "builtin",
  category: "AI",
  host: "api.anthropic.com",
  requiresEnv: ["ANTHROPIC_API_KEY"],
  actions: [
    {
      id: "ask",
      title: "Ask the tutor",
      inputs: [{ name: "question", label: "Your question", type: "textarea", placeholder: "What's confusing you?" }],
    },
    {
      id: "feedback",
      title: "Get feedback on my draft",
      inputs: [{ name: "draft", label: "Your draft", type: "textarea", placeholder: "Paste your draft, outline, or script" }],
    },
    {
      id: "quizme",
      title: "Quiz me",
      inputs: [{ name: "topic", label: "Topic (optional)", placeholder: "Leave empty to use this card", optional: true }],
    },
    {
      id: "simplify",
      title: "Explain it simpler",
      inputs: [{ name: "text", label: "Text", type: "textarea", placeholder: "Paste the part that’s hard to follow" }],
    },
    {
      id: "draftquiz",
      title: "Draft quiz questions",
      teacherOnly: true,
      inputs: [{ name: "text", label: "Topic or source text", type: "textarea", placeholder: "Paste the card text or describe the topic" }],
    },
    {
      id: "summarize",
      title: "Summarize a wall",
      teacherOnly: true,
      inputs: [{ name: "text", label: "Posts", type: "textarea" }],
    },
  ],
  configured: () =>
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.ANTHROPIC_AUTH_TOKEN ||
    fs.existsSync(path.join(os.homedir(), ".config", "anthropic")),
  async invoke(action, input, ctx) {
    if (action === "ask") {
      const q = (input.question ?? "").trim();
      if (!q) throw new ConnectorError("bad_input", "Write your question first");
      const context = ctx.moduleTitle ? `The student is working on the card “${ctx.moduleTitle}”.\nCard content:\n${ctx.moduleBody ?? ""}\n\n` : "";
      return { render: "text", text: await complete(TUTOR, `${context}Student's question: ${q}`) };
    }
    if (action === "feedback") {
      const draft = (input.draft ?? "").trim();
      if (draft.length < 20) throw new ConnectorError("bad_input", "Paste a little more of your draft first");
      return { render: "text", text: await complete(COACH, `${cardContext(ctx)}Student's draft:\n${draft}`) };
    }
    if (action === "quizme") {
      const topic = (input.topic ?? "").trim();
      if (!topic && !ctx.moduleTitle) throw new ConnectorError("bad_input", "Enter a topic");
      return { render: "text", text: await complete(QUIZZER, `${cardContext(ctx)}${topic ? `Student's topic: ${topic}` : "Use the card's content."}`) };
    }
    if (action === "simplify") {
      const text = (input.text ?? "").trim();
      if (!text) throw new ConnectorError("bad_input", "Paste the text to simplify");
      return { render: "text", text: await complete(SIMPLIFIER, text) };
    }
    if (action === "draftquiz") {
      const text = (input.text ?? "").trim();
      if (!text) throw new ConnectorError("bad_input", "Paste the text or describe the topic");
      return { render: "text", text: await complete(QUESTION_WRITER, text) };
    }
    if (action === "summarize") {
      const text = (input.text ?? "").trim();
      if (!text) throw new ConnectorError("bad_input", "The wall is empty");
      return { render: "text", text: await complete(SUMMARIZER, text) };
    }
    throw new ConnectorError("bad_input", "Unknown action");
  },
};
