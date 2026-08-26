# Admin Platform test ledger

## 2026-08-26 — observability refit coverage

- SHA: recorded in the follow-up ledger commit on `feat/bridge-refit`.
- Added coverage:
  - `src/test/admin/resolve-error.test.ts` rewritten against the unified
    RPC path — the old tests asserted the deleted direct-`UPDATE` shape. Now
    pins the read→RPC id forwarding, the cache-tag bust, the no-open-rows
    short circuit, the super-admin gate ordering, and the real (unmocked)
    `describeResolveFailure` translation of a Forbidden/42501 RPC error.
  - `ResolveErrorButton.test.tsx` and `BulkResolveButton.test.tsx` — the
    second exists specifically to pin the confirm shape the first was unified
    onto, so the two buttons cannot drift apart again silently.
  - `src/test/api/log-error.test.ts` — a token-bearing URL goes in, a redacted
    one is written, and the write still happens (redaction is fail-open).
  - `analyze-error.test.ts`, `rca.test.ts` — the unconfigured-provider path
    returns a status rather than throwing, the stored-analysis shape, and the
    `rca_analysis` exclusion that keeps an analysis out of the incident feed.
  - `sentry-resolve.test.ts` — success, the 403 missing-scope message, and the
    unconfigured-token path.
  - `feature-health-summary.test.tsx` plus a pin on `computeFeatureStatus`
    outputs, so the three-call-site consolidation stayed a rendering change
    and not a status-logic change.
  - `severity-mix-strip.test.tsx`, `posture-disclosure.test.tsx`,
    `kpi-source-note.test.tsx`, `admin-shell-health-badge.test.tsx`,
    `ForensicsHeader.test.tsx`, `FieldCopy.test.tsx`, `RcaPanel.test.tsx`,
    `TrendStrip.test.tsx`, `RecentTimelines.test.tsx`, and
    `tracer-shared.test.ts` (waterfall grouping, ordering, missing-required
    ghosting).
- Guarantees now held by tests: one resolution path with one privilege model;
  an RCA analysis is never counted as an occurrence of the incident it
  annotates; client error context cannot be persisted with URL secrets or raw
  emails; feature-health status thresholds and hysteresis are unchanged by the
  UI consolidation.
- Verification: full unit + unit-dom suite in the refit worktree —
  1210 files, 11,120 tests, 0 failures, 6 pre-existing skips. `tsc --noEmit`
  clean. ESLint clean across `src/app/admin/**`, `src/lib/admin/**`,
  `src/lib/golf/**`, `src/lib/supabase/**`, `src/app/golf/actions/*.ts`.
