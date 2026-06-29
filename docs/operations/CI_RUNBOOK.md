# CI Runbook

Use GitHub Actions as the merge-safety dashboard. Each CI job is independent so one failure does not hide later test or build results.

## Local Truth

Run this before marking a normal code change done:

```bash
npm run verify
```

For database-sensitive work:

```bash
npm run verify:db
```

For larger or high-risk work:

```bash
npm run verify:full
```

## Failure Triage

1. Read the failed job first, not the first workflow in the list.
2. Fix hard blockers before advisory jobs.
3. If `Lint ratchet` fails, download `lint-ratchet-report` and fix the rule counts that increased.
4. If `Database types drift` fails, regenerate types from the target Supabase project and commit the generated file.
5. If `Feature knowledge` fails, update `memory/registry.yml` or the mapped feature docs so changed code has current routing context.
6. If `Supabase lint + RLS tests` fails during startup, download `supabase-startup-logs` and create or update the P0 Supabase CI issue.
7. If `Playwright Smoke` fails, treat it as product-critical unless the failure is clearly missing CI secrets in the credentialed smoke test.

## Hard vs Advisory

The source of truth is `docs/operations/GATE_MATRIX.md`. Workflows with advisory behavior must say so in their workflow name or step comments.
