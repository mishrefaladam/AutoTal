import "server-only";

import { logger } from "@/lib/logger";
import { UserFacingError, type ErrorCode } from "@/lib/result";

import { INSTAGRAM_CAROUSEL_MAX_ITEMS, INSTAGRAM_CAROUSEL_MIN_ITEMS } from "./limits";

/**
 * Zentrale Protokollkonfiguration fuer die Instagram API mit Instagram Login.
 * Die Version wird absichtlich nur hier festgelegt.
 */
export const INSTAGRAM_GRAPH_API_VERSION = "v26.0";

export const INSTAGRAM_REQUIRED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
] as const;

export const INSTAGRAM_PUBLISH_PERMISSION_MESSAGE =
  "Die Instagram-Verbindung besitzt nicht die erforderliche " +
  "Veröffentlichungsberechtigung. Bitte Instagram unter Integrationen neu " +
  "verbinden.";

export const INSTAGRAM_PUBLISH_OUTCOME_UNKNOWN_MESSAGE =
  "Instagram hat auf die Veröffentlichung nicht eindeutig geantwortet. Bitte " +
  "prüfen Sie zuerst den Instagram-Account. Falls der Beitrag dort nicht " +
  "vorhanden ist, bearbeiten und geben Sie den Entwurf erneut frei.";

export const INSTAGRAM_CONTAINER_POLL_DELAYS_MS = [
  1_000, 1_000, 1_500, 1_500, 2_000, 2_000,
] as const;

const INSTAGRAM_PUBLISH_RETRY_POLL_DELAYS_MS = [1_000, 1_500, 1_500] as const;

export const INSTAGRAM_CHILD_CONCURRENCY = 3;

export { INSTAGRAM_CAROUSEL_MAX_ITEMS, INSTAGRAM_CAROUSEL_MIN_ITEMS } from "./limits";

const INSTAGRAM_OAUTH_URL = "https://www.instagram.com/oauth/authorize";
const INSTAGRAM_CODE_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const INSTAGRAM_TOKEN_BASE_URL = "https://graph.instagram.com";
const INSTAGRAM_GRAPH_BASE_URL =
  `${INSTAGRAM_TOKEN_BASE_URL}/${INSTAGRAM_GRAPH_API_VERSION}`;

type Fetcher = typeof fetch;

export type InstagramApiConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
};

type OptionalInstagramApiConfig = {
  appId?: string;
  appSecret?: string;
  redirectUri?: string;
};

type InstagramErrorBody = {
  error?: {
    type?: string;
    code?: number;
    error_subcode?: number;
    message?: string;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
  code?: number;
  error_type?: string;
  error_message?: string;
};

export type InstagramProfile = {
  userId: string;
  username: string;
};

export type InstagramPublishingLimit = {
  usage: number;
  total: number;
  durationSeconds: number | null;
};

export type InstagramPublishResult = {
  postId: string | null;
  permalink: string | null;
  alreadyPublished: boolean;
};

export type InstagramContainerStatusCode =
  | "IN_PROGRESS"
  | "FINISHED"
  | "ERROR"
  | "EXPIRED"
  | "PUBLISHED";

type InstagramApiErrorDetails = {
  operation: string;
  status: number;
  apiCode?: number;
  errorSubcode?: number;
};

export class InstagramApiRequestError extends UserFacingError {
  readonly operation: string;
  readonly status: number;
  readonly apiCode: number | undefined;
  readonly errorSubcode: number | undefined;

  constructor(
    message: string,
    code: ErrorCode,
    details: InstagramApiErrorDetails,
  ) {
    super(message, code);
    this.name = "InstagramApiRequestError";
    this.operation = details.operation;
    this.status = details.status;
    this.apiCode = details.apiCode;
    this.errorSubcode = details.errorSubcode;
  }
}

export class InstagramPublishOutcomeUnknownError extends UserFacingError {
  constructor() {
    super(INSTAGRAM_PUBLISH_OUTCOME_UNKNOWN_MESSAGE, "CONFLICT");
    this.name = "InstagramPublishOutcomeUnknownError";
  }
}

export function requireInstagramApiConfig(
  input: OptionalInstagramApiConfig,
): InstagramApiConfig {
  if (!input.appId || !input.appSecret || !input.redirectUri) {
    throw new UserFacingError(
      "Die Instagram-Integration ist nicht eingerichtet. Bitte hinterlegen " +
        "Sie INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET und INSTAGRAM_REDIRECT_URI.",
      "NOT_CONFIGURED",
    );
  }

  return {
    appId: input.appId,
    appSecret: input.appSecret,
    redirectUri: input.redirectUri,
  };
}

export function hasRequiredInstagramScopes(scopes: readonly string[]): boolean {
  return INSTAGRAM_REQUIRED_SCOPES.every((scope) => scopes.includes(scope));
}

export function buildInstagramAuthorizationUrl(
  config: InstagramApiConfig,
  state: string,
): string {
  const url = new URL(INSTAGRAM_OAUTH_URL);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_REQUIRED_SCOPES.join(","));
  url.searchParams.set("state", state);
  // Der Kunde meldet sich ausschliesslich mit seinem Instagram-Konto an.
  url.searchParams.set("enable_fb_login", "0");

  return url.toString();
}

