<!-- markdownlint-disable MD022 MD012 -->
## Code Review Tooling
No AI reviewer bots run on PRs — Review Gate + CodeQL cover the same hard
rules deterministically. `.coderabbit.yaml` is a disable stub. The custom
rule packs under `.coderabbit/ast-grep/` and `.coderabbit/semgrep/` remain
load-bearing — CI consumes them directly; the directory name is historical.

**Review Gate** (`.github/workflows/review-gate.yml`) runs ast-grep,
semgrep, gitleaks, actionlint, yamllint, shellcheck, markdownlint,
ruff+pylint, sqlfluff, hadolint, and an env-secrets check, aggregating to
`Review Gate aggregate`. Its blocking hard rules: service-role key in a
client bundle, RLS missing on a new table, a server action without an auth
check, a bare (non-sport-prefixed) table name, and DELETE-then-INSERT in a
save/submit/sync path.

**CI split**: GitHub Actions (`ci.yml`) owns the per-PR fast path —
typecheck, lint, vitest, build, Supabase lint + RLS tests, BaseballHelm
smoke — aggregating to `CI aggregate`. CircleCI (`.circleci/config.yml`)
owns the weekly heavy jobs and two native compile checks gated by branch
name (iOS on `main`/`release/*`/`ios/*`/`capacitor/*`; Android on those plus
`android/*`/`ci/android-*`). See `.circleci/README.md` for setup.

`docs/CI_RUNBOOK.md` classifies every check as hard-gate vs. advisory with
rerun commands — use it when a check is red or stuck. `.gitleaks.toml`'s
`[allowlist]` `paths` are global across every rule, not scoped to one entry.
