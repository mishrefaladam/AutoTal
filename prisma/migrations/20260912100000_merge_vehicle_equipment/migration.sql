BEGIN;

-- Transfer every nonblank legacy value before clearing the deprecated list.
-- Keep the first spelling and original order, comparing case-insensitively.
UPDATE "Vehicle" AS vehicle
SET "features" = ARRAY(
  SELECT value
  FROM (
    SELECT DISTINCT ON (lower(btrim(raw, E' \t\n\r')))
      btrim(raw, E' \t\n\r') AS value, position
    FROM unnest(vehicle."features" || vehicle."highlights")
      WITH ORDINALITY AS entry(raw, position)
    WHERE btrim(raw, E' \t\n\r') <> ''
    ORDER BY lower(btrim(raw, E' \t\n\r')), position
  ) AS merged
  ORDER BY position
), "highlights" = ARRAY[]::text[];

COMMIT;
