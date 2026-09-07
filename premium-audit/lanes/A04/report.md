# Lane A04 — Home and Rounds library: hierarchy, discovery, and resume

Baseline: `3c90f9f174ac103af5fafc600aebecd98243decc`. Read-only phase; no runtime, no device, no screenshots. Evidence labels used: `SOURCE`, `RISK`, `PROPOSAL`, `NOT_RUN`. `OBSERVED`/`REPRODUCED` are unavailable this phase and are not used below.

## Top 5 actionable findings

1. **A04-001** (P1, SOURCE/RISK) — Shared `FairwayDashboardSkeleton` puts the KPI grid directly under the masthead, but BOTH resolved layouts (player and coach) put a schedule/Today block there instead; cold-start players never render a KPI grid at all. `src/components/fairway/pages/dashboard/FairwayDashboardSkeleton.tsx:77-147`, `FairwayPlayerDashboard.tsx:380-492`, `FairwayCoachDashboard.tsx:604-704`.
2. **A04-002** (P1, SOURCE/RISK) — `DayScheduleSwipe` resolves timezone/today-key and decides whether to jump off "today" to the next populated day in two sequentially-gated effects, guaranteeing an intermediate committed render at "Today, nothing scheduled" before the jump, on the file's own measured-common sparse-feed case. `DayScheduleSwipe.tsx:79-83,134-141`.
3. **A04-003** (P2, SOURCE) — Rounds aggregates (KPI hero "Best round"/"Avg score", month-header avg/best) silently extrapolate 9-hole scores to an 18-hole equivalent with no label anywhere, while the individual round row two clicks away is honest (raw score + explicit hole count). `rounds/page.tsx:184-226`, `FairwayRoundsLibrary.tsx:175-223`, `FairwayRoundRow.tsx:56-61,100-129,170-193`.
4. **A04-004** (P2, SOURCE/RISK) — Rounds library filter/grouping/player/search state is plain `useState` with no URL sync or persistence, on a `force-dynamic` route; opening a round and pressing Back is likely to reset the whole toolbar. `FairwayRoundsLibrary.tsx:234-241`, `rounds/page.tsx:21`.
5. **A04-005** (P2, SOURCE) — The same round entity opens a different destination (AI Round Review vs. plain scorecard detail) depending on whether it was tapped from Home's Recent Rounds or the Rounds library/coach table, with no visible cue distinguishing the two. `player-dashboard-parts.tsx:344-345`, `FairwayRoundRow.tsx:86-87`, `FairwayCoachDashboard.tsx:945-947`.

Coverage tally: 9 findings recorded (7 defects/risks, 2 passing verifications of prior seeds); 0 blocked; see ledger below for the full inspected surface.

## All findings

See `findings.jsonl` in this directory for the full structured records (A04-001 through A04-009). Summary of each:

### A04-001 — Skeleton region order disagrees with both resolved layouts (P1)
- **Evidence:** SOURCE (structural mismatch, readable from source) / RISK (the visible handoff itself needs a device/browser trace).
- **Mechanism:** `FairwayDashboardSkeleton.tsx` renders masthead → 4-tile KPI grid (lines 101-106) → two generic content columns (111-147). `FairwayPlayerDashboard.tsx` renders masthead → teamless notice → `DayScheduleSwipe` (421-425, unconditional) → KPI grid only inside the `hasRounds` branch (492). `FairwayCoachDashboard.tsx` renders masthead → scope band → `FairwayJoinRequestAlert` → `NotificationsLatestModule` → `TodayPanel` ("Today", 696-700) → KPI grid (703). Both real layouts put a schedule/Today region ahead of the KPI grid; the skeleton reverses that. The skeleton's own header comment defends its generic two-column shape as unavoidable ("role isn't known until the async page resolves") — that argument covers *content* ambiguity, not *order*, since both roles already agree schedule-before-KPI regardless of role.
- Additionally: the player's zero-rounds branch (427-480) never renders a KPI grid at all, so the skeleton's KPI shells are structurally unfulfillable for that account state.
- **Proposed fix:** insert one generic schedule-shaped panel between the masthead and KPI grid; consider dropping the KPI shells for the case where account state is knowable early, or explicitly document the accepted one-time swap.
- **Negative tests:** T05 (same-scope background refresh geometry), T26 (sparse/cold accounts).

