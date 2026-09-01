import "server-only";

import type { SocialDraftStatus } from "@/generated/prisma/enums";
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
    active: boolean;
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

/** Fahrzeuge zur Auswahl im Beitragsassistenten (US-18). */
export async function listVehiclesForSocial() {
  const vehicles = await prisma.vehicle.findMany({
    where: { active: true },
    select: {
      id: true,
      slug: true,
      make: true,
      model: true,
      variant: true,
      priceCents: true,
      images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return vehicles.map((vehicle) => ({
    id: vehicle.id,
    slug: vehicle.slug,
    title: [vehicle.make, vehicle.model, vehicle.variant]
      .filter(Boolean)
      .join(" "),
    priceCents: vehicle.priceCents,
    imageUrl: vehicle.images[0]?.url ?? null,
  }));
}

export const SOCIAL_STATUS_LABELS: Record<SocialDraftStatus, string> = {
  DRAFT: "Entwurf",
  APPROVED: "Freigegeben",
  PUBLISHED: "Veröffentlicht",
  FAILED: "Fehlgeschlagen",
};
