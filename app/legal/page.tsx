import Link from "next/link";

export const metadata = { title: "Privacy & Terms · Questhand" };

/** What Questhand keeps and who can see it, and the short rules for using it: one page (/privacy and /terms lead here). */
export default function Legal() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-14 text-[15px] leading-relaxed text-ink-2 [&_h2]:mt-12 [&_h2]:scroll-mt-6 [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-ink [&_h3]:mb-2 [&_h3]:mt-8 [&_h3]:text-[17px] [&_h3]:font-semibold [&_h3]:text-ink [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
      <Link href="/" className="flex items-center gap-2 text-[13px] font-medium text-ink-2"><span className="inline-block h-4 w-4 rounded-[5px] bg-ink" />Questhand</Link>
      <h1 className="mt-6 text-[28px] font-semibold tracking-tight text-ink">Privacy &amp; Terms</h1>
      <p className="mt-2 text-[13px] text-ink-3">Last updated November 25, 2026</p>
      <nav className="mt-4 flex gap-4 text-[13px]"><a href="#privacy" className="underline">Privacy</a><a href="#terms" className="underline">Terms of use</a></nav>

      <h2 id="privacy">Privacy</h2>
      <p className="mt-6">Questhand is a place for a class to work: a teacher deals out cards, and each student works through their own. This page says what we keep and why. We don’t sell data, show ads, or use tracking cookies.</p>

      <h3>Teachers</h3>
      <ul>
        <li>Your name and email, and either a password (stored only as a salted hash) or your Google account id if you sign in with Google. From Google we receive only your name, email, profile photo, and account id. You can use a photo of your own instead (press your photo in the account menu); it’s kept like your other uploads.</li>
        <li>The courses you build, and the feedback you give.</li>
        <li>Email addresses of other teachers you share a course with. They and the course’s owner can see each other’s name and email; students never see them.</li>
      </ul>

      <h3>Students</h3>
      <ul>
        <li>Your Questhand account: your name, your email, and a password stored only as a salted hash (or your Google sign-in instead). The same account is used for classes you take and courses you teach.</li>
        <li>The name your teacher lists you under in their class, and the email they invited you with. If your teacher asks, Questhand emails you an invitation with your own link to the class; we send nothing else.</li>
        <li>Your work: answers, writing, recordings, files and links you add, ratings, your plan, and feedback you give and receive.</li>
        <li>Your teacher can see your work in their class. Classmates see only what is shared on purpose, such as wall posts and Collab Studio work in your group. Other students never receive your answers or feedback.</li>
      </ul>

      <h3>Where it’s kept</h3>
      <ul>
        <li>Course data is kept on our server (Hetzner, in Finland) and backed up to Cloudflare R2. Uploaded files are stored in Cloudflare R2 and opened through short-lived links.</li>
        <li>Pages are delivered through Cloudflare, which sees standard request information such as IP addresses.</li>
        <li>Invitation emails are sent through Resend, which receives the student’s email address and the invitation’s text.</li>
        <li>If a teacher turns on optional tools (for example the AI coach or an image search), the text sent to that tool goes to its provider.</li>
      </ul>

      <h3>Cookies</h3>
      <p>One cookie keeps you signed in. That’s all.</p>

      <h3>Your choices</h3>
      <p>Students can ask their teacher to correct or remove their work. Teachers can remove students, files, and courses. To have an account deleted, ask the teacher who runs the class, or the site owner through Questhand’s Google sign-in support contact.</p>


      <h2 id="terms">Terms of use</h2>
      <ul className="mt-4">
        <li>Questhand is offered as is, while it’s being built. Features may change.</li>
        <li>Teachers are responsible for the courses they create and for having the right to share what they upload.</li>
        <li>Upload only work that is yours to share. Don’t upload anything unlawful, hateful, or private about someone else.</li>
        <li>Keep your sign-in to yourself. An invitation link is for the person it was sent to.</li>
        <li>Uploads have size limits, and files may be cleared after a course ends.</li>
        <li>We may remove content or accounts that break these rules.</li>
      </ul>
    </main>
  );
}
