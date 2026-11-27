// The personal link a teacher pastes into their own AI (Claude, ChatGPT…) to use Questhand through MCP. The link holds
// a long random token: whoever has it acts as that teacher, so it's made new on request and can be turned off.
import crypto from "crypto";
import { openKey, sealKey } from "../aifeedback";
import { db, save, type User } from "../store";

const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** A new link for this account (the old one stops working). */
export function newToken(user: User): string {
  const token = `qh_${crypto.randomBytes(32).toString("base64url")}`;
  user.mcp = { hash: hash(token), sealed: sealKey(token), at: Date.now() };
  save();
  return token;
}
/** This account's current link token, if it has one. */
export function tokenOf(user: User): string | null {
  return user.mcp ? openKey(user.mcp.sealed) : null;
}
export function dropToken(user: User) {
  user.mcp = undefined;
  save();
}
/** Whose link this is (or nobody's). Compared by hash, in constant time. */
export function userOfToken(token: string | null | undefined): User | null {
  if (!token || !/^qh_[\w-]{40,60}$/.test(token)) return null;
  const h = Buffer.from(hash(token), "hex");
  for (const u of Object.values(db().users)) {
    if (u.mcp && crypto.timingSafeEqual(Buffer.from(u.mcp.hash, "hex"), h)) {
      // When it was last used (at most once an hour written), so Settings can say it's connected.
      if (!u.mcp.used || Date.now() - u.mcp.used > 3600_000) { u.mcp.used = Date.now(); save(); }
      return u;
    }
  }
  return null;
}
