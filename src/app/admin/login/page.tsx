import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/admin/login-form";
import { Logo } from "@/components/site/logo";
import { getAdminSession } from "@/modules/admin/auth";
import { getCompany } from "@/modules/company/repository";

/**
 * Anmeldeseite des Adminbereichs (US-14).
 *
 * Liegt außerhalb des geschützten Admin-Layouts – sonst gäbe es eine
 * Umleitungsschleife.
 */

export const metadata: Metadata = {
  title: "Anmeldung",
  // Der Adminbereich gehört nicht in den Suchindex.
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: PageProps<"/admin/login">) {
  // Wer bereits angemeldet ist, soll nicht auf dem Anmeldeformular landen.
  const session = await getAdminSession();
  if (session) redirect("/admin/dashboard");

  const [company, params] = await Promise.all([getCompany(), searchParams]);

  const callbackUrl =
    typeof params.callbackUrl === "string" ? params.callbackUrl : undefined;

  return (
    <div className="bg-muted/40 flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo name={company.displayName} href="/" className="h-20" />
        </div>

        <div className="border-border bg-card rounded-xl border p-7 shadow-[var(--shadow-card)]">
          <h1 className="font-display text-xl font-bold tracking-tight">
            Anmeldung
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Interner Bereich zur Verwaltung der Website.
          </p>

          <div className="mt-6">
            <LoginForm callbackUrl={callbackUrl} />
          </div>
        </div>

        <p className="text-muted-foreground mt-6 text-center text-sm">
          <Link href="/" className="hover:text-foreground transition-colors">
            Zurück zur Website
          </Link>
        </p>
      </div>
    </div>
  );
}
