# Feature: Recruiting (gap stub)

```yaml
feature_id: recruiting (see Registry Correction below — this stub does NOT
  describe the code the registry's `recruiting:` id actually maps to)
status: stub — gap recorded 2026-08-21, baseball deprioritized by owner 2026-08-20
last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
last_verified_at: 2026-08-21
```

> **This is a gap stub, not a current-state doc.** It exists to record a
> documentation gap explicitly, per the OS contract ("A governed file that
> maps to no feature is a system gap: map it in `memory/registry.yml` in the
> same change, or record the gap explicitly" — `memory/system/
> golfhelm-engineering-os.md`). It is deliberately short. Do not treat
> anything below as a verified feature spec.

## Registry Correction — read this before using this file

The task that produced this stub described `memory/registry.yml`'s
`recruiting:` entry as mapping `src/lib/recruiting/**` (baseball). **That is
incorrect, and the registry says so itself.** Verified this pass by reading
both entries directly:

- `memory/registry.yml`'s `recruiting:` entry (`name: Recruiting HQ`) is
  **golf's** active recruiting feature: routes
  `src/app/golf/(dashboard)/dashboard/recruiting/**`, components
  `src/components/golf/recruiting/**` + `src/components/fairway/pages/
  recruiting/**`, actions `recruiting.ts` / `recruit-documents.ts` /
  `recruit-documents-categories.ts`, migrations `*golf_recruits*.sql` /
  `*recruit_documents*.sql`. `status: active`, `criticality: medium`,
  **not deprioritized, not baseball.** Its `docs.feature` pointer is
  `memory/context/golfhelm-features.md`, not `memory/features/recruiting.md`
  — so it was never claiming this file should exist under this name either.
- `src/lib/recruiting/**` — the baseball pipeline-stage code the task
  actually meant — is mapped under `baseball_core`
  (`memory/registry.yml` lines ~139-145), with an inline comment left by a
  prior pass explaining exactly this: *"`src/lib/recruiting/**` was mapped
  by NO registry entry, so `knowledge:map` returned `impactedFeatures: []`
  for it... It belongs here [`baseball_core`]... The entry NAMED
  `recruiting` is golf's ... and is correct as-is."*

So: naming this stub `recruiting.md` risks colliding with golf's real,
active Recruiting HQ feature if anyone later runs `knowledge:map` against
`recruiting.ts`/`dashboard/recruiting/**` and finds this file instead of a
golf doc. **This file only covers the baseball pipeline-stage code.** The
actual underlying gap — no `memory/features/*.md` exists for golf's
Recruiting HQ either — is real but is a separate, non-deprioritized gap not
addressed here; flagging it for the owner/next pass rather than fixing it in
this stub.

## What `src/lib/recruiting/**` actually contains

Verified by reading the code directly, `last_verified_sha`:

- One file: `src/lib/recruiting/stages.ts` (51 lines).
- Exports `PIPELINE_STAGES`: an ordered array of 5 recruiting-pipeline
  stages — `watchlist`, `high_priority`, `offer_extended`, `committed`,
  `uninterested` — each with `id`, `label`, `color`, `description`.
- Those 5 values are confirmed **exactly identical**, in the same order, to
  the live `baseball_pipeline_stage` Postgres enum in
  `src/lib/types/database.ts` (line 21394 / 21602).
- A code comment in the file documents a real fixed defect: `contacted` and
  `campus_visit` stages used to be shown in the UI but were rejected
  server-side by `WatchlistSchemas.updateStatus`, so selecting them
  silently failed — both were removed from `PIPELINE_STAGES` to match the
  DB enum and the server contract. Date of that fix not established this
  pass (no commit was traced for it).
- Exports `getNextStage(currentStage)`: returns the next stage in the
  pipeline sequence, or `null` at the end.
- Exports the derived type `PipelineStageColor`.
- Imported by 5 files, all baseball: `src/app/baseball/(dashboard)/
  dashboard/pipeline/PipelineClient.tsx`, `.../pipeline/loading.tsx`,
  `.../watchlist/WatchlistClient.tsx`, `src/lib/utils.ts`, and
  `src/lib/validation/action-schemas.ts`. `lib/utils.ts` and
  `action-schemas.ts` both carry comments naming this file as "the single
  source of truth" for pipeline-stage labels/validation — confirmed by
  direct read, not just the comment's own claim: `action-schemas.ts`
  imports `PIPELINE_STAGES` into what is presumably a zod/validation schema
  (not traced further this pass).
- No tests, no `memory/features/*.md`, no registry `tests:` entries were
  found scoped specifically to `stages.ts` or `PIPELINE_STAGES` — baseball's
  broader `e2e/baseball-*.spec.ts` and `supabase/tests/rls/baseball_*.sql`
  (both under `baseball_core`) may incidentally exercise it but were not
  checked line-by-line this pass.

## Not covered by this stub

- Baseball recruiting beyond this one file: watchlist/pipeline UI, coach
  outreach, recruit documents, or any baseball-side data model beyond the
  one enum named above. `memory/context/baseballhelm-features.md` and
  `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md` are `baseball_core`'s
  existing docs of record — not re-verified or re-derived here.
- Golf's Recruiting HQ (the registry's actual `recruiting:` entry) — see
  Registry Correction above. It has its own gap (no `memory/features/*.md`)
  that this stub does not fix.
