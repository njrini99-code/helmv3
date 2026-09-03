<!-- markdownlint-disable MD013 -->
# Sentry Snapshots — visual-diff CI

Visual safety net for pull requests: a fixed, named set of screenshots is
captured from THIS PR's own build and uploaded to Sentry's Snapshots product
(Beta), which diffs it against a base build and posts a GitHub status check.
Workflow: `.github/workflows/sentry-snapshots.yml`. Spec files:
`e2e/sentry-snapshots.spec.ts` (public pages + GolfHelm player) and
`e2e/sentry-snapshots-baseball.spec.ts` (BaseballHelm coach + player).
Shared capture logic: `e2e/fixtures/sentry-snapshot-helpers.ts`.

Anchor SHA for the "current" claims below: run
`git rev-list --count 75d3c761a..HEAD -- 'e2e/**' '.github/workflows/sentry-snapshots.yml'`
to see how far the code has moved since this was written (75d3c761a is the
`main` commit this branch was created from — Phase G of the Sentry
maximum-observability build).

---

## 1. How it works

1. On a pull request (or a push to `main`), the `gate` job decides in a few
   seconds whether the heavy job should run at all — see §5 "Cost controls."
2. The `snapshots` job checks out full git history (`fetch-depth: 0` —
   Sentry resolves the base build from git metadata, specifically the
   merge-base with `main`, so a shallow clone gives it nothing to diff
   against), installs deps, restores `ci.yml`'s `next-build` cache
   (read-only — this job never saves to it), and runs `npm run build` —
   **this PR's own frontend code**, not a deployed URL.
3. `npm run start` serves that build; one Playwright invocation runs both
   spec files across the `chromium`, `baseball-coach`, and `baseball-player`
   projects, each self-gated behind `SENTRY_SNAPSHOTS=1`.
4. Every captured PNG lands in `test-results/sentry-snapshots/`, named
   `<screen>-<viewport>.png` — see §2. Filenames are the diff key: Sentry
   matches head against base by filename, not by capture order, so every
   name in that table is a hand-written literal, never a loop index or a
   discovered route.
5. `npx @sentry/cli@3.7.0 snapshots upload test-results/sentry-snapshots
   --app-id helm-web --project javascript-nextjs` uploads them, reading
   `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` from the step env.
   sentry-cli auto-detects git metadata (head SHA, base SHA via merge-base,
   PR number) from the GitHub Actions environment — nothing here overrides
   `--head-sha` / `--base-sha` / `--pr-number` manually.
6. Sentry diffs this upload against the most recent upload for the same
   `--app-id` on the resolved base ref and posts a **"Snapshot Testing"**
   status check on the PR. GitHub is the only VCS Sentry Snapshots supports
   for that status check today.

### Why a base build needs `push: main` too

A `pull_request`-only trigger would upload head builds forever with nothing
to diff against — the base build for `main` has to come from somewhere, and
that somewhere is a push to `main` re-running this same job. That is also
why the workflow's `gate` job always treats a `push` event as relevant
regardless of which paths changed (§5) — every merge to main should refresh
the base, not just merges that touch what the `pull_request` path filter
matches.

---

## 2. The screen list

15 distinct screens × 2 viewports (mobile 390×844, desktop 1440×900) = 30
images. This is fewer screens than the original 20-30 target because the
credentials that actually exist in CI reach fewer roles than the full app —
see §6 "OWNER ACTION" for what widens it.

| Name (file prefix) | Route | Fixture / auth |
| --- | --- | --- |
| `public-golf-login` | `/golf/login` | none (public) |
| `public-baseball-login` | `/baseball/login` | none (public) |
| `golf-player-dashboard` | `/golf/dashboard` | `golfPlayerTest` (`E2E_GOLF_*`) |
| `golf-player-rounds` | `/golf/dashboard/rounds` | `golfPlayerTest` |
| `golf-player-stats` | `/golf/dashboard/stats` | `golfPlayerTest` |
| `golf-player-qualifiers` | `/golf/dashboard/qualifiers` | `golfPlayerTest` |
| `golf-player-coachhelm` | `/golf/dashboard/coachhelm` | `golfPlayerTest` |
| `golf-player-calendar` | `/golf/dashboard/calendar` | `golfPlayerTest` |
| `baseball-coach-command-center` | `/baseball/dashboard/command-center` | `baseball-coach` project (`E2E_BASEBALL_COACH_*`) |
| `baseball-coach-roster` | `/baseball/dashboard/roster` | `baseball-coach` project |
| `baseball-coach-stats` | `/baseball/dashboard/stats` | `baseball-coach` project |
| `baseball-coach-calendar` | `/baseball/dashboard/calendar` | `baseball-coach` project |
| `baseball-player-today` | `/baseball/player/today` | `baseball-player` project (`E2E_BASEBALL_PLAYER_*`) |
| `baseball-player-passport` | `/baseball/player/passport` | `baseball-player` project |
| `baseball-player-timeline` | `/baseball/player/timeline` | `baseball-player` project |

