import dns from "dns/promises";
import net from "net";
import { ConnectorError } from "./types";

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 10_000;

function isPrivate(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivate(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/** 自定义连接器只能访问公网的 https 地址，防止被用来探测服务器内网。 */
export async function assertPublicHttps(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConnectorError("bad_input", "That isn't a valid URL");
  }
  if (url.protocol !== "https:") throw new ConnectorError("forbidden", "Only https URLs are allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new ConnectorError("forbidden", "Private network addresses aren't allowed");
  }
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (addrs.length === 0 || addrs.some(isPrivate)) {
    throw new ConnectorError("forbidden", "Private network addresses aren't allowed");
  }
}

export async function fetchJson(
  url: string,
  opts: { headers?: Record<string, string>; custom?: boolean } = {},
): Promise<unknown> {
  if (opts.custom) await assertPublicHttps(url);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "classdeck-prototype/0.1", ...opts.headers },
      redirect: opts.custom ? "error" : "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new ConnectorError("upstream", "Can't reach this service. Try again later.");
  }
  if (res.status === 404) throw new ConnectorError("not_found", "No results. Try different words.");
  if (res.status === 401 || res.status === 403) throw new ConnectorError("not_configured", "The service refused the request (it may need a key, or it blocks server requests)");
  if (!res.ok) throw new ConnectorError("upstream", `The service returned an error (${res.status})`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new ConnectorError("upstream", "The response is too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new ConnectorError("upstream", "The service didn't return JSON");
  }
}

/**
 * Fetch an HTML page for a link preview. Follows up to three redirects by hand so every hop
 * is checked against the private-network rule, and reads at most 512 KB.
 */
export async function fetchHtml(raw: string): Promise<{ url: string; html: string }> {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicHttps(url);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Mozilla/5.0 (compatible; classdeck-preview/0.1)" },
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
    } catch {
      throw new ConnectorError("upstream", "Couldn’t reach that page");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    if (!res.ok) throw new ConnectorError("upstream", `That page returned an error (${res.status})`);
    const reader = res.body?.getReader();
    let html = "";
    const dec = new TextDecoder();
    while (reader && html.length < 512_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader?.cancel().catch(() => {});
    return { url, html };
  }
  throw new ConnectorError("upstream", "Too many redirects");
}
