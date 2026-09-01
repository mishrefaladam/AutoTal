import "server-only";

import { env, isInstagramConfigured } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/result";

/**
 * Instagram-Veröffentlichung über die Meta Graph API (EPIC 8).
 *
 * Voraussetzung ist ein Instagram-*Business*- oder *Creator*-Konto, das mit
 * einer Facebook-Seite verknüpft ist. Für Privatkonten gibt es keine
 * Veröffentlichungs-API – das ist eine Einschränkung von Meta, keine der
 * Anwendung.
 *
 * Ablauf beim Veröffentlichen (zweistufig, so schreibt es Meta vor):
 *   1. Medien-Container anlegen (Bild-URL + Bildunterschrift)
 *   2. Container veröffentlichen
 *
 * Das Bild muss unter einer öffentlich erreichbaren URL liegen – Meta lädt es
 * selbst herunter. Uploads vom Server werden nicht unterstützt.
 *
 * Tokens liegen ausschließlich serverseitig und verschlüsselt in der
 * Datenbank (siehe src/lib/crypto.ts). Sie werden nie an den Client geliefert.
 */

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const PROVIDER = "instagram";

export type InstagramConnection = {
  connected: boolean;
  username: string | null;
  accountId: string | null;
  expiresAt: Date | null;
  /** true, wenn das Token in weniger als sieben Tagen abläuft. */
  expiringSoon: boolean;
};

/** Verbindungsstatus für die Anzeige im Admin – ohne das Token selbst. */
export async function getInstagramConnection(): Promise<InstagramConnection> {
  const credential = await prisma.integrationCredential.findUnique({
    where: { provider: PROVIDER },
    select: {
      externalAccountId: true,
      externalUsername: true,
      expiresAt: true,
      active: true,
    },
  });

  if (!credential || !credential.active) {
    return {
      connected: false,
      username: null,
      accountId: null,
      expiresAt: null,
      expiringSoon: false,
    };
  }

  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  return {
    connected: true,
    username: credential.externalUsername,
    accountId: credential.externalAccountId,
    expiresAt: credential.expiresAt,
    expiringSoon: Boolean(
      credential.expiresAt &&
        credential.expiresAt.getTime() - Date.now() < sevenDays,
    ),
  };
}

