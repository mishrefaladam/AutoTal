import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import {
  exchangeInstagramCode,
  saveInstagramCredential,
} from "@/integrations/instagram";
import { safeCompare } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { UserFacingError } from "@/lib/result";
import { getAdminSession } from "@/modules/admin/auth";
import { INSTAGRAM_STATE_COOKIE } from "@/modules/social/instagram-constants";

/**
 * OAuth-Rücksprung von Meta (US-22).
 *
 * Prüft in dieser Reihenfolge:
 *   1. Ist überhaupt ein Admin angemeldet? Sonst könnte ein Unbeteiligter
 *      ein Konto verbinden.
 *   2. Stimmt der `state`-Wert mit dem gesetzten Cookie überein? (CSRF)
 *   3. Erst dann wird der Code gegen ein Token getauscht.
 *
 * Das Token wird verschlüsselt gespeichert und niemals an den Browser
 * ausgeliefert.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectWithMessage(
  request: NextRequest,
  params: Record<string, string>,
): NextResponse {
  const url = new URL("/admin/integrationen", request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.redirect(
      new URL("/admin/login", request.nextUrl.origin),
    );
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(INSTAGRAM_STATE_COOKIE)?.value;
  // Der state-Wert ist verbraucht, sobald er geprüft wurde.
  cookieStore.delete(INSTAGRAM_STATE_COOKIE);

  const searchParams = request.nextUrl.searchParams;

  // Meta meldet einen Abbruch durch den Nutzer über error-Parameter.
  const metaError = searchParams.get("error");
  if (metaError) {
    logger.warn("Instagram-Verbindung von Meta abgelehnt", {
      reason: searchParams.get("error_reason"),
    });

    return redirectWithMessage(request, {
      ig_error:
        "Die Verbindung wurde abgebrochen. Bitte versuchen Sie es erneut und " +
        "bestätigen Sie die angefragten Berechtigungen.",
    });
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state || !expectedState || !safeCompare(state, expectedState)) {
    logger.warn("Instagram-Rücksprung mit ungültigem state abgewiesen");

    return redirectWithMessage(request, {
      ig_error:
        "Der Rücksprung von Instagram war ungültig oder ist abgelaufen. " +
        "Bitte starten Sie die Verbindung erneut.",
    });
  }

  try {
    const credential = await exchangeInstagramCode(code);
    await saveInstagramCredential(credential);

    logger.info("Instagram-Konto verbunden", {
      userId: session.id,
      accountId: credential.accountId,
    });

    return redirectWithMessage(request, {
      ig_success: credential.username
        ? `Instagram-Konto @${credential.username} wurde verbunden.`
        : "Das Instagram-Konto wurde verbunden.",
    });
  } catch (error) {
    const message =
      error instanceof UserFacingError
        ? error.message
        : "Die Verbindung konnte nicht hergestellt werden. Bitte versuchen Sie es erneut.";

    logger.error("Instagram-Verbindung fehlgeschlagen", { error });

    return redirectWithMessage(request, { ig_error: message });
  }
}
