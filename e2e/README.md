# E2E Tests Documentation

This directory contains end-to-end tests for the Helm Sports Labs baseball recruiting platform using Playwright.

## Setup

### Install Dependencies

```bash
npm install
```

### Install Playwright Browsers

```bash
npx playwright install
```

## Running Tests

### Run All Tests

```bash
npm run test:e2e
```

### Run Tests in UI Mode (Interactive)

```bash
npm run test:e2e:ui
```

### Run Tests in Headed Mode (See Browser)

```bash
npm run test:e2e:headed
```

### Run Specific Test File

```bash
npx playwright test e2e/auth.spec.ts
```

### Run Tests in Debug Mode

```bash
npx playwright test --debug
```

## Test Structure

### Test Files

- **`auth.spec.ts`** - Authentication flows (login, logout, session persistence)
- **`discover.spec.ts`** - Player discovery and filtering
- **`watchlist.spec.ts`** - Watchlist and pipeline management
- **`messages.spec.ts`** - Messaging functionality
- **`player-profile.spec.ts`** - Player profile viewing and interactions

### Helper Files

- **`helpers/auth.ts`** - Authentication helper functions
- **`helpers/common.ts`** - Common test utilities

## Test Data

Tests use pre-configured test users:

```typescript
{
  coach: {
    email: 'testcoach@helm.test',
    password: 'TestCoach123!',
  },
  player: {
    email: 'testplayer@helm.test',
    password: 'TestPlayer123!',
  },
}
```

**Important:** These users must exist in your test database for tests to pass.

## BaseballHelm seeded fixtures (Camps / Pipeline / Box Score)

`camps.spec.ts`, `baseball-pipeline.spec.ts`, and `baseball-box-score.spec.ts`
exercise real coach/player flows (camp registration, pipeline stage moves,
box-score entry) against **seeded, production-shaped data** rather than
mocks. They are gated on the `PLAYWRIGHT_BASEBALL_SEEDED` env var and
self-skip when it isn't set to `1`, so the rest of the suite stays green on
machines/forks without a seeded test database.

### Seeded accounts

Same shared `@helm.test` logins every other spec in this directory uses
(`helpers/auth.ts` `TEST_USERS`):

```text
COACH : testcoach@helm.test  / TestCoach123!
PLAYER: testplayer@helm.test / TestPlayer123!
```

The seed script (`scripts/seed-baseball-e2e.ts`) attaches both to a
dedicated `E2E Test University Baseball` team, with the coach granted full
`baseball_team_coach_staff` capabilities (head coach, all `can_*` flags) so
every coach-only write path the specs touch (camps, box scores, pipeline
notes) is authorized.

Fixture roster, beyond the shared accounts: three seed-only players
(`Riley Bennett`, `Quinn Ortiz`, `Dakota Reyes` — `*@baseballhelm-e2e.test`)
plus one off-roster recruiting candidate (`Jordan Hayes`, grad year 2027)
used by the Pipeline spec. Seed-only accounts never log in and never have
their password reset; only the two shared `@helm.test` accounts get their
password force-set on every seed run.

### Deterministic-ID strategy

Every seeded row's `id` is derived from a stable key via
`detId(key) = sha1("baseballhelm-e2e:" + key)`, reshaped into a v5-style
UUID. Re-running the script `upsert`s the same rows in place instead of
duplicating them — safe to run repeatedly, including in CI on every PR. The
`baseballhelm-e2e` namespace is fixed and distinct from
`scripts/seed-baseball-demo.ts`'s `baseballhelm-demo-phase1` namespace, so
the two seed scripts can never collide.

The one exception: the test player's camp registration. Registering via the
UI inserts a row with a fresh random id that a by-id upsert can't reset, so
the script explicitly deletes any `baseball_camp_registrations` row scoped
to `(seeded camp, test player)` before reseeding — guaranteeing the
register/unregister spec always starts from "not registered." No other
data is touched by that cleanup.

### Running / resetting the seed locally

```bash
# 1. Dry run (default) — prints the seed plan, writes nothing:
DOTENV_CONFIG_PATH=.env.local npm run seed:baseball:e2e

# 2. Actually seed (writes to the database the env vars point at):
DOTENV_CONFIG_PATH=.env.local npm run seed:baseball:e2e -- --confirm
```

