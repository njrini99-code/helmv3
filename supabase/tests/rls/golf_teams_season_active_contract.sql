BEGIN;

SELECT plan(3);

SELECT has_column(
  'public',
  'golf_teams',
  'season_active',
  'golf_teams exposes the season_active contract used by CoachHelm and admin reads'
);

SELECT col_not_null(
  'public',
  'golf_teams',
  'season_active',
  'season_active is required so an absent value never ambiguously disables a team'
);

SELECT col_default_is(
  'public',
  'golf_teams',
  'season_active',
  'true',
  'new teams default to an active season'
);

SELECT * FROM finish();

ROLLBACK;
