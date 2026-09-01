import { redirect } from "next/navigation";

/** /admin hat keine eigene Ansicht und führt direkt auf die Übersicht. */
export default function AdminIndexPage() {
  redirect("/admin/dashboard");
}