function apiErrorCode(body: InstagramErrorBody): number | undefined {
  return body.error?.code ?? body.code;
}

function collectRequestSecrets(url: URL, init: RequestInit): string[] {
  const secrets = new Set<string>();
  const sensitiveParameter = /^(access_token|client_secret|code)$/i;

  for (const [key, value] of url.searchParams) {
    if (sensitiveParameter.test(key) && value) secrets.add(value);
  }

  const authorization = new Headers(init.headers).get("authorization");
  if (authorization) {
    secrets.add(authorization);
    const bearerToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (bearerToken) secrets.add(bearerToken);
  }

  if (init.body instanceof URLSearchParams || init.body instanceof FormData) {
    for (const key of ["access_token", "client_secret", "code"]) {
      const value = init.body.get(key);
      if (typeof value === "string" && value) secrets.add(value);
    }
  }

  return [...secrets];
}

function sanitizeMetaDiagnostic(
  value: string | undefined,
  secrets: readonly string[],
): string | undefined {
  if (!value) return undefined;

  let sanitized = value
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(
      /((?:access[_-]?token|client[_-]?secret|authorization)\s*[=:]\s*)[^\s,;&]+/gi,
      "$1[redacted]",
    );

  for (const secret of secrets) {
    sanitized = sanitized.replaceAll(secret, "[redacted]");
  }

  return sanitized.slice(0, 1_000);
}

function metaErrorLogContext(
  body: InstagramErrorBody,
  secrets: readonly string[],
) {
  return {
    errorType: body.error?.type ?? body.error_type,
    apiCode: apiErrorCode(body),
    errorSubcode: body.error?.error_subcode,
    errorMessage: sanitizeMetaDiagnostic(
      body.error?.message ?? body.error_message,
      secrets,
    ),
    errorUserTitle: sanitizeMetaDiagnostic(
      body.error?.error_user_title,
      secrets,
    ),
    errorUserMessage: sanitizeMetaDiagnostic(
      body.error?.error_user_msg,
      secrets,
    ),
    fbtraceId: sanitizeMetaDiagnostic(body.error?.fbtrace_id, secrets),
  };
}

