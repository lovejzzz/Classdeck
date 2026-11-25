import { redirect } from "next/navigation";

// Privacy and Terms are one page now.
export default function Terms() {
  redirect("/legal#terms");
}
