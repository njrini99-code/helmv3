# Change ledger — observability_sentry

## 2026-09-02 — Sentry Snapshots visual-diff CI added

- SHA: 75d3c761a (branch point; see the PR for the merge SHA).
- Change: new `.github/workflows/sentry-snapshots.yml` (advisory, not
  required), `e2e/sentry-snapshots.spec.ts` (public pages + GolfHelm
  player), `e2e/sentry-snapshots-baseball.spec.ts` (BaseballHelm coach +
  player), and shared capture helpers in
  `e2e/fixtures/sentry-snapshot-helpers.ts`. Captures a fixed, named set of
  15 screens (30 images across mobile + desktop viewports) from each PR's
  own build and uploads them via `sentry-cli snapshots upload` (pinned
  3.7.0) for Sentry to diff head against base and post a status check.
  `playwright.config.ts` updated to wire the new baseball spec into the
  existing `baseball-coach` / `baseball-player` projects, same pattern
  `visual-audit.spec.ts` already uses.
- Why: no automated visual-regression signal existed on PRs before this —
  `visual-audit.spec.ts` is a manual-only, unbounded route crawl against
  production, not a fixed-filename diffable set. Runs against the real
  shared Supabase project (strictly read-only) rather than a local
  throwaway stack, because no GolfHelm demo-seed script exists and
  replicating `baseball-auth-smoke`'s ~17-minute local-stack pattern for a
  second product on every PR would reintroduce the PR-throughput cost that
  got that job moved off the PR gate on 2026-08-26.
- Full design, screen list, determinism rules, and OWNER ACTION items (a
  CI-scoped `SENTRY_AUTH_TOKEN` — blocked, Sentry's org-auth-token API
  refuses personal-token Bearer auth; golf coach-role coverage — needs a
  `GOLFHELM_COACH_EMAIL`/`PASSWORD` secret) live in
  `docs/observability/SENTRY_SNAPSHOTS.md`.