### A04-002 — DayScheduleSwipe's landing-day selection is a second, later effect (P1)
- **Evidence:** SOURCE for the effect-ordering mechanism; RISK for the visible double-flash (no runtime to confirm paint timing).
- **Mechanism:** Effect 1 (`DayScheduleSwipe.tsx:79-83`, deps `[timezone]`) resolves `tz`/`todayKey`. Effect 2 (135-141, deps `[isReady, landed, byDay, todayKey, eventOffsets]`) decides whether to jump the initial `offset` off "today" onto the first day that actually has events — but `isReady` only becomes true as a RESULT of effect 1's state writes, so effect 2 cannot run until the render caused by effect 1 has already committed. That guarantees at least one committed frame at `offset=0` ("Today") before the landing jump, on exactly the sparse-feed case this file's own comment says is the measured norm (4 populated days across a 34-day reachable range).
- **Proposed fix:** compute the initial landing offset in the SAME state transition that resolves `tz`/`todayKey` (one effect, or a `useMemo` off the resolved values) instead of a second effect gated on the first's output.
- **Boundary respected:** proposed as an edit to `DayScheduleSwipe.tsx` only (A04-owned); the shared `dayKeyInTz`/`dayLabel` helpers in `DaySchedule.tsx` are untouched — flagged to A07 as the canonical calendar-semantics owner before any cross-file change.
- **Negative tests:** T17 (midnight/DST/timezone), T05.

### A04-003 — Un-labeled 9/18-hole normalization in Rounds aggregates (P2)
- **Evidence:** SOURCE.
- **Mechanism:** `rounds/page.tsx:184-226` computes server-side `roundStats.best`/`.avg`/trend from `normalizedScores` — an array where every round's score is scaled by `18/holes_played` (explicit comment: "normalize 9-hole rounds to 18-hole equivalents"). `FairwayRoundsLibrary.tsx`'s `normalizedScore()` (176-180) and `monthSummary()` (213-223) do the identical transform client-side for each month header's avg/best caption and sparkline. Neither surface labels the result as normalized. By contrast, `FairwayRoundRow.tsx` (the actual row) is honest: it shows `round.total_score` raw (170-193) next to an explicit `"{holesPlayed} holes"` tag (100-129) — so the same screen is honest at the row level and silent at the aggregate level, which is exactly the kind of inconsistency the work order asks to check for.
- **Proposed fix:** footnote/asterisk on affected StatTiles and month headers whenever the set includes a non-18-hole round; coordinate with A06 (owns C07 metric provenance) rather than inventing a parallel labeling convention.
- **Negative tests:** T06, T18.

