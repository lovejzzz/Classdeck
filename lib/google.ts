// "Sign in with Google": checks the ID token Google's button hands the browser.
// Only the public client id is needed (GOOGLE_CLIENT_ID); there is no client secret.
import crypto from "node:crypto";

type Jwk = crypto.JsonWebKey & { kid: string };
const g = globalThis as unknown as { __googleKeys?: { keys: Jwk[]; until: number } };

async function keys(): Promise<Jwk[]> {
  if (g.__googleKeys && g.__googleKeys.until > Date.now()) return g.__googleKeys.keys;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!r.ok) throw new Error("Couldn’t reach Google");
  const age = Number(r.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 3600);
  const { keys } = (await r.json()) as { keys: Jwk[] };
  g.__googleKeys = { keys, until: Date.now() + age * 1000 };
  return keys;
}

export interface GoogleUser { sub: string; email: string; name: string }

/** The person in a Google ID token, or null if the token isn't genuine, is expired, or is meant for another site. */
export async function verifyGoogle(token: string, clientId: string): Promise<GoogleUser | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header: { alg?: string; kid?: string }, claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(h, "base64url").toString());
    claims = JSON.parse(Buffer.from(p, "base64url").toString());
  } catch {
    return null;
  }
  if (header.alg !== "RS256") return null;
  const jwk = (await keys()).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const ok = crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(s, "base64url"));
  if (!ok) return null;
  const now = Date.now() / 1000;
  if (claims.iss !== "accounts.google.com" && claims.iss !== "https://accounts.google.com") return null;
  if (claims.aud !== clientId) return null;
  if (typeof claims.exp !== "number" || claims.exp < now - 60) return null;
  if (claims.email_verified !== true || typeof claims.email !== "string" || typeof claims.sub !== "string") return null;
  const email = claims.email.toLowerCase();
  return { sub: claims.sub, email, name: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim().slice(0, 60) : email.split("@")[0] };
}
