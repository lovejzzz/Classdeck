import Link from "next/link";

export const metadata = { title: "Privacy · Questhand" };

/** What Questhand keeps about teachers and students, and who can see it. */
export default function Privacy() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-14 text-[15px] leading-relaxed text-ink-2 [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:text-ink [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
      <Link href="/" className="flex items-center gap-2 text-[13px] font-medium text-ink-2"><span className="inline-block h-4 w-4 rounded-[5px] bg-ink" />Questhand</Link>
      <h1 className="mt-6 text-[28px] font-semibold tracking-tight text-ink">Privacy</h1>
      <p className="mt-2 text-[13px] text-ink-3">Last updated November 12, 2026</p>

      <p className="mt-6">Questhand is a place for a class to work: a teacher deals out cards, and each student works through their own. This page says what we keep and why. We don’t sell data, show ads, or use tracking cookies.</p>

      <h2>Teachers</h2>
      <ul>
        <li>Your name and email, and either a password (stored only as a salted hash) or your Google account id if you sign in with Google. From Google we receive only your name, email, and account id.</li>
        <li>The courses you build, and the feedback you give.</li>
      </ul>

      <h2>Students</h2>
      <ul>
        <li>The name your teacher adds (or you add when you join), a 4-digit PIN stored only as a salted hash, and an email only if your teacher or a class form provides one.</li>
        <li>Your work: answers, writing, recordings, files and links you add, ratings, your plan, and feedback you give and receive.</li>
        <li>Your teacher can see your work in their class. Classmates see only what is shared on purpose, such as wall posts and Collab Studio work in your group. Other students never receive your answers or feedback.</li>
      </ul>

      <h2>Where it’s kept</h2>
      <ul>
        <li>Course data is kept on our server (Hetzner, in Finland) and backed up to Cloudflare R2. Uploaded files are stored in Cloudflare R2 and opened through short-lived links.</li>
        <li>Pages are delivered through Cloudflare, which sees standard request information such as IP addresses.</li>
        <li>If a teacher turns on optional tools (for example the AI coach or an image search), the text sent to that tool goes to its provider.</li>
      </ul>

      <h2>Cookies</h2>
      <p>One cookie keeps you signed in. That’s all.</p>

      <h2>Your choices</h2>
      <p>Students can ask their teacher to correct or remove their work. Teachers can remove students, files, and courses. To have an account deleted, ask the teacher who runs the class, or the site owner through Questhand’s Google sign-in support contact.</p>

      <p className="mt-10 text-[13px]"><Link href="/terms" className="underline">Terms of use</Link></p>
    </main>
  );
}