The six golf routes are exactly the set `e2e/appstore-screenshots.spec.ts`
already ships App Store screenshots for under the player fixture (proven
reachable). The two baseball entry routes
(`/baseball/dashboard/command-center`, `/baseball/player/today`) are
`e2e/visual-audit.spec.ts`'s own entry routes for those roles.

**Golf coach-only surfaces (roster, the coach Intelligence home) are NOT
captured.** `dashboard/roster` and `dashboard/intelligence` import
`loadCoachIntents` / coach-analytics loaders and redirect a player session —
verified by reading each page's role branch, not assumed. Capturing them
needs a `GOLFHELM_COACH_EMAIL` / `GOLFHELM_COACH_PASSWORD` secret, which
does not exist in this repo's GitHub Actions secrets today. See §6.

Golf's other `dashboard/my-*` routes (`my-standing`, `my-qualifiers`,
`my-game-profile`, `my-insights`) and `dashboard/insights` are legacy
permanent redirects onto `/golf/dashboard/coachhelm` — capturing them
separately would just re-shoot `golf-player-coachhelm` under a different
name.

---

## 3. Why production data, not a local throwaway stack

`ci.yml`'s `baseball-auth-smoke` job proves the alternative — spin up a
disposable Supabase stack on the runner, seed it, and test against that
instead of production — and that pattern was deliberately **not** reused
here, for two concrete reasons:

1. **No GolfHelm demo-seed script exists.** `scripts/seed-baseball-demo.ts`
   (`npm run seed:baseball:ci`) is baseball-only; there is no
   `seed:golf:ci` or equivalent anywhere in `package.json`. Building one
   would make this change a new seeding subsystem, not a CI job.
