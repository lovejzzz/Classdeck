import { redirect } from "next/navigation";

// The teacher's courses are on the home page; /teach on its own goes there.
export default function TeachHome() {
  redirect("/");
}