function toUserFacingInstagramError(
  status: number,
  body: InstagramErrorBody,
): UserFacingError {
  const code = apiErrorCode(body);
  const subcode = body.error?.error_subcode;

  if (status === 401 || code === 190) {
    return new UserFacingError(
      "Der Instagram-Zugang wurde abgelehnt oder ist abgelaufen. Bitte " +
        "verbinden Sie das Konto unter \u201eIntegrationen\u201c erneut.",
      "UNAUTHORIZED",
    );
  }

  if (code === 200) {
    return new UserFacingError(
      INSTAGRAM_PUBLISH_PERMISSION_MESSAGE,
      "UNAUTHORIZED",
    );
  }

  if (status === 429 || code === 4 || code === 32) {
    return new UserFacingError(
      "Instagram hat das aktuelle Veröffentlichungslimit erreicht. Bitte " +
        "versuchen Sie es später erneut.",
      "RATE_LIMITED",
    );
  }

  if (code === 9007 && subcode === 2207027) {
    return new UserFacingError(
      "Instagram verarbeitet das Bild noch. Bitte versuchen Sie die " +
        "Veröffentlichung in einem Moment erneut.",
      "SERVICE_UNAVAILABLE",
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
    "Instagram hat die Anfrage abgelehnt. Bitte prüfen Sie die Verbindung " +
      "unter \u201eIntegrationen\u201c und versuchen Sie es erneut.",
    "SERVICE_UNAVAILABLE",
  );
}

async function requestJson<T>(
  url: URL,
  init: RequestInit,
  operation: string,
  fetcher: Fetcher,
): Promise<T> {
  let response: Response;

  try {
    response = await fetcher(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
  } catch (error) {
    logger.error("Instagram-Anfrage fehlgeschlagen", {
      operation,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

    if (operation.endsWith("/media_publish")) {
      throw new InstagramPublishOutcomeUnknownError();
    }

    throw new UserFacingError(
      "Instagram konnte nicht erreicht werden. Bitte versuchen Sie es erneut.",
      "SERVICE_UNAVAILABLE",
    );
  }

  const body = (await response.json().catch(() => ({}))) as InstagramErrorBody;

  if (!response.ok) {
    // Keine URLs, Bodies oder Header loggen: Sie koennen Tokens enthalten.
    const secrets = collectRequestSecrets(url, init);
    logger.error("Instagram-API hat einen Fehler gemeldet", {
      operation,
      status: response.status,
      ...metaErrorLogContext(body, secrets),
    });
    const userFacingError = toUserFacingInstagramError(response.status, body);

    if (operation.endsWith("/media_publish") && response.status >= 500) {
      throw new InstagramPublishOutcomeUnknownError();
    }

    throw new InstagramApiRequestError(
      userFacingError.message,
      userFacingError.code,
      {
        operation,
        status: response.status,
        apiCode: apiErrorCode(body),
        errorSubcode: body.error?.error_subcode,
      },
    );
  }

  return body as T;
}

async function graphRequest<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {},
  method: "GET" | "POST" = "GET",
  fetcher: Fetcher = fetch,
): Promise<T> {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}${path}`);
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
  };

  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  } else {
    init.body = new URLSearchParams(params);
  }

  return requestJson<T>(url, init, `${method} ${path}`, fetcher);
}

function normalizeScopes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((scope): scope is string => typeof scope === "string");
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean);
  }

  return [];
}

/** Tauscht den Callback-Code gegen ein kurzlebiges Instagram-Token. */
export async function exchangeInstagramAuthorizationCode(
  config: InstagramApiConfig,
  code: string,
  fetcher: Fetcher = fetch,
): Promise<{ accessToken: string; userId: string; scopes: string[] }> {
  const form = new FormData();
  form.set("client_id", config.appId);
  form.set("client_secret", config.appSecret);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", config.redirectUri);
  form.set("code", code);

  type AuthorizationToken = {
    access_token?: string;
    user_id?: string | number;
    permissions?: string | string[];
  };

  const response = await requestJson<
    AuthorizationToken & { data?: AuthorizationToken[] }
  >(
    new URL(INSTAGRAM_CODE_TOKEN_URL),
    { method: "POST", body: form },
    "POST authorization code exchange",
    fetcher,
  );

  // Business Login liefert den Token dokumentiert in data[0]. Das
  // Top-Level-Format bleibt als toleranter Fallback erhalten.
  const token = response.data?.[0] ?? response;
  const scopes = normalizeScopes(token.permissions);

  if (!token.access_token || token.user_id === undefined) {
    throw new UserFacingError(
      "Instagram hat keine vollständigen Zugangsdaten zurückgegeben. Bitte " +
        "starten Sie die Verbindung erneut.",
      "SERVICE_UNAVAILABLE",
    );
  }

  if (!hasRequiredInstagramScopes(scopes)) {
    throw new UserFacingError(
      "Die benötigten Instagram-Berechtigungen wurden nicht vollständig " +
        "erteilt. Bitte starten Sie die Verbindung erneut und bestätigen Sie " +
        "beide Berechtigungen.",
      "UNAUTHORIZED",
    );
  }

  return {
    accessToken: token.access_token,
    userId: String(token.user_id),
    scopes,
  };
}

/** Tauscht ein kurzlebiges gegen ein rund 60 Tage gültiges Token. */
export async function exchangeInstagramLongLivedToken(
  appSecret: string,
  shortLivedAccessToken: string,
  fetcher: Fetcher = fetch,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(`${INSTAGRAM_TOKEN_BASE_URL}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortLivedAccessToken);

  const response = await requestJson<{
    access_token?: string;
    expires_in?: number;
  }>(url, { method: "GET" }, "GET long-lived token exchange", fetcher);

  if (!response.access_token || !response.expires_in) {
    throw new UserFacingError(
      "Instagram hat kein gültiges langlebiges Zugangstoken zurückgegeben. " +
        "Bitte starten Sie die Verbindung erneut.",
      "SERVICE_UNAVAILABLE",
    );
  }

  return {
    accessToken: response.access_token,
    expiresIn: response.expires_in,
  };
}

/** Verlängert ein gültiges, mindestens 24 Stunden altes Long-Lived Token. */
export async function refreshInstagramLongLivedToken(
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(`${INSTAGRAM_TOKEN_BASE_URL}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);

  const response = await requestJson<{
    access_token?: string;
    expires_in?: number;
  }>(url, { method: "GET" }, "GET long-lived token refresh", fetcher);

  if (!response.access_token || !response.expires_in) {
    throw new UserFacingError(
      "Instagram hat das Zugangstoken nicht erneuert. Bitte verbinden Sie das " +
        "Konto unter \u201eIntegrationen\u201c erneut.",
      "UNAUTHORIZED",
    );
  }

  return {
    accessToken: response.access_token,
    expiresIn: response.expires_in,
  };
}

/** Ermittelt die ID und den Benutzernamen direkt aus dem Instagram-Token. */
export async function getInstagramProfile(
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<InstagramProfile> {
  const response = await graphRequest<{
    user_id?: string | number;
    id?: string | number;
    username?: string;
    data?: Array<{
      user_id?: string | number;
      id?: string | number;
      username?: string;
    }>;
  }>("/me", accessToken, { fields: "user_id,username" }, "GET", fetcher);

  // Meta dokumentiert je nach Endpoint-Darstellung Objekt und data-Liste.
  const profile = response.data?.[0] ?? response;
  const userId = profile.user_id ?? profile.id;

  if (userId === undefined || !profile.username) {
    throw new UserFacingError(
      "Instagram konnte den Professional Account nicht eindeutig ermitteln. " +
        "Bitte prüfen Sie den Kontotyp und verbinden Sie das Konto erneut.",
      "NOT_CONFIGURED",
    );
  }

  return { userId: String(userId), username: profile.username };
}

/** Liest das aktuelle, kontospezifische Publishing-Limit. */
export async function getInstagramPublishingLimit(
  accountId: string,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<InstagramPublishingLimit | null> {
  const response = await graphRequest<{
    quota_usage?: number;
    config?: { quota_total?: number; quota_duration?: number };
    data?: Array<{
      quota_usage?: number;
      config?: { quota_total?: number; quota_duration?: number };
    }>;
  }>(
    `/${accountId}/content_publishing_limit`,
    accessToken,
    { fields: "quota_usage,config" },
    "GET",
    fetcher,
  );

  const limit = response.data?.[0] ?? response;
  const usage = limit.quota_usage;
  const total = limit.config?.quota_total;

  if (typeof usage !== "number" || typeof total !== "number") return null;

  return {
    usage,
    total,
    durationSeconds: limit.config?.quota_duration ?? null,
  };
}

export async function createInstagramImageContainer(
  accountId: string,
  accessToken: string,
  input: { imageUrl: string; caption: string },
  fetcher: Fetcher = fetch,
): Promise<string> {
  const response = await graphRequest<{ id?: string }>(
    `/${accountId}/media`,
    accessToken,
    { image_url: input.imageUrl, caption: input.caption },
    "POST",
    fetcher,
  );

  if (!response.id) {
    throw new UserFacingError(
      "Instagram hat keinen Medien-Container erstellt.",
      "SERVICE_UNAVAILABLE",
    );
  }

  return response.id;
}

export async function getInstagramContainerStatus(
  containerId: string,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<{ statusCode: string; status: string | null }> {
  const response = await graphRequest<{
    status_code?: string;
    status?: string;
    data?: Array<{ status_code?: string; status?: string }>;
  }>(
    `/${containerId}`,
    accessToken,
    { fields: "status_code,status" },
    "GET",
    fetcher,
  );

  const container = response.data?.[0] ?? response;

  return {
    statusCode:
      typeof container.status_code === "string"
        ? container.status_code.toUpperCase()
        : "UNKNOWN",
    status: typeof container.status === "string" ? container.status : null,
  };
}

type ContainerPollingOptions = {
  delaysMs?: readonly number[];
  sleep?: (milliseconds: number) => Promise<void>;
  /** "Bild 3 von 5" – damit die Meldung sagt, welches Medium gemeint ist. */
  mediaLabel?: string;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Drain in-flight requests on failure and stop scheduling new ones. */
async function mapChildren<T, R>(
  values: readonly T[],
  operation: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  let failed = false;
  const workers = Array.from(
    { length: Math.min(INSTAGRAM_CHILD_CONCURRENCY, values.length) },
    async () => {
      while (!failed && next < values.length) {
        const index = next++;
        try {
          results[index] = await operation(values[index], index);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    },
  );
  const settled = await Promise.allSettled(workers);
  const failure = settled.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return results;
}

async function waitForInstagramChildren(
  childrenIds: readonly string[],
  accessToken: string,
  fetcher: Fetcher,
  options: ContainerPollingOptions,
): Promise<void> {
  let pending = childrenIds.map((id, index) => ({ id, index }));
  const wait = options.sleep ?? sleep;
  const delays = options.delaysMs ?? INSTAGRAM_CONTAINER_POLL_DELAYS_MS;

  for (const [round, delay] of delays.entries()) {
    await wait(delay);
    const results = await mapChildren(pending, async (child) => {
      const container = await getInstagramContainerStatus(child.id, accessToken, fetcher);
      logger.info("Instagram child container status", {
        containerId: child.id,
        imageIndex: child.index + 1,
        round: round + 1,
        statusCode: container.statusCode,
      });
      if (container.statusCode === "FINISHED") return null;
      if (container.statusCode === "IN_PROGRESS") return child;
      throw new UserFacingError(
        `Instagram konnte Bild ${child.index + 1} von ${childrenIds.length} nicht verarbeiten. ` +
          (container.statusCode === "EXPIRED"
            ? "Der Mediencontainer ist abgelaufen. Bitte versuchen Sie es erneut."
            : "Bitte prüfen Sie das Fahrzeugbild und versuchen Sie es erneut."),
        "SERVICE_UNAVAILABLE",
      );
    });
    pending = results.filter((child) => child !== null);
    if (pending.length === 0) return;
  }
  throw new UserFacingError(
    `Instagram verarbeitet Bild ${pending[0].index + 1} von ${childrenIds.length} noch. ` +
      "Bitte versuchen Sie die Veröffentlichung in einem Moment erneut.",
    "SERVICE_UNAVAILABLE",
  );
}

export async function waitForInstagramContainer(
  containerId: string,
  accessToken: string,
  fetcher: Fetcher = fetch,
  options: ContainerPollingOptions = {},
): Promise<"FINISHED" | "PUBLISHED"> {
  const delaysMs = options.delaysMs ?? INSTAGRAM_CONTAINER_POLL_DELAYS_MS;
  const wait = options.sleep ?? sleep;

  for (const [index, delayMs] of delaysMs.entries()) {
    await wait(delayMs);
    const attempt = index + 1;
    const container = await getInstagramContainerStatus(
      containerId,
      accessToken,
      fetcher,
    );

    logger.info("Instagram container status", {
      containerId,
      attempt,
      statusCode: container.statusCode,
      status: container.status,
    });

    if (container.statusCode === "FINISHED") return "FINISHED";
    if (container.statusCode === "PUBLISHED") return "PUBLISHED";

    // Ein Medienproblem heißt beim Namen: "Bild 3 von 5" – nicht "Verbindung
    // prüfen". Der Händler soll wissen, welches Bild er ansehen muss.
    const media = options.mediaLabel ?? "das Bild";

    if (container.statusCode === "ERROR") {
      throw new UserFacingError(
        `Instagram konnte ${media} nicht verarbeiten. Bitte prüfen Sie das ` +
          "Fahrzeugbild (JPEG, öffentlich erreichbar) und versuchen Sie es erneut.",
        "SERVICE_UNAVAILABLE",
      );
    }

    if (container.statusCode === "EXPIRED") {
      throw new UserFacingError(
        `Der Instagram-Mediencontainer für ${media} ist abgelaufen. Bitte ` +
          "versuchen Sie die Veröffentlichung erneut; dabei werden neue Container erstellt.",
        "SERVICE_UNAVAILABLE",
      );
    }

    if (container.statusCode !== "IN_PROGRESS") {
      logger.error("Unbekannter Instagram-Containerstatus", {
        containerId,
        attempt,
        statusCode: container.statusCode,
        status: container.status,
      });
      throw new UserFacingError(
        "Instagram hat einen unbekannten Verarbeitungsstatus gemeldet. Bitte " +
          "versuchen Sie es später erneut.",
        "SERVICE_UNAVAILABLE",
      );
    }
  }

  throw new UserFacingError(
    `Instagram verarbeitet ${options.mediaLabel ?? "das Bild"} noch. Bitte versuchen Sie die ` +
      "Veröffentlichung in einem Moment erneut.",
    "SERVICE_UNAVAILABLE",
  );
}

/**
 * Ein Element eines Carousels: nur das Bild, keine Caption – die gehört an
 * den Carousel-Container.
 */
export async function createInstagramCarouselItemContainer(
  accountId: string,
  accessToken: string,
  input: { imageUrl: string },
  fetcher: Fetcher = fetch,
): Promise<string> {
  const response = await graphRequest<{ id?: string }>(
    `/${accountId}/media`,
    accessToken,
    { image_url: input.imageUrl, is_carousel_item: "true" },
    "POST",
    fetcher,
  );

  if (!response.id) {
    throw new UserFacingError(
      "Instagram hat keinen Medien-Container für das Carousel-Bild erstellt.",
      "SERVICE_UNAVAILABLE",
    );
  }

  return response.id;
}

/** Der Carousel-Container: die fertigen Kinder in Reihenfolge plus Caption. */
export async function createInstagramCarouselContainer(
  accountId: string,
  accessToken: string,
  input: { childrenIds: readonly string[]; caption: string },
  fetcher: Fetcher = fetch,
): Promise<string> {
  const response = await graphRequest<{ id?: string }>(
    `/${accountId}/media`,
    accessToken,
    {
      media_type: "CAROUSEL",
      children: input.childrenIds.join(","),
      caption: input.caption,
    },
    "POST",
    fetcher,
  );

  if (!response.id) {
    throw new UserFacingError(
      "Instagram hat keinen Carousel-Container erstellt.",
      "SERVICE_UNAVAILABLE",
    );
  }

  return response.id;
}

export async function publishInstagramImageContainer(
  accountId: string,
  accessToken: string,
  containerId: string,
  fetcher: Fetcher = fetch,
): Promise<string> {
  const response = await graphRequest<{ id?: string }>(
    `/${accountId}/media_publish`,
    accessToken,
    { creation_id: containerId },
    "POST",
    fetcher,
  );

  if (!response.id) {
    throw new InstagramPublishOutcomeUnknownError();
  }

  return response.id;
}

export async function getInstagramMediaPermalink(
  mediaId: string,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<string | null> {
  const response = await graphRequest<{ permalink?: string }>(
    `/${mediaId}`,
    accessToken,
    { fields: "permalink" },
    "GET",
    fetcher,
  );

  return response.permalink ?? null;
}

// ---------------------------------------------------------------------------
// Existenzprüfung: Gibt es den veröffentlichten Beitrag noch?
// ---------------------------------------------------------------------------

export type InstagramMediaExistence =
  /** Instagram kennt das Medium; es ist weiterhin online. */
  | { state: "exists"; permalink: string | null }
  /** Instagram meldet eindeutig: Dieses Objekt gibt es nicht mehr. */
  | { state: "missing" }
  /**
   * Keine Aussage möglich – Zugang, Limit, Ausfall oder Unbekanntes. Der
   * lokale Zustand darf sich daraus nicht ändern.
   */
  | {
      state: "unknown";
      reason: "unauthorized" | "rate-limited" | "unavailable" | "network" | "unknown";
      message: string;
    };

/**
 * Metas Kennzeichen für ein nicht (mehr) vorhandenes Objekt beim GET auf eine
 * Media-ID: HTTP 404, Code 100 mit Subcode 33 ("Unsupported get request.
 * Object with ID … does not exist, cannot be loaded due to missing
 * permissions, or does not support this operation") oder Code 803 ("Some of
 * the aliases you requested do not exist").
 */
function isMediaNotFoundError(error: InstagramApiRequestError): boolean {
  if (error.status === 404) return true;
  if (error.apiCode === 100 && error.errorSubcode === 33) return true;
  return error.apiCode === 803;
}

/**
 * Prüft, ob ein veröffentlichter Beitrag auf Instagram noch existiert.
 *
 * NUR LESEN: Ein einzelner GET auf die Media-ID mit den Feldern id und
 * permalink. Es gibt bewusst keine Funktion, die ein Medium über die API
 * löscht – Meta unterstützt das für veröffentlichte Feed-Beiträge nicht
 * verlässlich; gelöscht wird in der Instagram-App, AutoTal gleicht nur ab.
 *
 * NICHT VERWECHSELN: Metas "does not exist"-Meldung nennt in einem Atemzug
 * auch "missing permissions". Damit ein abgelaufener Zugang nicht als
 * Löschung durchgeht, wird bei dieser Meldung zusätzlich /me abgefragt:
 * Antwortet Instagram dort, ist das Token in Ordnung und das Medium fehlt
 * tatsächlich. Antwortet es nicht, bleibt der Ausgang unbekannt. Jeder
 * andere Fehler – Zugang, Limit, 5xx, Netz – ist ebenfalls "unbekannt".
 */
export async function getInstagramMediaExistence(
  mediaId: string,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<InstagramMediaExistence> {
  try {
    const media = await graphRequest<{ id?: string | number; permalink?: string }>(
      `/${mediaId}`,
      accessToken,
      { fields: "id,permalink" },
      "GET",
      fetcher,
    );
    return { state: "exists", permalink: media.permalink ?? null };
  } catch (error) {
    if (error instanceof InstagramApiRequestError) {
      if (isMediaNotFoundError(error)) {
        try {
          await getInstagramProfile(accessToken, fetcher);
        } catch {
          return {
            state: "unknown",
            reason: "unauthorized",
            message:
              "Instagram hat den Beitrag nicht gefunden, aber auch der Zugang " +
              "ließ sich nicht bestätigen. Bitte prüfen Sie die Verbindung unter " +
              "\u201eIntegrationen\u201c.",
          };
        }
        return { state: "missing" };
      }

      if (error.code === "UNAUTHORIZED") {
        return { state: "unknown", reason: "unauthorized", message: error.message };
      }
      if (error.code === "RATE_LIMITED") {
        return { state: "unknown", reason: "rate-limited", message: error.message };
      }
      if (error.status >= 500) {
        return { state: "unknown", reason: "unavailable", message: error.message };
      }
      return { state: "unknown", reason: "unknown", message: error.message };
    }

    if (error instanceof UserFacingError) {
      // Aus requestJson: Netzwerk oder Zeitüberschreitung.
      return { state: "unknown", reason: "network", message: error.message };
    }

    return {
      state: "unknown",
      reason: "unknown",
      message: "Der Instagram-Status konnte nicht geprüft werden. Bitte versuchen Sie es erneut.",
    };
  }
}

/**
 * Weiche Sperre am Kontolimit: Ist es erreicht, wird gar nicht erst ein
 * Container erzeugt. Lässt sich das Limit nicht lesen, wird trotzdem
 * veröffentlicht – eine veraltete Zahl darf keinen Beitrag verhindern.
 */
async function assertPublishingLimitNotReached(
  accountId: string,
  accessToken: string,
  fetcher: Fetcher,
): Promise<void> {
  try {
    const limit = await getInstagramPublishingLimit(
      accountId,
      accessToken,
      fetcher,
    );
    if (limit && limit.total > 0 && limit.usage >= limit.total) {
      throw new UserFacingError(
        `Instagram hat das aktuelle Veröffentlichungslimit erreicht ` +
          `(${limit.usage} von ${limit.total}). Bitte versuchen Sie es später erneut.`,
        "RATE_LIMITED",
      );
    }
  } catch (error) {
    if (error instanceof UserFacingError && error.code === "RATE_LIMITED") {
      throw error;
    }

    logger.warn("Instagram-Veröffentlichungslimit konnte nicht gelesen werden", {
      accountId,
      error,
    });
  }
}

/**
 * Fuehrt genau einen Publishing-Versuch aus. Die Limit-Abfrage ist nur eine
 * Komfortpruefung: Meta erzwingt das Limit letztlich bei `media_publish`.
 * Nur fuer Metas eindeutigem "Media ID is not available" darf nach erneuter
 * Statuspruefung genau ein kontrollierter `media_publish`-Retry erfolgen.
 */
export async function publishInstagramImage(
  input: {
    accountId: string;
    accessToken: string;
    imageUrl: string;
    caption: string;
    publishedMediaId?: string | null;
    publishedPermalink?: string | null;
  },
  fetcher: Fetcher = fetch,
  options: PublishOptions = {},
): Promise<InstagramPublishResult> {
  const { accountId, accessToken } = input;

  if (input.publishedMediaId) {
    return {
      postId: input.publishedMediaId,
      permalink: input.publishedPermalink ?? null,
      alreadyPublished: true,
    };
  }

  await assertPublishingLimitNotReached(accountId, accessToken, fetcher);

  options.onPhase?.("images");
  const containerId = await createInstagramImageContainer(
    accountId,
    accessToken,
    { imageUrl: input.imageUrl, caption: input.caption },
    fetcher,
  );
  const containerState = await waitForInstagramContainer(
    containerId,
    accessToken,
    fetcher,
    options,
  );

  if (containerState === "PUBLISHED") {
    return { postId: null, permalink: null, alreadyPublished: true };
  }

  options.onPhase?.("publish");
  const published = await publishContainerWithRetry(
    accountId,
    accessToken,
    containerId,
    fetcher,
    options,
  );
  if (published.alreadyPublished) {
    return { postId: null, permalink: null, alreadyPublished: true };
  }

  return persistAndResolve(published.postId, containerId, accessToken, fetcher, options);
}

/**
 * Die Schritte einer Veröffentlichung, wie die Oberfläche sie benennt.
 * Gemeldet wird der tatsächliche Beginn eines Schritts – kein geschätzter
 * Fortschritt.
 */
export type InstagramPublishPhase = "images" | "carousel" | "publish";

type PublishOptions = ContainerPollingOptions & {
  retryDelaysMs?: readonly number[];
  onPublished?: (postId: string) => Promise<void>;
  onPhase?: (phase: InstagramPublishPhase) => void;
};

/**
 * Erster Status-Poll ohne Vorwartezeit.
 *
 * Aus den Production-Timings: Das Anlegen der Kind-Container dauert je
 * Aufruf mehrere Sekunden, weil Meta das Bild dabei selbst lädt. Wenn das
 * letzte Kind angelegt ist, sind die ersten längst fertig – die Sekunde vor
 * dem ersten Poll wartete auf nichts. Die weiteren Abstände bleiben.
 */
function withoutInitialWait(delaysMs: readonly number[]): readonly number[] {
  return delaysMs.length > 0 ? [0, ...delaysMs.slice(1)] : delaysMs;
}

/**
 * `media_publish` mit genau einem kontrollierten Retry – und nur für Metas
 * eindeutiges "Media ID is not available" (9007/2207027). Jeder andere
 * Fehler geht unverändert nach oben; ein blinder zweiter Aufruf könnte
 * einen zweiten Beitrag erzeugen.
 *
 * Für Einzelbild und Carousel dieselbe Routine: Der Container-Typ spielt
 * für den Publish-Schritt keine Rolle.
 */
async function publishContainerWithRetry(
  accountId: string,
  accessToken: string,
  containerId: string,
  fetcher: Fetcher,
  options: PublishOptions,
): Promise<{ postId: string; alreadyPublished: false } | { postId: null; alreadyPublished: true }> {
  try {
    const postId = await publishInstagramImageContainer(accountId, accessToken, containerId, fetcher);
    return { postId, alreadyPublished: false };
  } catch (error) {
    const isMediaNotAvailable =
      error instanceof InstagramApiRequestError &&
      error.apiCode === 9007 &&
      error.errorSubcode === 2207027;

    if (!isMediaNotAvailable) throw error;

    logger.warn("Instagram-Medium war beim Publish noch nicht verfügbar", {
      containerId,
      apiCode: error.apiCode,
      errorSubcode: error.errorSubcode,
    });

    const retryState = await waitForInstagramContainer(containerId, accessToken, fetcher, {
      delaysMs: options.retryDelaysMs ?? INSTAGRAM_PUBLISH_RETRY_POLL_DELAYS_MS,
      sleep: options.sleep,
      mediaLabel: options.mediaLabel,
    });

    if (retryState === "PUBLISHED") {
      return { postId: null, alreadyPublished: true };
    }

    // Genau ein Retry fuer den eindeutig abgelehnten 9007/2207027-Aufruf.
    const postId = await publishInstagramImageContainer(accountId, accessToken, containerId, fetcher);
    return { postId, alreadyPublished: false };
  }
}

async function persistAndResolve(
  postId: string,
  containerId: string,
  accessToken: string,
  fetcher: Fetcher,
  options: PublishOptions,
): Promise<InstagramPublishResult> {
  if (options.onPublished) {
    try {
      await options.onPublished(postId);
    } catch (error) {
      logger.error("Instagram Media ID konnte nicht persistiert werden", {
        containerId,
        postId,
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      throw new InstagramPublishOutcomeUnknownError();
    }
  }

  let permalink: string | null = null;
  try {
    permalink = await getInstagramMediaPermalink(postId, accessToken, fetcher);
  } catch {
    logger.warn("Instagram-Permalink konnte nicht geladen werden", { postId });
  }

  return { postId, permalink, alreadyPublished: false };
}

/**
 * Carousel: mehrere Bilder als ein Beitrag.
 *
 * Ablauf laut Meta: je Bild ein Container mit `is_carousel_item=true` (ohne
 * Caption), jeder bis FINISHED abwarten; dann der Carousel-Container mit
 * `media_type=CAROUSEL`, den Kind-IDs in Reihenfolge und der Caption; auch
 * den abwarten; erst dann genau ein `media_publish`.
 *
 * Scheitert ein Kind, wird abgebrochen – kein halbes Carousel. Die Meldung
 * nennt die Position ("Bild 3 von 5"). Die Kinder entstehen in einem Zug;
 * ein Retry über `media_publish` hinaus erzeugt neue Container, nie einen
 * zweiten Beitrag, weil der Aufrufer die Media ID sofort persistiert und
 * beim nächsten Aufruf `publishedMediaId` mitgibt.
 */
export async function publishInstagramCarousel(
  input: {
    accountId: string;
    accessToken: string;
    imageUrls: readonly string[];
    caption: string;
    publishedMediaId?: string | null;
    publishedPermalink?: string | null;
  },
  fetcher: Fetcher = fetch,
  options: PublishOptions = {},
): Promise<InstagramPublishResult> {
  const { accountId, accessToken, imageUrls } = input;

  if (input.publishedMediaId) {
    return {
      postId: input.publishedMediaId,
      permalink: input.publishedPermalink ?? null,
      alreadyPublished: true,
    };
  }

  if (
    imageUrls.length < INSTAGRAM_CAROUSEL_MIN_ITEMS ||
    imageUrls.length > INSTAGRAM_CAROUSEL_MAX_ITEMS
  ) {
    throw new UserFacingError(
      `Ein Instagram-Carousel braucht ${INSTAGRAM_CAROUSEL_MIN_ITEMS} bis ` +
        `${INSTAGRAM_CAROUSEL_MAX_ITEMS} Bilder; ausgewählt sind ${imageUrls.length}.`,
      "VALIDATION",
    );
  }

  const startedAt = performance.now();
  const durationsMs: Record<string, number> = {};
  let outcome = "failed";
  async function measure<T>(phase: string, operation: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await operation();
    } finally {
      durationsMs[phase] = Math.round(performance.now() - start);
    }
  }

  try {
    await measure("quotaCheck", () =>
      assertPublishingLimitNotReached(accountId, accessToken, fetcher),
    );
    const pollDelaysMs = withoutInitialWait(
      options.delaysMs ?? INSTAGRAM_CONTAINER_POLL_DELAYS_MS,
    );

    options.onPhase?.("images");
    const childrenIds = await measure("childCreation", () =>
      mapChildren(imageUrls, async (imageUrl, index) => {
        try {
          return await createInstagramCarouselItemContainer(
            accountId, accessToken, { imageUrl }, fetcher,
          );
        } catch (error) {
          // Ein Bildproblem beim Anlegen heißt wie beim Polling beim Namen:
          // "Bild 3 von 5" – Zugangs- und Limitfehler bleiben unverändert.
          if (
            error instanceof InstagramApiRequestError &&
            (error.apiCode === 9004 || error.apiCode === 2207052)
          ) {
            throw new UserFacingError(
              `Instagram konnte Bild ${index + 1} von ${imageUrls.length} nicht laden. ` +
                "Es muss unter einer öffentlich erreichbaren Adresse liegen, im Format " +
                "JPEG vorliegen und darf höchstens 8 MB groß sein.",
              "SERVICE_UNAVAILABLE",
            );
          }
          throw error;
        }
      }),
    );
    await measure("childPolling", () =>
      waitForInstagramChildren(childrenIds, accessToken, fetcher, {
        ...options,
        delaysMs: pollDelaysMs,
      }),
    );

    options.onPhase?.("carousel");
    const carouselId = await measure("parentCreation", () =>
      createInstagramCarouselContainer(
        accountId, accessToken, { childrenIds, caption: input.caption }, fetcher,
      ),
    );
    const carouselState = await measure("parentPolling", () =>
      waitForInstagramContainer(carouselId, accessToken, fetcher, {
        ...options,
        delaysMs: pollDelaysMs,
        mediaLabel: "das Carousel",
      }),
    );
    if (carouselState === "PUBLISHED") {
      outcome = "alreadyPublished";
      return { postId: null, permalink: null, alreadyPublished: true };
    }

    options.onPhase?.("publish");
    const published = await measure("mediaPublish", () =>
      publishContainerWithRetry(accountId, accessToken, carouselId, fetcher, {
        ...options,
        mediaLabel: "das Carousel",
      }),
    );
    if (published.alreadyPublished) {
      outcome = "alreadyPublished";
      return { postId: null, permalink: null, alreadyPublished: true };
    }
    const result = await persistAndResolve(published.postId, carouselId, accessToken, fetcher, options);
    outcome = "published";
    return result;
  } finally {
    logger.info("Instagram carousel timings", {
      imageCount: imageUrls.length,
      concurrency: INSTAGRAM_CHILD_CONCURRENCY,
      durationsMs,
      totalMs: Math.round(performance.now() - startedAt),
      outcome,
    });
  }
}
