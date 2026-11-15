# Feature: Golf demo team (generated)

<!-- schema-drift-absent: golf_demo_ledger, golf_demo_begin, golf_demo_apply, golf_demo_remove, golf_demo_finish_rounds, golf_demo_tables, golf_demo_write_guard, golf_demo_generator, golf_demo_read_only, golf_demo_refresh_v1, golf_demo_writer, golf_lifecycle_write -->
<!-- The last five are a migration file name, an error DETAIL, a flag and two settings, not database objects. -->

The shared demo team (Demo University Golf, `DEMO_TEAM_ID` in
`src/lib/demo/config.ts`) is fully synthetic and regenerated around today.
Launch readiness DD-01 to DD-18 (15 Nov 2026), except DD-14.

## Status

- Code: on `main` once PR #2540 lands.
- Database: migrations `20261115210000_golf_demo_generator.sql`,
  `20261115210100_golf_demo_write_guard.sql` and
  `20261115210200_golf_messages_events_is_test.sql` are **held**
  (`supabase/migrations/HELD.md`). The functions named in this doc are not
  live until the owner applies them; `src/lib/types/database.ts` does not list
  them.
- Daily cron: flag `golf_demo_refresh_v1`, off everywhere.

## How it works

1. **Generate** (`src/lib/golf/demo/generate.ts`, pure): `generateDemoTeam`
   takes today in the team's zone and a seed, and returns every row for 26
   tables (`DEMO_TABLES`, insert order). The roster and stories are in
   `story.ts`; the season calendar (fall qualifiers and tournaments, spring
   opener, breaks) in `calendar.ts`; hole-by-hole play with shots in
   `round-sim.ts`. Ids are stable (`stableUuid`), and each round draws from its
   own random stream, so a past round is identical on every later day (DD-04).
   No real name appears anywhere.
2. **Plan** (`writer.ts`, `planDemoWrite`): diffs the dataset against the
   ledger (row key to a 24-hex hash of the row). New and changed rows are sent,
   and rows the generator wrote that are no longer generated are removed. Each
   generated round is "finished" once its holes and shots are in, via its own
   ledger entry (`golf_rounds#finished`).
3. **Apply** (`applyDemoWrite`): parents first, children before their parents
   on removal. It goes through four service-role functions of migration
   20261115210000: `golf_demo_begin`, `golf_demo_apply`, `golf_demo_remove`
   and `golf_demo_finish_rounds`. They refuse any team but the demo team and
   any table outside the 26. They **skip a row that exists but is not in the
   ledger**, so the generator never overwrites or deletes a row it did not
   write. Finishing recomputes round totals from holes and refreshes player
   stats.
4. **Check** (`coverage.ts`, `snapshot.ts`): `readDemoSnapshot` reads every
   demo-team row in the covered tables, whoever wrote it, and
   `checkDemoCoverage` checks it the way a prospect sees it. The checks cover
   the roster, test rows, future or abandoned rounds, headers equal to hole
   sums, one shot per stroke, no shared scorecards, and believable putting
   (32 to 34 per 18, three-putts 8 to 11%). They also cover seed tags,
   weekdays in copy, upcoming events, tournaments and lineups, qualifiers
   closed and scored, practice plans, attendance, and the season row
   (DATA-04).

`refresh.ts` (`refreshDemoTeam`) runs all four steps: it loads the team zone,
the coach to write as (`DEMO_COACH_EMAIL` if that coach is on staff, else the
primary coach) and the team channel. A dry run calls only `golf_demo_begin`
with pruning off.

## Entry points

| What | Where | Writes |
|---|---|---|
| Daily cron, 09:35 UTC | `src/app/api/cron/golf-demo-refresh/route.ts` | only with `golf_demo_refresh_v1` on; 500 when the check fails |
| By hand | `npm run golf:demo:refresh` (dry run), `-- --apply`, `-- --full`, `-- --no-db --today YYYY-MM-DD` | with `--apply` |
| Read-only check | `npm run golf:demo:verify` | never |
| Owner SQL | `scripts/sql/strip-demo-seed-tags.sql`, `scripts/sql/golf-demo-cleanup.sql` (part A any time, part B after the first run) | when the owner flips ROLLBACK to COMMIT |

Both scripts refuse a production Supabase URL unless `HELM_ALLOW_PRODUCTION=1`.

## The write guard (DD-13)

`20261115210100` puts a trigger, `golf_demo_write_guard`, on 18 tables. It
refuses any write by a signed-in user (`auth.uid()` set) to a row whose team,
found directly or through its parent, is the demo team. It raises 42501 with
DETAIL `golf_demo_read_only`. Writes with no signed-in user (service role,
crons, SQL) pass, and so do writes carrying the generator's mark
(`helm.golf_demo_writer = 'generator'`). The app's message, poll, attachment
and practice-plan actions are `demoSafe` and show "This is a shared demo team:
changes are not saved." `isGolfDemoRefusal` (`src/lib/demo/golf-read-only.ts`)
recognises both the app and the database refusal.

## Traps

- The round lifecycle guard keeps completed rounds. Under the owner mark
  (`helm.golf_lifecycle_write = 'atomic'`) it returns NEW, which a DELETE does
  not have, so **the delete is skipped without an error**. `golf_demo_remove`
  and the cleanup SQL set the round to `abandoned` under the mark, clear the
  mark, then delete.
- `DEMO_TABLES` and the SQL array in `golf_demo_tables()` must match;
  `writer.test.ts` checks it.
- After changing a function in the migration, regenerate the declarative
  mirror (`supabase/schemas/functions/*.sql`, `triggers/golf.sql`) from a
  dump of a local database with the migration applied.
- The QA environment is `staging-qa` in `momentic.config.yaml`. The QA
  accounts belong on a QA team, never on the demo team.

## Tests

- `src/lib/golf/demo/__tests__/`: generator, coverage, writer (fake port,
  day by day, foreign rows), refresh (fake Supabase client).
- `src/app/api/cron/golf-demo-refresh/__tests__/route.test.ts`.
- pgTAP: `supabase/tests/rls/golf_demo_generator.sql`,
  `supabase/tests/rls/golf_demo_write_guard.sql`.
