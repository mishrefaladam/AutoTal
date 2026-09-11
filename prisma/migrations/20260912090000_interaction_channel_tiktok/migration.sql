-- ---------------------------------------------------------------------------
-- TikTok als eigener Interaktionskanal (additiv)
-- ---------------------------------------------------------------------------
--
-- Nur ein zusätzlicher Wert im Aufzählungstyp. Bestehende Zeilen der
-- Zählertabelle bleiben unverändert gültig, es wird nichts umgeschrieben und
-- nichts gelöscht.
--
-- IF NOT EXISTS, damit ein erneuter Lauf nicht scheitert. Der Wert wird in
-- dieser Migration nicht verwendet – in PostgreSQL darf ein frisch angelegter
-- Aufzählungswert innerhalb derselben Transaktion noch nicht benutzt werden.

ALTER TYPE "InteractionChannel" ADD VALUE IF NOT EXISTS 'TIKTOK';
