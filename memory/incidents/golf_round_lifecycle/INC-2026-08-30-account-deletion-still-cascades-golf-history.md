# INC-2026-08-30 — the golf-history cascade fix is committed but not applied

- Feature: `golf_round_lifecycle`
- Status: OPEN — repair exists in the repository and is NOT live in production
- Risk: R4 — irreversible destruction of user data on a single settings click;
  the fix is a schema change to a shared production database and needs
  explicit owner authorization to apply
- First seen: 2026-08-30, while classifying the permanently-red
  `Supabase Preview` check (that check was telling the truth)

<!-- schema-drift-absent: golf_player_anonymize_on_unlink, golf_players_user_id_fkey, baseball_timeline_acks, baseball_event_telemetry -->

<!-- The names above are declared to docs:schema-drift as documented BECAUSE
     they are absent. golf_player_anonymize_on_unlink and the SET NULL form of
     golf_players_user_id_fkey are the missing repair. baseball_timeline_acks
     and baseball_event_telemetry are named in the "what was NOT checked"
     section as two guesses this session got WRONG — the real objects are
     baseball_timeline_event_acks and (for the telemetry migration) columns on
     baseball_pitch_events. Recording a wrong guess is the point of that
     section; deleting the names would delete the correction. -->

## What is wrong

`supabase/migrations/20260819200000_preserve_golf_history_on_account_deletion.sql`
is committed on `main`. Its own header records the owner decision of 2026-08-18
— *"There should be no deletion of golf shot history"* — and measured then that
**93 of 94 players** pass the delete route's pre-flight and reach the cascade.
That ratio is 2026-08-18's measurement and has NOT been re-measured here.

It is not applied. Verified read-only against production
(`qmnssrrolpinvwjjnufo`) on 2026-08-30:

| What the migration does | Production, today |
| --- | --- |
| makes `golf_players.user_id` nullable | still `NOT NULL` |
| FK to `users` becomes `ON DELETE SET NULL` | still `ON DELETE CASCADE` |
| adds `golf_player_anonymize_on_unlink()` | no function matching `%anonymize%` exists |

```text
golf_players_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```

The route was then read as it stands today rather than trusted from that
migration's header — eleven days and many merges separate the two, and a
stopgap block could have landed in between. It did not:

- `src/app/api/account/delete/route.ts:150` — `USER_BLOCKING_TABLES` is still
  exactly `golf_goals.created_by_user_id`,
  `golf_qualifier_selections.selected_by_user_id` and
  `golf_travel_expenses.created_by`. Nothing blocks on `golf_rounds` or
  `golf_shots`.
- `src/app/api/account/delete/route.ts:308` — the route still ends in
  `admin.from('users').delete().eq('id', user.id)`, a service-role delete.
- The file names `golf_rounds`, `golf_shots` and `golf_players` **nowhere**, so
  no preservation or detach step was added on the application side either.

So the cascade below that delete still destroys the player's `golf_rounds`,
`golf_holes`, `golf_shots`, `golf_round_reviews` and `golf_round_stats_cache`.
Irreversibly, with no export and no grace period.

## Why nobody noticed

The migration's own header describes a version-stamp collision it was restamped
to avoid, and ends: *"A P0 that reports itself as applied is worse than one that
reports itself as missing."* That is what happened, by a different route —
`supabase_migrations.schema_migrations` records **846** versions against **337**
tracked migration files, so the ledger and the directory have long since stopped
being comparable by eye, and the one automated check that compares them
(`Supabase Preview`) has been red on every `main` commit for so long that it
reads as background noise.

## What was checked, and what was not

Checked: the three objects above, individually, against the live catalog rather
than against the migration file — the G8 rule. And the delete route as it is
today, rather than as its migration's header described it in August, which is
the same rule pointed at code instead of schema.

NOT checked: whether every other unapplied-looking migration is genuinely
unapplied. Several files that look local-only are deliberately so, and say so in
their own headers — the `reconcile_*` family exists to bring a **reset local**
schema in line with production, not the other way round. Two of this session's
first guesses were wrong for exactly that reason (`baseball_event_telemetry` is
a migration name, not a table; the table is `baseball_timeline_event_acks`, not
`baseball_timeline_acks`). A full classification of the 337 files is real work
and is registered as `MIGRATIONS_REPO_PRODUCTION_LEDGER_DIVERGENCE`, not
guessed at here.

## What closes this

The migration is applied to production under explicit owner authorization, and
the three rows in the table above are re-verified against the live catalog.

Not attempted from this session: `supabase db push` and `migration up` are
denied by `permissions.deny`, deliberately, and a production schema change is
not something an agent should authorize for itself.
