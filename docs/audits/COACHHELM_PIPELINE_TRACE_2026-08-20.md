# CoachHelm insight pipeline trace — why 66% of `golf_coach_insights` never reach a surface

Date: 2026-08-20. Code-side companion to a database-side measurement (not reproduced here — see
the numbers quoted in the task). Scope: read-only trace, `git grep`/`git ls-files` only (phantom
dirs `.deepsec/`, `.worktrees/`, `.claude/worktrees/` excluded per repo convention). Every claim
below is a quoted line from a tracked file; no doc/prose claim is repeated without opening the file.

## Ranked causes (headline first)

**1. The exposure ledger does not measure what the database numbers assume it measures.**
The primary coach-facing queue (`TriageDesk`/`SignalQueue`, populated by `getSignalGroups` in
`src/app/golf/actions/signal-groups.ts`) **never calls `recordInsightExposure`**. Only the parallel,
now-secondary read path in `src/app/golf/actions/insight-delivery.ts` writes to
`golf_insight_exposure`, and its 6 call sites are fed by consumers that are mostly *not* the
primary UI: a per-category "verdict sentence" assembler, a per-player drill's `useEffect`, a
roster-card top-1-per-player badge. So `golf_insight_exposure` is simultaneously an **undercount**
(insights genuinely visible on the real Signal Queue leave zero exposure rows) and, for the rows it
does track, an **overcount** (the same call re-fires on every `router.refresh()`, not once per human
view). The 419:1 coach_feed ratio is explained by mechanism #3 below; the "never shown" *count*
itself is only as trustworthy as an exposure ledger that skips the surface coaches actually use.
Evidence: §5 and the "Crossed wires" section.

