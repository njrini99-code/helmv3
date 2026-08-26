BEGIN;

SELECT plan(1);

SELECT is(
  (
    SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)::text[]
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'ncaa_division'
  ),
  ARRAY['D2', 'D3', 'D1', 'NAIA', 'JUCO', 'JUCO_D1', 'JUCO_D2', 'JUCO_D3', 'CCCAA']::text[],
  'ncaa_division preserves every production-supported value in its canonical order'
);

SELECT * FROM finish();

ROLLBACK;
