# BaseballHelm seeded production smoke (#382)

`e2e/baseball-stats-smoke.spec.ts` is a seeded Playwright smoke test for
BaseballHelm's stats surfaces (Command Center, Stats Center, Box Score,
Upload, and the player Today / My Stats pages). It exists to catch a
specific class of regression that unit tests and unseeded E2E specs both
miss: **a read model silently drifting from the data it's supposed to
read** (wrong table, wrong team scope, wrong season window, a broken
join) — which shows up in production as a stats surface quietly
rendering its empty state even though real data exists.

## Two tiers

1. **Anonymous route-wiring (always on).** No env gating, no
   credentials. Asserts that the auth-walled dashboard routes bounce an
   anonymous visitor to login (not a 500), and that the one deliberate
   exception — `/baseball/player/today`, which renders a "teamless"
   terminal instead of redirecting (see `PlayerTodayTeamless`) — shows
   that honest terminal and not real player data. This tier runs in
   every `e2e` job invocation with zero setup.

2. **Seeded data assertions**, gated by `PLAYWRIGHT_BASEBALL_SEEDED`.
   Logs in as the seeded coach and player accounts from
   `scripts/seed-rini-baseball-demo.ts` and asserts manifest-backed
   non-empty data renders. Every assertion in this tier pairs a
   positive "real data is visible" check with an explicit "the
   surface's own empty-state text is ABSENT" check — the empty-state
   absence check is what turns "no data yet" (often legitimate) into
   "empty state shown while the seed claims data" (always a bug) for
   this spec specifically.

If `PLAYWRIGHT_BASEBALL_SEEDED` is unset (the default for the shared
`e2e` job and for local `npm run test:e2e` runs without extra setup),
tier 2 self-skips via `test.skip()` — it never fails for lack of
fixture data, mirroring the existing pattern in
`e2e/baseball-phase1.spec.ts`.

## Required environment variables

| Variable | Purpose | Example (Rini demo) |
|---|---|---|
| `PLAYWRIGHT_BASEBALL_SEEDED` | Set to `1` or `true` to un-skip tier 2 | `1` |
| `E2E_BASEBALL_COACH_EMAIL` | Seeded college coach login | `njrini99@gmail.com` |
| `E2E_BASEBALL_COACH_PASSWORD` | That coach's password | — |
| `E2E_BASEBALL_PLAYER_EMAIL` | Seeded player login (must be the stat-bearing player — `Marcus Rodriguez` in the Rini demo) | `rinin376@gmail.com` |
| `E2E_BASEBALL_PLAYER_PASSWORD` | That player's password | — |
| `NEXT_PUBLIC_SUPABASE_URL` | Same Supabase project the fixture accounts live in | (already required by the rest of the E2E suite) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same project, anon key | (already required by the rest of the E2E suite) |

`e2e/helpers/auth.ts`'s `TEST_USERS` reads the coach/player vars above
with the original hardcoded `testcoach@helm.test` / `testplayer@helm.test`
fixtures as fallback, so unsetting them does not break any other spec
that imports `TEST_USERS`.

## One-time seeding command

Run this against the target Supabase project (needs
`SUPABASE_SERVICE_ROLE_KEY` locally — **not** one of the CI secrets
consumed by the `baseball-smoke` job, since the job only logs in as an
already-seeded account and never needs service-role access):

```bash
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
  scripts/seed-rini-baseball-demo.ts --confirm
```

The seed is idempotent (all writes are `upsert`s keyed by deterministic
UUIDs or natural unique constraints), so it is safe to re-run against
the same project — re-running refreshes the season/aggregate rollups
without duplicating rows.

`e2e/helpers/baseball-seed-manifest.ts` is the single source of truth
for what the seed *claims* to have written (minimum player/game counts,
the known stat-bearing player, and a deterministic completed-game ID for
deep-linking straight to its Box Score). If the seed script's lineup,
game count, or namespace ever changes, that manifest must be updated in
the same change — see the file's header comment for why it intentionally
duplicates the seed's `detId` scheme rather than importing the script.

## CI wiring

Wired as an isolated, advisory job (`baseball-smoke`) in
`.github/workflows/playwright.yml`, modeled on the existing
`picker-screenshots` job's checkout/setup/build/browser-cache shape.

- **Isolated**: runs as its own job, not inside the shared `e2e` job.
  The shared job's full suite already has pre-existing failing specs
  that exhaust its 30-minute budget before a late spec would ever run,
  and bundling seeded-credential requirements into the shared job would
  make its pass/fail depend on baseball fixture secrets it doesn't
  otherwise need.
- **Advisory / non-blocking**: the test step ends in
  `|| echo "baseball-smoke had failures — see report artifact"`, so a
  failure never fails the PR. A Playwright HTML report is still
  uploaded as a build artifact on every run (`if: always()`) for manual
  inspection.
- **Secret-scoped**: `PLAYWRIGHT_BASEBALL_SEEDED` and the
  `E2E_BASEBALL_*` credentials are declared in the `baseball-smoke`
  job's own `env:` block, not the workflow-level `env:` block — so no
  other job's specs (including the shared `e2e` job, which has its own
  unrelated `E2E_GOLF_*` fixtures) ever see them.
- Required repo secrets (Settings → Secrets and variables → Actions):
  `PLAYWRIGHT_BASEBALL_SEEDED`, `E2E_BASEBALL_COACH_EMAIL`,
  `E2E_BASEBALL_COACH_PASSWORD`, `E2E_BASEBALL_PLAYER_EMAIL`,
  `E2E_BASEBALL_PLAYER_PASSWORD`. `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are inherited from the
  workflow-level `env:` block already used by the `e2e` job (same
  Supabase project the fixture accounts were seeded into).

### Promotion path

Once `baseball-smoke` has been green across several consecutive runs
(recommend N >= 10, or roughly a week of merges to `main`), remove the
`|| echo "..."` suffix from the "Run baseball-smoke spec" step so a real
failure fails the job, and add it as a required status check in branch
protection if desired.

## What this spec deliberately does NOT cover

- **Healthy zero-data state** (e.g. a brand-new, unseeded team showing
  "No players yet"). That's a correct UI state, not a regression, and
  is out of scope for this spec — it's only exercised when
  `PLAYWRIGHT_BASEBALL_SEEDED` is unset, at which point tier 2 doesn't
  run at all.
- **Anonymous-authenticated content assertions.** Tier 1 only asserts
  "redirected to login" / "no leak", never real page content, since an
  anonymous visitor is supposed to see nothing.
- **Live execution in this sandbox.** This spec was authored and
  typechecked/linted in an environment without a live browser or
  Supabase connection; the first real signal on whether the seed and
  read models actually agree will come from the first scheduled
  `baseball-smoke` CI run (or a manual local run) once the required
  secrets are populated.
