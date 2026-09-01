/**
 * Einheitliches Ergebnis-Objekt für Server Actions und Service-Aufrufe.
 *
 * Server Actions geben *niemals* rohe Exceptions an den Client. Stattdessen
 * liefern sie ein `ActionResult`, das die UI direkt anzeigen kann (US-29).
 * Technische Details bleiben im Serverlog.
 */

export type FieldErrors = Record<string, string[]>;

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      /** Für den Nutzer verständliche Meldung – wird 1:1 angezeigt. */
      error: string;
      code?: ErrorCode;
      /** Feldbezogene Validierungsfehler für react-hook-form. */
      fieldErrors?: FieldErrors;
    };

export type ErrorCode =
  | "VALIDATION"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "SERVICE_UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "CONFLICT"
  | "UNKNOWN";

export function ok(): ActionResult<void>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(
  error: string,
  options: { code?: ErrorCode; fieldErrors?: FieldErrors } = {},
): ActionResult<never> {
  return { ok: false, error, code: options.code ?? "UNKNOWN", ...options };
}

/**
 * Fehler, dessen Nachricht bewusst für Endnutzer formuliert ist und daher
 * nach außen gereicht werden darf.
 */
export class UserFacingError extends Error {
  readonly code: ErrorCode;

  constructor(message: string, code: ErrorCode = "UNKNOWN") {
    super(message);
    this.name = "UserFacingError";
    this.code = code;
  }
}

export const GENERIC_ERROR_MESSAGE =
  "Da ist leider etwas schiefgelaufen. Bitte versuchen Sie es in einem Moment " +
  "erneut oder rufen Sie uns an.";

/**
 * Wandelt einen beliebigen Fehler in ein anzeigbares Ergebnis um.
 * Unbekannte Fehler werden generisch maskiert, damit keine internen Details
 * (Query-Fragmente, Pfade, Keys) nach außen dringen.
 */
export function toActionResult(error: unknown): ActionResult<never> {
  if (error instanceof UserFacingError) {
    return fail(error.message, { code: error.code });
  }

  return fail(GENERIC_ERROR_MESSAGE, { code: "UNKNOWN" });
}