Required env vars (read via `dotenv/config`, so `.env.local` works):

```text
NEXT_PUBLIC_SUPABASE_URL=<your test/dev Supabase project URL>
SUPABASE_SERVICE_ROLE_KEY=<service role key for that project>
```

The script uses the service-role key to bypass RLS for setup and to call
the `recalculate_baseball_season_stats` RPC (so team/season-stat rollups
and the player "My Stats" dashboard are non-empty). It only ever writes
rows under the `baseballhelm-e2e` namespace — never run it against a shared
production database; point it at a dedicated test/dev Supabase project.

Re-running the seed at any time (e.g. after a spec mutates a pipeline stage,
a watchlist note, or flips the scheduled game to `completed`) restores the
baseline described above. There's no separate "reset" command — reseeding
*is* the reset, because every mutable column is rewritten by the upsert.

### The `PLAYWRIGHT_BASEBALL_SEEDED` gate

```bash
PLAYWRIGHT_BASEBALL_SEEDED=1 npx playwright test camps.spec.ts baseball-pipeline.spec.ts baseball-box-score.spec.ts
```

Without this env var set to `1`, all three spec files self-skip via
`test.skip(!SEEDED, '...set PLAYWRIGHT_BASEBALL_SEEDED=1...')` calls at both
the `describe` and `beforeEach` level — running the full suite locally
without seeding is safe and won't produce false failures.

### Refreshing fixtures

To pick up a schema change or just get a clean baseline before a local test
run: re-run `npm run seed:baseball:e2e -- --confirm` against your test
database. There's nothing else to refresh — the script is the single
source of truth for this fixture set, and it's idempotent by design (see
above).

### CI

`.github/workflows/playwright.yml`'s `e2e` job runs
`npm run seed:baseball:e2e -- --confirm` immediately before
`npm run test:e2e`, and exports `PLAYWRIGHT_BASEBALL_SEEDED=1` for that test
run — both gated on the `SUPABASE_SERVICE_ROLE_KEY` repo secret being
present (it isn't, on fork PRs, matching the existing `E2E_GOLF_*` secret
pattern in that workflow). When the secret is absent, the seed step is
skipped entirely and the three specs above self-skip rather than fail.

### Cleanup: "create game" spec self-cleans via a service-role teardown (not the UI)

`GameCard`'s delete affordance is still intentionally hidden in the UI (a
permanent `hidden` class), so `baseball-box-score.spec.ts`'s "should create
a new game and redirect to its box-score entry page" test cannot clean up
the `baseball_games` row it creates through the app UI. It creates a real
row (plus a linked `baseball_events` row, since the create form defaults
`create_calendar_event` to `true`) tagged with a unique opponent name
(`E2E Created Opponent ${Date.now()}`).

