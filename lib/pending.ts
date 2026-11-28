import { uid } from "./profile";
import { db, save, type User } from "./store";
import { verified } from "./verify";

/**
 * Templates sent to an address before it was someone's confirmed account become messages from the sender, the first
 * time that account (now confirmed) is seen. Nothing happens for an address that isn't confirmed yet.
 */
export function deliverPending(u: User) {
  const d = db();
  const list = d.pending?.[u.email];
  if (!list?.length || !verified(u)) return;
  for (const p of list) {
    if (!d.users[p.from] || !d.shares?.[p.share] || p.from === u.id) continue;
    const key = [p.from, u.id].sort().join("~");
    (d.letters[key] ??= []).push({ id: uid("lt-"), from: p.from, text: p.text, at: p.at, share: p.share });
    save(key);
  }
  delete d.pending[u.email];
  save(u.email);
}
