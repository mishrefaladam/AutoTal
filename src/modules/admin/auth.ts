import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/result";

/**
 * Serverseitige Autorisierung für den Adminbereich (US-14).
 *
 * Die Middleware prüft nur, ob ein gültig signiertes Token vorliegt. Hier
 * wird zusätzlich gegen die Datenbank geprüft: Existiert der Benutzer noch
 * und ist er aktiv? Ohne diesen Schritt hätte jemand, dessen Zugang gerade
 * gesperrt wurde, bis zum Ablauf seines Tokens weiter Zugriff.
 *
 * JEDE Admin-Seite und JEDE Admin-Server-Action muss eine dieser Funktionen
 * aufrufen. Ein vergessener Aufruf ist eine offene Tür.
 */

export type AdminSession = {
  id: string;
  email: string;
  name: string;
  role: string;
};

/**
 * Aktuell angemeldeter Admin oder null.
 * Mit `cache()` umhüllt: Layout, Seite und Actions eines Requests teilen sich
 * eine einzige Abfrage.
 */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) return null;

  const user = await prisma.adminUser.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, active: true },
  });

  if (!user || !user.active) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
});

/**
 * Für Seiten und Layouts: leitet zur Anmeldung um, wenn nicht berechtigt.
 *
 * `callbackUrl` sorgt dafür, dass man nach der Anmeldung dort landet, wo man
 * hinwollte – statt immer auf dem Dashboard.
 */
export async function requireAdmin(
  callbackUrl?: string,
): Promise<AdminSession> {
  const session = await getAdminSession();

  if (!session) {
    const target = callbackUrl
      ? `/admin/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
      : "/admin/login";
    redirect(target);
  }

  return session;
}

/**
 * Für Server Actions: wirft statt umzuleiten.
 *
 * Ein `redirect()` innerhalb einer Action würde als Erfolg aussehen; der
 * geworfene Fehler landet dagegen sauber im ActionResult.
 */
export async function requireAdminForAction(): Promise<AdminSession> {
  const session = await getAdminSession();

  if (!session) {
    throw new UserFacingError(
      "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
      "UNAUTHORIZED",
    );
  }

  return session;
}
