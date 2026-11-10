import { fetchJson } from "./safety";
import { ConnectorError, type Connector, type Manifest, type OutputSpec, type ToolResult } from "./types";

/** 按 "a.b.0.c" 这样的路径从 JSON 里取值。 */
export function pick(data: unknown, path: string): unknown {
  if (!path) return data;
  let cur: unknown = data;
  for (const key of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function str(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(str).join("、");
  if (typeof v === "object") return JSON.stringify(v);
  // 外部服务返回的 HTML 一律去掉标签，只留文字
  return String(v).replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function fill(template: string, input: Record<string, string>, encode: boolean) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = (input[k] ?? "").trim();
    return encode ? encodeURIComponent(v) : v;
  });
}

function shape(data: unknown, out: OutputSpec): ToolResult {
  switch (out.render) {
    case "card": {
      const image = out.map.image ? str(pick(data, out.map.image)) : "";
      const url = out.map.url ? str(pick(data, out.map.url)) : "";
      return {
        render: "card",
        title: str(pick(data, out.map.title)),
        text: str(pick(data, out.map.text)),
        image: image.startsWith("https://") ? image : undefined,
        url: url.startsWith("https://") ? url : undefined,
      };
    }
    case "list": {
      const arr = pick(data, out.items);
      const items = (Array.isArray(arr) ? arr : []).slice(0, out.limit ?? 8).map((it) => {
        const url = out.map.url ? str(pick(it, out.map.url)) : "";
        return { title: str(pick(it, out.map.title)), text: str(pick(it, out.map.text)), url: url.startsWith("https://") ? url : undefined };
      });
      if (items.length === 0) throw new ConnectorError("not_found", "No results. Try different words.");
      return { render: "list", items };
    }
    case "gallery": {
      const arr = pick(data, out.items);
      const items = (Array.isArray(arr) ? arr : [])
        .map((it) => {
          const url = out.map.url ? str(pick(it, out.map.url)) : "";
          return {
            title: str(pick(it, out.map.title)),
            image: str(pick(it, out.map.image)),
            url: url.startsWith("https://") ? url : undefined,
            credit: out.map.credit ? str(pick(it, out.map.credit)) || undefined : undefined,
          };
        })
        .filter((it) => it.image.startsWith("https://"))
        .slice(0, out.limit ?? 12);
      if (items.length === 0) throw new ConnectorError("not_found", "No images found. Try different words.");
      return { render: "gallery", items };
    }
    case "table": {
      const arr = pick(data, out.rows);
      const rows = (Array.isArray(arr) ? arr : []).slice(0, out.limit ?? 10).map((r) => out.columns.map((c) => str(pick(r, c.path))));
      if (rows.length === 0) throw new ConnectorError("not_found", "No results. Try different words.");
      return { render: "table", columns: out.columns.map((c) => c.label), rows };
    }
    case "text":
      return { render: "text", text: str(pick(data, out.path)) };
  }
}

export function fromManifest(m: Manifest, kind: "builtin" | "custom"): Connector {
  const env = m.auth?.env;
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    icon: m.icon ?? "🔌",
    kind,
    category: kind === "custom" ? "Custom" : m.category ?? "Research",
    host: new URL(m.baseUrl).hostname,
    requiresEnv: env ? [env] : [],
    actions: m.actions.map(({ id, title, description, inputs, teacherOnly }) => ({ id, title, description, inputs, teacherOnly })),
    configured: () => !env || !!process.env[env],
    async invoke(actionId, input) {
      const action = m.actions.find((a) => a.id === actionId);
      if (!action) throw new ConnectorError("bad_input", "Unknown action");
      input = { ...input };
      for (const spec of action.inputs) {
        if (spec.type === "select" && spec.options?.length) {
          // Only the listed values; anything else falls back to the default.
          if (!spec.options.some(([v]) => v === input[spec.name])) input[spec.name] = spec.options[0][0];
        }
        if (!spec.optional && !(input[spec.name] ?? "").trim()) throw new ConnectorError("bad_input", `Enter “${spec.label}”`);
      }
      const url = new URL(m.baseUrl.replace(/\/$/, "") + fill(action.path, input, true));
      for (const [k, v] of Object.entries(action.query ?? {})) url.searchParams.set(k, fill(v, input, false));
      const headers: Record<string, string> = { ...m.headers };
      if (m.auth) {
        const secret = process.env[m.auth.env];
        if (!secret) throw new ConnectorError("not_configured", `${m.auth.env} isn't set on the server`);
        const value = (m.auth.prefix ?? "") + secret;
        if (m.auth.type === "header") headers[m.auth.name] = value;
        else url.searchParams.set(m.auth.name, value);
      }
      const data = await fetchJson(url.toString(), { headers, custom: kind === "custom" });
      return shape(data, action.output);
    },
  };
}

const ID = /^[a-z][a-z0-9-]{1,30}$/;
const NAME = /^\w{1,30}$/;

/** 检查网页上提交的自定义连接器。不合格就抛出说明原因的错误。 */
export function validateManifest(x: unknown, takenIds: string[]): Manifest {
  const bad = (msg: string): never => {
    throw new ConnectorError("bad_input", msg);
  };
  if (!x || typeof x !== "object") bad("Expected a JSON object");
  const m = x as Manifest;
  if (!ID.test(m.id ?? "")) bad("id must be lowercase letters, digits, and dashes, starting with a letter");
  if (takenIds.includes(m.id)) bad(`The id “${m.id}” is already taken`);
  if (!m.name || typeof m.name !== "string") bad("Missing name");
  if (typeof m.description !== "string") bad("Missing description");
  let base: URL | undefined;
  try {
    base = new URL(m.baseUrl);
  } catch {
    bad("baseUrl isn't a valid URL");
  }
  if (base!.protocol !== "https:") bad("baseUrl must start with https://");
  if (m.auth) {
    if (m.auth.type !== "header" && m.auth.type !== "query") bad("auth.type must be header or query");
    // 只允许读取 LMS_ 开头的变量，这样自定义连接器拿不到服务器上的其他密钥。
    if (!/^LMS_[A-Z0-9_]+$/.test(m.auth.env ?? "")) bad("auth.env must be an uppercase variable name starting with LMS_");
    if (!m.auth.name) bad("Missing auth.name");
  }
  if (!Array.isArray(m.actions) || m.actions.length === 0) bad("At least one action is required");
  for (const a of m.actions) {
    if (!NAME.test(a.id ?? "")) bad("Invalid action.id");
    if (!a.title) bad(`Action “${a.id}” is missing a title`);
    if (typeof a.path !== "string" || !a.path.startsWith("/")) bad(`Action “${a.id}”: path must start with /`);
    if (!Array.isArray(a.inputs)) bad(`Action “${a.id}” is missing inputs`);
    for (const i of a.inputs) if (!NAME.test(i.name ?? "") || !i.label) bad(`Action “${a.id}” has an invalid input`);
    const r = a.output?.render;
    if (r !== "card" && r !== "list" && r !== "table" && r !== "text" && r !== "gallery") bad(`Action “${a.id}”: output.render must be card, list, table, text, or gallery`);
  }
  return {
    id: m.id, name: m.name, description: m.description, icon: m.icon, baseUrl: m.baseUrl,
    headers: m.headers, auth: m.auth, actions: m.actions,
  };
}
