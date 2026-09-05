"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  Car,
  ExternalLink,
  Inbox,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Plug,
  Sparkles,
  X,
} from "lucide-react";

import { Logo } from "@/components/site/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AdminSession } from "@/modules/admin/auth";
import { logoutAction } from "@/modules/admin/logout-action";

/**
 * Rahmen des Adminbereichs: Seitenleiste, Kopfzeile, Abmeldung.
 *
 * Bewusst nüchtern gehalten – hier wird gearbeitet, nicht repräsentiert. Die
 * Signalfarbe markiert ausschließlich den aktiven Navigationspunkt.
 */

const ADMIN_NAV = [
  {
    href: "/admin/dashboard",
    label: "Übersicht",
    icon: LayoutDashboard,
  },
  {
    href: "/admin/fahrzeuge",
    label: "Fahrzeuge",
    icon: Car,
  },
  {
    href: "/admin/ankauf",
    label: "Ankaufanfragen",
    icon: Inbox,
  },
  {
    href: "/admin/unternehmen",
    label: "Unternehmen",
    icon: Building2,
  },
  {
    href: "/admin/finanzierung",
    label: "Finanzierung",
    icon: Landmark,
  },
  {
    href: "/admin/social-media",
    label: "Social Media",
    icon: Sparkles,
  },
  {
    href: "/admin/integrationen",
    label: "Integrationen",
    icon: Plug,
  },
];

export function AdminShell({
  session,
  companyName,
  openInquiries = 0,
  children,
}: {
  session: AdminSession;
  companyName: string;
  /** Offene Ankaufanfragen – erscheinen als Zähler an der Navigation. */
  openInquiries?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navigation = (
    <nav aria-label="Verwaltung" className="flex-1">
      <ul className="space-y-1">
        {ADMIN_NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active
                    ? "bg-brand-subtle text-brand-strong"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}

                {/* Nur bei den Ankaufanfragen und nur, wenn wirklich etwas
                    offen ist – eine dauerhafte "0" wäre reines Rauschen. */}
                {item.href === "/admin/ankauf" && openInquiries > 0 && (
                  <span
                    className="bg-brand text-brand-foreground tabular ml-auto rounded-full px-1.5 py-0.5 text-xs font-semibold"
                    aria-label={`${openInquiries} offen`}
                  >
                    {openInquiries}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const sidebarFooter = (
    <div className="border-border space-y-3 border-t pt-4">
      <div className="px-3">
        <p className="truncate text-sm font-medium">{session.name}</p>
        <p className="text-muted-foreground truncate text-xs">{session.email}</p>
      </div>

      <Button asChild variant="ghost" size="sm" className="w-full justify-start">
        <a href="/" target="_blank" rel="noopener noreferrer">
          <ExternalLink data-icon="inline-start" aria-hidden="true" />
          Website ansehen
        </a>
      </Button>

      {/* Als echtes Formular: funktioniert auch ohne JavaScript. */}
      <form action={logoutAction}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
        >
          <LogOut data-icon="inline-start" aria-hidden="true" />
          Abmelden
        </Button>
      </form>
    </div>
  );

  return (
    <div className="bg-muted/30 min-h-dvh">
      {/* Seitenleiste ab Desktop */}
      <aside className="border-border bg-background fixed inset-y-0 left-0 hidden w-64 flex-col border-r p-4 lg:flex">
        <div className="mb-6 px-2">
          <Logo name={companyName} href="/admin/dashboard" className="text-xl" />
          <p className="text-muted-foreground mt-2 text-xs">Verwaltung</p>
        </div>

        {navigation}
        {sidebarFooter}
      </aside>

      {/* Kopfzeile auf Mobil */}
      <header className="border-border bg-background sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b px-4 lg:hidden">
        <Logo name={companyName} href="/admin/dashboard" className="text-xl" />

        <Button
          variant="outline"
          size="icon-lg"
          onClick={() => setMobileNavOpen((open) => !open)}
          aria-expanded={mobileNavOpen}
          aria-controls="admin-mobile-nav"
          aria-label={mobileNavOpen ? "Menü schließen" : "Menü öffnen"}
        >
          {mobileNavOpen ? (
            <X aria-hidden="true" />
          ) : (
            <Menu aria-hidden="true" />
          )}
        </Button>
      </header>

      {mobileNavOpen && (
        <div
          id="admin-mobile-nav"
          className="border-border bg-background flex flex-col gap-4 border-b p-4 lg:hidden"
        >
          {navigation}
          {sidebarFooter}
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          {children}
        </div>
      </main>
    </div>
  );
}