/** Speichert ein Zugangstoken verschlüsselt. */
export async function saveInstagramCredential(input: {
  accessToken: string;
  accountId: string;
  username: string | null;
  expiresAt: Date | null;
  scopes?: string[];
}): Promise<void> {
  const accessTokenEncrypted = encryptSecret(input.accessToken);

  await prisma.integrationCredential.upsert({
    where: { provider: PROVIDER },
    create: {
      provider: PROVIDER,
      accessTokenEncrypted,
      externalAccountId: input.accountId,
      externalUsername: input.username,
      expiresAt: input.expiresAt,
      scopes: input.scopes ?? [],
      active: true,
    },
    update: {
      accessTokenEncrypted,
      externalAccountId: input.accountId,
      externalUsername: input.username,
      expiresAt: input.expiresAt,
      scopes: input.scopes ?? [],
      active: true,
      connectedAt: new Date(),
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
  const credential = await prisma.integrationCredential.findUnique({
    where: { provider: PROVIDER },
  });

  if (!credential || !credential.active || !credential.externalAccountId) {
    throw new UserFacingError(
      "Es ist kein Instagram-Konto verbunden. Bitte stellen Sie die " +
        "Verbindung unter „Integrationen“ her.",
      "NOT_CONFIGURED",
    );
  }

  if (credential.expiresAt && credential.expiresAt.getTime() < Date.now()) {
    throw new UserFacingError(
      "Der Instagram-Zugang ist abgelaufen. Bitte verbinden Sie das Konto " +
        "unter „Integrationen“ erneut.",
      "UNAUTHORIZED",
    );
  }

  return {
    accessToken: decryptSecret(credential.accessTokenEncrypted),
    accountId: credential.externalAccountId,
  };
}

/**
 * Übersetzt einen Graph-API-Fehler in eine Meldung, die dem Admin
 * weiterhilft (US-24). Der Rohfehler bleibt im Log.
 */
function toUserFacingGraphError(
  status: number,
  body: { error?: { message?: string; code?: number; error_subcode?: number } },
): UserFacingError {
  const code = body.error?.code;

  if (status === 401 || code === 190) {
    return new UserFacingError(
      "Der Instagram-Zugang wurde von Meta abgelehnt. Das passiert meist, " +
        "wenn das Token abgelaufen ist oder der Zugriff entzogen wurde. " +
        "Bitte verbinden Sie das Konto unter „Integrationen“ erneut.",
      "UNAUTHORIZED",
    );
  }

  if (status === 429 || code === 4 || code === 32) {
    return new UserFacingError(
      "Instagram hat das Veröffentlichungslimit erreicht (maximal 50 Beiträge " +
        "in 24 Stunden). Bitte versuchen Sie es später erneut.",
      "RATE_LIMITED",
    );
  }

  if (code === 9004 || code === 2207052) {
    return new UserFacingError(
      "Instagram konnte das Bild nicht laden. Es muss unter einer öffentlich " +
        "erreichbaren Adresse liegen, im Format JPEG vorliegen und darf " +
        "höchstens 8 MB groß sein.",
      "SERVICE_UNAVAILABLE",
    );
  }

  if (status >= 500) {
    return new UserFacingError(
      "Instagram ist derzeit nicht erreichbar. Bitte versuchen Sie es in ein " +
        "paar Minuten erneut.",
      "SERVICE_UNAVAILABLE",
    );
  }

  return new UserFacingError(
    "Instagram hat die Veröffentlichung abgelehnt. Bitte prüfen Sie unter " +
      "„Integrationen“, ob das Konto noch verbunden ist, und versuchen Sie es " +
      "erneut.",
    "SERVICE_UNAVAILABLE",
  );
}

async function graphRequest<T>(
  path: string,
  params: Record<string, string>,
  method: "GET" | "POST" = "POST",
): Promise<T> {
  const url = new URL(`${GRAPH_BASE_URL}${path}`);

  const init: RequestInit = { method };

  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  } else {
    init.body = new URLSearchParams(params);
  }

  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      // Verhindert, dass ein hängender Aufruf die Server Action blockiert.
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    logger.error("Instagram-Anfrage fehlgeschlagen", { path, error });
    throw new UserFacingError(
      "Instagram konnte nicht erreicht werden. Bitte prüfen Sie die " +
        "Internetverbindung und versuchen Sie es erneut.",
      "SERVICE_UNAVAILABLE",
    );
  }

  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; code?: number };
  };

  if (!response.ok) {
    // Die URL enthält kein Token (das steckt im Body), aber die
    // Meta-Fehlermeldung kann Kontodetails enthalten – daher nur ins Log.
    logger.error("Instagram-API hat einen Fehler gemeldet", {
      path,
      status: response.status,
      graphMessage: body.error?.message,
      graphCode: body.error?.code,
    });

    throw toUserFacingGraphError(response.status, body);
  }

  return body as T;
}

export type PublishResult = {
  postId: string;
  permalink: string | null;
};

/**
 * Veröffentlicht ein Bild mit Bildunterschrift (US-23).
 *
 * WICHTIG: Diese Funktion prüft NICHT den Freigabestatus. Das passiert eine
 * Ebene höher in `publishSocialDraft()` – dort ist die Prüfung "nur APPROVED"
 * verankert, damit sie nicht umgangen werden kann, indem jemand direkt hier
 * einsteigt.
 */