### A04-004 — Rounds library toolbar state has no return-state path (P2)
- **Evidence:** SOURCE for the state-loss mechanism; RISK for whether Back actually remounts (Next.js 15/16 default Router Cache `staleTimes.dynamic` is 0 for a page not overriding it — no `staleTimes` override found in `next.config.*` — which would force a fresh server render/remount on Back, but this is a framework-default inference, not an observed trace).
- **Mechanism:** `grouping`, `filter`, `playerFilter`, `search` are `React.useState` (`FairwayRoundsLibrary.tsx:234-241`) with no `useSearchParams`/`router.replace` sync and no persisted storage. The route is `export const dynamic = 'force-dynamic'` (`rounds/page.tsx:21`). Nothing survives a remount.
- **Proposed fix:** URL-sync the toolbar state (mirrors the coach dashboard's own `?range=` precedent in `FairwayCoachDashboard.tsx:321-328`); this is squarely C04 (view/return state, owned by A02) — request the pattern rather than forking a second one.
- **Negative tests:** T05.

### A04-005 — Same round, two different destinations depending on entry list (P2)
- **Evidence:** SOURCE.
- **Mechanism:** `player-dashboard-parts.tsx:345` links Home's Recent Rounds rows to `/golf/dashboard/rounds/${round.id}/review` (the AI Round Review / FilmstripReview surface). `FairwayRoundRow.tsx:87` (Rounds library) and `FairwayCoachDashboard.tsx:947` (coach's Recent Rounds `DataTable`) both route the same round id to `/golf/dashboard/rounds/${id}` (the plain scorecard detail page). The two pages have materially different content (AI narrative + coach notes + standing vs. hole-by-hole scorecard) and no row-level affordance signals which one a given tap will open.
- **Proposed fix:** a product decision on canonical destination per surface (not A04's to make unilaterally), or a visible differentiator on the row if the divergence is intentional.
- **Negative tests:** T05.

### A04-006 — Duplicate "View all" label, opposite behavior (P3)
- **Evidence:** SOURCE.
- **Mechanism:** `NotificationsLatestModule` renders a "View all" control (`NotificationsLatestModule.tsx:107`) immediately above the "Recent rounds" section header's own "View all" (`FairwayPlayerDashboard.tsx:723-725`) — one opens an in-page overlay (bell panel), the other navigates to `/golf/dashboard/rounds`. This is the literal "duplicate destination labels" defect the work order calls out.
- **Proposed fix:** rename one control (trivial single-file text change once approved by whoever owns notification copy).

### A04-007 — TodayCard forks its own timezone-formatting helper (P3)
- **Evidence:** SOURCE.
- **Mechanism:** `player-dashboard-parts.tsx:104-114`'s `formatEventTime()` duplicates `formatTimeInTz()` (`src/lib/utils/timezone.ts:49-56`), the canonical helper already used by `DaySchedule.tsx`, `DayScheduleSwipe.tsx`, and `FairwayCoachDashboard`'s `TodayPanel`. Behavior differs slightly: the fork swallows a bad timezone to `''`; the canonical helper would throw.
- **Proposed fix:** replace with `formatTimeInTz`, preserving the try/catch locally if the swallow-on-error behavior is wanted. Flagged to A07 as canonical-helper owner per the work order's explicit "no independent timezone helper fork" rule.

### A04-008 — PASS: multiple unfinished rounds each resume by their own id (verifies a G20-adjacent concern)
- Each in-progress round in `FairwayUnfinishedBanner.tsx` (56-91) is its own row with its own `Continue` link scoped to `round.id` (line 119) and its own hole-progress readout (107-109). No dashboard-level "pick the active round" logic exists elsewhere (checked `dashboard-data.ts` for `in_progress`/`continueRound`/`Continue` — none found outside the Rounds surfaces). This risk, as stated in the work order, is **not present** at this baseline.

### A04-009 — PASS: Coach Home is a real, distinct composition (verifies G20)
- `FairwayCoachDashboard.tsx` (696-1104) renders team-scoped KPIs with honest coverage gates, a per-player `DataTable` with real avatars, Team Pulse, and a ranked Top Performers list linking to individual player profiles — none of which exists in the player composition. The "player composition simply reused with coach labels" failure mode named in Section 7 is **not present**.

## Coverage ledger

| Surface | Status |
| --- | --- |
| `FairwayPlayerDashboard.tsx` (cold/zero-rounds branch, 427-480) | `FINDING:A04-001` (skeleton mismatch), otherwise `PASS` (honest empties, single hero, discoverability links) |
| `FairwayPlayerDashboard.tsx` (normal/hasRounds branch, 482-753) | `FINDING:A04-001`, `FINDING:A04-005`, `FINDING:A04-006`; KPI honesty (`metricEmpty`, delta/sparkline trend-agreement via `computeSeriesTrend`) — `PASS` |
| `FairwayCoachDashboard.tsx` (no-team funnel, 389-427) | `PASS` (onboarding funnel, not a zeroed dashboard) |
| `FairwayCoachDashboard.tsx` (with-team, 429-1104) | `FINDING:A04-001`, `FINDING:A04-005`; `PASS` on A04-009 (real coach composition), `PASS` on honest KPI/roster-null/rosterFull/showInviteNotice gating |
| `FairwayDashboardSkeleton.tsx` | `FINDING:A04-001` |
| `DayScheduleSwipe.tsx` | `FINDING:A04-002`; swipe/keyboard/week-map/pointer-drag affordances — `PASS` (not independently re-verified beyond effect order; see NOT_RUN) |
| `DaySchedule.tsx` (coach "Schedule" card + shared `dayKeyInTz`/`dayLabel`/`formatTimeInTz` consumers) | `PASS` (canonical helpers, honest empty/error/fade-on-overflow states) |
| `player-dashboard-parts.tsx` — `SectionTitle`, `TodayCard`, `GenomeFingerprintTeaser`, `RecentRoundsList`, `StandingCard` | `FINDING:A04-005`, `FINDING:A04-006`, `FINDING:A04-007`; otherwise `PASS` (honest insufficient-data, discoverability deep-links) |
| `FairwayRoundsLibrary.tsx` (masthead/hero/toolbar/history/empties) | `FINDING:A04-003`, `FINDING:A04-004`; search/filter/grouping/pagination-by-scroll, coach player-scoping, zero-result vs. zero-account empty states — `PASS` (distinct copy for "No rounds yet" vs. "No rounds in this view") |
| `FairwayRoundRow.tsx` | `PASS` (honest raw score + hole count + FIR/GIR/putts, contributes to `FINDING:A04-003`'s contrast and `FINDING:A04-005`) |
| `FairwayUnfinishedBanner.tsx` | `PASS` — verifies `A04-008` |
| `rounds/page.tsx` (server queries, `roundStats` computation, `withCanonicalRoundTotal`) | `FINDING:A04-003`, `FINDING:A04-004`; team-roster failure surfaced as a thrown error rather than a silent empty team — `PASS` |
| `rounds/continue/[id]/page.tsx` | `PASS` (fetch keyed by URL `id`, no ambiguous "the" round selection) — out of A04's repair scope (A05-owned round lifecycle), read only to confirm A04-008 |
| `rounds/[id]/page.tsx` (`FairwayRoundDetail`) vs. `rounds/[id]/review/page.tsx` (`FilmstripReview`) | `FINDING:A04-005` (two destinations); internal content of each page is A05/A06-owned, not independently reviewed |
| `FairwayRoundCard.tsx` | `OUT_OF_SCOPE:dead-code` — component itself deleted; file now only exports shared pure helpers (`scoreToParTone`, `formatToPar`, `getRoundTypeLabel`) consumed by `FairwayRoundRow.tsx` |
| `RoundTypeEditor.tsx` | `OUT_OF_SCOPE:A05` (round-setup/edit surface, not Home/Rounds-library hierarchy) — read only for context |
| Dead/non-mounted paths | `FairwayRoundCard` component body (see above) |

## Contracts requested

- **C02 (scoped read):** Home's skeleton-vs-real mismatch (A04-001) and DayScheduleSwipe's two-phase landing (A04-002) would both benefit from a single "content availability" generation signal shared with A02's pattern, rather than each screen inventing its own `isReady`/staged-effect convention.
- **C04 (view/return state):** A04-004 (Rounds toolbar state) is squarely C04's job; A04 needs the URL-sync/restoration pattern from A02 rather than forking a second persistence mechanism.
- **C07 (metric provenance):** A04-003's un-labeled 9/18-hole normalization needs a provenance field (raw vs. normalized, and the normalization rule applied) that A06 already owns for metrics generally.

## Shared changes requested

- **A02** — C04 pattern/API for persisting Rounds library toolbar state across a round-detail visit and Back (A04-004).
- **A06** — C07-style provenance labeling convention so FairwayRoundsLibrary can disclose normalized 9-hole aggregates without inventing its own footnote scheme (A04-003).
- **A07** — awareness of two items in A04-owned files that touch shared calendar/time semantics without editing A07's files: (1) `DayScheduleSwipe.tsx`'s two-effect landing-day bug (A04-002) is proposed as a fix inside `DayScheduleSwipe.tsx` only; (2) `player-dashboard-parts.tsx`'s forked `formatEventTime()` should be replaced with the canonical `formatTimeInTz()` (A04-007). No request to edit `DaySchedule.tsx` or any shared date helper.

## Open questions for the owner

1. Should Home's "Recent rounds" continue to deep-link into Round Review (AI narrative) while every other Rounds surface opens the plain scorecard detail (A04-005)? This is a product decision, not a bug A04 can resolve by inspection alone.
2. Should 9-hole rounds ever be blended into an "18-hole equivalent" aggregate at all, or should Rounds/Home KPIs report 9-hole and 18-hole rounds as separate series/counts (A04-003)? Labeling is the minimum fix; a stronger fix might be to never average across the two round shapes.

## Messaging referrals

None. No messaging-owned surface (inbox, threads, message actions/attachments/notifications) was touched or observed while reading Home/Rounds files.

## NOT_RUN ledger

| Check | Missing dependency | Next owner |
| --- | --- | --- |
| Whether the A04-001 skeleton→real handoff is visually perceptible (a real paint flash vs. a same-frame swap) | Browser/device trace with a throttled network, React DevTools profiler or frame capture | A11 (perf/frame-pacing instrumentation) or a repair-phase device session |
| Whether the A04-002 DayScheduleSwipe intermediate "Today, nothing scheduled" frame is actually painted (vs. React batching both effects' commits into one before paint) | Same as above; a fixture with a sparse feed (today empty, later day populated) run in a real browser | Repair-phase device/browser session |
| Whether Back navigation to `/golf/dashboard/rounds` actually remounts `FairwayRoundsLibrary` (A04-004) under this app's live Next.js Router Cache configuration | Running app + browser session; Next.js 15/16 Router Cache behavior is a framework default inference here, not observed | A02 (owns navigation/return-state investigation) or a repair-phase browser session |
| DayScheduleSwipe swipe-gesture/keyboard/pointer-drag affordances beyond reading the code (T16: scroll-vs-swipe cancellation) | Real touch/pointer device | A12 (device acceptance) |
| Whether `FairwayDashboardSkeleton`'s KPI-shell geometry pixel-matches the real KPI grid's `MetricCard` dimensions (claimed in the file's own comments) | Rendered/computed-style comparison, not just source reading | A03 (owns component geometry verification, G26) |
| Full-round T26 sparse/long-content fixtures (very long course names, many months of history, zero-score rounds) rendered end-to-end | Fixture data + running app | Repair-phase / A12 |

Section 12 seed verification (baseline `3c90f9f174ac103af5fafc600aebecd98243decc`):

- **G03** (player placeholder order/actions/gutters differ from actual Home) — **still present**. See A04-001; the skeleton's own comments show it was deliberately rewritten (2026-07-22 per its header) to stop being a 1:1 coach mirror, but the order defect (KPI-before-schedule vs. schedule-before-KPI in both real layouts) survived that rewrite.
- **G04** (schedule readiness and initial next-event selection occur in separate effects) — **still present**. See A04-002; confirmed at the exact line numbers cited, unchanged in mechanism from the seed's description.
- **G20** (A04 half — Rounds controls and generic cards dominate before actual records) — **substantially addressed, not fully**. `FairwayRoundsLibrary` already has search/filter/grouping/type-pills/honest empties and a ledger-row (not card-wall) presentation, which resolves the literal "wall of cards" framing. What remains from the same underlying concern: A04-003 (un-labeled normalization) and A04-004 (no return-state). The "duplicate Improving pills" example from the seed's Section 7 language was not found — only one `StatusPill` renders the categorical trend (`FairwayRoundsLibrary.tsx:487-506`), not a duplicate.
- **UX05** (player placeholder structure) — same as G03: still present.
- **UX06** (stable initial schedule) — same as G04: still present.
- **UX22** (Rounds history hierarchy) — **partially fixed, partially open**. The "five equal large metric cards" framing from Section 7 is resolved (the StatTile hero already differentiates trend-bearing tiles from value-only ones, per the `items-start`/`items-stretch` comment at `FairwayRoundsLibrary.tsx:407-413`), and history is a compact ledger, not oversized cards. A04-003 and A04-004 are the parts of "hierarchy" still open.
