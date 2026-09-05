import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CompanyDto } from "@/modules/company/types";
import { VEHICLE_PLATFORMS } from "@/modules/company/vehicle-platforms";

export function VehiclePlatformLinks({
  company,
}: {
  company: Pick<CompanyDto, (typeof VEHICLE_PLATFORMS)[number]["field"]>;
}) {
  const links = VEHICLE_PLATFORMS.flatMap(({ field, label }) => {
    const url = company[field]?.trim();
    return url ? [{ field, label, url }] : [];
  });

  if (links.length === 0) return null;

  return (
    <div className="border-border mt-8 border-t pt-6">
      <h2
        id="fahrzeugplattformen"
        className="text-muted-foreground text-sm font-medium"
      >
        Unsere Fahrzeuge finden Sie auch auf
      </h2>
      <ul
        aria-labelledby="fahrzeugplattformen"
        className="mt-3 flex flex-wrap gap-3"
      >
        {links.map(({ field, label, url }) => (
          <li key={field}>
            <Button asChild variant="outline" size="xl">
              <a href={url} target="_blank" rel="noopener noreferrer">
                {label}
                <ExternalLink data-icon="inline-end" aria-hidden="true" />
                <span className="sr-only"> (öffnet in neuem Tab)</span>
              </a>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
