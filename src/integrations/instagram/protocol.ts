import "server-only";

import { logger } from "@/lib/logger";
import { UserFacingError, type ErrorCode } from "@/lib/result";

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
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

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

    if (container.statusCode === "ERROR") {
      throw new UserFacingError(
        "Instagram konnte das Bild nicht verarbeiten. Bitte prüfen Sie das " +
          "Fahrzeugbild und versuchen Sie es erneut.",
        "SERVICE_UNAVAILABLE",
      );
    }

    if (container.statusCode === "EXPIRED") {
      throw new UserFacingError(
        "Der Instagram-Mediencontainer ist abgelaufen. Bitte versuchen Sie " +
          "die Veröffentlichung erneut; dabei wird ein neuer Container erstellt.",
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
    "Instagram verarbeitet das Bild noch. Bitte versuchen Sie die " +
      "Veröffentlichung in einem Moment erneut.",
    "SERVICE_UNAVAILABLE",
  );
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
  options: ContainerPollingOptions & {
    retryDelaysMs?: readonly number[];
    onPublished?: (postId: string) => Promise<void>;
  } = {},
): Promise<InstagramPublishResult> {
  const { accountId, accessToken } = input;

  if (input.publishedMediaId) {
    return {
      postId: input.publishedMediaId,
      permalink: input.publishedPermalink ?? null,
      alreadyPublished: true,
    };
  }

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

  let postId: string;
  try {
    postId = await publishInstagramImageContainer(
      accountId,
      accessToken,
      containerId,
      fetcher,
    );
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

    const retryState = await waitForInstagramContainer(
      containerId,
      accessToken,
      fetcher,
      {
        delaysMs:
          options.retryDelaysMs ?? INSTAGRAM_PUBLISH_RETRY_POLL_DELAYS_MS,
        sleep: options.sleep,
      },
    );

    if (retryState === "PUBLISHED") {
      return { postId: null, permalink: null, alreadyPublished: true };
    }

    // Genau ein Retry fuer den eindeutig abgelehnten 9007/2207027-Aufruf.
    postId = await publishInstagramImageContainer(
      accountId,
      accessToken,
      containerId,
      fetcher,
    );
  }

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
    permalink = await getInstagramMediaPermalink(
      postId,
      accessToken,
      fetcher,
    );
  } catch {
    logger.warn("Instagram-Permalink konnte nicht geladen werden", { postId });
  }

  return { postId, permalink, alreadyPublished: false };
}
