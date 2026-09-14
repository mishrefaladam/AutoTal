import type { InstagramPublishPhase } from "@/integrations/instagram/protocol";

/**
 * Rückmeldungen während der Veröffentlichung.
 *
 * Nur serverseitig belegbar: Die Streaming-Route reicht den Beginn jedes
 * Schritts an den Browser durch. Ein direkter Aufruf der Server Action aus
 * dem Client kann keine Funktion übergeben und läuft ohne Rückmeldung.
 *
 * Eigene Datei, weil eine "use server"-Datei nur Funktionen exportieren darf.
 */
export type PublishHooks = {
  onPhase?: (phase: InstagramPublishPhase) => void;
};
