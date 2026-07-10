<!--
STATUS: SUPERSEDED
DATE: 2026-07-10
SUPERSEDED BY / WHY: Feb/March 2026 point-in-time report; the ground it covers has since had a dedicated, later remediation pass (project memory: "Golf stats correctness audit").
KEPT FOR HISTORY -- do not delete this file.
-->

# Round Review Accuracy & Enhancement Report

> **Date:** February 2026
> **Scope:** Full audit of the AI-generated round review pipeline — data flow, calculations, insight quality, and UI gaps

---

## Executive Summary

The round review system is **production-ready but has 12 specific accuracy issues** ranging from score estimation on incomplete data to miss direction double-counting bugs. The system correctly avoids false precision in several areas (putts_per_gir intentionally disabled, null instead of guesses). However, **rich data already computed is not displayed in the UI** — front/back splits, momentum charts, putting distance breakdowns, strokes-to-gain rankings, and penalty analysis are all generated but hidden.

**Key findings:**
- **3 bugs** that produce incorrect numbers in specific edge cases
- **4 accuracy weaknesses** in how stats are calculated or estimated
- **5 enhancement opportunities** to make reviews significantly more useful
- **8 data fields** already computed but not shown to users

---

## 1. System Architecture

```
golf_shots (raw) ──→ buildHoleBreakdowns() ──→ HoleBreakdown[]
                          │                          │
                          ▼                          ▼
                   golf_holes (validation)    generateReviewContent()
                   golf_rounds (ground truth)       │
                                                    ▼
                                            RoundReviewContent
                                            (stored in golf_round_reviews.round_stats)
                                                    │
                                                    ▼
                                            RoundReviewDisplay (UI)
```

**Separate pipeline (aggregate, not per-round):**
```
golf_shots ──→ golf-stats-calculator-shots.ts ──→ GolfStats (100+ metrics)
                                                        │
                                                        ▼
                                              stats-insight-generator.ts ──→ MinedPattern[]
                                                        │
                                                        ▼
                                              orchestrator.ts ──→ ComposedInsight[]
```

The round review system uses its **own rule-based engine** (`round-review-system.ts`), NOT the V2 orchestrator. This is intentional — the V2 system is designed for aggregate multi-round analysis, while round reviews analyze a single round.

---

## 2. Bugs (Produce Incorrect Data)

### BUG-1: Miss Direction Double-Counting

**Location:** `round-review-system.ts:539-540`
```typescript
const leftMisses = driveMisses.filter(h => h.driveMiss?.includes('left')).length;
const rightMisses = driveMisses.filter(h => h.driveMiss?.includes('right')).length;
```

**Problem:** Uses `.includes()` string matching. If `miss_direction` contains compound values like `"left_short"` or `"short_left"`, both `left` and `short` would match separate filters. Same issue on approach misses (line 545-546).

**Impact:** Miss pattern percentages can exceed 100% in aggregate. In the round review, `dominantMiss` comparison (line 541) could pick the wrong direction.

**Fix:** Use exact match or starts-with logic:
```typescript
const leftMisses = driveMisses.filter(h =>
  h.driveMiss === 'left' || h.driveMiss?.startsWith('left_')
).length;
```

**Also affects:** `golf-stats-calculator-shots.ts` lines 1359-1362 and 1467-1474 (same `.includes()` pattern on putt miss directions).

---

### BUG-2: GIR Detection Uses `lie_after` Only (Misses Some Greens)

**Location:** `round-review-system.ts:352-358`
```typescript
for (let i = 0; i < holeShots.length; i++) {
  const s = holeShots[i]!;
  if (s.lie_after === 'green' || s.result === 'hole') {
    greenReachedAt = i + 1;
    break;
  }
}
```

**Problem:** Only checks `lie_after === 'green'` or `result === 'hole'`. Does NOT check `result === 'green'` or `result === 'gir'`. The main stats calculator (`golf-stats-calculator-shots.ts`) uses a separate `isGreenHit()` function that checks three result values: `'green'`, `'gir'`, `'hole'`.

