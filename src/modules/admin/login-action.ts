"use server";

import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  RATE_LIMITS,
  checkRateLimitForRequest,
  rateLimitMessage,
} from "@/lib/rate-limit";
import { type ActionResult, fail, ok } from "@/lib/result";

/**
 * Anmeldung im Adminbereich (US-14).
 *
 * Rate-limitiert, damit Passwörter nicht durchprobiert werden können. Die
 * Fehlermeldung ist bewusst unspezifisch – sie verrät nicht, ob die
 * E-Mail-Adresse existiert.
 */

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Bitte geben Sie Ihre E-Mail-Adresse an.")
    .email("Bitte geben Sie eine gültige E-Mail-Adresse an."),
  password: z.string().min(1, "Bitte geben Sie Ihr Passwort ein."),
  callbackUrl: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

const INVALID_CREDENTIALS =
  "E-Mail-Adresse oder Passwort ist nicht korrekt.";

/**
 * Verhindert Open Redirects: Nach der Anmeldung wird ausschließlich auf
 * eigene Admin-Pfade weitergeleitet, niemals auf eine fremde Domain.
 *
 * Die Middleware von Auth.js hängt den callbackUrl als *absolute* URL an
 * ("http://host/admin/unternehmen"). Deshalb wird auch diese Form akzeptiert,
 * aber nur der Pfad übernommen – der Host aus der URL wird verworfen, sonst
 * wäre genau hier die Weiterleitung auf eine fremde Domain möglich.
 */
function safeCallbackUrl(candidate: string | undefined): string {
  const fallback = "/admin/dashboard";

  if (!candidate) return fallback;

  let path = candidate;

  if (/^https?:\/\//i.test(candidate)) {
    try {
      path = new URL(candidate).pathname;
    } catch {
      return fallback;
    }
  }

  // "//example.com" wäre eine protokollrelative URL auf eine fremde Domain.
  if (path.startsWith("//")) return fallback;

  if (path.startsWith("/admin") && !path.startsWith("/admin/login")) {
    return path;
  }

  return fallback;
}

export async function loginAction(
  raw: unknown,
): Promise<ActionResult<{ redirectTo: string }>> {
  const limit = await checkRateLimitForRequest(RATE_LIMITS.login);

  if (!limit.allowed) {
    logger.warn("Anmeldung durch Rate Limit abgewiesen");
    return fail(rateLimitMessage(limit), { code: "RATE_LIMITED" });
  }

  const parsed = loginSchema.safeParse(raw);

  if (!parsed.success) {
    return fail("Bitte prüfen Sie Ihre Eingaben.", { code: "VALIDATION" });
  }

  const { email, password, callbackUrl } = parsed.data;

  try {
    // redirect: false – die Weiterleitung übernimmt der Client, damit ein
    // Fehlschlag als ActionResult zurückkommt statt als Redirect-Exception.
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(INVALID_CREDENTIALS, { code: "UNAUTHORIZED" });
    }

    logger.error("Unerwarteter Fehler bei der Anmeldung", { error });
    return fail(
      "Die Anmeldung ist gerade nicht möglich. Bitte versuchen Sie es erneut.",
      { code: "SERVICE_UNAVAILABLE" },
    );
  }

  return ok({ redirectTo: safeCallbackUrl(callbackUrl) });
}