export async function publishImagePost(input: {
  imageUrl: string;
  caption: string;
}): Promise<PublishResult> {
  if (!isInstagramConfigured()) {
    throw new UserFacingError(
      "Die Instagram-Integration ist nicht eingerichtet. Es fehlen " +
        "INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET oder INSTAGRAM_REDIRECT_URI.",
      "NOT_CONFIGURED",
    );
  }

  const { accessToken, accountId } = await loadCredential();

  // Schritt 1: Medien-Container anlegen.
  const container = await graphRequest<{ id: string }>(
    `/${accountId}/media`,
    {
      image_url: input.imageUrl,
      caption: input.caption,
      access_token: accessToken,
    },
  );

  // Schritt 2: Container veröffentlichen.
  const published = await graphRequest<{ id: string }>(
    `/${accountId}/media_publish`,
    {
      creation_id: container.id,
      access_token: accessToken,
    },
  );

  // Schritt 3: Permalink nachladen. Schlägt das fehl, ist der Beitrag
  // trotzdem online – der Link ist nur Komfort.
  let permalink: string | null = null;

  try {
    const details = await graphRequest<{ permalink?: string }>(
      `/${published.id}`,
      { fields: "permalink", access_token: accessToken },
      "GET",
    );
    permalink = details.permalink ?? null;
  } catch {
    logger.warn("Permalink konnte nicht geladen werden", {
      postId: published.id,
    });
  }

  logger.info("Instagram-Beitrag veröffentlicht", { postId: published.id });

  return { postId: published.id, permalink };
}

// ---------------------------------------------------------------------------
// OAuth (US-22)
// ---------------------------------------------------------------------------

const REQUIRED_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "business_management",
];

/** Startadresse des Meta-Anmeldedialogs. */
export function buildInstagramAuthUrl(state: string): string {
  const config = env();

  if (!isInstagramConfigured()) {
    throw new UserFacingError(
      "Die Instagram-Integration ist nicht eingerichtet. Bitte hinterlegen " +
        "Sie INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET und INSTAGRAM_REDIRECT_URI.",
      "NOT_CONFIGURED",
    );
  }

  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", config.INSTAGRAM_APP_ID!);
  url.searchParams.set("redirect_uri", config.INSTAGRAM_REDIRECT_URI!);
  url.searchParams.set("scope", REQUIRED_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  return url.toString();
}

/**
 * Tauscht den OAuth-Code gegen ein langlebiges Token und ermittelt das
 * verknüpfte Instagram-Business-Konto.
 */
export async function exchangeInstagramCode(code: string): Promise<{
  accessToken: string;
  accountId: string;
  username: string | null;
  expiresAt: Date | null;
}> {
  const config = env();

  // 1. Kurzlebiges Nutzertoken
  const short = await graphRequest<{ access_token: string }>(
    "/oauth/access_token",
    {
      client_id: config.INSTAGRAM_APP_ID!,
      client_secret: config.INSTAGRAM_APP_SECRET!,
      redirect_uri: config.INSTAGRAM_REDIRECT_URI!,
      code,
    },
    "GET",
  );

  // 2. Gegen ein langlebiges Token tauschen (rund 60 Tage gültig)
  const long = await graphRequest<{
    access_token: string;
    expires_in?: number;
  }>(
    "/oauth/access_token",
    {
      grant_type: "fb_exchange_token",
      client_id: config.INSTAGRAM_APP_ID!,
      client_secret: config.INSTAGRAM_APP_SECRET!,
      fb_exchange_token: short.access_token,
    },
    "GET",
  );

  // 3. Facebook-Seiten mit verknüpftem Instagram-Business-Konto suchen
  const pages = await graphRequest<{
    data?: {
      id: string;
      name: string;
      instagram_business_account?: { id: string; username?: string };
    }[];
  }>(
    "/me/accounts",
    {
      fields: "id,name,instagram_business_account{id,username}",
      access_token: long.access_token,
    },
    "GET",
  );

  const page = pages.data?.find((entry) => entry.instagram_business_account);

  if (!page?.instagram_business_account) {
    throw new UserFacingError(
      "Es wurde kein Instagram-Business-Konto gefunden. Bitte stellen Sie " +
        "sicher, dass Ihr Instagram-Konto ein Business- oder Creator-Konto " +
        "ist und mit einer Facebook-Seite verknüpft wurde. Für Privatkonten " +
        "erlaubt Meta keine automatische Veröffentlichung.",
      "NOT_CONFIGURED",
    );
  }

  return {
    accessToken: long.access_token,
    accountId: page.instagram_business_account.id,
    username: page.instagram_business_account.username ?? null,
    expiresAt: long.expires_in
      ? new Date(Date.now() + long.expires_in * 1000)
      : null,
  };
}
