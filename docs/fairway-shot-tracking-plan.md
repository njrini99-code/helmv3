# Fairway redesign plan — Shot-tracking / round-entry flow

_Status: PLAN ONLY (not built). Locked 2026-05-31._
_Source: read-only architecture+UX survey of the full flow._

## TL;DR

The round-entry flow is the largest, riskiest surface in the app — but **~80% of the
non-tracking work is already done**. A flag-gated, presentation-only Fairway fork
already routes the **resume → setup → holes** screens to `FairwayNewRoundEntry`, and
the **save modal + submit overlay** already share the legacy prop contracts. The
**round-detail handoff** (`rounds/[id]`) is also already Fairway (`FairwayRoundDetail`).

**The remaining work is dominated by ONE thing: the tracking screen**
(`ShotTrackingComprehensive`, ~2,006 lines) — the hole-by-hole shot-entry UI, shared
by both `rounds/new` and `rounds/continue/[id]`. Everything else is small.

## The flow (4-state machine in one client orchestrator)

`step: 'setup' | 'holes' | 'tracking' | 'submitting'` lives in
`rounds/new/new-round-client.tsx` (2,771 lines).

1. **Entry** `rounds/new/page.tsx` — player-gated; loads the most recent
   `status='in_progress'` round → offers resume.
2. **Resume gate** — "Round in progress" → Continue (`/rounds/continue/[id]`) or Start
   Fresh. Realtime `useRoundStatusSync` dismisses if completed elsewhere. localStorage
   recovery probe raises a "Recover Unsaved Progress?" drawer.
3. **Setup** — course (saved searchable list / manual new + tees), recent-course
   quick-pick, round type (practice/tournament/**qualifier** w/ `?qualifier=` deep-link),
   date, 9/18 + front/back, validation → `tracking` (if saved hole configs) or `holes`.
4. **Holes config** — `HoleConfigurationForm` par+yardage grid → `tracking`.
5. **Tracking** (the heart) — `ShotTrackingComprehensive`. Per shot: auto-derived shot
   type, club (tee par4/5), putt break+slope, context-aware result set, miss direction
   (8-way approach / putt tags / L-R tee), distance + unit toggle + quick chips, penalty.
   Per-hole GIR/FIR/putts/scramble computed by `calculateHoleStats`, never hand-entered.
   Sub-surfaces: scorecard header (Out/In/Total), shot-pills bar → edit-shot modal,
   completed-hole review, undo, unsaved-input guard, xl course visualization.
6. **Finish & submit** — finish-confirm drawer → `submitGolfRoundComprehensive` →
   `RoundSubmitOverlay` → `router.push('/rounds/[id]')` (Fairway round detail).
7. **Continue** `/rounds/continue/[id]` — server reconstructs round+holes+shots, renders
   `ContinueRoundClient` reusing the **same legacy** `ShotTrackingComprehensive`.
8. **Recover** `/rounds/recover` — scans IndexedDB (modern+legacy) + localStorage, lists
   recoverable rounds, re-submits.

## Reuse VERBATIM (logic untouched — presentation-only rebuild)

- **All server actions** in `actions/golf.ts`: `savePartialRound`,
  `submitGolfRoundComprehensive`, `deleteInProgressRound`, qualifier/course getters,
  `deleteShot`/`updateShot`, `checkRoundStaleness`.
- **State machine** `hooks/golf/use-shot-state-machine.ts` (reducer + autosave circuit
  breaker + derived shot type) and sub-hooks `use-penalty-handler`, `use-undo-manager`,
  `use-edit-shot-modal`.
- **Persistence/offline**: `emergency-save.ts`, `sync-engine.ts`, `indexed-db.ts`,
  `use-offline-sync.ts`, `use-connection-status.ts`, `use-round-status-sync.ts`,
  `offline-sync-store`.
- **Calculation**: `shot-helpers.ts`, `golf-stats-calculator-shots.ts`.
- The orchestrators keep ALL state + handlers; Fairway children receive props — exactly
  the pattern `FairwayNewRoundEntry` already uses ("owns NO state, NO mutations").

## ⚠️ Hard guardrails

- **Do NOT touch `submitRoundDirectFallback`** (golf.ts) — it does a delete-then-insert,
  which violates the no-destructive-writes rule, BUT it is load-bearing RPC-failure
  fallback logic, heavily logged, writes a backup first. It is OUT OF SCOPE for a
  presentation PR. Flag it to reviewers so nobody "fixes" it mid-redesign.
- Autosave's in-flight/queued ref dance + circuit breaker must stay in the orchestrator —
  never move into presentation components.
- Don't change the shot-entry tap sequence in a way that breaks the state machine's
  auto-classification / auto-advance contract.

## Already done (verify parity, don't rebuild)

`components/fairway/pages/rounds-new/`: `FairwayNewRoundEntry`, `FairwayHoleConfig`,
`FairwayRecentCourses`, `FairwaySaveRoundModal`, `FairwayRoundSubmitOverlay`.
Round detail: `FairwayRoundDetail`.

## Proposed phasing

| Phase | Scope | Size |
|---|---|---|
| **1 (verify)** | Confirm resume/setup/holes + save/submit overlay parity; confirm `continue-round-client` also swaps the two overlays/modal | S |
| **2 (the job)** | `FairwayShotTracking` — re-skin all of `ShotTrackingComprehensive` (scorecard header, shot pills, result/miss/distance cards, completed-hole review, edit/penalty/undo modals) over the **unchanged** `useShotStateMachine` + same prop contract. Wire BOTH `new-` and `continue-round-client` to it behind the flag. | **XL** |
| **3** | Fairway finish-confirm drawer + sticky submit banner (extract from `new-round-client.tsx`) | S |
| **4** | Fairway recover screen (`recover-round-client.tsx`) — lowest priority, rarely seen | S |

## Risks

1. **Tracking screen (Phase 2)** is the single highest-effort/highest-risk piece — must
   preserve the exact `ShotRecord` build, `isReadyForNextShot` validation, auto-advance/
   focus, and the edit-modal field interdependencies.
2. **Autosave + offline sync** correctness (logic stays put; only chrome changes).
3. **`continue-round-client` divergence** — it still imports the legacy tracking
   component; it MUST adopt the same Fairway child or new vs. continue drift visually.
4. Shot-entry ergonomics are the core mobile-on-course UX; tread carefully on tap count.

## Recommendation

Do this as its own dedicated session/PR. Phase 1 (verify) + Phase 2 (tracking) are the
real work; Phases 3–4 are small follow-ups. Budget the bulk for the ~2k-line tracking
re-skin.
