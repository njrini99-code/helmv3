# INC-2026-09-02 — a closed pipe aborted the deploy script after a real success

- Feature: `feature_awareness_system`

## What happened

A production promote deployed fine, then died with a bare exit 134 in
`vercel inspect ... 2>&1 | awk '/id/ {print $2; exit}'`. The Vercel CLI
writes every row to stderr; `awk` closed the pipe after its second row; the
CLI's next write got EPIPE and allocated until V8 aborted (SIGABRT) roughly
90 seconds later. `pipefail` + `set -e` turned that into a dead script and
an unwritten release marker, even though the deploy itself had succeeded.

## Fix / where it lives now

`scripts/deploy-prod.sh` now captures the CLI's whole output into a
variable first, then parses it — never piping directly into something that
can close the pipe early.
`scripts/__tests__/deploy-prod-verify.test.ts` pins the behavior.
`.claude/rules/shipping.md` states the rule generally: capture Vercel CLI
output before parsing it.
