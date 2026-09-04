<!-- markdownlint-disable MD003 MD007 MD012 MD013 MD022 MD028 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
---
verified: 2026-09-04  # paths machine-checked AND prose re-read against review-gate.yml, ci.yml, .circleci/config.yml and the live required contexts
---

## Code Review Tooling

> 2026-07-20: the external AI reviewers were DROPPED by founder decision —
> their credit quota had become the slowest step in shipping, and the Review
> Gate + CodeQL cover the same hard rules deterministically. `.coderabbit.yaml`
> is now a disable stub, and the bots were removed from main's required status
> checks. No bot checks appear on current PRs. The custom rule packs under
> `.coderabbit/ast-grep/` and `.coderabbit/semgrep/` REMAIN — CI consumes
> them directly; treat that directory name as historical.

> PR check is red or stuck pending? `docs/CI_RUNBOOK.md` classifies every
> check as hard-gate vs. advisory, with expected wait windows and exact
> GHA/CircleCI rerun commands.

**Review Gate** (`.github/workflows/review-gate.yml`) — the deterministic
review toolchain (ast-grep, semgrep, gitleaks, actionlint, yamllint,
shellcheck, markdownlint, ruff+pylint, sqlfluff, hadolint, and an
env-secrets check). Aggregate
status check: `Review Gate aggregate` (renamed from `all` on 2026-08-19 —
`Review Gate / all` posts NOTHING, and required contexts are matched by
name, so looking for the old name is the phantom-check trap that made
every PR unsatisfiable; CI's is `CI aggregate`). The blocking hard rules
live in the
custom packs: service-role key in a client bundle, RLS missing on a new
table, server action without an auth check, sport-prefixed table name
violation, destructive DELETE-then-INSERT in a save/submit/sync path.

Layout since 2026-09-02: every tool except semgrep runs as a named STEP of
one `Review Gate checks` job (semgrep keeps its pinned-container job), and
the aggregate reads `steps.*.outcome` so one failing tool cannot hide
another. Twelve jobs became three; nothing stopped running. ci.yml made the
same move (`Static checks`, `Lint`). The reason was runner-slot starvation:
~47 check runs per PR on a pool that behaves like 20 concurrent jobs.

**CI split — GitHub Actions vs CircleCI**

GitHub Actions owns the per-PR fast path (`ci.yml`, job display names
verbatim): Static checks, TypeScript, Lint, Unit tests, Unit tests (shifted
timezone), Next build, Supabase lint + RLS tests, BaseballHelm authenticated
smoke — behind a `Detect code-relevant paths` gate, aggregating to
`CI aggregate`. Plus the Review Gate above. Three of those were missing from
this list until 2026-09-04, one of them (`Static checks`) named correctly
two paragraphs earlier in this same file.

CircleCI (`.circleci/config.yml`) owns what GHA does poorly:

- `weekly` workflow — Knip dead-code, Stryker mutation tests on
  `src/lib/coachhelm/v2/`, full-repo sqlfluff, npm audit, Squawk
  migration safety, Promptfoo evals, Janitor entropy report
  (`scripts/janitor/`, advisory).
  Scheduled Mondays 06:00 UTC; triggered via the
  `run-weekly=true` pipeline parameter (configure in CircleCI
  project settings → Triggers).
- `android` workflow — Android `assembleDebug` on a Linux Android image.
  Same branch-name gating as `ios` below: push to `main`, `release/*`,
  `android/*`, `capacitor/*`, `ci/android-*`. A PR from any other branch
  name touching `android/**` does NOT trigger it. AGENTS.md has always
  documented this workflow; this file omitted it entirely until 2026-09-04.
- `ios` workflow — iOS Capacitor compile verification on M-series
  macOS runners (~2× faster, ~⅓ the cost of GHA `macos-13`). Runs on
  push to `main`, `release/*`, `ios/*`, `capacitor/*` or
  `agent/fix-circleci-ios-*` branches. Gating is by branch NAME, not changed
  files: a PR touching `ios/**` from any other branch name does not trigger
  it, and that last pattern is the opt-in an agent fixing iOS CI needs.

See `.circleci/README.md` for one-time project setup steps (CircleCI
dashboard) and the planned upgrade path (TestFlight publish via
Fastlane, parallel Playwright, Lighthouse on Vercel previews).

Shared config:

- `.gitleaks.toml` — project-specific secret patterns. Its `[allowlist]`
  `paths` are GLOBAL across every rule, not scoped to one: the rotated
  2026-05-17 Supabase dev DB password is allowlisted in the audit docs, and
  so is `.gitleaks.toml` itself plus one source file — the Supabase
  error-envelope privacy test, which needs a real-shaped JWT to prove
  redaction works. "Only in audit docs" read as though a source file could
  never be allowlisted.

---