Rather than accept that as permanent test-database pollution, the
`Coach - Create New Game` describe block now has a `test.afterAll` teardown
that deletes exactly the `baseball_games` row(s) (and their linked
`baseball_events` row(s)) it created, by opponent name, via a service-role
Supabase client — the same construction pattern
`scripts/seed-baseball-e2e.ts` uses for seeding
(`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, session-less).
The teardown is a silent no-op (never a failure) when the service-role key
isn't present in the environment, matching every other seed/cleanup path in
this suite.

This test had no cleanup prior to 2026-07-08 and had accumulated ~160 junk
`baseball_games` rows in the shared database, purged via a one-off SQL
cleanup that same night. The Camps spec's create/delete round-trip was
already fully self-cleaning via its working UI delete action and is
unaffected by this change.

## CI/CD Integration

### GitHub Actions

Add to `.github/workflows/e2e-tests.yml`:

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## BaseballHelm mandatory smoke (#372)

`baseball-smoke.spec.ts` is a **non-skippable** suite covering Command
Center, Player Today, Calendar, Roster, Stats Center / My Stats,
Performance / Lift, and Settings, plus a player→coach denied-capability
redirect check. `baseball-onboarding-smoke.spec.ts` is a small, anonymous
companion covering signup + onboarding rendering. Unlike the rest of `e2e/`
(which self-skips when no seeded fixture is present, e.g.
`baseball-phase1.spec.ts`'s `PLAYWRIGHT_BASEBALL_SEEDED` guard), this suite
has no spec-level skip guard and is wired as a **blocking** step in
`.github/workflows/playwright.yml` whenever the required repo secrets are
available. A failure there fails CI.

### How it authenticates

`playwright/baseball-auth.setup.ts` logs a coach and a player in once against
`/baseball/login` and persists their session to
`playwright/.auth/baseball-coach.json` / `playwright/.auth/baseball-player.json`.
`playwright.config.ts` wires this as a `setup` project; the `baseball-coach`
and `baseball-player` projects declare `dependencies: ['setup']` and consume
the matching storageState file, so `baseball-smoke.spec.ts` never logs in
itself — it just navigates as an already-authenticated coach or player
(tests are tagged `@coach` / `@player` so each project only runs its own
half of the file).

### Required env vars

| Env var | Purpose |
|---|---|
| `E2E_BASEBALL_COACH_EMAIL` / `E2E_BASEBALL_COACH_PASSWORD` | Seeded coach login used by the `setup` project. |
| `E2E_BASEBALL_PLAYER_EMAIL` / `E2E_BASEBALL_PLAYER_PASSWORD` | Seeded player login used by the `setup` project. |
| `SUPABASE_SERVICE_ROLE_KEY` | Used by `npm run seed:baseball:ci` to upsert the demo team/accounts. |
| `PLAYWRIGHT_BASEBALL_REQUIRED` | Optional. Set to `1`/`true` locally to opt into the same "throw on missing creds" behavior CI gets automatically (CI is detected via the `CI` env var). |

Register the first three (well, four counting the two coach/player email +
password pairs) as **GitHub Secrets** on the repo
(`Settings → Secrets and variables → Actions`) — the workflow injects them
into the `e2e` job's `env:` block. Trusted PRs with these secrets run
`npm run seed:baseball:ci` and the mandatory BaseballHelm smoke as hard gates.
Dependabot and fork `pull_request` runs do not receive repo secrets from
GitHub, so the workflow skips only the secret-backed seed/smoke path and keeps
running the rest of the Playwright job. If a trusted run invokes the setup
without credentials, `playwright/baseball-auth.setup.ts` still throws
``Baseball seeded auth missing — set E2E_BASEBALL_*_EMAIL /
E2E_BASEBALL_*_PASSWORD and run `npm run seed:baseball:ci` ``.

### Seeding / resetting the fixture

```bash
# Dry run first (prints the plan, writes nothing):
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-demo.ts

# Actually seed (idempotent — safe to re-run any time, upserts by deterministic id):
npm run seed:baseball:ci
```

This creates/upserts **Demo University Baseball** with a coach
(`demo-coach@baseballhelmdemo.com`) and player (`demo-player@baseballhelmdemo.com`),
both with password `BaseballDemo2026` (see `scripts/seed-baseball-demo.ts` for
the full roster + practice/lift/readiness/insight fixtures it seeds). If you
point `E2E_BASEBALL_*` at those exact values, the demo seed doubles as the
CI fixture; otherwise point them at a dedicated CI-only account and seed that
account by whatever means is appropriate for your environment.

To reset: re-run `npm run seed:baseball:ci` — every write is an
`upsert(..., { onConflict: 'id' })` on a deterministic id, so a second run is
a no-op diff rather than creating duplicates or destroying existing rows.
Delete `playwright/.auth/baseball-*.json` to force a fresh login on the next
run (they're already gitignored alongside the other `playwright/.auth/*`
files).

### Known gap / follow-up

Full fresh-account onboarding — actually creating a brand-new coach/player
account, completing the multi-step onboarding wizard, and tearing the
account down afterwards — is **not** covered by the mandatory suite (it
needs nondeterministic creation + cleanup that doesn't fit an always-green
smoke test). `baseball-onboarding-smoke.spec.ts` covers only the anonymous,
render-only slice (signup form renders; the coach-onboarding wizard renders
its first step for a logged-out visitor; the player onboarding route
correctly denies anonymous visitors). File a follow-up issue referencing
#372 for full account-creation onboarding coverage if one doesn't already
exist.

## BaseballHelm authenticated route crawler (#373)

`baseball-route-crawler.spec.ts` runs under the same `baseball-coach` /
`baseball-player` Playwright projects as the mandatory smoke above — no new
login mechanism, it reuses the persisted storageState. Unlike the mandatory
smoke's fixed route list, it **discovers** routes at runtime by querying the
live rendered DOM for visible `<nav> a[href]` links (main sidebar + any
hub-subnav strip), so it catches a link that's registered but silently
fails to render, not just a hardcoded list.

It replaces `scripts/route-crawler-baseball.mjs`, which posted credentials
to a `/api/auth/login` REST endpoint that never existed in this repo
(BaseballHelm auth is a client-side Supabase form, not a JSON login API) —
that script's sign-in always failed and it exited 0 ("no credentials —
skipping") regardless of whether CI secrets were configured, and it was
never wired into any workflow.

For each discovered route, `e2e/helpers/route-health.ts` (shared with
`baseball-smoke.spec.ts`) asserts it isn't a 4xx/5xx, doesn't bounce to
`/login` (guard bounce), doesn't redirect into `/golf/` (wrong-sport
redirect), doesn't render a React/Next error boundary, doesn't get stuck on
a loading spinner, and isn't near-blank after settling. It also best-effort
discovers any public player/team/program/packet links surfaced on an
authenticated page and re-checks each (capped at 3) in a fresh,
unauthenticated context — only routes that are actually linked from real
data, never guessed IDs.

Each role's results are written to
`test-results/baseball-route-crawler-{coach,player}-report.json` and
uploaded as the `baseball-route-crawler-report` CI artifact.

**Not** wired into the #372 hard PR gate (`ci.yml`'s `baseball-auth-smoke`
job): DOM-driven discovery and the stuck-spinner/near-blank heuristics are
new, unproven surface area, so it runs as its own step inside
`playwright.yml`'s advisory `e2e` job for now — promote once it's proven
stable across several `main` runs.

## Viewing Test Reports

After running tests, view the HTML report:

```bash
npx playwright show-report
```

## Writing New Tests

### Test Structure Example

```typescript
import { test, expect } from '@playwright/test';
import { loginAsCoach } from './helpers/auth';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
  });

  test('should do something', async ({ page }) => {
    await page.goto('/path');
    await expect(page.locator('selector')).toBeVisible();
  });
});
```

### Best Practices

1. **Use Data Test IDs**: Prefer `[data-testid="..."]` selectors for stability
2. **Wait for Elements**: Always wait for elements to be visible before interacting
3. **Avoid Hardcoded Waits**: Use `waitForSelector` instead of `waitForTimeout` when possible
4. **Clean State**: Each test should be independent and not rely on previous tests
5. **Descriptive Names**: Test names should clearly describe what they're testing

## Debugging Failed Tests

### Screenshots

Failed tests automatically save screenshots to `test-results/`

### Trace Viewer

View traces for failed tests:

```bash
npx playwright show-trace test-results/.../trace.zip
```

### VS Code Extension

Install the Playwright VS Code extension for:
- Running tests from editor
- Debugging with breakpoints
- Test generation

## Configuration

Edit `playwright.config.ts` to customize:
- Test timeout
- Number of retries
- Browsers to test
- Base URL
- Reporter options

## Common Issues

### Tests timing out

Increase timeout in `playwright.config.ts`:

```typescript
use: {
  actionTimeout: 10000, // 10 seconds
}
```

### Element not found

Ensure you're waiting for page load:

```typescript
await page.waitForLoadState('networkidle');
```

### Tests pass locally but fail in CI

- Check browser versions
- Ensure database is seeded with test data
- Verify environment variables

## Test Coverage

Current test coverage includes:
- ✅ Authentication (login, logout, protected routes)
- ✅ Player discovery and filtering
- ✅ Watchlist management
- ✅ Messaging
- ✅ Player profile viewing

## Future Test Areas

- [ ] Player signup and onboarding
- [ ] Video upload and playback
- [ ] Camp registration
- [ ] Compare players feature
- [ ] Mobile responsive views
- [ ] Accessibility (a11y) tests
