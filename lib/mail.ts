// Sending email in Questhand's name: only the fixed invitation below, through the provider whose key the site owner
// saved on the server (RESEND_API_KEY, MAIL_FROM). Without a key, nothing is sent and the option doesn't appear.
import { db, save } from "./store";

export const mailReady = () => !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;

/** Invitations one teacher may send per day, across all their courses. */
export const DAILY_LIMIT = 150;

/** Text from teachers goes into a fixed template: one line, no markup, short. */
export const plain = (s: string, max = 80) => s.replace(/[\r\n\t<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Count a send against the teacher's daily allowance (kept in the database, so a restart doesn't reset it). */
export function takeAllowance(userId: string, n: number): number {
  const u = db().users[userId];
  if (!u) return 0;
  const day = new Date().toISOString().slice(0, 10);
  const used = u.mail?.day === day ? u.mail.n : 0;
  const ok = Math.max(0, Math.min(n, DAILY_LIMIT - used));
  u.mail = { day, n: used + ok };
  save();
  return ok;
}

export async function sendInvite(to: string, p: { course: string; teacher: string; link: string }): Promise<boolean> {
  if (!mailReady()) return false;
  // Addresses that can never receive mail (tests use these) are never handed to the provider.
  if (/@(example\.(test|com|org|net)|[^@]+\.(test|invalid|localhost))$/i.test(to)) return false;
  const course = plain(p.course), teacher = plain(p.teacher, 60);
  const subject = `${teacher} invited you to ${course} on Questhand`;
  const text = `${teacher} added you to ${course} on Questhand.\n\nOpen your board:\n${p.link}\n\nThis link is only for you: keep this email, and use the link again to get back in on another device. If you weren’t expecting this, you can ignore it.`;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<div style="font:15px/1.5 system-ui,sans-serif;color:#1b1b1a;max-width:480px">
<p><b>${esc(teacher)}</b> added you to <b>${esc(course)}</b> on Questhand.</p>
<p><a href="${esc(p.link)}" style="display:inline-block;background:#1b1b1a;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">Open my board</a></p>
<p style="color:#55544f;font-size:13px">This link is only for you: keep this email, and use the link again to get back in on another device. If you weren’t expecting this, you can ignore it.</p></div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
