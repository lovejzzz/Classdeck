import crypto from "crypto";
import { mailReady, sendCode } from "./mail";
import type { User } from "./store";

/**
 * Checking that an email address is the account's own: a six-digit code sent to it. Google accounts are checked by
 * Google. Until an address is checked, nobody can find the account by it (or send it a template by it).
 */

const TTL = 15 * 60_000;
const COOLDOWN = 45_000;
const PER_DAY = 10;
const TRIES = 5;

export const verified = (u: User) => !!u.google || !!u.emailVerified;

/** Do new accounts on this site have to check their address? Where email can't be sent (a dev computer), only when asked. */
export const verifyOn = () => mailReady() || process.env.QH_DEV_VERIFY === "1";

const hashOf = (u: { id: string }, code: string) => crypto.createHash("sha256").update(`${u.id}:${code}`).digest("hex");

type Holder = { id: string; email: string; verify?: User["verify"] };

/**
 * Make and send a new code. Returns what to tell the person, and (off the live site, where no email goes out) the code
 * itself so it can be typed in. Waits between sends and caps them per day.
 */
export async function issueCode(u: Holder, extra?: NonNullable<User["verify"]>["claim"]): Promise<{ ok: true; devCode?: string } | { ok: false; error: string }> {
  const now = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  const v = u.verify;
  if (v && now - v.sent < COOLDOWN) {
    // A sign-up taking over the address: the code that just went to it works for them too (it's the same inbox).
    if (extra && now < v.exp) { v.claim = extra; return { ok: true }; }
    return { ok: false, error: "A code was just sent. Check your email (and its spam folder), or try again in a minute." };
  }
  const n = v?.day === day ? v.n : 0;
  if (n >= PER_DAY) return { ok: false, error: "That’s enough codes for today. Try again tomorrow, or sign in with Google." };
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  u.verify = { hash: hashOf(u, code), exp: now + TTL, sent: now, tries: 0, day, n: n + 1, ...(extra ? { claim: extra } : {}) };
  const sent = await sendCode(u.email, code);
  if (!sent && process.env.NODE_ENV !== "production") return { ok: true, devCode: code };
  if (!sent) return { ok: false, error: "We couldn’t send a code to that address. Check it, or sign in with Google." };
  return { ok: true };
}

/** Check a typed code. A few wrong tries and the code stops working (send a new one). */
export function checkCode(u: Holder, code: string): { ok: true } | { ok: false; error: string } {
  const v = u.verify;
  if (!v || Date.now() > v.exp) return { ok: false, error: "That code has run out. Send a new one." };
  if (v.tries >= TRIES) return { ok: false, error: "Too many wrong codes. Send a new one." };
  if (hashOf(u, String(code).replace(/\D/g, "")) !== v.hash) { v.tries++; return { ok: false, error: v.tries >= TRIES ? "Too many wrong codes. Send a new one." : "That code isn’t right" }; }
  return { ok: true };
}
