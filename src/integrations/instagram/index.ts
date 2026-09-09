import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/result";

import {
  INSTAGRAM_PUBLISH_PERMISSION_MESSAGE,
  buildInstagramAuthorizationUrl,
  exchangeInstagramAuthorizationCode,
  exchangeInstagramLongLivedToken,
  getInstagramProfile,
  hasRequiredInstagramScopes,
  publishInstagramImage,
  refreshInstagramLongLivedToken,
  requireInstagramApiConfig,
} from "./protocol";

/**
 * Instagram API mit Instagram Login.
 *
 * Ein professionelles Instagram-Konto (Business oder Creator) wird direkt
 * verbunden. Eine Facebook-Seite ist fuer diesen Flow nicht erforderlich.
 * Tokens bleiben ausschliesslich serverseitig und AES-256-GCM-verschluesselt.
 *
 * Publishing bleibt zweistufig: Medien-Container anlegen und danach
 * veroeffentlichen. Meta muss das Bild ueber eine oeffentliche URL laden
 * koennen. Aktuell wird bewusst nur ein Bild veroeffentlicht; Instagram
 * Carousel / mehrere Bilder sind noch nicht implementiert.
 */

const PROVIDER = "instagram";
const REFRESH_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const MINIMUM_REFRESH_AGE_MS = 24 * 60 * 60 * 1000;

export type InstagramTokenStatus =
  | "missing"
  | "valid"
  | "expiring"
  | "expired"
  | "legacy";

export type InstagramConnection = {
  connected: boolean;
  requiresReconnect: boolean;
  username: string | null;
  accountId: string | null;
  connectedAt: Date | null;
  expiresAt: Date | null;
  tokenStatus: InstagramTokenStatus;
  /** true, wenn das Token in weniger als sieben Tagen abläuft. */
  expiringSoon: boolean;
};

type StoredCredential = {
  id: string;
  accessTokenEncrypted: string;
  externalAccountId: string | null;
  externalUsername: string | null;
  scopes: string[];
  expiresAt: Date | null;
  connectedAt: Date;
  active: boolean;
  updatedAt: Date;
};

const credentialSelect = {
  id: true,
  accessTokenEncrypted: true,
  externalAccountId: true,
  externalUsername: true,
  scopes: true,
  expiresAt: true,
  connectedAt: true,
  active: true,
  updatedAt: true,
} as const;

function instagramConfig() {
  const config = env();
  return requireInstagramApiConfig({
    appId: config.INSTAGRAM_APP_ID,
    appSecret: config.INSTAGRAM_APP_SECRET,
    redirectUri: config.INSTAGRAM_REDIRECT_URI,
  });
}

function emptyConnection(): InstagramConnection {
  return {
    connected: false,
    requiresReconnect: false,
    username: null,
    accountId: null,
    connectedAt: null,
    expiresAt: null,
    tokenStatus: "missing",
    expiringSoon: false,
  };
}

function connectionFromCredential(
  credential: StoredCredential,
  now = new Date(),
): InstagramConnection {
  const base = {
    username: credential.externalUsername,
    accountId: credential.externalAccountId,
    connectedAt: credential.connectedAt,
    expiresAt: credential.expiresAt,
  };

  if (!hasRequiredInstagramScopes(credential.scopes)) {
    return {
      ...base,
      connected: false,
      requiresReconnect: true,
      tokenStatus: "legacy",
      expiringSoon: false,
    };
  }

  const remaining = credential.expiresAt
    ? credential.expiresAt.getTime() - now.getTime()
    : Number.POSITIVE_INFINITY;

  if (remaining <= 0) {
    return {
      ...base,
      connected: false,
      requiresReconnect: true,
      tokenStatus: "expired",
      expiringSoon: true,
    };
  }

  const expiringSoon = remaining < 7 * 24 * 60 * 60 * 1000;

  return {
    ...base,
    connected: Boolean(credential.externalAccountId),
    requiresReconnect: false,
    tokenStatus: expiringSoon ? "expiring" : "valid",
    expiringSoon,
  };
}

function shouldRefreshCredential(
  credential: StoredCredential,
  now = new Date(),
): boolean {
  if (!credential.expiresAt) return false;

  const remaining = credential.expiresAt.getTime() - now.getTime();
  const tokenAge = now.getTime() - credential.updatedAt.getTime();

  return (
    remaining > 0 &&
    remaining <= REFRESH_WINDOW_MS &&
    tokenAge >= MINIMUM_REFRESH_AGE_MS
  );
}

async function refreshStoredCredential(
  credential: StoredCredential,
  now = new Date(),
): Promise<StoredCredential> {
  const currentToken = decryptSecret(credential.accessTokenEncrypted);
  const refreshed = await refreshInstagramLongLivedToken(currentToken);
  const expiresAt = new Date(now.getTime() + refreshed.expiresIn * 1000);

  const updated = await prisma.integrationCredential.update({
    where: { id: credential.id },
    data: {
      accessTokenEncrypted: encryptSecret(refreshed.accessToken),
      expiresAt,
    },
    select: credentialSelect,
  });

  logger.info("Instagram-Zugang erneuert", {
    accountId: credential.externalAccountId,
    expiresAt,
  });

  return updated;
}

