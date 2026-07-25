# Round Review, Strengths & Weaknesses, and CoachHelm UI/UX — investigation

**Date:** 2026-07-25
**Asked:** "Dig more into round review and strengths and weakness outputs. And
CoachHelm UI/UX and organization."
**Method:** live prod queries + code tracing. Every number below is measured, not
estimated. Nothing was changed; this is findings only.

---

## Headline

Round review has the **same shape as the effectiveness ledger**: the generation
half works, the entire interaction and lifecycle half has never run once. And
strengths & weaknesses is **structurally non-discriminating** — it tells almost
every player the same three weaknesses, because it grades college golfers against
a PGA-scratch yardstick.

The one pleasant surprise: the CoachHelm route consolidation is genuinely well
executed. The problem there is that `CLAUDE.md` no longer describes it.

---

## 1. Round Review

### 1.1 Coverage: 25%

| Measure | Value |
|---|---|
| Completed rounds | **284** |
| Rounds with a review | **70** |
| Rounds with **no** review | **214** |
| Reviews in last 7d / 30d | 13 / 15 |
| Oldest / newest review | 2026-02-27 / 2026-07-24 |

This tracks the round-analysis stall documented separately — the same
non-durable trigger that stranded 200 rounds.

### 1.2 Nine lifecycle columns are dead across all 70 reviews

Populated: `summary` 70/70, `highlights` 70/70, `areas_to_review` 70/70,
`round_stats` 70/70, `primary_takeaway` 62/70, `next_practice_priority` 62/70.

**Zero of 70**, every one of them: `action_items`, `sentiment_score`,
`coach_notes`, `coach_rating`, `coach_viewed_at`, `shared_with_coach`,
`shared_with_player`, `published_at`, `published_by`.

The publish → share → coach-feedback loop has never executed a single time in
production. **All 70 reviews are `status='draft'`.**

### 1.3 Two sources of truth for review status — the coach filter reads the wrong one

`getTeamReviews` and `getPendingCoachReviews` (`round-reviews.ts:1013-1019`,
`:1136-1141`) read status out of a JSON side-car:

```ts
// Filter by status if specified (status is in patterns_detected JSON)
const extData = (r as ReviewDbRow).patterns_detected as ReviewExtendedData | null;
return extData?.status === options.status;
```

But a real `status` column exists on the table. Measured contents of the
side-car: only **8 of 70** rows carry a `status` key, and **all 8 say
`'failed'`**. So `getTeamReviews({status:'draft'})` matches **zero rows** even
though all 70 rows are drafts.

`getPendingCoachReviews` survives only by accident — its fallback is
`extData?.status ?? 'draft'`, and everything really is a draft. The moment
publishing works, published reviews would still read as `'draft'` and never leave
the pending queue.

### 1.4 `patterns_detected` is a junk drawer holding two incompatible shapes

| `jsonb_typeof` | Rows | What it actually is |
|---|---|---|
| `array` | **48** | empty `[]` |
| `object` | **22** | a lifecycle side-car |

Keys found in the object variant — every one of which duplicates a real column
or should be one:

| Key | Rows | Real column |
|---|---|---|
| `player_viewed_at` | 14 | `player_viewed_at` (**0 populated**) |
| `status` | 8 | `status` (all `'draft'`) |
| `generation_completed_at` | 8 | — |
| `last_error` | 8 | — |

So the column named `patterns_detected` **never contains detected patterns**.
It is either empty or repurposed. Confirmed harmless downstream only because
`patternsDetected` is never consumed by any component (no `.map`, no `.length`
anywhere) — the payload is dead either way.

### 1.5 This corrects an earlier conclusion: 14 player views exist, reported as zero

`player_viewed_at` the column reads 0, so any analytics on it reports no
engagement. But 14 views are recorded in the side-car. `markReviewAsViewed`
writes to the blob (`round-reviews.ts:1246` selects `patterns_detected`), while
`src/lib/admin/data/user-engagement.ts:28` filters
`.not('player_viewed_at','is',null)` — the real column.

**Admin engagement analytics reports zero player review views when there were 14.**

### 1.6 The coach-facing review surface is dead code

`getTeamReviews` and `getPendingCoachReviews` have **zero callers** outside their
own definition file. There is no wired path for a coach to see team round
reviews. The status bug in 1.3 is therefore latent — it lives in code nobody
calls, and would bite the moment someone wires the surface up.

### 1.7 Eight generation failures — already fixed, corpses remain

8 reviews carry `last_error`:

> Route `/golf/dashboard/rounds/new` used `revalidatePath /golf/rounds` during
> render which is unsupported.

All eight are dated **2026-02-27 → 2026-03-09**, and **no such call site exists
in the codebase today** — this was fixed months ago. The rows remain as corpses
whose real `status` column still reads `'draft'`, so they look like valid
pending drafts.

### 1.8 Three engine versions coexist

`coachhelm-v2` (62), `v1.0` (7), `rule-based-v2` (1). One `generation_method`.

---

## 2. Strengths & Weaknesses — the output barely discriminates

### 2.1 It uses a private benchmark table, not the shared one

`generateStatisticalStrengthsWeaknesses` (`src/lib/golf/strokes-gained.ts:259`)
grades against a **file-local `COLLEGE_BENCHMARKS` constant** (`:176`).

The shared source `src/lib/golf/sg-benchmarks.ts` has what that constant lacks:
`ncaa_d1`, `ncaa_d2`, `ncaa_d3` tiers, plus `WOMENS_SG_SCALE = 1.083` and
gender-aware baseline selection. **S&W has neither division awareness nor gender
scaling** — every player on every team is graded against one flat yardstick.

