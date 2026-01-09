# Golf Stats Calculations Reference

> Complete documentation of how every statistic is calculated in the Helm Golf shot tracking system.
>
> **Source:** `src/lib/utils/golf-stats-calculator-shots.ts`

---

## Table of Contents

1. [General Stats](#1-general-stats)
2. [Scoring Stats](#2-scoring-stats)
3. [Driving Stats](#3-driving-stats)
4. [GIR (Greens in Regulation)](#4-gir-greens-in-regulation)
5. [Putting Stats](#5-putting-stats)
6. [Approach Stats](#6-approach-stats)
7. [Scrambling & Short Game](#7-scrambling--short-game)
8. [Around The Green (ATG)](#8-around-the-green-atg)
9. [Sand Saves](#9-sand-saves)
10. [Penalties](#10-penalties)
11. [Strokes Gained](#11-strokes-gained)

---

## Helper Functions

```typescript
// Safe percentage calculation (returns null if no data)
safePercent(made, attempts) = (made / attempts) * 100  // rounded to 1 decimal

// Safe average calculation (returns null if no data)
safeAverage(total, count) = total / count  // rounded to 2 decimals

// Distance normalization
normalizeToYards(distance, unit) = unit === 'feet' ? distance / 3 : distance
normalizeToFeet(distance, unit) = unit === 'yards' ? distance * 3 : distance
```

---

## 1. General Stats

| Stat | Calculation |
|------|-------------|
| `roundsPlayed` | Count of rounds in dataset |
| `holesPlayed` | Sum of holes across all rounds |

---

## 2. Scoring Stats

### Basic Scoring

| Stat | Calculation |
|------|-------------|
| `scoringAverage` | `sum(roundScores) / roundsPlayed` |
| `bestRound` | `min(roundScores)` |
| `worstRound` | `max(roundScores)` |

### Score Type Counts

| Stat | Calculation |
|------|-------------|
| `totalEagles` | Count where `score - par <= -2` |
| `totalBirdies` | Count where `score - par == -1` |
| `totalPars` | Count where `score - par == 0` |
| `totalBogeys` | Count where `score - par == 1` |
| `totalDoublePlus` | Count where `score - par >= 2` |

### Per-Round Averages

| Stat | Calculation |
|------|-------------|
| `birdiesPerRound` | `totalBirdies / roundsPlayed` |
| `eaglesPerRound` | `totalEagles / roundsPlayed` |
| `parsPerRound` | `totalPars / roundsPlayed` |
| `bogeysPerRound` | `totalBogeys / roundsPlayed` |
| `doublePlusPerRound` | `totalDoublePlus / roundsPlayed` |

### By Round Type

| Stat | Calculation |
|------|-------------|
| `practiceScoringAvg` | Average score for `round_type == 'practice'` |
| `qualifyingScoringAvg` | Average score for `round_type == 'qualifying'` |
| `tournamentScoringAvg` | Average score for `round_type == 'tournament'` |

### Streaks

| Stat | Calculation |
|------|-------------|
| `mostBirdiesRound` | Max birdies in a single round |
| `mostBirdiesRow` | Max consecutive holes with birdie |
| `mostParsRow` | Max consecutive holes with par |
| `currentNo3PuttStreak` | Current streak of holes without 3-putt |
| `longestNo3PuttStreak` | Longest streak of holes without 3-putt |

---

## 3. Driving Stats

### Distance

| Stat | Calculation |
|------|-------------|
| `drivingDistanceAvg` | `avg(all_tee_shot_distances)` in yards |
| `drivingDistanceDriverOnly` | `avg(tee_shot_distances where club_type == 'driver')` |

### Fairway Accuracy

| Stat | Calculation |
|------|-------------|
| `fairwaysHit` | Count where `tee_shot.result == 'fairway'` |
| `fairwayOpportunities` | Count of Par 4/5 holes (where fairway is in play) |
| `fairwayPercentage` | `(fairwaysHit / fairwayOpportunities) * 100` |
| `fairwayPctPar4` | Fairway % on Par 4 holes only |
| `fairwayPctPar5` | Fairway % on Par 5 holes only |
| `fairwayPctDriver` | Fairway % when using driver |
| `fairwayPctNonDriver` | Fairway % when using non-driver |
| `fairwaysHitPerRound` | `fairwaysHit / roundsPlayed` |

### Miss Direction (Tee Shots)

| Stat | Calculation |
|------|-------------|
| `missLeftCount` | Count where `miss_direction` contains 'left' |
| `missRightCount` | Count where `miss_direction` contains 'right' |
| `missLeftPct` | `(missLeftCount / totalMisses) * 100` |
| `missRightPct` | `(missRightCount / totalMisses) * 100` |

---

## 4. GIR (Greens in Regulation)

### Definition
**Green in Regulation** = Shot that lands on green has `shot_number <= (par - 2)`

- Par 3: Must hit green on 1st shot
- Par 4: Must hit green by 2nd shot
- Par 5: Must hit green by 3rd shot

### Basic GIR

| Stat | Calculation |
|------|-------------|
| `girTotal` | Count of holes where GIR was achieved |
| `girOpportunities` | Total holes played |
| `girPercentage` | `(girTotal / girOpportunities) * 100` |
| `girPerRound` | `girTotal / roundsPlayed` |

### GIR by Par

| Stat | Calculation |
|------|-------------|
| `girPctPar3` | GIR % on Par 3 holes |
| `girPctPar4` | GIR % on Par 4 holes |
| `girPctPar5` | GIR % on Par 5 holes |

### GIR by Approach Distance (yards)

| Stat | Distance Range | Calculation |
|------|----------------|-------------|
| `girPct50_75` | 50-74 yards | GIR % from this distance |
| `girPct75_100` | 75-99 yards | GIR % from this distance |
| `girPct100_125` | 100-124 yards | GIR % from this distance |
| `girPct125_150` | 125-149 yards | GIR % from this distance |
| `girPct150_175` | 150-174 yards | GIR % from this distance |
| `girPct175_200` | 175-199 yards | GIR % from this distance |
| `girPct200_225` | 200-224 yards | GIR % from this distance |
| `girPct225Plus` | 225+ yards | GIR % from this distance |

### GIR by Lie

| Stat | Calculation |
|------|-------------|
| `girPctFromFairway` | GIR % when approach was from fairway |
| `girPctFromRough` | GIR % when approach was from rough |
| `girPctFromSand` | GIR % when approach was from sand |

---

## 5. Putting Stats

### Basic Putting

| Stat | Calculation |
|------|-------------|
| `totalPutts` | Count of all shots where `shot_type == 'putting'` |
| `puttsPerRound` | `totalPutts / roundsPlayed` |
| `puttsPerHole` | `totalPutts / holesPlayed` |
| `puttsPerGir` | `puttsOnGirHoles / girTotal` |
| `threePuttsTotal` | Count of holes with 3+ putts |
| `threePuttsPerRound` | `threePuttsTotal / roundsPlayed` |
| `onePuttsTotal` | Count of holes with exactly 1 putt |

### Putt Make Percentage by Distance (feet)

| Stat | Distance Range | Calculation |
|------|----------------|-------------|
| `puttMakePct0_3` | 0-3 ft | `(made / attempts) * 100` |
| `puttMakePct3_5` | 3-5 ft | `(made / attempts) * 100` |
| `puttMakePct5_10` | 5-10 ft | `(made / attempts) * 100` |
| `puttMakePct10_15` | 10-15 ft | `(made / attempts) * 100` |
| `puttMakePct15_20` | 15-20 ft | `(made / attempts) * 100` |
| `puttMakePct20_25` | 20-25 ft | `(made / attempts) * 100` |
| `puttMakePct25_30` | 25-30 ft | `(made / attempts) * 100` |
| `puttMakePct30_35` | 30-35 ft | `(made / attempts) * 100` |
| `puttMakePct35Plus` | 35+ ft | `(made / attempts) * 100` |

**"Made"** = First putt goes in (1 putt on hole)

### Putt Proximity (Leave Distance after First Putt)

| Stat | Starting Distance | Calculation |
|------|-------------------|-------------|
| `puttProximity0_5` | 0-5 ft | Avg distance left after missed first putt |
| `puttProximity5_10` | 5-10 ft | Avg distance left after missed first putt |
| `puttProximity10_15` | 10-15 ft | Avg distance left after missed first putt |
| `puttProximity15_20` | 15-20 ft | Avg distance left after missed first putt |
| `puttProximity20Plus` | 20+ ft | Avg distance left after missed first putt |

### Putt Efficiency (Average Putts to Hole Out)

| Stat | Starting Distance | Calculation |
|------|-------------------|-------------|
| `puttEff0_5` | 0-3 ft | Avg total putts from this distance |
| `puttEff5_10` | 5-10 ft | Avg total putts from this distance |
| `puttEff10_15` | 10-15 ft | Avg total putts from this distance |
| `puttEff15_20` | 15-20 ft | Avg total putts from this distance |
| `puttEff20_25` | 20-25 ft | Avg total putts from this distance |
| `puttEff25_30` | 25-30 ft | Avg total putts from this distance |
| `puttEff30_35` | 30-35 ft | Avg total putts from this distance |
| `puttEff35Plus` | 35+ ft | Avg total putts from this distance |

### Putt Miss Direction

| Stat | Meaning | Calculation |
|------|---------|-------------|
| `puttMissLeftPct` | Missed left | % of misses with `miss_direction` containing 'left' |
| `puttMissRightPct` | Missed right | % of misses with `miss_direction` containing 'right' |
| `puttMissShortPct` | Left short | % of misses with `miss_direction` containing 'short' |
| `puttMissLongPct` | Hit too hard | % of misses with `miss_direction` containing 'long' |
| `puttMissLowPct` | Under-read break | % of misses with `miss_direction == 'low'` |
| `puttMissHighPct` | Over-read break | % of misses with `miss_direction == 'high'` |

### Putting Stats by Break Type

For each break type (`left_to_right`, `right_to_left`, `straight`, `multiple`):

```typescript
puttingByBreak[breakType] = {
  totalPutts: number,
  makePct0_3: number,    // Make % from 0-3 ft
  makePct3_5: number,    // Make % from 3-5 ft
  // ... etc for each distance bucket
  makePct35Plus: number,
  overallMakePct: number, // Overall make % for this break type
  missShortPct: number,   // % misses that were short
  missLowPct: number,     // % misses that under-read
  missHighPct: number,    // % misses that over-read
}
```

---

## 6. Approach Stats

### Approach Proximity (Distance to Hole After Approach)

| Stat | Calculation |
|------|-------------|
| `approachProximityAvg` | Avg distance to hole after ALL approach shots (feet) |
| `approachProximityWhenHitGreen` | Avg proximity when approach landed on green |
| `approachProximityWhenMissedGreen` | Avg proximity when approach missed green |

### Proximity by Par

| Stat | Calculation |
|------|-------------|
| `approachProximityPar3` | Avg proximity on Par 3 holes |
| `approachProximityPar4` | Avg proximity on Par 4 holes |
| `approachProximityPar5` | Avg proximity on Par 5 holes |

### Proximity by Lie

| Stat | Calculation |
|------|-------------|
| `approachProximityFairway` | Avg proximity from fairway lies |
| `approachProximityRough` | Avg proximity from rough lies |
| `approachProximitySand` | Avg proximity from sand lies |

### Proximity by Distance (yards)

| Stat | Distance Range | Calculation |
|------|----------------|-------------|
| `approachProx30_75` | 30-75 yards | Avg proximity (feet) |
| `approachProx75_100` | 75-100 yards | Avg proximity (feet) |
| `approachProx100_125` | 100-125 yards | Avg proximity (feet) |
| `approachProx125_150` | 125-150 yards | Avg proximity (feet) |
| `approachProx150_175` | 150-175 yards | Avg proximity (feet) |
| `approachProx175_200` | 175-200 yards | Avg proximity (feet) |
| `approachProx200_225` | 200-225 yards | Avg proximity (feet) |
| `approachProx225Plus` | 225+ yards | Avg proximity (feet) |

### Approach Efficiency (Strokes to Hole Out by Distance + Lie)

For each distance bucket, tracks average strokes to hole out by lie:

```typescript
approachEff{Distance}: {
  fairway: number | null,  // Avg strokes from fairway
  rough: number | null,    // Avg strokes from rough
  sand: number | null,     // Avg strokes from sand
}
```

Distance buckets: `30_75`, `75_100`, `100_125`, `125_150`, `150_175`, `175_200`, `200_225`, `225Plus`

---

## 7. Scrambling & Short Game

### Definition
**Scramble** = Missed GIR but still made par or better

| Stat | Calculation |
|------|-------------|
| `scrambleAttempts` | Count of missed GIRs |
| `scramblesMade` | Count where `!GIR && score <= par` |
| `scramblingPercentage` | `(scramblesMade / scrambleAttempts) * 100` |

### Scrambling by Lie

| Stat | Calculation |
|------|-------------|
| `scramblingPctFairway` | Scramble % when around green lie was fairway |
| `scramblingPctRough` | Scramble % when around green lie was rough |
| `scramblingPctSand` | Scramble % when around green lie was sand |

### Scrambling by Distance (yards from hole)

| Stat | Distance | Calculation |
|------|----------|-------------|
| `scramblingPct0_10` | 0-10 yards | Scramble % from this distance |
| `scramblingPct10_20` | 10-20 yards | Scramble % from this distance |
| `scramblingPct20_30` | 20-30 yards | Scramble % from this distance |

---

## 8. Around The Green (ATG)

### Definition
**Around The Green** = Shots from within 30 yards of the hole

### ATG Efficiency (Average Strokes to Hole Out)

| Stat | Calculation |
|------|-------------|
| `atgEfficiencyAvg` | Avg strokes to hole out from within 30 yards |

### ATG Efficiency by Distance

| Stat | Distance | Calculation |
|------|----------|-------------|
| `atgEfficiency0_10` | 0-10 yards | Avg strokes to hole out |
| `atgEfficiency10_20` | 10-20 yards | Avg strokes to hole out |
| `atgEfficiency20_30` | 20-30 yards | Avg strokes to hole out |

### ATG Efficiency by Lie

| Stat | Calculation |
|------|-------------|
| `atgEffFairway` | Avg strokes from fairway within 30 yards |
| `atgEffRough` | Avg strokes from rough within 30 yards |
| `atgEffSand` | Avg strokes from sand within 30 yards |

### ATG Efficiency by Distance + Lie

```typescript
atgEffByDistanceLie = {
  '0_10':  { fairway: number, rough: number, sand: number },
  '10_20': { fairway: number, rough: number, sand: number },
  '20_30': { fairway: number, rough: number, sand: number },
}
```

---

## 9. Sand Saves

### Definition
**Sand Save** = Missed GIR from sand (bunker), but made par or better

| Stat | Calculation |
|------|-------------|
| `sandSaveAttempts` | Count where `!GIR && lastLieBeforeGreen == 'sand'` |
| `sandSavesMade` | Count where `sandSaveAttempt && score <= par` |
| `sandSavePercentage` | `(sandSavesMade / sandSaveAttempts) * 100` |

---

## 10. Penalties

| Stat | Calculation |
|------|-------------|
| `totalPenalties` | Count of shots where `is_penalty == true` |
| `penaltiesPerRound` | `totalPenalties / roundsPlayed` |

---

## 11. Strokes Gained

### Formula
```
Strokes Gained = Expected_Before - (1 + Expected_After)
```

Where:
- **Expected_Before** = PGA Tour average strokes to hole out from starting position
- **Expected_After** = PGA Tour average strokes from ending position (0 if holed)

### PGA Tour Benchmarks

#### From Tee (by hole yardage)
| Distance | Expected Strokes |
|----------|------------------|
| 400 yards | 4.08 |
| 425 yards | 4.17 |
| 450 yards | 4.27 |
| 475 yards | 4.37 |
| 500 yards | 4.47 |
| 525 yards | 4.57 |
| 550 yards | 4.68 |
| 575 yards | 4.79 |
| 600 yards | 4.91 |

#### From Fairway
| Distance | Expected Strokes |
|----------|------------------|
| 50 yards | 2.59 |
| 75 yards | 2.70 |
| 100 yards | 2.80 |
| 125 yards | 2.90 |
| 150 yards | 2.99 |
| 175 yards | 3.08 |
| 200 yards | 3.19 |
| 225 yards | 3.32 |
| 250 yards | 3.45 |
| 275 yards | 3.58 |

#### From Rough
| Distance | Expected Strokes |
|----------|------------------|
| 50 yards | 2.76 |
| 75 yards | 2.86 |
| 100 yards | 2.95 |
| 125 yards | 3.05 |
| 150 yards | 3.15 |
| 175 yards | 3.26 |
| 200 yards | 3.39 |
| 225 yards | 3.53 |
| 250 yards | 3.68 |
| 275 yards | 3.84 |

#### From Sand
| Distance | Expected Strokes |
|----------|------------------|
| 20 yards | 2.53 |
| 30 yards | 2.60 |
| 40 yards | 2.73 |
| 50 yards | 2.90 |
| 75 yards | 3.20 |
| 100 yards | 3.40 |
| 125 yards | 3.60 |
| 150 yards | 3.80 |

#### From Green (Putting - by feet)
| Distance | Expected Strokes |
|----------|------------------|
| 1 ft | 1.00 |
| 2 ft | 1.01 |
| 3 ft | 1.04 |
| 4 ft | 1.13 |
| 5 ft | 1.23 |
| 6 ft | 1.34 |
| 7 ft | 1.42 |
| 8 ft | 1.50 |
| 9 ft | 1.56 |
| 10 ft | 1.61 |
| 15 ft | 1.78 |
| 20 ft | 1.87 |
| 25 ft | 1.94 |
| 30 ft | 1.99 |
| 40 ft | 2.06 |
| 50 ft | 2.12 |
| 60 ft | 2.18 |

#### Recovery (Trouble)
| Situation | Expected Strokes |
|-----------|------------------|
| Any recovery shot | 3.50 |

### Strokes Gained Categories

| Stat | Shot Types Included | Calculation |
|------|---------------------|-------------|
| `strokesGainedTee` | Tee shots | Sum of SG for all tee shots |
| `strokesGainedApproach` | Approach shots | Sum of SG for all approach shots |
| `strokesGainedAroundGreen` | Around the green | Sum of SG for all ATG shots |
| `strokesGainedPutting` | Putting | Sum of SG for all putts |
| `strokesGainedTotal` | All shots | Sum of all four categories |

### Per-Round Strokes Gained

| Stat | Calculation |
|------|-------------|
| `sgTeePerRound` | `strokesGainedTee / roundsPlayed` |
| `sgApproachPerRound` | `strokesGainedApproach / roundsPlayed` |
| `sgAroundGreenPerRound` | `strokesGainedAroundGreen / roundsPlayed` |
| `sgPuttingPerRound` | `strokesGainedPutting / roundsPlayed` |
| `sgTotalPerRound` | `strokesGainedTotal / roundsPlayed` |

---

## Interpreting Strokes Gained

- **Positive SG** = Better than PGA Tour average
- **Negative SG** = Worse than PGA Tour average
- **SG of 0** = Exactly PGA Tour average

### Example Calculation

**Scenario:** 150-yard approach from fairway, ball lands 20 feet from hole

```
Expected_Before (150 yards, fairway) = 2.99
Expected_After (20 feet, green) = 1.87

Strokes Gained = 2.99 - (1 + 1.87) = 2.99 - 2.87 = +0.12
```

**Interpretation:** This shot gained 0.12 strokes vs PGA Tour average - slightly better than average performance.

---

## Data Sources

- **Primary Table:** `golf_shots` (single source of truth)
- **Derived Table:** `golf_holes` (aggregated per-hole stats)
- **Putt Analysis:** `putt_details` (miss tags, break direction)
- **Approach Analysis:** `approach_miss_details` (miss direction, lie type)

---

**Last Updated:** 2026-01-09
**Source File:** `src/lib/utils/golf-stats-calculator-shots.ts` (1,693 lines)
