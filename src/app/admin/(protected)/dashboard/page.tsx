import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Car,
  CircleCheck,
  Landmark,
  Plug,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getInstagramConnection } from "@/integrations/instagram";
import { isOpenAIConfigured, isResendConfigured } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/modules/admin/auth";
import { getCompany } from "@/modules/company/repository";

export const metadata: Metadata = { title: "Übersicht" };

/**
 * Startseite des Adminbereichs.
 *
 * Beantwortet die drei Fragen, die man beim Öffnen hat: Läuft der
 * Fahrzeug-Sync? Sind alle Dienste eingerichtet? Liegt etwas zur Freigabe an?
 */
export default async function AdminDashboardPage() {
  const [session, company, socialVehicleCount, draftCounts, instagram] =
    await Promise.all([
      requireAdmin(),
      getCompany(),
      prisma.vehicle.count(),
      prisma.socialDraft.groupBy({ by: ["status"], _count: { _all: true } }),
      getInstagramConnection(),
    ]);

  const countByStatus = Object.fromEntries(
    draftCounts.map((entry: { status: string; _count: { _all: number } }) => [
      entry.status,
      entry._count._all,
    ]),
  ) as Partial<Record<"DRAFT" | "APPROVED" | "PUBLISHED" | "FAILED", number>>;

  const services = [
    {
      label: "E-Mail-Versand (Resend)",
      ready: isResendConfigured(),
      hint: "Ohne Einrichtung können Formulare keine Anfragen zustellen.",
      href: "/admin/integrationen",
    },
    {
      label: "KI-Texte (OpenAI)",
      ready: isOpenAIConfigured(),
      hint: "Ohne Key lassen sich keine Beitragstexte erzeugen.",
      href: "/admin/social-media",
    },
    {
      label: "Instagram",
      ready: instagram.connected,
      hint: "Ohne Verbindung können Beiträge nicht veröffentlicht werden.",
      href: "/admin/integrationen",
    },
  ];

  return (
    <>
      <AdminPageHeader
        title={`Guten Tag, ${session.name.split(" ")[0]}`}
        description="Ein Überblick über Bestand, Dienste und offene Beiträge."
      />

      {/* Kennzahlen */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Car}
          label="Fahrzeuge erfasst"
          value={socialVehicleCount}
          hint="Datenbasis für Social-Media-Beiträge"
        />

        <StatCard
          icon={Sparkles}
          label="Entwürfe offen"
          value={countByStatus.DRAFT ?? 0}
          hint="warten auf Prüfung"
        />

        <StatCard
          icon={CircleCheck}
          label="Freigegeben"
          value={countByStatus.APPROVED ?? 0}
          hint="bereit zur Veröffentlichung"
        />

        <StatCard
          icon={TriangleAlert}
          label="Fehlgeschlagen"
          value={countByStatus.FAILED ?? 0}
          hint={countByStatus.FAILED ? "erfordert Aufmerksamkeit" : "alles in Ordnung"}
          tone={countByStatus.FAILED ? "warning" : "default"}
        />
      </div>

      <div className="space-y-8">
        {/* Fahrzeugbörse */}
        <AdminCard
          title="Fahrzeugbörse"
          action={
            <Button asChild variant="outline" size="xl">
              <Link href="/admin/integrationen">
                Integrationen
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Link>
            </Button>
          }
        >
          <div className="border-border flex flex-wrap items-start gap-4 rounded-lg border p-4">
            <CircleCheck
              className="text-success mt-0.5 size-5 shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Wird von willhaben eingebettet</p>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                Fahrzeuge werden auf willhaben gepflegt und erscheinen dort
                unmittelbar auch auf der Website. Auf dieser Seite ist dafür
                nichts zu tun.
              </p>
            </div>
          </div>
        </AdminCard>

        {/* Dienste */}
        <AdminCard
          title="Dienste"
          description="Was eingerichtet ist – und was noch fehlt."
        >
          <ul className="space-y-3">
            {services.map((service) => (
              <li
                key={service.label}
                className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
              >
                <div>
                  <p className="font-medium">{service.label}</p>
                  {!service.ready && (
                    <p className="text-muted-foreground mt-0.5 text-sm">
                      {service.hint}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Badge
                    className={cn(
                      "border-transparent",
                      service.ready
                        ? "bg-success/12 text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {service.ready ? "eingerichtet" : "offen"}
                  </Badge>

                  {!service.ready && (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={service.href}>Einrichten</Link>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </AdminCard>

        {/* Schnellzugriff */}
        <AdminCard title="Schnellzugriff">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                href: "/admin/fahrzeuge",
                icon: Car,
                label: "Fahrzeuge",
                hint: "Datenbasis für Social Media",
              },
              {
                href: "/admin/unternehmen",
                icon: Building2,
                label: "Unternehmensdaten",
                hint: `${company.city || "Standort"} · Öffnungszeiten`,
              },
              {
                href: "/admin/finanzierung",
                icon: Landmark,
                label: "Finanzierung",
                hint: "Rechner und Partner",
              },
              {
                href: "/admin/integrationen",
                icon: Plug,
                label: "Integrationen",
                hint: "Sync und Instagram",
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="border-border hover:border-brand/40 hover:bg-muted/40 group flex flex-col gap-2 rounded-lg border p-4 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <item.icon className="text-brand-strong size-5" aria-hidden="true" />
                <span className="font-medium">{item.label}</span>
                <span className="text-muted-foreground text-sm">{item.hint}</span>
              </Link>
            ))}
          </div>
        </AdminCard>
      </div>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: number;
  hint?: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="border-border bg-background rounded-xl border p-5">
      <Icon
        className={cn(
          "size-5",
          tone === "warning" ? "text-destructive" : "text-muted-foreground",
        )}
        aria-hidden={true}
      />
      <p className="text-muted-foreground mt-3 text-sm">{label}</p>
      <p className="font-display tabular mt-0.5 text-3xl font-bold">{value}</p>
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </div>
  );
}
