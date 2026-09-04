"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Phone } from "lucide-react";

import { Logo } from "@/components/site/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MAIN_NAV, isNavItemActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Kopfzeile mit Hauptnavigation (US-02).
 *
 * Auf Mobilgeräten klappt die Navigation in ein Sheet. Die Telefonnummer
 * bleibt auch dort als eigener Button sichtbar – Anrufen ist im
 * Autohandel der häufigste Kontaktweg und soll nie hinter einem Menü liegen.
 */
export function SiteHeader({
  companyName,
  phone,
  phoneHref,
}: {
  companyName: string;
  phone: string;
  phoneHref: string;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Beim Scrollen bekommt die Leiste einen Rand, damit sie sich sichtbar vom
  // Inhalt löst. Passiv registriert, um das Scrollen nicht zu blockieren.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-colors duration-200",
        scrolled
          ? "border-b border-border bg-background/85 backdrop-blur-md"
          : "border-b border-transparent bg-background",
      )}
    >
      <div className="container-page flex h-20 items-center justify-between gap-4 lg:h-24">
        <Logo name={companyName} className="h-12 lg:h-16" priority />

        <nav aria-label="Hauptnavigation" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {MAIN_NAV.map((item) => {
              const active = isNavItemActive(pathname, item.href);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                    {active && (
                      <span
                        aria-hidden="true"
                        className="bg-brand absolute inset-x-3 -bottom-px h-0.5 rounded-full"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {phoneHref && (
            <Button asChild variant="outline" size="xl" className="hidden sm:inline-flex">
              <a href={`tel:${phoneHref}`}>
                <Phone data-icon="inline-start" aria-hidden="true" />
                <span className="tabular">{phone}</span>
              </a>
            </Button>
          )}

          <Button asChild variant="brand" size="xl" className="hidden md:inline-flex">
            <Link href="/fahrzeuge">Fahrzeuge ansehen</Link>
          </Button>

          {/* Mobiles Menü */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon-lg"
                className="lg:hidden"
                aria-label="Menü öffnen"
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-full max-w-sm p-0">
              <SheetHeader className="border-b border-border px-5 py-4">
                <SheetTitle asChild>
                  <Logo
                    name={companyName}
                    className="h-12"
                    onNavigate={() => setMenuOpen(false)}
                  />
                </SheetTitle>
              </SheetHeader>

              <nav aria-label="Hauptnavigation" className="px-3 py-4">
                <ul className="flex flex-col gap-0.5">
                  {MAIN_NAV.map((item) => {
                    const active = isNavItemActive(pathname, item.href);

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMenuOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex flex-col gap-0.5 rounded-lg px-3 py-3 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                            active
                              ? "bg-muted text-foreground"
                              : "text-foreground hover:bg-muted/60",
                          )}
                        >
                          <span className="text-base font-medium">{item.label}</span>
                          {item.description && (
                            <span className="text-muted-foreground text-sm">
                              {item.description}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              {phoneHref && (
                <div className="border-t border-border p-5">
                  <Button asChild variant="brand" size="2xl" className="w-full">
                    <a href={`tel:${phoneHref}`}>
                      <Phone data-icon="inline-start" aria-hidden="true" />
                      <span className="tabular">{phone}</span>
                    </a>
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
