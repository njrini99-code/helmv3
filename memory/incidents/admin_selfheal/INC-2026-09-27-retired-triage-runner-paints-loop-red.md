# INC-2026-09-27: a retired Diagnose runner painted the self-heal loop red daily

- Feature: `admin_selfheal`
- Surface: `/admin/errors` loop view (self-heal circuit), and repair-contract STEP 0b
- Status: FIXED on main in 1a326692d (#2081), awaiting deploy; RECURRED 2026-09-30 under `metadata.runner`, fixed in ec225fe22 (#2103, pending merge)
- Risk: R1. Read-model only. No schema, RLS, grant or data change.
- Signal: `background_job_logs` `selfheal-triage` rows with `status = 'failed'` and `metadata.method = 'claude-code-cloud-session'` at 2026-09-25 09:05Z, 2026-09-26 09:09Z and 2026-09-27 09:20Z, each a few minutes after a completed `vercel-cron` Diagnose run.

## What was wrong

Diagnose moved to a Vercel cron on 2026-09-02, but the retired
Anthropic-hosted cloud task still fires once a day. It has no credentials and
no `node_modules`, so it writes a `failed` heartbeat. `fetchSelfHealBoard`
(`src/lib/admin/data/selfheal.ts`) classified each stage from its newest row
(`runs[0]`), so for ~6h a day Diagnose read FAILED and `summarizeLoop` turned
the whole loop red, while the real runner was healthy.

## Fix

- `SelfHealStage.retiredMethods` (Diagnose: `claude-code-cloud-session`).
- `selectStageHeartbeat` picks the newest row not written by a retired runner.
  Retired rows stay in the run history; operator rows (`manual-…`) still
  count; if every row in view is retired, the newest is returned (never
  `never-ran`).
- repair-contract STEP 0b's freshness query applies the same filter.

## Recurrence 2026-09-30 (same root cause, new key)

At 2026-09-30 09:18Z the retired task wrote its `failed` row as
`metadata.runner = 'claude-code-cloud-session'` with **no** `method` key,
20 seconds after the completed `vercel-cron` Diagnose run (09:17:41Z). The
method-only match did not recognise it, so the row would again decide
Diagnose's status, and repair-contract STEP 0b's SQL would refuse to run.

Fix: `selectStageHeartbeat` treats a row as retired when either
`metadata.method` or `metadata.runner` names a retired runner; STEP 0b's SQL
filters both keys. A live `runner` (e.g. `desktop-routine`) still counts.
Regression test: "recognises a retired runner that names itself in
metadata.runner" fails on c70bd65ef and passes with the fix. Replay:
`replay/manifests/retired-runner-key-heartbeat-2026-09-30.yml`.

Neither fix is live yet: production serves 6ee77e98 (2026-09-23), which
predates #2081 too.

## Still open (owner)

Disable the retired cloud scheduled task. This fix stops the false red; it
does not stop the task firing.

## Proof

- `src/lib/admin/__tests__/selfheal-registry.test.ts` (selectStageHeartbeat
  block) fails on origin/main 17343f1a6 with `selectStageHeartbeat is not a
  function` and passes with the fix.
- Replay: `replay/manifests/retired-runner-heartbeat-2026-09-27.yml`.

## Verify in production

After deploy: the loop view shows Diagnose `ok` between ~09:20Z and 15:17Z
while the retired task's `failed` row appears in the history list.
