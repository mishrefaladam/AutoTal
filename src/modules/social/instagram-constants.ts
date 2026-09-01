/**
 * Konstanten der Instagram-Anbindung.
 *
 * Bewusst eine eigene Datei: Ein Modul mit `"use server"` darf ausschließlich
 * async Funktionen exportieren. Eine Konstante dort würde das gesamte Modul
 * ungültig machen.
 */

/** Cookie mit dem OAuth-`state`-Wert zur CSRF-Absicherung. */
export const INSTAGRAM_STATE_COOKIE = "ig_oauth_state";
