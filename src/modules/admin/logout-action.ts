"use server";

import { signOut } from "@/lib/auth";

/**
 * Abmeldung aus dem Adminbereich.
 *
 * Als Server Action statt über `next-auth/react`: Damit ist kein
 * SessionProvider im Client-Baum nötig, und die Session wird serverseitig
 * beendet – auch dann, wenn im Browser gerade kein JavaScript läuft.
 */
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/admin/login" });
}
