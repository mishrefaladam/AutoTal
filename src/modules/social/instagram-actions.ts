"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  buildInstagramAuthUrl,
  disconnectInstagram,
} from "@/integrations/instagram";
import { logger } from "@/lib/logger";
import { type ActionResult, ok, toActionResult } from "@/lib/result";
import { requireAdminForAction } from "@/modules/admin/auth";

import { INSTAGRAM_STATE_COOKIE } from "./instagram-constants";

/**
 * Verbinden und Trennen des Instagram-Kontos (US-22).
 *
 * Der OAuth-Ablauf wird mit einem `state`-Wert gegen CSRF abgesichert: Der
 * Wert wird als HttpOnly-Cookie gesetzt und beim Rücksprung verglichen. Ohne
 * diese Prüfung könnte jemand einem angemeldeten Admin einen präparierten
 * Rücksprung unterschieben und ein fremdes Konto verbinden.
 */

export async function startInstagramConnect(): Promise<
  ActionResult<{ authUrl: string }>
> {
  try {
    await requireAdminForAction();

    const state = randomBytes(32).toString("base64url");

    const cookieStore = await cookies();
    cookieStore.set(INSTAGRAM_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });

    return ok({ authUrl: buildInstagramAuthUrl(state) });
  } catch (error) {
    logger.error("Instagram-Verbindung konnte nicht gestartet werden", { error });
    return toActionResult(error);
  }
}

export async function disconnectInstagramAction(): Promise<
  ActionResult<{ message: string }>
> {
  try {
    const admin = await requireAdminForAction();

    await disconnectInstagram();

    logger.info("Instagram-Verbindung getrennt", { userId: admin.id });
    revalidatePath("/admin/integrationen");
    revalidatePath("/admin/social-media");

    return ok({
      message:
        "Die Verbindung wurde getrennt und das gespeicherte Zugangstoken gelöscht.",
    });
  } catch (error) {
    return toActionResult(error);
  }
}