**Impact:** If shot data has `result='green'` but `lie_after` is null (data entry inconsistency), the round review marks GIR as false while the aggregate stats mark it as true. This causes **disagreement between round review GIR% and dashboard GIR%**.

**Fix:** Add result checks to match the main calculator:
```typescript
if (s.lie_after === 'green' || s.result === 'hole' ||
    s.result === 'green' || s.result === 'gir') {
```

---

### BUG-3: Score Estimation Clamp Can Override Ground Truth

**Location:** `round-review-system.ts:330-342`
```typescript
// Incomplete hole data — estimate remaining shots
const onGreen = lastShot?.lie_after === 'green';
if (onGreen) {
  score = holeShots.length + 2;  // assume 2-putt
} else {
  score = holeShots.length + 3;  // assume chip + 2-putt
}
// Clamp to reasonable range
score = Math.max(par - 2, Math.min(par + 6, score));
```

**Problem:** The clamp of `par + 6` means a quintuple bogey (par + 5) or worse gets capped. While the cross-reference code (lines 399-429) later adjusts to match `round.total_score`, the adjustment distributes evenly across ALL incomplete holes. If one hole had a 10 on a par 4 (+6) but shot data is incomplete, the system would cap it at par+6=10, which works. But if two holes are incomplete and one was actually a par, the adjustment would incorrectly shift the par hole's score.

**Impact:** On rounds with multiple incomplete holes, score distribution can be wrong even though the total is correct.

**Fix:** Use `round.total_score` as constraint but prioritize holes with more shot data (more shots recorded = higher confidence in that hole's score).

---

## 3. Accuracy Weaknesses

### WEAK-1: Fairway Hit Detection Is Approximate

**Location:** `round-review-system.ts:346`
```typescript
const fairwayHit = par >= 4 && teeShot ? (teeShot.lie_after === 'fairway') : null;
```

**Issue:** Only checks `lie_after === 'fairway'` from the tee shot. If `lie_after` is null but the player hit the fairway, it's counted as null (excluded from calculation). The round-level `total_fairways_hit` (line 518) is preferred as ground truth, but the hole-by-hole breakdown used for miss pattern analysis still relies on shot data.

**Impact:** Drive miss pattern analysis (left vs right) is only as good as the `lie_after` field population rate. If 30% of tee shots lack `lie_after`, the miss pattern is computed from 70% of the data — potentially biased.

**Mitigation:** The system already prefers round-level totals for the aggregate fairway stat. The hole-level gap mainly affects the miss direction breakdown.

---

### WEAK-2: First Putt Distance Uses `putt_distance_feet` (Not `distance_to_hole_before`)

**Location:** `round-review-system.ts:375`
```typescript
const firstPuttFeet = firstPutt?.putt_distance_feet ? parseFloat(firstPutt.putt_distance_feet) : null;
```

**Issue:** Uses `putt_distance_feet` field which may differ from `distance_to_hole_before` with `distance_unit_before='feet'`. Per memory notes, these should match for first putts, but if they don't (data entry discrepancy), putting distance breakdowns would use the wrong value.

**Impact:** LOW — this is correct field usage per schema design. But no validation that the two fields agree.

---

### WEAK-3: Strokes-to-Gain Calculation Is Simplistic

**Location:** `round-review-system.ts:660-698`

The round review's `strokesToGain` uses simple heuristics:
- Three-putts: 1 stroke each (assumes all three-putts become two-putts)
- Penalties: raw count (reasonable)
- Scrambling: `missedScrambles * 0.5` (assumes 50% conversion rate)
- GIR: `additionalGIRs * 0.5` (assumes each extra GIR saves 0.5 strokes)

**Issue:** These multipliers are hardcoded estimates, not derived from the player's actual data. A player with great putting who three-putts from 50ft might only save 0.3 strokes per eliminated three-putt (since they'd still two-putt from 50ft). Meanwhile, a player three-putting from 15ft saves closer to 0.8 strokes.

**Impact:** MEDIUM — the ranking of improvement areas is approximately correct but the specific stroke numbers are ±30% off.

**Enhancement:** Use the player's actual putt make rates by distance to calculate realistic save potential.

