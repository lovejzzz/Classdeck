// 连接器：把一个外部 API 包装成学生能在模块里使用的“工具”。
// 两种写法：
//   1. 声明式（Manifest）：一段 JSON 描述网址、参数和怎样取结果。不用写代码，可以在网页上添加。
//   2. 代码式（Connector）：需要多步请求或特殊逻辑时，用 TypeScript 写。

export interface InputSpec {
  name: string;
  label: string;
  type?: "text" | "textarea" | "select";
  placeholder?: string;
  /** For "select": [value, label] pairs. The first is the default. */
  options?: [string, string][];
  /** Can be left empty. */
  optional?: boolean;
}

/** Shelves on the connectors page and in the card editor. */
export const CATEGORIES = ["AI", "Language & writing", "Research", "Science & data", "Media", "Custom"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface ActionSpec {
  id: string;
  title: string;
  description?: string;
  inputs: InputSpec[];
  /** 只给老师用，不会出现在学生的工具栏里。 */
  teacherOnly?: boolean;
}

/** 所有连接器都把结果整理成这四种形状之一，界面只需要会画这四种。 */
export type ToolResult =
  | { render: "card"; title: string; text: string; image?: string; url?: string }
  | { render: "list"; items: { title: string; text: string; url?: string }[] }
  | { render: "table"; columns: string[]; rows: string[][] }
  | { render: "text"; text: string }
  | { render: "gallery"; items: { title: string; image: string; url?: string; credit?: string }[] };

export interface InvokeContext {
  moduleTitle?: string;
  moduleBody?: string;
  moduleCriteria?: string;
}

export interface Connector {
  id: string;
  name: string;
  description: string;
  icon: string;
  kind: "builtin" | "custom";
  category: Category;
  /** 需要的服务器环境变量。缺少时显示为“未配置”。 */
  requiresEnv?: string[];
  host?: string;
  actions: ActionSpec[];
  configured(): boolean;
  invoke(actionId: string, input: Record<string, string>, ctx: InvokeContext): Promise<ToolResult>;
}

export type OutputSpec =
  | { render: "card"; map: { title: string; text: string; image?: string; url?: string } }
  | { render: "list"; items: string; map: { title: string; text: string; url?: string }; limit?: number }
  | { render: "gallery"; items: string; map: { title: string; image: string; url?: string; credit?: string }; limit?: number }
  | { render: "table"; rows: string; columns: { label: string; path: string }[]; limit?: number }
  | { render: "text"; path: string };

export interface ManifestAction extends ActionSpec {
  /** 路径模板，如 /page/summary/{title}。只支持 GET，学生的操作不会修改外部数据。 */
  path: string;
  query?: Record<string, string>;
  output: OutputSpec;
}

export interface Manifest {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category?: Category;
  baseUrl: string;
  headers?: Record<string, string>;
  /** 密钥只从服务器环境变量读取，永远不会发到浏览器。 */
  auth?: { type: "header" | "query"; name: string; env: string; prefix?: string };
  actions: ManifestAction[];
}

export type ErrorCode = "not_configured" | "bad_input" | "upstream" | "forbidden" | "rate_limited" | "not_found";

export class ConnectorError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
  }
}

/** 发给浏览器的连接器描述（不含任何密钥或实现）。 */
export interface ConnectorInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  kind: "builtin" | "custom";
  category: Category;
  host?: string;
  configured: boolean;
  requiresEnv: string[];
  actions: ActionSpec[];
}
