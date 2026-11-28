import { db, type User } from "./store";

/** People's names: a first and a last name on every account, shown together; the email tells two Sam Lees apart. */

export { namePart, fullName, splitName } from "./namesplit";
import { fullName } from "./namesplit";

/** Does the account still need to say its first and last name? */
export const needsName = (u: User) => !u.firstName || !u.lastName;

/**
 * Set an account's name, and carry it to the class lists it's on (where no classmate already has it: there the
 * class keeps the name the student has). The caller saves.
 */
export function setAccountName(u: User, first: string, last: string) {
  u.firstName = first;
  u.lastName = last;
  u.name = fullName(first, last);
  const n = u.name.toLowerCase();
  for (const c of Object.values(db().courses)) {
    for (const st of [...c.students, ...(c.waiting ?? [])]) {
      if (st.userId !== u.id || st.name === u.name) continue;
      const taken = [...c.students, ...(c.waiting ?? [])].some((x) => x.id !== st.id && x.name.trim().toLowerCase() === n);
      if (!taken) st.name = u.name;
    }
  }
}