### 2.2 All four SG benchmarks are hardcoded to `0` — i.e. PGA scratch

```ts
sgTee: 0, sgApproach: 0, sgAroundGreen: 0, sgPutting: 0,
```

Measured against the 30 real players in `golf_player_stats_cache`:

| Metric | Benchmark | Players above it | Population avg |
|---|---|---|---|
| **SG Approach** | 0 | **0 of 30** | **−3.30** |
| **SG Putting** | 0 | **1 of 30** | −2.87 |
| **Scrambling** | 55% | **0 of 30** | — |
| SG Around Green | 0 | 11 of 30 | −0.50 |
| SG Off the Tee | 0 | 15 of 30 | +0.12 |
| GIR | 60% | 23 of 30 | 60.1% |

**Consequence:** SG Approach is a "weakness" for 100% of players, SG Putting for
97%, scrambling for 100%. The weakness list is structurally the same three items
for nearly everyone — not because those are each player's actual relative
weaknesses, but because the bar is set at professional scratch and the
population is college golfers. A player's *genuine* worst area is buried.

Note GIR is well calibrated (population avg 60.1 vs a 60 benchmark, 23/30
above). So this is not "all the benchmarks are wrong" — it is specifically the
four SG bars and scrambling. That makes it a targeted fix, not a rewrite.

### 2.3 Silent empty state below 3 rounds

`getPlayerStrengthsWeaknessesImpl` returns `null` when `roundsPlayed < 3`
(`stats-data.ts:2489`), and `StatsSpineStage` turns that into `[]`. A player with
1–2 rounds sees emptiness rather than "come back after 3 rounds."

### 2.4 Recommended fix

Point S&W at `sg-benchmarks.ts` with the team's division and gender, so the SG
bars reflect the population being graded. This is a pure code change — **no S&W
grade is persisted anywhere**, so there is no backfill and no migration.

---

## 3. UI/UX and organization

### 3.1 The route consolidation is good — better than expected

Eight legacy routes are proper `permanentRedirect` shims with explanatory
headers, registered in `src/lib/golf/surface-registry.ts` as
`legacy: true, hidden: true`, plus belt-and-braces `next.config.mjs` redirects
added 2026-07-22 to catch client-side navigation:

`alerts`, `insights`, `patterns`, `development`, `analytics/coachhelm`,
`my-insights`, `my-standing`, `my-game-profile`

Only `coachhelm` (484 lines) and `intelligence` (340) are real pages — those
contain conditional role redirects, not stubs. 51 dashboard routes total.

*(Correcting a stale note of mine: `surface-registry.ts` exists and was modified
2026-07-24. An earlier audit recorded it as deleted. It is not.)*

### 3.2 But `CLAUDE.md` now actively misdirects

`CLAUDE.md`'s "Coach-Only Features" table still lists these as live features with
routes and action files:

| Listed feature | Listed route | Reality |
|---|---|---|
| Alerts | `/dashboard/alerts` | **redirect shim** |
| Insights | `/dashboard/insights` | **redirect shim** |
| Patterns | `/dashboard/patterns` | **redirect shim** |
| Development Plans | `/dashboard/development` | **redirect shim** |
| CoachHelm Analytics | `/dashboard/analytics/coachhelm` | **redirect shim** |
| Intelligence Hub | `/dashboard/intelligence` | real page |

Five of six are dead routes presented as first-class features. Anyone — human or
agent — who follows that table to "fix Alerts" edits a surface no user reaches.
Given `CLAUDE.md` opens with "Read this entire file before writing ANY code,"
this is the highest-leverage doc fix available.

### 3.3 Nineteen components violate the documented reduced-motion invariant

`CLAUDE.md` is explicit: *"always `useReducedMotionGuard()` … never raw
`useReducedMotion()` (returns `null` pre-hydration → #418 mismatch)."*

**19 non-test CoachHelm components use the raw hook** (25 files including
tests), among them `InsightCard`, `HeroInsightCard`, `HeroNarrativeCard`,
`MovementPill`, `DrillChips`, `GoalCard`, `GoalCreationModal`, `IntentPill`,
the whole `v3/Chat/*` set, `InsightListView`, `RoundSGSummary`, and the round
review page itself.

Spot-checked `InsightCard.tsx:391` and `HeroNarrativeCard.tsx:46`: both gate only
the `transition` prop while leaving `initial={{ opacity: 0 }}` / `initial="hidden"`
**unconditional**. So the element server-renders invisible and depends on JS to
reveal it — the "reduced-motion reveals" bug class already logged in the browser
QA sweep (#905–#917). The fix is mechanical and matches an idiom already used
elsewhere in the codebase.

---

## Priority order

| # | Finding | Cost | Why it ranks here |
|---|---|---|---|
| 1 | S&W graded at PGA scratch (2.2) | small | Actively misleads every player, every view |
| 2 | `CLAUDE.md` lists 5 dead routes as features (3.2) | trivial | Misdirects all future work, human and agent |
| 3 | 19 raw `useReducedMotion` (3.3) | mechanical | Known bug class, a11y-visible |
| 4 | Review status read from JSON side-car (1.3) | small | Latent until the coach surface is wired |
| 5 | 14 views invisible to analytics (1.5) | small | Understates engagement to zero |
| 6 | Review lifecycle never runs (1.2) | large | Product decision, not a bug fix |
| 7 | `patterns_detected` junk drawer (1.4) | medium | Needs a migration; nothing reads it today |

Findings 1–3 are the ones I would do first: all small, all user-visible, none
requiring a migration or a product decision.
