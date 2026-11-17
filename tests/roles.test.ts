// The co-teacher rules, checked without a server: npx tsx tests/roles.test.ts
// Uses an in-memory database (nothing is read from or written to disk).
const g = globalThis as unknown as { __lmsdb: unknown };
g.__lmsdb = {
  users: {
    owner: { id: "owner", email: "owner@example.test", name: "O", hash: "", salt: "", google: "g-o", createdAt: 0 },
    ed: { id: "ed", email: "Editor@Example.test", name: "E", hash: "", salt: "", google: "g-e", createdAt: 0 },
    view: { id: "view", email: "viewer@example.test", name: "V", hash: "", salt: "", google: "g-v", createdAt: 0 },
    pw: { id: "pw", email: "editor@example.test", name: "P", hash: "x", salt: "y", createdAt: 0 },
    other: { id: "other", email: "other@example.test", name: "X", hash: "", salt: "", google: "g-x", createdAt: 0 },
  },
  sessions: {}, uploads: {}, customConnectors: [], courses: {},
};

async function main() {
  const { roleOf, canTeach, canSeeTeacher, canBeStudent } = await import("../lib/auth");
  const course = { id: "c1", ownerId: "owner", people: [{ email: "editor@example.test", role: "editor", at: 0 }, { email: "viewer@example.test", role: "viewer", at: 0 }] } as never;
  const t = (userId: string) => ({ kind: "teacher", userId, exp: Date.now() + 1e6 }) as never;
  const rows: [string, boolean][] = [
    ["owner is owner", roleOf(t("owner"), course) === "owner"],
    ["Google editor is editor (email case ignored)", roleOf(t("ed"), course) === "editor"],
    ["viewer is viewer", roleOf(t("view"), course) === "viewer"],
    ["password account with the invited email gets nothing", roleOf(t("pw"), course) === null],
    ["uninvited teacher gets nothing", roleOf(t("other"), course) === null],
    ["editor can teach", canTeach(t("ed"), course)],
    ["viewer can't teach", !canTeach(t("view"), course)],
    ["viewer can see the teacher view", canSeeTeacher(t("view"), course)],
    ["viewer can't act as a student", !canBeStudent(t("view"), course, "s1")],
    ["no session gets nothing", roleOf(null, course) === null && !canSeeTeacher(null, course)],
  ];
  const bad = rows.filter(([, ok]) => !ok);
  console.log(`${rows.length - bad.length} passed, ${bad.length} failed`);
  bad.forEach(([n]) => console.log(`  ✗ ${n}`));
  process.exit(bad.length ? 1 : 0);
}
main();