---

### WEAK-4: Scramble "From" Classification Is Limited

**Location:** `round-review-system.ts:637-641`
```typescript
const upAndDownDetails = scrambleAttemptsList.map(h => ({
  hole: h.hole,
  success: h.scrambleSuccess,
  from: h.sandSaveAttempt ? 'sand' : h.approachMiss ? `missed ${h.approachMiss}` : 'rough/fringe',
}));
```

**Issue:** Only distinguishes sand vs approach miss direction vs generic "rough/fringe". Doesn't capture:
- Actual lie (rough, fringe, fairway bunker)
- Distance from green
- Whether chip was uphill/downhill

**Impact:** LOW for current UI (scramble details aren't shown yet), but limits future short game analysis quality.

---

## 4. Enhancement Opportunities

### ENHANCE-1: Display Hidden Data (High Impact, Low Effort)

The `RoundReviewContent` object contains rich data that the UI doesn't render:

| Data Field | What It Contains | Display Suggestion |
|---|---|---|
| `frontBackSplit` | Score, putts, GIR, fairways for each 9 | Side-by-side comparison card |
| `momentumData` | Cumulative score-to-par per hole | Line chart showing momentum swings |
| `puttingBreakdown.ranges` | Make % by distance bucket (0-5, 5-15, 15-25, 25+) | Bar chart with make rates |
| `drivingAnalysis.longestDrive` | Longest drive distance + hole | Highlight stat |
| `drivingAnalysis.missPattern` | Left/right miss counts | Pie or bar chart |
| `penaltyAnalysis.holes` | Which holes had penalties + count | Penalty markers on scorecard |
| `strokesToGain` | Ranked improvement opportunities with stroke values | Priority list card |
| `shortGameAnalysis.upAndDownDetails` | Per-hole scramble attempts with lie context | Expandable scramble timeline |

**Business Value:** All this data is already computed and stored. Displaying it transforms the review from a text summary into a data-rich coaching tool. This is the highest-ROI enhancement.

---

### ENHANCE-2: Visual Scorecard with Color-Coded Holes

**Current:** Hole-by-hole data exists in `holeByHole[]` but is shown only in the ShotByShot component (different section).

**Proposed:** Add a compact 18-hole scorecard grid at the top of the review:
- Each hole shows: hole number, par, score, score-to-par
- Color coding: Eagle (gold), Birdie (green), Par (gray), Bogey (orange), Double+ (red)
- Icons for: three-putt, one-putt, penalty, sand save, scramble
- Tap to expand any hole for shot-by-shot detail

**Business Value:** Coaches glance at the scorecard first — this is the most natural entry point for round review.

---

### ENHANCE-3: Player-Relative Benchmarks Instead of Fixed Thresholds

**Current grading (line 455-483):**
```typescript
// Hardcoded thresholds
const girVal = girPct >= 70 ? 5 : girPct >= 60 ? 4 : girPct >= 50 ? 3 : ...
const puttVal = putts <= 28 ? 5 : putts <= 30 ? 4 : putts <= 32 ? 3 : ...
```

**Problem:** A high school player shooting 82 with 33 putts gets a "D" for putting, but 33 putts might be their best round ever. The grading doesn't account for player skill level.

**Proposed:** Use `playerAvgs` (already passed to `generateReviewContent`) to set dynamic thresholds:
- "Above average" = better than player's 20-round average by > 10%
- "Below average" = worse by > 10%
- Grade relative to player's own history, not fixed college benchmarks

The `cmp()` helper (line 735-740) already does this for keyStats but uses fixed thresholds for the overall grade.

**Business Value:** Makes reviews feel personalized. A player improving from 36 putts to 33 should get positive feedback, not a generic "C" grade.

---

### ENHANCE-4: Connect Round Review to V2 Orchestrator Insights

**Current:** Round reviews are standalone. The V2 orchestrator generates aggregate insights (multi-round trends, strokes gained breakdown, root cause analysis) but these aren't linked to individual rounds.

**Proposed:** After generating the round review, fetch the player's latest V2 insights and surface contextual connections:
- "This is your 3rd consecutive round with GIR below 50% — see your CoachHelm analysis for approach shot drills"
- "Your putting was 4 strokes better than your 10-round average — the lag putting work is paying off"
- "You lost 2.3 strokes to penalties this round vs your average of 0.8 — course management is flagged as a focus area"

**Business Value:** Connects single-round observations to multi-round patterns. Makes the AI feel like it "remembers" the player's history.

---

### ENHANCE-5: Smarter Strokes-to-Gain with Actual Player Data

**Current approach:** Hardcoded multipliers (three-putt = 1 stroke, scramble = 0.5 strokes).

**Proposed approach:** Calculate from actual data:

```
Three-putt savings = SUM(actual_putt_count - expected_2putt_count) for three-putt holes
  where expected_2putt_count uses player's distance-based make rates

Scramble savings = missed_scrambles * (target_scramble_rate - current_scramble_rate) * avg_strokes_saved_per_scramble

GIR savings = additional_GIRs_at_target * (avg_non_GIR_score - avg_GIR_score)
```

The stats calculator already computes:
- `puttMakePct` by distance bucket (for realistic three-putt modeling)
- `scramblePct` (actual conversion rate)
- Scoring with/without GIR can be derived from hole data

**Business Value:** Turns generic "you could save 3 strokes" into precise "you left 2.7 strokes on the table — here's exactly where."

---

## 5. Aggregate Stats Calculator Issues (Affects Dashboard, Not Round Review Directly)

These issues live in `golf-stats-calculator-shots.ts` and affect the dashboard/CoachHelm but are included for completeness:

| Issue | Location | Severity | Description |
|---|---|---|---|
| Null → 0 conversion | `normalizeToYards()` | MEDIUM | Missing distances silently become 0 instead of null, could affect SG calculations |
| SG fallback estimates | Lines 536-550 | MEDIUM | Assumes 3ft putt miss / 20ft approach proximity when actual distance missing |
| SG per-round divides by total rounds, not rounds with SG data | Lines 1911-1914 | MEDIUM | Understates SG/round if some rounds lack distance data |
| Around-green 50y threshold | Line 433 | LOW | 50y from hole ≈ 20-30y from green edge; approximation varies by course |
| PGA Tour benchmarks for amateurs | SG benchmarks | LOW | SG calculated against PGA Tour expected strokes; all amateurs show negative SG |
| Miss direction double-counting | Lines 1359-1362, 1467-1474 | HIGH | Same `.includes()` bug as BUG-1 |

---

## 6. CoachHelm V2 Insight Generator Issues

These affect the aggregate multi-round analysis, not individual round reviews:

| Issue | Severity | Description |
|---|---|---|
| **Confidence inflation** | MEDIUM | 10 rounds = 0.9 confidence (should be ~0.75 for high-leverage claims) |
| **Fixed college benchmarks** | MEDIUM | Benchmarks don't adjust for player skill level |
| **Root cause assumes causation** | LOW | "Your scoring issues trace back to the tee" stated as fact, not hypothesis |
| **Insight priority = stroke impact only** | LOW | Doesn't weight by actionability (easy fix > hard fix at same impact) |
| **Missing insight categories** | MEDIUM | No front/back split analysis, hole-specific patterns, recovery rate, weather correlation |
| **Sample minimums inconsistent** | LOW | Approach miss patterns fire at 20 misses; driving at 10 — should be 30+ and 15+ |

---

## 7. Action Plan

### Phase 1: Bug Fixes (1-2 days)

| # | Task | File | Impact |
|---|---|---|---|
| 1.1 | Fix miss direction double-counting with exact matching | `round-review-system.ts`, `golf-stats-calculator-shots.ts` | Corrects miss pattern percentages |
| 1.2 | Add `result === 'green'` and `result === 'gir'` to GIR detection | `round-review-system.ts:352-358` | Aligns round review GIR with dashboard GIR |
| 1.3 | Improve score estimation for multi-incomplete-hole rounds | `round-review-system.ts:330-342` | Better score distribution across holes |

### Phase 2: Display Hidden Data (2-3 days)

| # | Task | Component | Impact |
|---|---|---|---|
| 2.1 | Add visual scorecard with color-coded holes | New component in round review | Most impactful UI addition |
| 2.2 | Show front 9 / back 9 split comparison | New card in round review | Shows momentum and fatigue |
| 2.3 | Add putting distance breakdown chart | New card in round review | Key coaching metric |
| 2.4 | Display strokes-to-gain priority ranking | New card in round review | Actionable improvement focus |
| 2.5 | Show momentum line chart (cumulative score-to-par) | New chart in round review | Shows round narrative visually |
| 2.6 | Add penalty breakdown with hole markers | Enhancement to review | Penalty awareness |

### Phase 3: Accuracy Improvements (2-3 days)

| # | Task | File | Impact |
|---|---|---|---|
| 3.1 | Player-relative grading (vs player average, not fixed benchmarks) | `round-review-system.ts` | Personalized, meaningful grades |
| 3.2 | Smarter strokes-to-gain using actual player make rates | `round-review-system.ts` | Precise improvement targets |
| 3.3 | Add confidence qualifier to causal claims in V2 insights | `stats-insight-generator.ts` | Honest communication |
| 3.4 | Increase sample minimums for approach/driving patterns | `stats-insight-generator.ts` | Fewer false pattern claims |

### Phase 4: Deep Enhancements (3-5 days)

| # | Task | Impact |
|---|---|---|
| 4.1 | Connect round review to V2 orchestrator insights (cross-reference trends) | Transforms isolated review into connected coaching narrative |
| 4.2 | Add hole-specific pattern detection (struggling on same holes across rounds) | Identifies course management vs skill issues |
| 4.3 | Implement front/back 9 trend analysis across rounds | Detects fatigue, warm-up patterns, mental game |
| 4.4 | Add recovery rate metric (performance after double+) | Mental game coaching opportunity |
| 4.5 | Tier V2 confidence properly (3-5 rounds: 0.55, 6-10: 0.70, 11-20: 0.85, 20+: 0.95) | Honest confidence communication |

---

## 8. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    DATA SOURCES                          │
├─────────────────────────────────────────────────────────┤
│  golf_rounds    │  golf_holes      │  golf_shots        │
│  (totals)       │  (par, score)    │  (shot-by-shot)    │
│  Ground truth   │  Validation      │  Detail source     │
└───────┬─────────┴────────┬─────────┴─────────┬──────────┘
        │                  │                   │
        ▼                  ▼                   ▼
┌─────────────────────────────────────────────────────────┐
│              buildHoleBreakdowns()                        │
│  Merges shots + holes + rounds into HoleBreakdown[]      │
│                                                          │
│  Priority: golf_holes.score > shot count > estimation    │
│  Cross-ref: adjusts incomplete holes to match total_score│
│                                                          │
│  ⚠️ BUG-2: GIR check missing result='green'/'gir'       │
│  ⚠️ BUG-3: Score clamp distributes evenly, not by data  │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│             generateReviewContent()                      │
│                                                          │
│  Computes from HoleBreakdown[]:                          │
│  ├── Scoring distribution (eagle → double+)              │
│  ├── Front/back split                                    │
│  ├── Momentum data (cumulative score-to-par)             │
│  ├── Putting breakdown (4 distance buckets)              │
│  ├── Driving analysis (distance, miss pattern)           │
│  ├── Short game (scramble, sand save details)            │
│  ├── Penalty analysis                                    │
│  ├── Strokes-to-gain priority list                       │
│  ├── Highlights & areas for improvement                  │
│  ├── Key stats with player-average comparison            │
│  ├── Overall grade (A-F) & sentiment                     │
│  └── Summary narrative                                   │
│                                                          │
│  ⚠️ BUG-1: Miss direction .includes() double-counting   │
│  ⚠️ WEAK-3: Strokes-to-gain uses hardcoded multipliers  │
│  ⚠️ WEAK-4: Limited scramble "from" classification       │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              golf_round_reviews table                     │
│                                                          │
│  Stores: summary, highlights, areas_to_review,           │
│          round_stats (full RoundReviewContent as JSON)    │
│                                                          │
│  Regenerable: review can be regenerated anytime           │
│  Shareable: shared_with_coach, coach_notes               │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              RoundReviewDisplay (UI)                      │
│                                                          │
│  SHOWS:                        HIDDEN (data exists):     │
│  ├── Grade & sentiment         ├── frontBackSplit        │
│  ├── Summary narrative         ├── momentumData          │
│  ├── Highlights (expandable)   ├── puttingBreakdown      │
│  ├── Areas for improvement     ├── drivingAnalysis       │
│  ├── Key stats (vs avg)        │   .longestDrive         │
│  ├── Recommendations           │   .missPattern          │
│  └── Stats comparison bars     ├── penaltyAnalysis       │
│                                ├── strokesToGain         │
│                                └── upAndDownDetails      │
└─────────────────────────────────────────────────────────┘
```

---

## 9. Grading Logic Deep Dive

Current grading formula (`determineGrade`, line 455):

```
Weighted average of:
  Score-to-par (weight: 2x)
    ≤-3 → 5, ≤-1 → 4, ≤1 → 3.5, ≤3 → 3, ≤5 → 2, >5 → 1

  GIR % (weight: 1x)
    ≥70% → 5, ≥60% → 4, ≥50% → 3, ≥40% → 2, <40% → 1

  Fairway % (weight: 1x, optional)
    ≥70% → 5, ≥60% → 4, ≥50% → 3, ≥40% → 2, <40% → 1

  Total putts (weight: 1x)
    ≤28 → 5, ≤30 → 4, ≤32 → 3, ≤34 → 2, >34 → 1

Grade thresholds:
  ≥4.2 → A, ≥3.5 → B, ≥2.5 → C, ≥1.5 → D, <1.5 → F
```

**Issue:** All thresholds are fixed regardless of player level. The grade should be computed relative to the player's own recent performance, with fixed benchmarks as a secondary context layer.

**Proposed enhancement:**
```
For each stat, grade = f(round_value, player_20round_avg, direction):
  > avg + 15% = 5 (exceptional for this player)
  > avg + 5%  = 4 (above their norm)
  within ±5%  = 3 (typical)
  < avg - 5%  = 2 (below their norm)
  < avg - 15% = 1 (significantly off)

Then contextual note: "B grade for your level — this would be C vs D1 average"
```

---

## 10. Key Stats Comparison Logic

The `cmp()` function (line 735) determines "above"/"below"/"average" tags:

```typescript
const cmp = (val, avg, better): StatComparison => {
  if (!avg) return 'average';
  const diff = val - avg;
  if (better === 'lower') return diff < -1 ? 'above' : diff > 1 ? 'below' : 'average';
  return diff > 1 ? 'above' : diff < -1 ? 'below' : 'average';
};
```

**Issue:** Uses absolute threshold of 1 for all stats. But:
- 1 putt difference (31 vs 32) is noise
- 1% GIR difference (55% vs 56%) is noise
- 1 fairway difference matters more than 1% GIR

**Proposed:** Use percentage-based thresholds appropriate to each stat:
- Putts: ±2 from average
- GIR%: ±5% from average
- Fairway%: ±5% from average
- Scrambling%: ±10% from average (high variance stat)

---

## Appendix: File Reference

| File | Purpose | Lines |
|---|---|---|
| `src/app/golf/actions/round-review-system.ts` | Core round review engine | ~900 |
| `src/lib/utils/golf-stats-calculator-shots.ts` | Aggregate stats from shots | ~1900 |
| `src/lib/coachhelm/v2/mining/stats-insight-generator.ts` | Multi-round insight mining | ~1600 |
| `src/lib/coachhelm/v2/orchestrator.ts` | V2 intelligence orchestrator | ~1500 |
| `src/app/golf/actions/shot-analytics.ts` | Shot pattern aggregation | ~800 |
| `src/app/golf/actions/stats-data.ts` | Stats data fetching layer | ~400 |
| `src/app/golf/actions/round-reviews.ts` | V1 review actions (deprecated) | ~1300 |
