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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * The invitation as an email page. Email apps strip most CSS, so it's tables and inline styles only, and the mark
 * is a PNG (Gmail doesn't show SVG). Colours are the site's: ink, paper, and the three suits.
 */
export function inviteHtml(p: { course: string; teacher: string; link: string }): string {
  const origin = new URL(p.link).origin;
  const course = esc(p.course), teacher = esc(p.teacher), link = esc(p.link);
  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
  const suit = (c: string, corner = "") => `<td width="33%" style="height:6px;background:${c};font-size:0;line-height:0;${corner}">&nbsp;</td>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>You’re invited to ${course}</title></head>
<body style="margin:0;padding:0;background:#f6f6f4;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f6f6f4">${teacher} added you to ${course}. Sign in (or make an account) to open your board.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f4">
<tr><td align="center" style="padding:40px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
    <tr><td align="center" style="padding:0 0 22px">
      <a href="${origin}" style="text-decoration:none;color:#1b1b1a;font:600 17px/1 ${font};letter-spacing:-0.01em"><img src="${origin}/email/mark.png" width="40" height="28" alt="" style="display:inline-block;vertical-align:middle;border:0;margin-right:8px">Questhand</a>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid #e6e6e3;border-radius:18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${suit("#3d68a6", "border-top-left-radius:17px")}${suit("#a0561f")}${suit("#9a4a8c", "border-top-right-radius:17px")}</tr></table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="padding:36px 36px 0;font:600 12px/1.4 ${font};letter-spacing:0.08em;text-transform:uppercase;color:#6b6b66">You’re invited</td></tr>
        <tr><td style="padding:8px 36px 0;font:600 28px/1.2 ${font};letter-spacing:-0.02em;color:#1b1b1a">${course}</td></tr>
        <tr><td style="padding:14px 36px 0;font:400 16px/1.6 ${font};color:#3f3f3c"><strong style="color:#1b1b1a;font-weight:600">${teacher}</strong> added you to the class on Questhand. Your board is ready: this week’s cards, what to do, and what comes back from your teacher.</td></tr>
        <tr><td style="padding:28px 36px 0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:12px;background:#1b1b1a">
            <a href="${link}" style="display:inline-block;padding:14px 26px;font:600 16px/1 ${font};color:#ffffff;text-decoration:none;border-radius:12px">Join the class &rarr;</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:24px 36px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#f6f6f4;border-radius:12px;padding:14px 16px;font:400 13.5px/1.55 ${font};color:#5f5f5c">
            <strong style="color:#1b1b1a;font-weight:600">This link is just for you.</strong> It asks you to sign in to Questhand (or make a free account with Google or your email) and adds the class to your account. After that, just sign in: your courses are all in one place.
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:22px 36px 34px;font:400 12.5px/1.5 ${font};color:#6b6b66">Button not working? Copy this into your browser:<br><a href="${link}" style="color:#3d68a6;word-break:break-all;text-decoration:underline">${link}</a></td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:22px 24px 0;font:400 12.5px/1.6 ${font};color:#6b6b66">Not expecting this? You can ignore it, and nothing happens.<br><a href="${origin}" style="color:#6b6b66;text-decoration:underline">Questhand</a> · cards for learning, made by teachers</td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

export async function sendInvite(to: string, p: { course: string; teacher: string; link: string }): Promise<boolean> {
  if (!mailReady()) return false;
  // Addresses that can never receive mail (tests use these) are never handed to the provider.
  if (/@(example\.(test|com|org|net)|[^@]+\.(test|invalid|localhost))$/i.test(to)) return false;
  const course = plain(p.course), teacher = plain(p.teacher, 60);
  const subject = `${teacher} invited you to ${course} on Questhand`;
  const text = [
    `You're invited to ${course}`,
    ``,
    `${teacher} added you to the class on Questhand. Your board is ready: this week's cards, what to do, and what comes back from your teacher.`,
    ``,
    `Open your board:`,
    p.link,
    ``,
    `This link is just for you. Keep this email: the same link gets you back in on any device for 120 days.`,
    ``,
    `Not expecting this? You can ignore it, and nothing happens.`,
    `Questhand`,
  ].join("\n");
  const html = inviteHtml({ course, teacher, link: p.link });
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

/** Addresses that can never receive mail (tests use these): never handed to the provider. */
export const undeliverable = (to: string) => /@(example\.(test|com|org|net)|[^@]+\.(test|invalid|localhost))$/i.test(to);

/** The sign-up code: six digits, fixed wording, nothing from anyone else in it. */
export async function sendCode(to: string, code: string): Promise<boolean> {
  if (!mailReady() || undeliverable(to)) return false;
  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
  const subject = `${code} is your Questhand code`;
  const text = [`Your Questhand code is ${code}`, ``, `Type it on the page that asked for it. It works for 15 minutes.`, ``, `Didn’t make a Questhand account? Ignore this email and nothing happens.`].join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f6f6f4"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f4"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background:#ffffff;border:1px solid #e6e6e3;border-radius:18px">
<tr><td style="padding:32px 32px 0;font:600 17px/1.3 ${font};color:#1b1b1a">Your Questhand code</td></tr>
<tr><td style="padding:18px 32px 0;font:600 34px/1 ${font};letter-spacing:0.18em;color:#1b1b1a">${code}</td></tr>
<tr><td style="padding:18px 32px 0;font:400 15px/1.6 ${font};color:#3f3f3c">Type it on the page that asked for it. It works for 15 minutes.</td></tr>
<tr><td style="padding:18px 32px 30px;font:400 12.5px/1.6 ${font};color:#6b6b66">Didn’t make a Questhand account? Ignore this email and nothing happens.</td></tr>
</table></td></tr></table></body></html>`;
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

/**
 * A template someone shared with an address that isn't on Questhand yet: who sent it, their note (one short line,
 * plain), the template drawn as rows of little cards in its suits' colours, and one button to join.
 */
type ShareMail = { from: string; name: string; size: string; note?: string; rows: { lesson: string; cards: { kind: string }[] }[]; link: string };

export async function sendShareInvite(to: string, p: ShareMail): Promise<boolean> {
  if (!mailReady() || undeliverable(to)) return false;
  const { subject, text, html } = shareInviteMail(p);
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

/** The share invitation's subject, plain text and HTML (kept apart from sending, so it can be looked at). */
export function shareInviteMail(p: ShareMail): { subject: string; text: string; html: string } {
  const from = plain(p.from, 60), name = plain(p.name, 80), note = p.note ? plain(p.note, 300) : "";
  const origin = new URL(p.link).origin;
  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
  const tint = (k: string) => (k === "content" ? "#3d68a6" : "#a0561f");
  const rows = p.rows.slice(0, 6).map((r) => `<tr><td style="padding:3px 10px 3px 0;font:400 12px/1.3 ${font};color:#6b6b66;white-space:nowrap;max-width:160px;overflow:hidden">${esc(plain(r.lesson, 32))}</td><td style="padding:3px 0">${r.cards.slice(0, 12).map((c) => `<span style="display:inline-block;width:13px;height:18px;margin-right:3px;border:1px solid #e4e2dc;border-top:3px solid ${tint(c.kind)};border-radius:3px;background:#ffffff"></span>`).join("")}</td></tr>`).join("");
  const more = p.rows.length > 6 ? `<tr><td colspan="2" style="padding:4px 0 0;font:400 12px/1.3 ${font};color:#6b6b66">and ${p.rows.length - 6} more lessons</td></tr>` : "";
  const subject = `${from} shared a Questhand template with you: ${name}`;
  const text = [`${from} shared a template with you on Questhand: ${name} (${p.size}).`, ...(note ? [``, `“${note}”`] : []), ``, `Make a free account with this email address (or sign in with Google using it), and the template is waiting in your inbox, ready to add to your templates:`, p.link, ``, `Not expecting this? Ignore it, and nothing happens.`].join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f6f4"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f4"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td align="center" style="padding:0 0 22px"><a href="${origin}" style="text-decoration:none;color:#1b1b1a;font:600 17px/1 ${font}"><img src="${origin}/email/mark.png" width="40" height="28" alt="" style="display:inline-block;vertical-align:middle;border:0;margin-right:8px">Questhand</a></td></tr>
<tr><td style="background:#ffffff;border:1px solid #e6e6e3;border-radius:18px;padding:32px 32px 30px">
<div style="font:600 12px/1.4 ${font};letter-spacing:0.08em;text-transform:uppercase;color:#6b6b66">A template for you</div>
<div style="padding-top:8px;font:400 16px/1.55 ${font};color:#3f3f3c"><strong style="color:#1b1b1a">${esc(from)}</strong> shared a course template with you on Questhand.</div>
${note ? `<div style="margin-top:14px;padding:12px 14px;background:#f6f6f4;border-radius:12px;font:400 14.5px/1.5 ${font};color:#1b1b1a">“${esc(note)}”</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border:1px solid #e6e6e3;border-radius:12px"><tr><td style="padding:14px 16px 6px;font:600 16px/1.3 ${font};color:#1b1b1a">${esc(name)}<div style="font:400 12.5px/1.5 ${font};color:#6b6b66">${esc(p.size)}</div></td></tr>
<tr><td style="padding:6px 16px 14px;background:#f7f6f3;border-radius:0 0 12px 12px"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}${more}</table></td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px"><tr><td style="border-radius:12px;background:#1b1b1a"><a href="${esc(p.link)}" style="display:inline-block;padding:14px 24px;font:600 15px/1 ${font};color:#ffffff;text-decoration:none;border-radius:12px">Get the template &rarr;</a></td></tr></table>
<div style="padding-top:18px;font:400 13px/1.55 ${font};color:#5f5f5c">Make a free account with <strong style="color:#1b1b1a">this email address</strong> (or sign in with Google using it), and the template is waiting in your inbox, ready to add to your templates.</div>
</td></tr>
<tr><td align="center" style="padding:22px 24px 0;font:400 12.5px/1.6 ${font};color:#6b6b66">Not expecting this? Ignore it, and nothing happens.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
