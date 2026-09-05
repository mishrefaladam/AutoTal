import { siteUrl } from "@/lib/env";
import {
  buildAutoDealerSchema,
  serializeJsonLd,
} from "@/modules/company/structured-data";
import type { CompanyDto } from "@/modules/company/types";

/**
 * Strukturierte Daten für Suchmaschinen (schema.org AutoDealer).
 *
 * Serverkomponente: Das JSON steht bereits im ausgelieferten HTML, ohne dass
 * ein Crawler JavaScript ausführen müsste.
 *
 * Wird im öffentlichen Layout einmal eingebunden und gilt damit für alle
 * öffentlichen Seiten. Im Adminbereich hat es nichts verloren – der ist
 * ohnehin von der Indizierung ausgenommen.
 *
 * dangerouslySetInnerHTML ist hier der vorgesehene Weg: React würde den
 * JSON-Text sonst HTML-escapen und damit ungültig machen. Die Absicherung
 * passiert in serializeJsonLd(), das alle Zeichen neutralisiert, mit denen
 * sich das Skriptelement verlassen ließe.
 */
export function StructuredData({ company }: { company: CompanyDto }) {
  const schema = buildAutoDealerSchema(company, siteUrl());

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  );
}