2. **Cost.** `baseball-auth-smoke` itself was moved OFF the per-PR gate
   (2026-08-26, see that job's own comment in `ci.yml`) specifically because
   its `supabase start` + local build + seed sequence measured ~17 minutes
   clean and ~24 minutes on a failure — and that was for baseball alone.
   Building an equivalent for golf too, on every relevant PR, would
   reintroduce exactly the PR-throughput problem that move fixed.

So this job builds the PR's own frontend code but talks to the real,
shared Supabase project (the same one `E2E_GOLF_*` / `E2E_BASEBALL_*` /
`NEXT_PUBLIC_SUPABASE_URL` already point every other authenticated CI job
at — see `AGENTS.md` §Supabase, "single SHARED database... no staging
copy"). Every test is **strictly read-only**: navigate and screenshot only,
same discipline `e2e/appstore-screenshots.spec.ts` already documents and
ships under. Nothing here clicks submit, send, start, or resume.

**The residual risk this accepts, in the open:** production data can drift
between runs (a demo account's round history, a player's stats), which can
produce a diff that is data noise, not a UI regression. §4 lists what
mitigates that and what doesn't.

---

## 4. Determinism rules

- **Animations frozen two ways.** `page.emulateMedia({ reducedMotion:
  'reduce' })` for any component that branches on `prefers-reduced-motion`
  in JS, AND a CSS override forcing every transition/animation to zero
  duration — lifted from `scripts/ui-intelligence/capture-desktop-screenshots.ts`'s
  `freezeAnimations` (the one existing helper in this repo that guarantees a
  motion-free frame regardless of what a component gates on). Both live in
  `e2e/fixtures/sentry-snapshot-helpers.ts`.
- **Settle window, not a hard content assertion.** Each capture waits for
  `networkidle` (8s timeout, best-effort), web fonts ready, then a fixed
  900ms settle — the same shape as `visual-audit.spec.ts`'s
  `settleForCapture`, generalized. This job deliberately does NOT wait on a
  per-route content landmark (a specific heading, a specific button) the way
  `appstore-screenshots.spec.ts` does for its six golf routes: with 15
  routes across two products, a hand-picked selector that drifts (a renamed
  heading, a moved `aria-label`) would fail this whole advisory job over a
  cosmetic rename instead of just producing a screenshot a human diff review
  catches. The tradeoff is real and deliberate — see `sentry-snapshot-helpers.ts`'s
  file header for the full reasoning.
- **Best-effort dynamic-content masking.** `page.screenshot({ mask: [...] })`
  targets `time, [datetime], [data-live-clock], [data-testid*="relative-time"]`
  — broad on purpose, and allowed to match zero elements on a given page
  (Playwright does not error on an empty mask locator). This is a cheap net
  against live clocks/timestamps, not a per-page audit of every dynamic
  field.
- **No frozen clock.** The brief for this job asked for one "where the
  existing helpers support it" — no `page.clock` (or equivalent) helper
  exists anywhere in this repo today, and forcing one in for the first time
  here risks a page whose server-rendered content was computed against the
  real clock disagreeing with a faked browser clock in ways this job did not
  have time to audit per-route. Left as a gap, not silently worked around.
- **What is NOT mitigated:** real content drift from mutable account data —
  a golf player's round count changing, a baseball roster gaining a player —
  is the documented residual risk from §3. A diff that turns out to be data
  drift rather than a UI regression is a "not a bug" verdict in the Sentry
  review UI, not a workflow failure.

---

## 5. Cost controls

Two independent, cheap (`gate` job, a few seconds) checks decide whether the
heavy `snapshots` job (build + Playwright browser install + capture +
upload, ~10-15 min depending on cache warmth) runs at all:

1. **`SENTRY_AUTH_TOKEN` must be set.** Checked via a step output, not a
   job/step `if:` reading `secrets.*` directly — capturing screenshots with
   nowhere to upload them is pure cost with no product. As of this writing
   the secret does NOT exist (see §6), so every PR pays only the `gate`
   job's few seconds until an owner adds it.
2. **On `pull_request`, a frontend/e2e-relevant path must have changed** —
   the identical path-filter shape `pr-smoke.yml`'s `detect-changes` job
   uses. A docs-only or backend-only PR never pays for a Next build it has
   no reason to need. `push` to `main` always runs regardless (§1, base
   build refresh).

This job is **advisory, not required** — it is not added to branch
protection's required checks, so a capture failure can never block a merge
by itself. See §6, "Advisory-then-required plan."

---

## 6. OWNER ACTION

### CI-scoped Sentry token (blocked — needs a human)

`POST https://sentry.io/api/0/organizations/helm-xs/org-auth-tokens/` with
the personal admin token from `.env.local` returned
`403 {"detail":"Authentication credentials were not provided."}` — on both
`GET` (list) and `POST` (create), against both `sentry.io` and the region
host `us.sentry.io`, despite that same token succeeding on
`GET /api/0/organizations/helm-xs/` (200) and carrying `org:admin` /
`org:write` in its scope list. This is not a scope problem; it is Sentry's
org-auth-token management API refusing personal-API-token Bearer auth
entirely (a deliberate boundary against a token minting more tokens
programmatically) — this repo has no evidence otherwise, and this session
did not find a documented alternative auth method for that endpoint.

**Exact steps:**

1. Sentry dashboard → Organization Settings → Auth Tokens → Organization
   Tokens → "Create New Token." Name it `github-actions-snapshots`. Scope:
   `project:write` (personal token) or `org:ci` (org-level token) per
   `docs.sentry.io/product/snapshots/integrating-into-ci/`.
2. `gh secret set SENTRY_AUTH_TOKEN --repo njrini99-code/helmv3` — pipe the
   token on stdin, never as a CLI argument (shell history).
3. Also add `SENTRY_ORG` (`helm-xs`) and `SENTRY_PROJECT`
   (`javascript-nextjs`) as repo secrets or variables if the CLI's
   auto-detection ever needs overriding — the workflow currently sets both
   directly in the upload step's `env:`, so this is redundant unless that
   changes.
4. Nothing else needs redeploying — the `gate` job re-checks the secret on
   every run and flips itself on the next PR once it exists.

### Golf coach-role coverage (blocked — needs a human)

Add `GOLFHELM_COACH_EMAIL` / `GOLFHELM_COACH_PASSWORD` as repo secrets
(a seeded golf coach login, same shape as the existing `E2E_GOLF_*` /
`E2E_BASEBALL_COACH_*` pairs), then extend
`e2e/sentry-snapshots.spec.ts` with a `golfCoachTest`-driven block
(`e2e/fixtures/golf-auth.ts` already exports `golfCoachTest` /
`hasGolfCoachAuth` — no new fixture needed) covering `dashboard/roster` and
`dashboard/intelligence` at minimum.

### Admin / Mission Control surfaces (not attempted — scope, not a blocker)

Not investigated this pass: what credential an admin/Mission Control screen
needs was out of scope for the credentials verification this session had
time for. Before adding it, confirm what auth an admin route actually
requires (a distinct role, or a flag on an existing account) — do not
assume `E2E_GOLF_*` / `E2E_BASEBALL_*` reach it.

---

## 7. How a diff is reviewed / approved

Sentry posts a **"Snapshot Testing"** status check on the PR (per
`docs.sentry.io/product/snapshots/integrating-into-ci/` — "requires approval
before passing"). A visual diff opens in the Sentry UI (org `helm-xs`,
project `javascript-nextjs`, app-id `helm-web`) for side-by-side review; an
intentional UI change is approved there, which turns the check green. A
change that turns out to be data drift (§4) rather than a real regression is
the same "approve" action — it isn't a special path, just a human judgment
call the same way any other visual review is.

Because this job is advisory (§5), the check's state does not block merging
regardless — reviewing it is a signal for the PR author/reviewer, not a
gate.

---

## 8. Advisory-then-required plan

Stay advisory until **two consecutive green runs on `main`** (i.e. two
successive pushes to `main` that both produce a clean base-build upload with
no capture failures) demonstrate the capture step itself is not flaky
independent of any real UI diff. Only then should an owner add `Sentry
Snapshots / Capture + upload Sentry snapshots` (or a renamed equivalent) to
branch protection's required checks — see `.github/branch-protection.md`
for how required contexts are added, and the "phantom check" trap
`AGENTS.md`'s Automated review section and that file both warn about:
renaming a job changes its check-run name, so a required-context change and
a job-rename must land together.

---

## 9. Rollback

Delete `.github/workflows/sentry-snapshots.yml`. Nothing else depends on
it: `e2e/sentry-snapshots.spec.ts` and `e2e/sentry-snapshots-baseball.spec.ts`
are both self-gated behind `SENTRY_SNAPSHOTS=1` and standalone/tag-scoped in
`playwright.config.ts` exactly like `e2e/visual-audit.spec.ts` and
`e2e/appstore-screenshots.spec.ts` already are, so leaving them in place
with no workflow to set that env var is inert — they simply never run. No
migration, no data, no other job references this one.

---

## 10. Base build status

**Not seeded locally — skipped deliberately.** This session had local
access to `GOLFHELM_PLAYER_EMAIL` / `GOLFHELM_PLAYER_PASSWORD` and
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (present in
`.env.local`, not `E2E_BASEBALL_COACH_*` / `E2E_BASEBALL_PLAYER_*`, which
are GitHub Actions secrets only), so a local `npm run build` +
`npm run start` + capture run could in principle have produced and
manually uploaded the public + golf-player subset (9 of 15 screens).

Two attempts were made and both were abandoned before completion:

1. A first `npm run build` failed at the prerender step
   (`Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.`) — a bug in
   this session's own local verification script, which exported
   `.env.local`'s `KEY="value"` lines with the literal surrounding quote
   characters still attached to the value. Fixed (switched to sourcing the
   file, which lets bash's own assignment parsing strip the quotes) and
   confirmed fixed by inspection before retrying — **this bug was local-only
   and never affected the actual CI workflow**, which reads
   `secrets.NEXT_PUBLIC_SUPABASE_URL` directly with no shell quoting step
   in between.
2. The retry was killed mid-build after the team lead flagged that this
   worktree's `.next` had grown to 6 GB and was the largest process on a
   16 GB machine running five other concurrent agent sessions. Per that
   guidance, the local pass was abandoned rather than restarted a third
   time, `.next` / `test-results` / `playwright-report` were deleted, and
   this doc records the skip instead of a manufactured result.

**Nothing here blocks the workflow.** CI's first successful `push: main`
run creates the base build from scratch — that is what the workflow does
on every push to `main` regardless of whether a local seed ever ran (see
§1, "Why a base build needs `push: main` too"). No manual step is needed to
make that happen.
