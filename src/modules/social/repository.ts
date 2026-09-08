import "server-only";

import type {
  SocialDraftStatus,
  VehicleStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/** Lesezugriffe auf Social-Media-Entwürfe (EPIC 7, EPIC 8). */

export type SocialDraftListItem = {
  id: string;
  status: SocialDraftStatus;
  caption: string;
  hashtags: string[];
  imageUrls: string[];
  generatedByModel: string | null;
  generatedAt: Date | null;
  approvedAt: Date | null;
  approvedByUser: string | null;
  publishedAt: Date | null;
  externalPermalink: string | null;
  errorMessage: string | null;
  retryCount: number;
  lastAttemptAt: Date | null;
  createdAt: Date;
  vehicle: {
    id: string;
    slug: string;
    title: string;
    priceCents: number;
    mileageKm: number;
    /** false = in der Fahrzeugverwaltung ausgeblendet. */
    active: boolean;
    /** Bestandsstatus – unabhängig von `active`. */
    status: VehicleStatus;
    primaryImageUrl: string | null;
  };
};

const DRAFT_INCLUDE = {
  vehicle: {
    select: {
      id: true,
      slug: true,
      make: true,
      model: true,
      variant: true,
      priceCents: true,
      mileageKm: true,
      active: true,
      status: true,
      images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
    },
  },
} as const;

type DraftWithVehicle = {
  id: string;
  status: SocialDraftStatus;
  caption: string;
  hashtags: string[];
  imageUrls: string[];
  generatedByModel: string | null;
  generatedAt: Date | null;
  approvedAt: Date | null;
  approvedByUser: string | null;
  publishedAt: Date | null;
  externalPermalink: string | null;
  errorMessage: string | null;
  retryCount: number;
  lastAttemptAt: Date | null;
  createdAt: Date;
  vehicle: {
    id: string;
    slug: string;
    make: string;
    model: string;
    variant: string | null;
    priceCents: number;
    mileageKm: number;
    active: boolean;
    status: VehicleStatus;
    images: { url: string }[];
  };
};

function toListItem(draft: DraftWithVehicle): SocialDraftListItem {
  return {
    id: draft.id,
    status: draft.status,
    caption: draft.caption,
    hashtags: draft.hashtags,
    imageUrls: draft.imageUrls,
    generatedByModel: draft.generatedByModel,
    generatedAt: draft.generatedAt,
    approvedAt: draft.approvedAt,
    approvedByUser: draft.approvedByUser,
    publishedAt: draft.publishedAt,
    externalPermalink: draft.externalPermalink,
    errorMessage: draft.errorMessage,
    retryCount: draft.retryCount,
    lastAttemptAt: draft.lastAttemptAt,
    createdAt: draft.createdAt,
    vehicle: {
      id: draft.vehicle.id,
      slug: draft.vehicle.slug,
      title: [draft.vehicle.make, draft.vehicle.model, draft.vehicle.variant]
        .filter(Boolean)
        .join(" "),
      priceCents: draft.vehicle.priceCents,
      mileageKm: draft.vehicle.mileageKm,
      active: draft.vehicle.active,
      status: draft.vehicle.status,
      primaryImageUrl: draft.vehicle.images[0]?.url ?? null,
    },
  };
}

export async function listSocialDrafts(limit = 30): Promise<SocialDraftListItem[]> {
  const drafts = await prisma.socialDraft.findMany({
    include: DRAFT_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return drafts.map(toListItem);
}

export async function getSocialDraft(
  id: string,
): Promise<SocialDraftListItem | null> {
  const draft = await prisma.socialDraft.findUnique({
    where: { id },
    include: DRAFT_INCLUDE,
  });

  return draft ? toListItem(draft) : null;
}

export type SocialVehicleOption = {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  /** Erstes Bild oder null. Ohne Bild ist nur der Textentwurf möglich. */
  imageUrl: string | null;
  /** false = im Admin ausgeblendet, aber weiterhin im Bestand. */
  active: boolean;
};

export type SocialVehicleSelection = {
  /** Fahrzeuge, aus denen ein Textentwurf entstehen kann. */
  vehicles: SocialVehicleOption[];
  /**
   * Alle intern erfassten Fahrzeuge, unabhängig von Bestandsstatus und
   * Sichtbarkeit. Nur damit lässt sich „noch nichts angelegt“ von „angelegt,
   * aber nichts mehr im Bestand“ unterscheiden.
   */
  totalCount: number;
};

/**
 * Fahrzeuge zur Auswahl im Beitragsassistenten (US-18).
 *
 * Maßgeblich ist ausschließlich der Bestandsstatus: Was im Bestand steht, kann
 * beworben werden. Zwei frühere Einschränkungen gibt es bewusst nicht:
 *
 *   `active` wird NICHT geprüft. Das Feld steuert nur die Sichtbarkeit in der
 *   Fahrzeugverwaltung; ein ausgeblendetes Fahrzeug ist deshalb trotzdem im
 *   Bestand. Genau hier fielen zuvor Fahrzeuge aus der Liste, die unter
 *   /admin/fahrzeuge sichtbar waren – der Assistent meldete dann „keine
 *   Fahrzeuge hinterlegt“, obwohl welche da waren.
 *
 *   Bilder werden NICHT vorausgesetzt. Ein Textentwurf entsteht allein aus den
 *   Fahrzeugdaten. Das Bild braucht erst die Veröffentlichung auf Instagram,
 *   und die ist ein eigener Schritt nach ausdrücklicher Freigabe.
 *
 * `externalSource` bleibt ebenfalls ungefiltert – derzeit gibt es nur die eine
 * Quelle (manuell gepflegt), und ein Filter darauf würde eine spätere zweite
 * Quelle still ausschließen.
 */
export async function listVehiclesForSocial(): Promise<SocialVehicleSelection> {
  const [vehicles, totalCount] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status: "IN_STOCK" },
      select: {
        id: true,
        slug: true,
        make: true,
        model: true,
        variant: true,
        priceCents: true,
        active: true,
        images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
      },
      // Sichtbare zuerst, danach das zuletzt Angelegte.
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    }),
    prisma.vehicle.count(),
  ]);

  return {
    vehicles: vehicles.map((vehicle) => ({
      id: vehicle.id,
      slug: vehicle.slug,
      title: [vehicle.make, vehicle.model, vehicle.variant]
        .filter(Boolean)
        .join(" "),
      priceCents: vehicle.priceCents,
      imageUrl: vehicle.images[0]?.url ?? null,
      active: vehicle.active,
    })),
    totalCount,
  };
}

export const SOCIAL_STATUS_LABELS: Record<SocialDraftStatus, string> = {
  DRAFT: "Entwurf",
  APPROVED: "Freigegeben",
  PUBLISHED: "Veröffentlicht",
  FAILED: "Fehlgeschlagen",
};