async function refreshWhenNeeded(
  credential: StoredCredential,
): Promise<StoredCredential> {
  if (!shouldRefreshCredential(credential)) return credential;

  try {
    return await refreshStoredCredential(credential);
  } catch (error) {
    // Solange das alte Token noch gilt, darf ein temporaerer Refresh-Fehler das
    // Publishing nicht blockieren. Der naechste Serverzugriff versucht es neu.
    logger.warn("Instagram-Zugang konnte noch nicht erneuert werden", {
      accountId: credential.externalAccountId,
      error,
    });
    return credential;
  }
}

async function findCredential(): Promise<StoredCredential | null> {
  return prisma.integrationCredential.findUnique({
    where: { provider: PROVIDER },
    select: credentialSelect,
  });
}

/** Verbindungsstatus fuer den Admin, niemals mit Klartext-Token. */
export async function getInstagramConnection(): Promise<InstagramConnection> {
  const stored = await findCredential();

  if (!stored || !stored.active) return emptyConnection();

  if (!hasRequiredInstagramScopes(stored.scopes)) {
    return connectionFromCredential(stored);
  }

  const credential = await refreshWhenNeeded(stored);
  return connectionFromCredential(credential);
}

/** Speichert ein Instagram-Zugangstoken verschluesselt. */
export async function saveInstagramCredential(input: {
  accessToken: string;
  accountId: string;
  username: string;
  expiresAt: Date;
  scopes: string[];
}): Promise<void> {
  const accessTokenEncrypted = encryptSecret(input.accessToken);
  const connectedAt = new Date();

  await prisma.integrationCredential.upsert({
    where: { provider: PROVIDER },
    create: {
      provider: PROVIDER,
      accessTokenEncrypted,
      externalAccountId: input.accountId,
      externalUsername: input.username,
      expiresAt: input.expiresAt,
      scopes: input.scopes,
      active: true,
      connectedAt,
    },
    update: {
      accessTokenEncrypted,
      externalAccountId: input.accountId,
      externalUsername: input.username,
      expiresAt: input.expiresAt,
      scopes: input.scopes,
      active: true,
      connectedAt,
    },
  });

  logger.info("Instagram-Zugang gespeichert", { accountId: input.accountId });
}

export async function disconnectInstagram(): Promise<void> {
  await prisma.integrationCredential.deleteMany({ where: { provider: PROVIDER } });
  logger.info("Instagram-Zugang entfernt");
}

async function loadCredential(): Promise<{
  accessToken: string;
  accountId: string;
}> {
  const stored = await findCredential();

  if (!stored || !stored.active || !stored.externalAccountId) {
    throw new UserFacingError(
      "Es ist kein Instagram-Konto verbunden. Bitte stellen Sie die " +
        "Verbindung unter \u201eIntegrationen\u201c her.",
      "NOT_CONFIGURED",
    );
  }

  if (!hasRequiredInstagramScopes(stored.scopes)) {
    throw new UserFacingError(
      INSTAGRAM_PUBLISH_PERMISSION_MESSAGE,
      "NOT_CONFIGURED",
    );
  }

  if (stored.expiresAt && stored.expiresAt.getTime() <= Date.now()) {
    throw new UserFacingError(
      "Der Instagram-Zugang ist abgelaufen. Bitte verbinden Sie das Konto " +
        "unter \u201eIntegrationen\u201c erneut.",
      "UNAUTHORIZED",
    );
  }

  const credential = await refreshWhenNeeded(stored);

  return {
    accessToken: decryptSecret(credential.accessTokenEncrypted),
    accountId: credential.externalAccountId!,
  };
}

export type PublishResult = {
  postId: string;
  permalink: string | null;
};

/** Veröffentlicht das erste Bild eines freigegebenen Social-Media-Entwurfs. */
export async function publishImagePost(input: {
  imageUrl: string;
  caption: string;
}): Promise<PublishResult> {
  // Erzwingt eine vollstaendige Konfiguration, bevor externe Aufrufe beginnen.
  instagramConfig();
  const { accessToken, accountId } = await loadCredential();

  const { postId, permalink } = await publishInstagramImage({
    accountId,
    accessToken,
    ...input,
  });

  logger.info("Instagram-Beitrag veröffentlicht", { postId });
  return { postId, permalink };
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export function buildInstagramAuthUrl(state: string): string {
  return buildInstagramAuthorizationUrl(instagramConfig(), state);
}

/**
 * Tauscht den OAuth-Code gegen ein langlebiges Instagram-Token und ermittelt
 * den Professional Account direkt, ohne Facebook Page Discovery.
 */
export async function exchangeInstagramCode(code: string): Promise<{
  accessToken: string;
  accountId: string;
  username: string;
  expiresAt: Date;
  scopes: string[];
}> {
  const config = instagramConfig();
  const short = await exchangeInstagramAuthorizationCode(config, code);
  const long = await exchangeInstagramLongLivedToken(
    config.appSecret,
    short.accessToken,
  );
  const profile = await getInstagramProfile(long.accessToken);

  return {
    accessToken: long.accessToken,
    accountId: profile.userId,
    username: profile.username,
    expiresAt: new Date(Date.now() + long.expiresIn * 1000),
    scopes: short.scopes,
  };
}
