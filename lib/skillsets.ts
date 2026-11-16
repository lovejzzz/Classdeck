// Ready-made skill sets a teacher can start from. Every course keeps its own copy and can rename, add, or remove skills.
import type { Level, Skill } from "./types";

export interface SkillSet {
  id: string;
  label: string;
  skills: Skill[];
}

export const SKILL_SETS: SkillSet[] = [
  {
    id: "speaking",
    label: "Public speaking",
    skills: [
      { id: "audience", name: "Audience & purpose" },
      { id: "structure", name: "Structure & storytelling" },
      { id: "vocal", name: "Vocal delivery" },
      { id: "body", name: "Body language & presence" },
      { id: "rehearsal", name: "Rehearsal & recall" },
      { id: "visual", name: "Visual support" },
    ],
  },
  {
    id: "music",
    label: "Music",
    skills: [
      { id: "mu-pitch", name: "Pitch & intonation" },
      { id: "mu-rhythm", name: "Rhythm & timing" },
      { id: "mu-harmony", name: "Harmony & theory" },
      { id: "mu-ear", name: "Ear training" },
      { id: "mu-tone", name: "Tone & technique" },
      { id: "mu-expression", name: "Expression & style" },
    ],
  },
  {
    id: "writing",
    label: "Writing",
    skills: [
      { id: "wr-ideas", name: "Ideas & argument" },
      { id: "wr-organization", name: "Organization" },
      { id: "wr-evidence", name: "Evidence & sources" },
      { id: "wr-style", name: "Style & voice" },
      { id: "wr-conventions", name: "Grammar & conventions" },
      { id: "wr-revision", name: "Revision" },
    ],
  },
  {
    id: "language",
    label: "Language learning",
    skills: [
      { id: "la-listening", name: "Listening" },
      { id: "la-speaking", name: "Speaking" },
      { id: "la-reading", name: "Reading" },
      { id: "la-writing", name: "Writing" },
      { id: "la-vocabulary", name: "Vocabulary" },
      { id: "la-grammar", name: "Grammar" },
    ],
  },
];

/** Four general levels that fit most subjects. */
export const DEFAULT_LEVELS: Level[] = [
  { n: 1, name: "Starting", description: "The skill isn’t evident yet; a lot of help is needed.", use: "Pick one thing to practice next." },
  { n: 2, name: "Developing", description: "The skill shows up, but not consistently.", use: "Point to what worked and one place to adjust." },
  { n: 3, name: "Meeting the goal", description: "The skill is clear and consistent in this activity.", use: "Explain its effect using specific evidence." },
  { n: 4, name: "Going beyond", description: "The skill is used with judgment and adapted to the situation.", use: "Explain the choice and its effect." },
];
