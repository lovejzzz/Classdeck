import { redirect } from "next/navigation";

/** Connectors moved into account Settings. */
export default function Connectors() {
  redirect("/settings");
}
