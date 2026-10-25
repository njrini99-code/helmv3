# Live rounds (P-6)

Build plan P-6 (handoff 4.34.6) with the 2026-10-25 changelog and recheck applied. P-6 has no page of its own: its words are
CH-16600 to CH-16677 (CH-16601 is the tournaments page's, P-6's "See all" is CH-16606; minus CH-16650 to CH-16653, P-5's) and CH-16680 to CH-16685 in `docs/clubhouse/catalog/tournaments.md`.

| File | What |
| --- | --- |
| `WIRING.md` | Routes, loaders, shared reads, push, sharing, and where each surface mounts |
| `CHANGES.md` | The slice-by-slice change notes for the live view, sharing and the held migrations |
| `HANDOFFS.md` | The Lock Screen / Live Activity contract, what 4.33 must expose, what is not done |
| `../held/data/live-rounds.md`, `live-rounds-realtime.md` | The held migrations 1 to 3 and how to apply and verify them |

## Verified here

- tsgo clean; the 11 guard suites, the full `src/clubhouse` suite (450 files) and `round-live.test.ts` pass.
- The three migrations ran on a scratch local Postgres: idempotent re-run, every VERIFY line passes with the migration
  and fails without it, and the declarative mirror matches it.

## Not verified

- pgTAP (`supabase/tests/rls/golf_round_live.sql`) on a real Supabase stack, squawk, `supabase db diff`, plpgsql_check and
  real Realtime delivery.
- Safari, the iOS shell and a device (no browser was run); no screenshots.
- `npm run build`, `docs:check` and the full repo suite.
