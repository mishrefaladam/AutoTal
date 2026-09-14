-- ---------------------------------------------------------------------------
-- Auf Instagram gelöschte Beiträge erkennen (additiv)
-- ---------------------------------------------------------------------------
--
-- Ein neuer Statuswert und zwei nullable/leer vorbelegte Spalten. Bestehende
-- Zeilen bleiben unverändert gültig; nichts wird umgeschrieben, nichts
-- gelöscht. Der neue Wert wird in dieser Migration nicht verwendet – in
-- PostgreSQL darf ein frisch angelegter Aufzählungswert innerhalb derselben
-- Transaktion noch nicht benutzt werden.
--
-- externalCheckedAt: Zeitpunkt des letzten Abgleichs mit Instagram, damit
-- das Öffnen der Social-Media-Seite nicht bei jedem Aufruf für jeden
-- veröffentlichten Beitrag eine Anfrage an Meta erzeugt.
--
-- previousExternalPostIds: Media-IDs, die auf Instagram gelöscht und danach
-- erneut veröffentlicht wurden. externalPostId bleibt der Idempotenz-
-- Schlüssel des aktuellen Beitrags; die alten IDs gehen nicht verloren.

ALTER TYPE "SocialDraftStatus" ADD VALUE IF NOT EXISTS 'DELETED_EXTERNALLY';

ALTER TABLE "SocialDraft"
  ADD COLUMN IF NOT EXISTS "externalCheckedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "previousExternalPostIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
