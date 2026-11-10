// 数据模型：课程 → 周 → 课 → 模块。模块是最小单位。

export type Density = "spacious" | "comfortable" | "compact";
export type Autonomy = "sequential" | "free";
export type Horizon = "lesson" | "week" | "term";
export type Entry = "code" | "account";
export type PresetId = "primary" | "secondary" | "higher";

export interface Profile {
  preset: PresetId | "custom";
  density: Density;
  autonomy: Autonomy;
  horizon: Horizon;
  entry: Entry;
}

export type ModuleType =
  | "read"
  | "explore"
  | "practice"
  | "wall"
  | "submit"
  | "quiz"
  | "reflect"
  | "selfcheck"
  | "studio";

/** 挂在模块上的一个工具：指向某个连接器的某个动作。 */
export interface ToolRef {
  connector: string;
  action: string;
  label?: string;
  defaults?: Record<string, string>;
}

export type AttachmentKind = "image" | "video" | "audio" | "file" | "link";

/** 卡牌上的素材：图片、视频、录音、文件或链接。 */
export interface Attachment {
  id: string;
  kind: AttachmentKind;
  url: string;
  name?: string;
  size?: number;
  /** For video and video links: the segment to watch, in seconds. */
  start?: number;
  end?: number;
  /** Credit line for images found through search. */
  credit?: string;
}

/** How a wall card behaves: who posts, how people respond, and moderation. */
export interface WallSettings {
  posting: "students" | "teacher";
  comments: boolean;
  reactions: "likes" | "votes" | "both" | "none";
  anonymous: boolean;
  approval: boolean;
}

export interface Comment {
  id: string;
  /** A student id, or "teacher". */
  from: string;
  text: string;
  at: number;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  /** 正确选项的下标。发给学生前会被服务器去掉。 */
  answer?: number;
}

export type Audience =
  | { kind: "all" }
  | { kind: "branch"; slot: string; variant: string }
  | { kind: "student"; studentId: string };

export interface Module {
  id: string;
  type: ModuleType;
  title: string;
  body: string;
  audience: Audience;
  tools: ToolRef[];
  attachments?: Attachment[];
  questions?: Question[];
  wall?: WallSettings;
  /** 为真时，必须先完成前面的模块才能打开（覆盖课程的自主权设置）。 */
  gate?: boolean;
  /** 只在发给学生时设置：这张卡片不是全班共有的（分支或个人模块）。 */
  personal?: boolean;
  /** Suggested time in minutes, shown on the card like a cost. */
  minutes?: number;
  /** Where students hand in work from this card. */
  submitTo?: "personal" | "studio";
  /** What "done" means for this card. */
  criteria?: string;
  /** Skill ids this card practices (from course.skills). */
  skills?: string[];
  /** Set only for students: this card is one of several paths they can pick from. */
  choice?: { slot: string; variant: string; recommended: boolean; count: number };
  /** Set only for students: the version they picked in a choice slot. */
  picked?: boolean;
}

export interface SessionPlan {
  minutes: number;
  agenda: { label: string; minutes: number; roundRobin?: boolean }[];
}

export interface Lesson {
  id: string;
  title: string;
  /** One-line goal shown under the lesson title. */
  goal?: string;
  modules: Module[];
  /** Version slots where students pick their own path. lesson.branches then holds the teacher's recommendation. */
  choiceSlots?: string[];
  /** Agenda for this week's group session (Collab Studio). */
  session?: SessionPlan;
  /** 分支分配：slot → 学生 → 版本。没有记录的学生拿该 slot 的第一个版本。 */
  branches: Record<string, Record<string, string>>;
}

export interface Week {
  id: string;
  title: string;
  lessons: Lesson[];
}

export interface Student {
  id: string;
  name: string;
}

export interface Skill {
  id: string;
  name: string;
}

export interface Level {
  n: number;
  name: string;
  description: string;
  use: string;
}

export interface Group {
  id: string;
  name: string;
  studentIds: string[];
}

export interface Course {
  id: string;
  title: string;
  subtitle?: string;
  skills?: Skill[];
  levels?: Level[];
  groups?: Group[];
  joinCode: string;
  access?: { joinOpen: boolean; passcode?: string; guestToken?: string };
  profile: Profile;
  students: Student[];
  weeks: Week[];
  currentLessonId: string;
  enabledConnectors: string[];
}

export type Status = "todo" | "doing" | "done";

export interface Progress {
  status: Status;
  output?: string;
  answers?: Record<string, number>;
  results?: Record<string, boolean>;
  score?: number;
  /** Recordings, files, and links the student added as their work. */
  work?: Attachment[];
  /** Self-assessment: skill id → level 1–4. */
  ratings?: Record<string, number>;
  /** Kept as one of the student's selected works. */
  starred?: boolean;
  updatedAt: number;
}

/** A piece of work a student posts to their group's Collab Studio. */
export interface StudioPost {
  id: string;
  moduleId: string;
  studentId: string;
  groupId: string;
  title: string;
  audience: string;
  purpose: string;
  skill: string;
  question: string;
  text: string;
  work: Attachment[];
  likes?: string[];
  createdAt: number;
  updatedAt: number;
}

/** Structured peer feedback on a studio post. */
export interface Feedback {
  id: string;
  postId: string;
  fromId: string;
  observed: string;
  effect: string;
  next: string;
  level?: number;
  createdAt: number;
}

export interface Post {
  id: string;
  moduleId: string;
  /** Empty when the post is anonymous and you aren't its author or the teacher. */
  studentId: string;
  text: string;
  createdAt: number;
  work?: Attachment[];
  likes?: string[];
  votes?: string[];
  comments?: Comment[];
  anonymous?: boolean;
  /** False while waiting for the teacher's approval. */
  approved?: boolean;
  /** Set only for students: this is your own post. */
  mine?: boolean;
  /** Set by the teacher. */
  pinned?: boolean;
}

export interface ToolLogEntry {
  studentId: string;
  moduleId: string;
  connector: string;
  action: string;
  at: number;
}

/** 课堂动态：学生做了什么。老师端的通知中心读这个。 */
export interface ClassEvent {
  id: string;
  at: number;
  kind: "done" | "post" | "wrong" | "quiz" | "tool" | "studio" | "feedback";
  studentId: string;
  moduleId: string;
  text: string;
}

export type ProgressMap = Record<string, Record<string, Progress>>; // 学生 → 模块 → 进度

export interface CourseState {
  course: Course;
  progress: ProgressMap;
  posts: Post[];
  toolUse: Record<string, Record<string, number>>; // 学生 → 模块 → 次数
  events: ClassEvent[]; // 只有老师端拿到
  /** Paths students picked: student → slot → variant. */
  choices: Record<string, Record<string, string>>;
  studio: { posts: StudioPost[]; feedback: Feedback[] };
}
