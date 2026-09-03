<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Change ledger — observability_supabase

## 2026-09-03 — Phase 2 Track B: Auth/Storage/Realtime/Edge Function observability, retry-outcome model, coverage audit

- Branch: `agent/dbobs-p2-services` (Track B of Phase 2 of
  `docs/ai-system/briefs/SUPABASE_ZERO_COST_OBSERVABILITY_BRIEF_2026-09-03.md`,
  built on Phase 1's PostgREST/Postgres error envelope + classifier +
  out-of-band recorder, already merged into this branch's tip
  `c7d8b35c1`). Full design writeup, fetched-docs ledger, and
  what's-wired/what's-not: `docs/observability/SUPABASE_SERVICE_OBSERVABILITY.md`.
  Feature current-state doc: `memory/features/observability-supabase.md`.
- Change, by deliverable:
  - **B5** (SHA `a867875f5`): `commit-outcome.ts` — pure retry/timeout/
    commit-outcome model (`classifyCommitOutcome`, `verifyDurableOutcome`,
    `summarizeAttempts`, `compareDurableChildCounts`). Not wired anywhere
    (`golf.ts` is owned by another session this phase).
  - **B1** (SHA `57d2bb3dd`): `classify-auth.ts` + `observe-auth.ts` — Auth
    error classifier (code table fetched from
    supabase.com/docs/guides/auth/debugging/error-codes.md) + server-only
    observer, mirroring `observe-result.ts`'s wiring. Not wired into any
    Auth call site yet.
  - **B2** (SHA `5feec5164`): `classify-storage.ts` + `observe-storage.ts` —
    Storage error classifier (code table fetched from
    supabase.com/docs/guides/storage/debugging/error-codes.md;
    `AccessDenied`'s default deliberately inverted from `classify.ts`'s
    `42501` convention — documented at length in the file header) + wired
    into 6 storage-delete/rollback sites across 4 server actions. One
    additive metric to `metrics.ts` (`helm.storage.failure`).
  - **B3** (SHA `d476a9cd2`): `realtime.ts` — client-safe channel
    observability (connect latency, reconnect count, `CHANNEL_ERROR`/
    `TIMED_OUT` classification with a once-per-`channelClass`-per-session
    `Sentry.captureMessage`, `CLOSED` deliberately treated as ambiguous not
    a failure). Wired into all 11 target hooks/components. One additive
    metric (`helm.realtime.channel_failure`) and one additive
    `client-breadcrumbs.ts` category (`'realtime'`). Fixed one existing
    test (`use-golf-messages.single-load.test.ts`) whose source-text
    boundary search broke when the bare `.subscribe()` it looked for was
    replaced by the wrapper call.
  - **B4** (SHA `faffc23b8`): `classify-edge.ts` + `observe-edge.ts` (app
    side) + `supabase/functions/_shared/observability.ts` (Deno side, fail-
    open Sentry Deno wrapper, import form and `Sentry.init()` shape
    verified against the official Supabase guide). Wrapped all three Edge
    Functions (`personalize-email`, `send-apns-push`, `send-fcm-push`);
    added the three trace headers to each one's CORS allow-list; wired
    `observeEdgeInvoke` into the one `functions.invoke(` call site
    (`push.ts`). One additive metric (`helm.edge_function.failure`).
    Deployment is an OWNER action, not performed.
  - **B6** (SHA `b04da98a1`): extended `scripts/supabase-error-audit.mjs`
    with a report-only Auth/Storage/Realtime/Edge coverage section — zero
    effect on the existing ratchet's exit code.
- Why: brief §10–13 (service-specific observability), §36–39 (retry/
  timeout/commit-outcome, error-rate metrics), §49–55 (coverage audit).
- Verification, every deliverable: `npx tsc --noEmit -p .` (clean each
  time), targeted `npx eslint <changed files> --max-warnings 0` (clean each
  time), targeted `npx vitest run` on new + touched-existing test files
  (all passed, including confirming B2/B3/B4's wiring did not change any
  existing action/hook/push test's behavior). B4's four Deno files were
  type-checked with `deno check --node-modules-dir=none` during this
  track's own build (clean, network-resolved through the sandbox proxy
  against real npm/jsr registries) — but the integrator disabled `deno`
  invocation on this machine shortly after (its cache reached 4.1 GB twice
  on a volume that dipped to 7 GiB free and has been removed), so as of
  this entry: **Deno type-check NOT VERIFIED (deno disabled on this machine
  by the integrator)** — that earlier clean pass is not a standing
  guarantee and no `deno` command ran again after the constraint landed.
  `supabase/functions` is excluded from the main `tsconfig.json` project
  (confirmed before touching Deno files, so `npx tsc --noEmit -p .` never
  saw them).
- Correction avoided: initially assumed (per the task brief's own fallback
  language) that `metrics.ts` might be `server-only`, which would have
  pushed Realtime's failure signal onto a breadcrumb+captureMessage-only
  path. Read the actual import graph (`flush.ts` → `vercel-wait-until.ts`,
  neither carries a `server-only` marker) before writing `realtime.ts` and
  found it IS browser-safe — so `realtime.ts` uses both the metric and the
  gated Sentry capture, per the brief's own "only if metrics.ts supports
  browser use" branch, rather than the fallback the brief describes for the
  case that turned out not to apply.
- Not verified / open items: see
  `docs/observability/SUPABASE_SERVICE_OBSERVABILITY.md` §8 in full — in
  short, Auth has zero wired production call sites, Storage has one
  client-side gap (`upload-course-image.ts`, cannot import a server-only
  observer) plus five out-of-scope files, Realtime's silent-propagation
  monitor is exposed but unused (no product invariant to hang it on yet),
  Edge Functions are not deployed, the commit-outcome model is not wired
  anywhere, `Sentry.continueTrace` for Edge Functions was not verified
  against the pinned SDK, and the Deno type-check is NOT VERIFIED as of
  this entry (deno disabled on this machine by the integrator).