**2. `lifecycle_state: 'tentative'` has no promotion path except archive-then-resurrect.**
A freshly inserted insight below `TENTATIVE_CONFIDENCE_FLOOR` (0.4) is written `tentative` and is
invisible to every surface (`VISIBLE_LIFECYCLE_STATES` excludes it). The only two ways out are (a)
a ≥5% value movement while `lifecycle_state === 'detected'` — which a `tentative` row can never
satisfy, since the guard is `existing.lifecycle_state === 'detected'`, not `'tentative'` — or (b)
being archived (needs 90 days *without* the nightly regen refreshing it) and then resurrected on a
later emission. A `tentative` row that a generator keeps re-emitting nightly has its staleness
clock reset every night (the lifecycle cron's own "STALENESS ANCHOR" comment says so explicitly),
so it can never go stale enough to archive, and therefore can never resurrect either. **A `tentative`
row that stays qualified is permanently invisible.** Given v3 generators size `sample_adequacy` off
targets of 20–30 samples while the emission floor (`MIN_SAMPLE_N`) is 5, a freshly-qualifying insight
plausibly starts under the 0.4 confidence floor — this is a highly plausible, code-verified
explanation for a large share of the 307 never-shown *active v3* rows. Evidence: §2.4.

**3. `applyInsightVisibility`'s `V3_ENGINE_FILTER` unconditionally hides every v2-engine row**,
regardless of state. This fully explains the ~112 never-shown rows that are not v3 (419 total minus
307 v3 = 112) and confirms the first "known lead." Evidence: §2.1.

**4. Exposure is recorded inside the shared data-fetching function itself, not at genuine render
time**, and that function is reused by non-rendering callers (a sentence-assembler, a rate-limited
badge count is exempt but the feed fetch isn't) and re-invoked by every `router.refresh()` after a
coach mutation on a `force-dynamic` page. This inflates the surfaces that *are* tracked without
inflating the count of insights that exist — hence the 419:1 ratio. Evidence: §5.

**5. Two design-consistent but cross-surface-inconsistent status gates.** `getSignalGroups` (Signal
Queue) and `getAlertCounts` (nav badge) additionally require `status = 'active'` on top of the
shared visibility contract, on purpose (documented: "the desk is an ACTION queue"). Every
`insight-delivery.ts` surface (hub_signal, player_feed, coach_feed, roster_card, round_review) does
**not** require `status='active'` — only `status != 'dismissed'` (via the shared helper) — so an
`acknowledged` or `resolved` insight can still render on a player's Hub card or feed while having
already disappeared from the coach's own queue. Not the `status` vs. `lifecycle_state` collision
you hypothesized (that pair is reconciled correctly, see §4), but a real, verified second axis of
surface disagreement. Evidence: §4.3.

**6. Structural per-surface caps drop rows that are otherwise fully visible.** `dedupeBySubject`
keeps only one insight per `(player_id, category, metric-subject)` per fetch, applied on every
`insight-delivery.ts` surface; `roster_card` additionally caps at **1 insight per player** by
default. These don't affect the primary Signal Queue (it doesn't call this ranking module at all)
but they permanently suppress every subject-duplicate and every non-#1 per-player insight from ever
appearing on the surfaces the exposure ledger tracks. Evidence: §2.5, §4.

---

## 1. Pipeline map, stage by stage

### 1a. Generation

- **v2 engine** — `src/lib/coachhelm/v2/orchestrator.ts` (`CoachHelmIntelligence` class; mining
  modules under `src/lib/coachhelm/v2/mining/*.ts` produce candidate insights, `nlg/insight-composer.ts`
  composes copy). `generateAlerts()` (orchestrator.ts:824) and `analyzePlayer()` are the two
  entry points that eventually call `upsertInsight`.
- **v3 engine** — per-metric generators under `src/lib/coachhelm/v3/generators/*.ts` (e.g.
  `putt-bias.ts`, `scrambling.ts`, `warmup-hole.ts`) each extend `BaseGenerator` in
  `src/lib/coachhelm/v3/engine/generator-base.ts`, whose `.run()` calls `upsertInsightV3`.
  Composite/causal-chain rules live under `src/lib/coachhelm/v3/composite/rules/*.ts`, synthesized
  by `src/lib/coachhelm/v3/composite/synthesis.ts`.

### 1b. Write to `golf_coach_insights`

- `src/lib/coachhelm/v2/insights/upsert.ts` — `upsertInsight()` (line 108) is "the single
  mandatory entry point for every Tier-1 insight generator." Enforces the sample floor
  (`MIN_SAMPLE_N = 5`, line 91), recomputes `confidence` (line 120), dedups on
  `(signature, player_id, coach_id, team_id)` (lines 177–192), and on INSERT sets
  `lifecycle_state = 'tentative'` if `confidence < TENTATIVE_CONFIDENCE_FLOOR` (0.4) else
  `'detected'` (line 382, `insertNew`).
- `src/lib/coachhelm/v3/insights/upsert-v3.ts` — `upsertInsightV3()` (line 39) wraps the v2
  upsert, then does one extra `UPDATE … SET engine_version = 'v3'` (lines 54–58) on the row the v2
  path just wrote/updated.

### 1c. Lifecycle progression (nightly cron)

`src/app/api/cron/coachhelm-insight-lifecycle/route.ts`, schedule `0 4 * * *`. Four rules (see the
file's own docblock, lines 10–35): `addressed→resolved` on 2 healthy cycles; `detected→archived`
after 30d no movement; anything `→archived` after 90d "stale" (staleness anchored on
`max(created_at, metadata.last_refreshed_at, metadata.redetected_at)` — line 22–27); and
`detected→tentative` demotion on confidence decay (never the reverse). **No rule promotes
`tentative → detected`.**

### 1d. Ranking / scoring

- `src/lib/coachhelm/v3/ranking/score.ts` — the shared `scoreInsight` composite (rank floor,
  damping, urgent short-circuit, per-coach weight, goal touch).
- `src/app/golf/actions/insight-delivery-ranking.ts` — `rankEvidenceInsightsScored` (orders),
  `dedupeBySubject` (line 112, drops same-subject duplicates), `collapseParScoring` (line 127,
  merges 3 par-scoring rows into 1 survivor).

### 1e. The delivery/gating layer

- `src/lib/coachhelm/v3/insight-visibility.ts` — the shared `applyInsightVisibility()` (§2 below).
  Every reader **except** `signal-groups.ts`'s roster/coach-alert query and a handful of admin/BI
  reads goes through it.
- `src/app/golf/actions/insight-delivery.ts` — the canonical fetchers for the 5 exposure-tracked
  surfaces (hub_signal, player_feed, coach_feed, roster_card, round_review). This file both applies
  the visibility gate AND writes to the exposure ledger.
- `src/app/golf/actions/signal-groups.ts` — `getSignalGroups()`, the **actual primary coach
  queue** (feeds TriageDesk/SignalQueue). Applies the visibility gate plus its own extra
  `status='active'` + `dismissed=false`. Does **not** write to the exposure ledger.

### 1f. The 5 surfaces (exact function → route)

| Surface tag | Function (file:line) | Real UI consumer |
|---|---|---|
| `hub_signal` | `getTopInsightForPlayerImpl`, insight-delivery.ts:347 (2 exposure call sites: :416 urgent short-circuit, :475 ranked fallback) | `HubInsightSignalCard.tsx` via `player-hub-data.ts:158` and the player CoachHelm home (`coachhelm/page.tsx:246`) |
| `player_feed` | `getInsightsForPlayerImpl`, insight-delivery.ts:500, exposure at :651 | Player CoachHelm home secondary list (`coachhelm/page.tsx:248`, `limit: 6`), also `stats-intelligence.ts:282` (`limit: 3`) |
| `coach_feed` | `getInsightsForCoachWithMetaImpl`, insight-delivery.ts:708, exposure at :856 | `team-category-insights.ts:1021` (category "verdict" sentence, NOT a card list), `player-fingerprint.ts:316`, `FairwayPlayerInsight.tsx:460` (per-player coach drill, client `useEffect` + manual refresh) |
| `roster_card` | `getTopInsightsForPlayersImpl`, insight-delivery.ts:898, exposure at :1003 | `dashboard/roster/page.tsx:465`, `stats-intelligence.ts:395` — 1 insight/player by default (`limit` defaults to 1, clamped 1–50, line 923) |
| `round_review` | `getRoundTakeawayInsightImpl`, insight-delivery.ts:1034, exposure at :1104 | `dashboard/rounds/[id]/review/page.tsx:441` — one takeaway per round, ±24h `updated_at` window, low natural traffic |

The **actual coach Signal Queue** (`getSignalGroups`, feeding `TriageDesk`/`SignalQueue` off
`intelligence/page.tsx:136`) is not in this table because it does not write exposure rows at all —
see §5.

---

## 2. Every filter between storage and screen

### 2.1 `applyInsightVisibility` — the shared gate (`src/lib/coachhelm/v3/insight-visibility.ts:77-82`)

```
export function applyInsightVisibility<Q>(query: Q): Q {
  return (query as InsightVisibilityFilterable)
    .or(V3_ENGINE_FILTER)
    .in('lifecycle_state', [...VISIBLE_LIFECYCLE_STATES])
    .neq('status', 'dismissed') as Q;
}
```

with

```
export const V3_ENGINE_FILTER = 'engine_version.eq.v3,signature.like.v3:%' as const;          // line 34
export const VISIBLE_LIFECYCLE_STATES = ['detected', 'matured', 'addressed', 'resolved'] as const; // line 38
```

Applied (confirmed by `git grep`) in every read in `insight-delivery.ts`, `insight-management.ts`,
`insights.ts`, `intelligence-dashboard.ts`, `alerts.ts`, `command-palette.ts`, `drills.ts`,
`player-effectiveness.ts`, `signal-groups.ts`, `whats-new.ts`, `coachhelm-analytics.ts`,
`src/lib/coachhelm/v2/analytics/effectiveness-writer.ts`, `src/lib/coachhelm/v3/chat/{program-pulse,read-tools}.ts`,
`src/lib/coachhelm/v3/composite/loader.ts`, `src/lib/coachhelm/v3/recap/builder.ts`, and the
causality-attribution cron. This is genuinely a single, well-adopted chokepoint — no reader was
found hand-rolling a divergent copy of these three predicates.

| Clause | Excludes | Blast radius |
|---|---|---|
| `.or('engine_version.eq.v3,signature.like.v3:%')` | Every row not stamped `engine_version='v3'` and not `signature LIKE 'v3:%'` — i.e. **all v2-engine rows**, unconditionally, regardless of state | Large and structural. Fully accounts for the ~112 never-shown rows that are not v3 (419 total − 307 v3). This is the "known lead" #1 — **confirmed true**. |
| `.in('lifecycle_state', ['detected','matured','addressed','resolved'])` | `tentative` (pre-maturity) and `archived` (soft-deleted) rows | Large. See §2.4 — `tentative` has no promotion path, so this is a **permanent** exclusion for any row that stays below the confidence floor. |
| `.neq('status', 'dismissed')` | Coach-dismissed rows | Small/expected — this is the intended dismiss mechanic, working as designed. |

### 2.2 `.not('evidence', 'is', null)` — present on every `insight-delivery.ts` read

`upsertInsight` (`src/lib/coachhelm/v2/insights/upsert.ts:113-117`) throws
`InsightEvidenceRefusal` if `evidence.sample_n < MIN_SAMPLE_N`, so every row that survives the
write path already has non-null `evidence`. Checked the one other direct-insert family
(`src/lib/coachhelm/v3/composite/synthesis.ts`) — it also routes through the standard
upsert/refusal path (the `isEvidenceRefusal` catch at synthesis.ts:490-497). **Conclusion: this
filter's exclusion set is ~empty in practice** — it is a defensive predicate, not a meaningful
blast-radius contributor.

### 2.3 Per-surface extra predicates

| Surface / function | Extra predicate | Excludes | Blast radius |
|---|---|---|---|
| `getSignalGroups` (signal-groups.ts:133-140) | `.eq('status','active').eq('dismissed', false)` on top of the shared gate | `acknowledged`/`resolved` **status** rows (even though their `lifecycle_state` is in the visible set) | Deliberate — "the desk is an ACTION queue" (comment, line 132-133). Real, but by design. |
| `getAlertCounts` (alerts.ts:245-252) | Same `status='active'` + `dismissed=false` pairing, with an explicit comment: "`.eq('status','active')` alone lets all 64 archived-active rows through" | Same as above, for the nav badge count | Deliberate, and internally consistent with `getSignalGroups` — the two agree with each other. |
| `getTopInsightsForPlayers` (roster_card, insight-delivery.ts:923) | `limit = Math.min(Math.max(opts.limit ?? 1, 1), 50)` — **default 1** | All but the #1-ranked insight per player | Structural — a coach never sees a 2nd insight for a player on the roster card unless the caller explicitly raises `limit`. |
| `getRoundTakeawayInsight` (round_review, insight-delivery.ts:1075-1077) | `.gte('updated_at', windowStart).lte('updated_at', windowEnd)` — a ±24h window around `round_date`, plus `.limit(20)` pre-rank | Any insight whose `updated_at` (last refresh) doesn't land within 24h of that specific round | Narrow surface by construction (one takeaway per round); low volume (34 impressions / 17 distinct) is consistent with low page traffic, not obviously a bug. |
| `getInsightsForCoachWithMeta` (coach_feed, per-player branch and team-wide branch, insight-delivery.ts:707-825) | `limit = Math.min(Math.max(opts.limit ?? 20, 1), 100)` | Rows beyond the ranked cut, though `total` (pre-slice count) is separately disclosed | Real but scoped to this one function's callers, not the primary Signal Queue. |
| Every `insight-delivery.ts` surface | `dedupeBySubject` (insight-delivery-ranking.ts:112-120): keeps first survivor per `(player_id, category, canonicalMetricSubject)` | Every other insight sharing that subject key, on every fetch, permanently (as long as a higher-ranked sibling exists) | Structural, not applied on the primary Signal Queue. See §2.5. |
| Every `insight-delivery.ts` surface | `collapseParScoring` (insight-delivery-ranking.ts:127-160): merges the 3 `scoring_par_{3,4,5}` rows into 1 survivor card | The 2 non-survivor par-scoring rows never render as separate cards from this path | Narrow (one specific metric family) but permanent for that family. |
| `getInsightsForCoachWithMeta` team-wide sweep | Soft-ceiling warning only (>800 visible rows logs a warning, does not drop) | Nothing dropped | Observability only — not a real filter. |

### 2.4 The `tentative` lifecycle trap (verified code path, not speculation)

On INSERT (`upsert.ts:379-388`, `insertNew`):
```
lifecycle_state: confidence < TENTATIVE_CONFIDENCE_FLOOR ? 'tentative' : 'detected'
```
`TENTATIVE_CONFIDENCE_FLOOR = 0.4` (upsert.ts:92).

On a refresh with **< 5% movement** (`updateExisting`, upsert.ts:226-274) — the common case for a
row a generator keeps re-emitting night after night with a roughly stable value — `lifecycle_state`
is **not included in `refreshPayload`** at all (lines 234-241) unless the row was `archived` (the
resurrection branch, lines 255-263). A `tentative` row therefore stays `tentative` indefinitely.

On a refresh with **≥ 5% movement** (upsert.ts:296-298):
```
const shouldMature =
  existing.lifecycle_state === 'detected' &&
  nextMovementCount >= MATURATION_MOVEMENTS;   // MATURATION_MOVEMENTS = 3
```
The guard is `=== 'detected'`. A `tentative` row can move 5%+ every single night and this branch
will still never touch its `lifecycle_state`, because the promotion is gated on the row already
being `detected`.

The only remaining path out of `tentative` is archive → resurrect
(`updateExisting`, lines 255-263 and 320-326): `lifecycle_state = confidence < 0.4 ? 'tentative' : 'detected'`
on the **next re-emission after the row was archived**. But archiving requires 90 days of staleness
per the nightly cron's Rule 3, and staleness is anchored on
`max(created_at, metadata.last_refreshed_at, metadata.redetected_at)`
(cron route.ts docblock, lines 22-27) — and `metadata.last_refreshed_at` is bumped on **every**
refresh, including the < 5%-movement branch (`upsert.ts:231`). **A `tentative` row a generator keeps
re-qualifying and re-emitting every night therefore never goes stale, never archives, and never gets
the one chance it has to be resurrected into `detected`.** It is a structural dead end, not a rare
edge case — anything that starts under the 0.4 confidence floor and stays qualified is invisible for
the rest of its life. Given `sample_adequacy` in most v3 generators targets 20-30 samples for a
score of 1.0 (e.g. `putt-bias.ts:269`: `Math.min(agg.rounds_played / 30, 1)`;
`approach-miss.ts:419`: `Math.min(agg.attempts / 25, 1)`) against an emission floor
(`MIN_SAMPLE_N`) of only 5, a newly-qualifying insight plausibly starts well under 0.4 confidence —
this is the single most likely explanation for the bulk of the 307 never-shown active v3 rows.

### 2.5 Dedupe/collapse — real, but scoped to the tracked surfaces, not the actual queue

`dedupeBySubject` (insight-delivery-ranking.ts:112-120):
```
export function dedupeBySubject<T extends RankableEvidenceInsight>(insights: T[]): T[] {
  const seenSignatures = new Set<string>();
  return insights.filter((insight) => {
    const subject = canonicalMetricSubject(insight.evidence?.metric) || insight.title;
    const sig = `${insight.player_id}:${insight.category}:${subject}`;
    if (seenSignatures.has(sig)) return false;
    seenSignatures.add(sig);
    return true;
  });
}
```
Applied on every `insight-delivery.ts` surface (hub_signal, player_feed, coach_feed, roster_card).
**Not applied** by `getSignalGroups` (verified — no import of `dedupeBySubject`/`collapseParScoring`
in `signal-groups.ts`, and no cap in `src/components/golf/coachhelm/triage/buildTriageViewModel.ts`).
So this filter narrows what a *given fetch of one of the 5 tracked surfaces* returns, but it is not
the reason the primary Signal Queue would be missing a row.

---

## 3. Two state fields — `status` and `lifecycle_state` — who reads which

`src/lib/coachhelm/v3/insight-visibility.ts:5-21` states this is a deliberate dual-axis design:
`lifecycle_state` is the engine's axis (sweeps + the lifecycle cron move it), `status` is the
coach's axis (only coach actions move it). Checked whether writers keep them in sync, and whether
any surface reads only one axis:

- `dismissInsight` / `bulkDismissInsights` set all three together:
  `status: 'dismissed', dismissed: true, lifecycle_state: 'archived'`
  (`insight-management.ts:359-362`; `insights.ts:1372-1375`).
- `acknowledgeInsight`-family sets `status: 'acknowledged', lifecycle_state: 'addressed'`
  (`insight-management.ts:433-435`; `insights.ts:1287-1289`).
- `resolveInsight`-family sets `status: 'resolved', lifecycle_state: 'resolved'`
  (`insight-management.ts:507-509`; `insights.ts:1545-1547`).
- The one **status-only** write found — `insights.ts:4342-4343`,
  `.update({ status: 'dismissed' })` with no `dismissed`/`lifecycle_state` — ages out stale
  **v2-engine** rows (`.contains('metadata', { v2_engine: true })`, line 4344). Because
  `V3_ENGINE_FILTER` already excludes every v2 row from every visibility-gated surface
  unconditionally, this omission has no observable effect on delivery — it does not reach a
  visibility-gated reader either way. Confirmed not a live bug, just an inconsistency in an already
  wholly-excluded code path.

**No reader was found that uses `status` as its sole gate while ignoring `lifecycle_state`, or vice
versa, in a way that produces a live contradiction.** The dual-axis design in `insight-visibility.ts`
is honored everywhere that matters. The real cross-surface disagreement is narrower and different
from the hypothesis — see §4 below.

---

## 4. "Crossed wires" — confirmed, but not the `status`/`lifecycle_state` collision hypothesized

### 4.1 The exposure ledger is blind to the surface coaches actually use

`getSignalGroups` (`signal-groups.ts`) has **zero references** to `recordInsightExposure`,
`recordExposureForReturned`, or `golf_insight_exposure` (confirmed by `git grep`). It is the
function that produces the `groups` prop `intelligence/page.tsx:364` passes into
`CoachIntelligenceHome` → `TriageDesk`, whose `useState(initialGroups)` (TriageDesk.tsx:233) is the
actual on-screen Signal Queue. Every insight a coach sees there — genuinely rendered, genuinely
read — leaves **no row** in `golf_insight_exposure`. The exposure-based "419 never shown" count can
therefore not distinguish "never rendered anywhere" from "rendered only on the surface nobody
instrumented."

### 4.2 The 5 tracked surfaces are populated by non-primary consumers

- `coach_feed`'s only two callers outside its own file are `team-category-insights.ts:1021`, which
  uses the fetch **only to extract one engine-backed sentence per category** for a "verdict" band
  (`assembleBriefEngineInsights`, comment at team-category-insights.ts:1014-1017) — not to render
  individual insight cards — and `player-fingerprint.ts:316` / `FairwayPlayerInsight.tsx:460`, a
  secondary per-player coach drill. Every row `getInsightsForCoachWithMeta` returns (up to `limit`,
  default 20) is recorded as "shown" via `recordExposureForReturned(data_, 'coach_feed', …)`
  (insight-delivery.ts:856) even when the actual UI only ever surfaces one derived sentence from
  the whole batch.
- `FairwayPlayerInsight.tsx:453-463` calls `getInsightsForCoach` inside a `useEffect` on mount
  (`loadInsights`, wired at line 463) **and** again from `handleRefresh` — both real renders and
  refresh-button clicks each record a fresh full-batch exposure.

### 4.3 A genuine cross-surface status disagreement

`getSignalGroups` and `getAlertCounts` require `status = 'active'` in addition to the shared gate
(documented as deliberate: "the desk is an ACTION queue," signal-groups.ts:132-133). Every
`insight-delivery.ts` surface (hub_signal, player_feed, coach_feed, roster_card, round_review) does
**not** add that constraint — it only excludes `status = 'dismissed'` via the shared helper, so an
`acknowledged` or `resolved` insight (lifecycle `addressed`/`resolved`, both in
`VISIBLE_LIFECYCLE_STATES`) can still appear on a player's Hub signal card, feed, or the round
review takeaway, or a coach's per-player drill, **after** it has already left the coach's own Signal
Queue. This is real and verified — a player could see a card for something the coach queue no longer
lists as outstanding — but it's a divergence in which surfaces additionally gate on `status`, not
the `status`-vs-`lifecycle_state` sync bug hypothesized in the brief.

---

## 5. Where exposure is logged, and whether it's per-render or per-genuine-impression

Single writer: `recordInsightExposure()`, `src/lib/coachhelm/v3/effectiveness/event-ledger.ts:141-179`.
Single caller of that writer: `recordExposureForReturned()`,
`src/app/golf/actions/insight-delivery.ts:312-329`, which is itself called from inside the 6
server-action fetchers listed in §1f — i.e. **exposure is recorded synchronously inside the data
read**, not from a client-side "this card actually painted" signal. The function's own doc comment
is explicit about the intent ("record an EXPOSURE event for every insight a read path is about to
RETURN," lines 297-300) but the mechanism ties "shown" to "this server action ran and returned rows,"
not to "a human looked at a screen."

Confirmed render-inflation triggers, all of which re-invoke a `coach_feed`-tagged fetch without a
new genuine impression:
- `TriageDesk.tsx` calls `router.refresh()` after Scan Team (line 380), after every
  review/dismiss/promote signal action (`runSignalAction`, line 413; `handlePromoted`, line 438),
  and via a manual refresh button (line 506). The route it refreshes,
  `intelligence/page.tsx`, is `export const dynamic = 'force-dynamic'` (line 41), so each refresh
  fully re-executes `getTeamCategoryInsights(teamId)` (page.tsx:150) → `getInsightsForCoachWithMeta`
  → up to 20 fresh `coach_feed` exposure rows, even though the coach is looking at the same team
  they were a second ago.
- `FairwayPlayerInsight.tsx`'s `loadInsights` fires once per mount (`useEffect`, line 463) and again
  per explicit refresh click — each a fresh `coach_feed` batch for that one player.

This mechanism — not a client-side "mark as seen" impression counter — is what produces a
419:1 impression:distinct-insight ratio on `coach_feed`: the ratio is measuring "how many times a
server action that happens to return this row was invoked," not "how many times a human saw a card."

---

## 6. Known-lead verification (as requested)

1. **Shared v3-only visibility gate hiding the v2 coach-alert family** — **confirmed true**,
   §2.1. `V3_ENGINE_FILTER` (`insight-visibility.ts:34`) excludes every non-v3 row unconditionally.
2. **`getPlayerCoachHelmDashboard` computes `data.insights` and drops it** — **confirmed true**,
   but clarified: the field itself is set (`insights: mergedInsights`, `insights.ts:3256`, combining
   a real `applyInsightVisibility`-gated DB read — `loadEvidenceBackedInsights`, `insights.ts:3305` —
   with the in-memory v2 engine's `analysis.insights`). The one caller,
   `dashboard/coachhelm/page.tsx:498`, passes the whole object into `PlayerCoachHelmHome` as
   `data={dashboardResult.data}`, but that component (`src/components/golf/coachhelm/home/PlayerCoachHelmHome.tsx`)
   reads `data.focusAreas`, `data.prediction`, `data.recentRounds`, `data.playerState`,
   `data.playerName` — never `data.insights`. Rendering instead uses the separately-passed
   `topInsight`/`secondaryInsights` props (the canonical insight-delivery.ts fetch, same page,
   lines 246-248). **Net effect: wasted computation (one extra DB read plus a full in-memory v2
   engine run per player-dashboard load), not itself a cause of insights failing to reach the
   screen** — the real rendering path already uses the correct, visibility-gated fetchers.
3. **`BehaviorLearner.getLearnedPreferences()` awaited then discarded, orchestrator.ts:833-834**
   — **confirmed true**: `await behaviorLearner.getLearnedPreferences();` (orchestrator.ts:832-833,
   inside `generateAlerts()`) — the return value is never assigned, so learned coach preferences
   never influence that function's output. Narrow impact: `generateAlerts` is v2-engine machinery,
   and every row it could produce is already unconditionally hidden by `V3_ENGINE_FILTER` (§2.1)
   regardless of ranking quality, so this bug currently has no additional effect on what reaches a
   screen — it's a real defect in already-dead-for-delivery code, not a live cause of the 66% gap.
4. **`OutcomeBadge` renders on every insight card but is structurally guaranteed empty** —
   **not confirmed as literally always-empty**. `outcome_status` is a real column, selected in
   `INSIGHT_SELECT` (insight-delivery.ts:191/206) and mapped onto `EvidenceInsight` by the single
   `mapRowToEvidenceInsight` (insight-delivery.ts:1603), so `OutcomeBadge`'s `readOutcomeStatus`
   (`InsightCard.tsx:106-112`) can read a real value. It IS written, by
   `rollupInsightEffectivenessForYesterday` in `src/lib/coachhelm/v2/analytics/effectiveness-writer.ts:505-520`,
   wired into the nightly lifecycle cron. But that writer requires **both** a pre-insight and a
   post-insight round within `POST_WINDOW_DAYS` of the insight's `created_at` — a narrow condition.
   Combined with the `tentative` trap (§2.4) meaning many insights never live long in a visible
   state, the badge is empty on most currently-visible cards **in practice**, but that's a
   downstream consequence of the delivery problems documented above, not an independent
   construction bug.
5. **`LeakBoard` unmounted; `FairwayEffectiveness`/`FairwayMyDevelopment`/`FairwayMyGameProfile`
   unreachable from any route** — **confirmed true, all four**:
   - `LeakBoard` (`src/components/golf/coachhelm/coach/LeakBoard.tsx`) is only rendered from
     `src/app/vizlab/VizLabClient.tsx:313` (a design-lab playground, not a product route) and its
     own test file. `src/components/golf/coachhelm/coach/index.ts:2` confirms it was "superseded by
     LeakBoard.tsx + TeamCategoryLeakBand.tsx" for whatever it replaced, but nothing downstream
     mounts *it*.
   - `FairwayEffectiveness` (`src/components/fairway/pages/coachhelm/FairwayEffectiveness.tsx`) has
     zero `<FairwayEffectiveness …/>` JSX call sites anywhere in `src/`. Only its TypeScript
     `FairwayEffectivenessProps` type is still imported (by `CoachIntelligenceHome.tsx`,
     `TriageDesk.tsx`, `EffectivenessScoreboard.tsx`) for prop-shape compatibility.
     `TriageDesk.tsx:13` and `EffectivenessScoreboard.tsx:8` both explicitly call it "the retired
     1,800-line `FairwayEffectiveness` … cockpit," replaced by `EffectivenessScoreboard`.
   - `FairwayMyDevelopment` and `FairwayMyGameProfile` are each real, defined, tested components
     with live barrel exports (`src/components/fairway/pages/coachhelm/index.ts:139-140`;
     `src/components/fairway/pages/player-game/index.ts:14-19`), but their former routes are dead:
     `dashboard/my-development/page.tsx:22` and `dashboard/my-game-profile/page.tsx:20` are both
     `permanentRedirect()` shims to `/golf/dashboard/coachhelm?view=development` /
     `?view=profile`, which render `DevelopmentDrill`/`ProfileDrill` instead — comments in both
     confirm the drills are "ported verbatim" from the retired Fairway pages. The original
     components are unreachable.

---

## 7. What could not be determined from code alone

- **Actual production distribution of `evidence.confidence` at insert time** — the `tentative`-trap
  hypothesis (§2.4) is code-verified as a structural dead end, but confirming *how many* of the 307
  never-shown v3 rows are actually stuck `tentative` (vs. some other lifecycle) requires the
  `lifecycle_state` breakdown of those 307 rows, which is a database-side query this trace cannot
  run.
- **Whether `getSignalGroups`'s un-instrumented Signal Queue actually shows a materially larger set
  than what `golf_insight_exposure` implies.** Confirmed the surface exists and skips the ledger;
  did not (cannot, without DB access) measure how many of the "419 never shown" rows would in fact
  satisfy `getSignalGroups`'s stricter `status='active'` predicate and thus have been visible there
  despite zero exposure rows.
- **How many rows the v3 generators actually emit below the 0.4 confidence floor in practice** —
  the sample-target math in §2.4 (20-30 vs. floor of 5) is a structural argument from the generator
  source, not a measured distribution.
- **Whether `router.refresh()`-driven re-exposure (§5) or the non-rendering `coach_feed` consumers
  (§4.2) contributes more to the 419:1 ratio** — both mechanisms are confirmed to exist and both
  inflate the same counter; apportioning the ratio between them needs the raw
  `golf_insight_exposure` rows (timestamps/session clustering), which is DB-side work.
- **Round_review's low volume (34 impressions / 17 distinct)** — confirmed the surface is narrow by
  construction (temporal window, one per round), but could not rule in or out whether it is
  *additionally* under-visited due to low round-review page traffic vs. some other filter, without
  page-view analytics this trace doesn't have access to.
