## Code Review Tooling

> 2026-07-20: the external AI reviewers (CodeRabbit, Greptile) were
> DROPPED by founder decision — CodeRabbit's credit quota had become the
> slowest step in shipping, and the Review Gate + CodeQL cover the same
> hard rules deterministically. `.coderabbit.yaml` is now a disable stub;
> `.greptile/` is deleted; "CodeRabbit" was removed from main's required
> status checks. The GitHub Apps themselves still need an owner uninstall
> (repo Settings → Integrations). The custom rule packs under
> `.coderabbit/ast-grep/` and `.coderabbit/semgrep/` REMAIN — CI consumes
> them directly; treat that directory name as historical.

> PR check is red or stuck pending? `docs/CI_RUNBOOK.md` classifies every
> check as hard-gate vs. advisory, with expected wait windows and exact
> GHA/CircleCI rerun commands.

**Review Gate** (`.github/workflows/review-gate.yml`) — the deterministic
review toolchain (ast-grep, semgrep, gitleaks, actionlint, yamllint,
shellcheck, markdownlint, ruff+pylint, sqlfluff, hadolint). Aggregate
status check: `Review Gate / all`. The blocking hard rules live in the
custom packs: service-role key in a client bundle, RLS missing on a new
table, server action without an auth check, sport-prefixed table name
violation, destructive DELETE-then-INSERT in a save/submit/sync path.

**CI split — GitHub Actions vs CircleCI**

GitHub Actions owns the per-PR fast path: typecheck, lint, vitest,
next build, Supabase RLS tests (`ci.yml`), and the Review Gate above.

CircleCI (`.circleci/config.yml`) owns what GHA does poorly:

- `weekly` workflow — Knip dead-code, Stryker mutation tests on
  `src/lib/coachhelm/v2/`, full-repo sqlfluff, npm audit, Squawk
  migration safety. Scheduled Mondays 06:00 UTC; triggered via the
  `run-weekly=true` pipeline parameter (configure in CircleCI
  project settings → Triggers).
- `ios` workflow — iOS Capacitor compile verification on M-series
  macOS runners (~2× faster, ~⅓ the cost of GHA `macos-13`). Runs on
  push to `main`, `release/*`, `ios/*`, `capacitor/*` branches.

See `.circleci/README.md` for one-time project setup steps (CircleCI
dashboard) and the planned upgrade path (TestFlight publish via
Fastlane, parallel Playwright, Lighthouse on Vercel previews).

Shared config:

- `.gitleaks.toml` — project-specific secret patterns (rotated
  2026-05-17 Supabase dev DB password is allowlisted only in audit
  docs).

---
