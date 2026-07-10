<!--
STATUS: SUPERSEDED
DATE: 2026-07-10
SUPERSEDED BY / WHY: Part of the pre-build docs/features/coachhelm/ implementation-guide package (untouched since 2026-01-14), superseded by the shipped V2 engine and its 2026-06 audits. Live reference: memory/context/coachhelm-ai.md.
KEPT FOR HISTORY -- do not delete this file.
-->

# CoachHelm V2 Intelligence Engine

## The Full Brain

---

## Philosophy

V1 was reactive: "Here's what happened."
V2 is predictive: "Here's what's about to happen, why, and what to do about it."

The goal: **Be smarter than any individual coach by learning from ALL coaches and ALL players, while still being personalized to each.**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COACHHELM V2 INTELLIGENCE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        DATA LAYER                                    │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │   │
│  │  │ Rounds  │ │ Holes   │ │ Shots   │ │ Events  │ │Qualifiers│       │   │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘       │   │
│  │       └───────────┴───────────┴───────────┴───────────┘             │   │
│  └─────────────────────────────────┬───────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────────────────────────▼───────────────────────────────────┐   │
│  │                     FEATURE EXTRACTION                               │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐           │   │
│  │  │ Temporal  │ │ Spatial   │ │ Sequence  │ │ Derived   │           │   │
│  │  │ Features  │ │ Features  │ │ Features  │ │ Metrics   │           │   │
│  │  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘           │   │
│  │        └─────────────┴─────────────┴─────────────┘                  │   │
│  └─────────────────────────────────┬───────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────────────────────────▼───────────────────────────────────┐   │
│  │                      INTELLIGENCE CORE                               │   │
│  │                                                                      │   │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │   │   PATTERN    │  │   CAUSAL     │  │  PREDICTIVE  │              │   │
│  │   │   MINER      │  │   ENGINE     │  │   ENGINE     │              │   │
│  │   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │   │
│  │          │                 │                 │                       │   │
│  │   ┌──────▼─────────────────▼─────────────────▼──────┐               │   │
│  │   │              REASONING ENGINE                    │               │   │
│  │   │  ┌─────────┐ ┌─────────┐ ┌─────────┐           │               │   │
│  │   │  │Abductive│ │Deductive│ │Inductive│           │               │   │
│  │   │  │Reasoning│ │Reasoning│ │Reasoning│           │               │   │
│  │   │  └─────────┘ └─────────┘ └─────────┘           │               │   │
│  │   └──────────────────────┬──────────────────────────┘               │   │
│  │                          │                                           │   │
│  │   ┌──────────────────────▼──────────────────────┐                   │   │
│  │   │           CONFIDENCE CALIBRATOR             │                   │   │
│  │   │   "How sure am I? What don't I know?"       │                   │   │
│  │   └──────────────────────┬──────────────────────┘                   │   │
│  │                          │                                           │   │
│  └──────────────────────────┼──────────────────────────────────────────┘   │
│                             │                                               │
│  ┌──────────────────────────▼──────────────────────────────────────────┐   │
│  │                    PERSONALIZATION LAYER                             │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │   │   COACH     │  │   PLAYER    │  │   TEAM      │                 │   │
│  │   │   MODEL     │  │   MODEL     │  │   MODEL     │                 │   │
│  │   └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └──────────────────────────┬──────────────────────────────────────────┘   │
│                             │                                               │
│  ┌──────────────────────────▼──────────────────────────────────────────┐   │
│  │                      OUTPUT LAYER                                    │   │
│  │   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │   │
│  │   │ Alerts  │ │ Focus   │ │ Reviews │ │Predictions│ │Summaries│      │   │
│  │   └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      LEARNING LAYER                                  │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │   │  FEEDBACK   │  │  BEHAVIOR   │  │  OUTCOME    │                 │   │
│  │   │  PROCESSOR  │  │  TRACKER    │  │  VALIDATOR  │                 │   │
│  │   └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# Part 1: Feature Extraction

Before intelligence, we need rich features from raw data.

## 1.1 Temporal Features

```typescript
// src/lib/coachhelm/v2/features/temporal.ts

export interface TemporalFeatures {
  // Time-based patterns
  dayOfWeek: number; // 0-6
  timeOfDay: 'morning' | 'midday' | 'afternoon';
  daysSinceLastRound: number;
  roundsInLast7Days: number;
  roundsInLast14Days: number;
  roundsInLast30Days: number;
  
  // Season position
  seasonWeek: number; // 1-52
  seasonPhase: 'early' | 'mid' | 'late' | 'championship';
  daysUntilNextEvent: number | null;
  daysAfterLastEvent: number | null;
  
  // Rhythm indicators
  playingFrequency: 'high' | 'normal' | 'low' | 'rusty';
  competitionDensity: number; // events per month recently
  restDays: number; // days since last competitive round
  
  // Momentum windows
  last3RoundsTrend: number; // slope
  last5RoundsTrend: number;
  last10RoundsTrend: number;
  volatility7Day: number; // standard deviation
  volatility30Day: number;
}

export function extractTemporalFeatures(
  playerId: string,
  asOfDate: Date
): TemporalFeatures {
  const rounds = getRoundsForPlayer(playerId, { before: asOfDate, limit: 30 });
  const events = getEventsForPlayer(playerId, { around: asOfDate });
  
  // Calculate days since last round
  const lastRound = rounds[0];
  const daysSinceLastRound = lastRound 
    ? daysBetween(new Date(lastRound.playedAt), asOfDate)
    : 999;
  
  // Calculate playing frequency
  const roundsLast14 = rounds.filter(r => 
    daysBetween(new Date(r.playedAt), asOfDate) <= 14
  ).length;
  
  let playingFrequency: TemporalFeatures['playingFrequency'];
  if (roundsLast14 >= 6) playingFrequency = 'high';
  else if (roundsLast14 >= 3) playingFrequency = 'normal';
  else if (roundsLast14 >= 1) playingFrequency = 'low';
  else playingFrequency = 'rusty';
  
  // Calculate trends (linear regression slope)
  const last3Scores = rounds.slice(0, 3).map(r => r.totalScore);
  const last5Scores = rounds.slice(0, 5).map(r => r.totalScore);
  const last10Scores = rounds.slice(0, 10).map(r => r.totalScore);
  
  return {
    dayOfWeek: asOfDate.getDay(),
    timeOfDay: getTimeOfDay(asOfDate),
    daysSinceLastRound,
    roundsInLast7Days: rounds.filter(r => daysBetween(new Date(r.playedAt), asOfDate) <= 7).length,
    roundsInLast14Days: roundsLast14,
    roundsInLast30Days: rounds.length,
    seasonWeek: getSeasonWeek(asOfDate),
    seasonPhase: getSeasonPhase(asOfDate),
    daysUntilNextEvent: events.next ? daysBetween(asOfDate, new Date(events.next.date)) : null,
    daysAfterLastEvent: events.last ? daysBetween(new Date(events.last.date), asOfDate) : null,
    playingFrequency,
    competitionDensity: calculateCompetitionDensity(events),
    restDays: calculateRestDays(rounds, asOfDate),
    last3RoundsTrend: calculateSlope(last3Scores),
    last5RoundsTrend: calculateSlope(last5Scores),
    last10RoundsTrend: calculateSlope(last10Scores),
    volatility7Day: standardDeviation(rounds.slice(0, 3).map(r => r.totalScore)),
    volatility30Day: standardDeviation(rounds.map(r => r.totalScore)),
  };
}
```

## 1.2 Sequence Features

```typescript
// src/lib/coachhelm/v2/features/sequence.ts

export interface SequenceFeatures {
  // Hole-to-hole momentum
  birdieFollowUp: {
    parRate: number;
    birdieRate: number;
    bogeyRate: number;
    sampleSize: number;
  };
  bogeyFollowUp: {
    parRate: number;
    birdieRate: number;
    bogeyRate: number;
    doublePlusRate: number;
    sampleSize: number;
  };
  doubleFollowUp: {
    parOrBetterRate: number;
    anotherDoubleRate: number;
    sampleSize: number;
  };
  
  // Streak patterns
  longestBirdieStreak: number;
  longestParStreak: number;
  longestBogeyStreak: number;
  averageBirdieStreakLength: number;
  averageBogeyStreakLength: number;
  
  // Position-based
  frontNineVsBackNine: number; // Positive = better front nine
  closingStretchScoring: number; // 16-18 vs average
  openingStretchScoring: number; // 1-3 vs average
  
  // Turning points
  typicalCollapseHole: number | null; // Where do bad rounds go wrong?
  typicalSurgeHole: number | null; // Where do good rounds take off?
  
  // Par type transitions
  par3ToPar4Performance: number; // Score on par 4 after par 3
  par5ToPar4Performance: number;
  longHoleToShortHoleAdjustment: number;
}

export function extractSequenceFeatures(
  playerId: string,
  rounds: RoundWithHoles[]
): SequenceFeatures {
  // Analyze hole-to-hole transitions across all rounds
  const transitions = analyzeAllTransitions(rounds);
  
  // Birdie follow-up analysis
  const afterBirdie = transitions.filter(t => t.prevScoreToPar === -1);
  const birdieFollowUp = {
    parRate: afterBirdie.filter(t => t.currScoreToPar === 0).length / afterBirdie.length,
    birdieRate: afterBirdie.filter(t => t.currScoreToPar <= -1).length / afterBirdie.length,
    bogeyRate: afterBirdie.filter(t => t.currScoreToPar >= 1).length / afterBirdie.length,
    sampleSize: afterBirdie.length,
  };
  
  // Bogey follow-up analysis
  const afterBogey = transitions.filter(t => t.prevScoreToPar === 1);
  const bogeyFollowUp = {
    parRate: afterBogey.filter(t => t.currScoreToPar === 0).length / afterBogey.length,
    birdieRate: afterBogey.filter(t => t.currScoreToPar <= -1).length / afterBogey.length,
    bogeyRate: afterBogey.filter(t => t.currScoreToPar === 1).length / afterBogey.length,
    doublePlusRate: afterBogey.filter(t => t.currScoreToPar >= 2).length / afterBogey.length,
    sampleSize: afterBogey.length,
  };
  
  // Find typical collapse/surge holes
  const holeImpact = calculateHoleImpact(rounds);
  const typicalCollapseHole = findCollapseHole(holeImpact);
  const typicalSurgeHole = findSurgeHole(holeImpact);
  
  return {
    birdieFollowUp,
    bogeyFollowUp,
    doubleFollowUp: analyzeDoubleFollowUp(transitions),
    longestBirdieStreak: findLongestStreak(rounds, -1),
    longestParStreak: findLongestStreak(rounds, 0),
    longestBogeyStreak: findLongestStreak(rounds, 1),
    averageBirdieStreakLength: averageStreakLength(rounds, -1),
    averageBogeyStreakLength: averageStreakLength(rounds, 1),
    frontNineVsBackNine: calculateFrontBackDiff(rounds),
    closingStretchScoring: calculateClosingStretch(rounds),
    openingStretchScoring: calculateOpeningStretch(rounds),
    typicalCollapseHole,
    typicalSurgeHole,
    par3ToPar4Performance: calculateParTypeTransition(transitions, 3, 4),
    par5ToPar4Performance: calculateParTypeTransition(transitions, 5, 4),
    longHoleToShortHoleAdjustment: calculateLengthTransition(transitions),
  };
}

interface Transition {
  roundId: string;
  prevHole: number;
  currHole: number;
  prevPar: number;
  currPar: number;
  prevScoreToPar: number;
  currScoreToPar: number;
}

function analyzeAllTransitions(rounds: RoundWithHoles[]): Transition[] {
  const transitions: Transition[] = [];
  
  for (const round of rounds) {
    const holes = round.holes.sort((a, b) => a.holeNumber - b.holeNumber);
    
    for (let i = 1; i < holes.length; i++) {
      const prev = holes[i - 1];
      const curr = holes[i];
      
      transitions.push({
        roundId: round.id,
        prevHole: prev.holeNumber,
        currHole: curr.holeNumber,
        prevPar: prev.par,
        currPar: curr.par,
        prevScoreToPar: prev.score - prev.par,
        currScoreToPar: curr.score - curr.par,
      });
    }
  }
  
  return transitions;
}

function findCollapseHole(holeImpact: HoleImpact[]): number | null {
  // Find the hole where bad rounds typically diverge from good rounds
  // A "collapse hole" is where good rounds stay good but bad rounds get worse
  
  const badRoundImpact = holeImpact.filter(h => h.roundType === 'bad');
  const divergencePoints = badRoundImpact.map(h => ({
    hole: h.holeNumber,
    divergence: h.cumulativeVsGoodRound,
  }));
  
  // Find where the biggest negative divergence happens
  const maxDivergence = divergencePoints.reduce(
    (max, curr) => curr.divergence < max.divergence ? curr : max,
    divergencePoints[0]
  );
  
  // Only return if there's a clear pattern (at least 2 strokes divergence)
  return maxDivergence.divergence < -2 ? maxDivergence.hole : null;
}
```

## 1.3 Contextual Features

```typescript
// src/lib/coachhelm/v2/features/contextual.ts

export interface ContextualFeatures {
  // Player state
  confidenceLevel: number; // 0-1, inferred from recent results
  formCycle: 'peaking' | 'building' | 'maintaining' | 'struggling' | 'recovering';
  pressureExposure: number; // How much high-pressure play recently
  
  // Environmental
  courseType: 'links' | 'parkland' | 'desert' | 'mountain' | 'mixed';
  courseDifficulty: number; // Relative to player's average courses
  weatherConditions: 'calm' | 'windy' | 'wet' | 'extreme';
  elevation: 'sea_level' | 'moderate' | 'high_altitude';
  
  // Competitive context
  eventImportance: number; // 1-10
  fieldStrength: number; // 1-10
  rosterPressure: number; // How close to bubble
  qualifyingStatus: 'safe' | 'bubble' | 'outside' | 'not_qualifying';
  
  // Mental state indicators (inferred)
  recentHighs: number; // Great moments in last 5 rounds
  recentLows: number; // Bad moments in last 5 rounds
  emotionalVolatility: number; // Variance in hole-to-hole scoring
  clutchFactor: number; // Performance in high-pressure situations
  
  // Physical indicators (if tracked)
  recentTravelMiles: number;
  sleepQuality: number | null; // If reported
  energyLevel: number | null; // If reported
}

export function extractContextualFeatures(
  playerId: string,
  roundId: string
): ContextualFeatures {
  const player = getPlayer(playerId);
  const round = getRound(roundId);
  const recentRounds = getRecentRounds(playerId, 10);
  const course = getCourse(round.courseId);
  const event = round.eventId ? getEvent(round.eventId) : null;
  
  // Calculate confidence level from recent performance
  const recentScoresToPar = recentRounds.slice(0, 5).map(r => r.scoreToPar);
  const confidenceLevel = calculateConfidence(recentScoresToPar, player.averageScoreToPar);
  
  // Determine form cycle
  const formCycle = determineFormCycle(recentRounds);
  
  // Calculate pressure exposure
  const pressureExposure = calculatePressureExposure(recentRounds);
  
  // Infer mental state from scoring patterns
  const holeScores = recentRounds.flatMap(r => r.holes.map(h => h.score - h.par));
  const emotionalVolatility = standardDeviation(holeScores);
  
  // Calculate clutch factor (performance when it matters)
  const clutchFactor = calculateClutchFactor(recentRounds);
  
  return {
    confidenceLevel,
    formCycle,
    pressureExposure,
    courseType: course.type,
    courseDifficulty: course.rating - player.averageCourseRating,
    weatherConditions: round.weather || 'calm',
    elevation: course.elevation,
    eventImportance: event?.importance || 5,
    fieldStrength: event?.fieldStrength || 5,
    rosterPressure: calculateRosterPressure(player),
    qualifyingStatus: getQualifyingStatus(player),
    recentHighs: countHighs(recentRounds),
    recentLows: countLows(recentRounds),
    emotionalVolatility,
    clutchFactor,
    recentTravelMiles: calculateRecentTravel(player),
    sleepQuality: player.sleepQuality,
    energyLevel: player.energyLevel,
  };
}

function determineFormCycle(rounds: Round[]): ContextualFeatures['formCycle'] {
  if (rounds.length < 5) return 'maintaining';
  
  const trend = calculateSlope(rounds.slice(0, 5).map(r => r.scoreToPar));
  const recentAvg = average(rounds.slice(0, 3).map(r => r.scoreToPar));
  const olderAvg = average(rounds.slice(5, 10).map(r => r.scoreToPar));
  
  // Peaking: improving trend + recent results better than older
  if (trend < -0.3 && recentAvg < olderAvg - 1) return 'peaking';
  
  // Building: improving but not yet showing in results
  if (trend < -0.2 && recentAvg >= olderAvg) return 'building';
  
  // Struggling: negative trend + worse results
  if (trend > 0.3 && recentAvg > olderAvg + 1) return 'struggling';
  
  // Recovering: was struggling, now stabilizing or improving
  if (olderAvg > recentAvg && trend <= 0) return 'recovering';
  
  return 'maintaining';
}

function calculateClutchFactor(rounds: Round[]): number {
  // Compare performance in clutch situations vs normal
  // Clutch = closing holes, competitive rounds, tight standings
  
  let clutchMoments = 0;
  let clutchSuccesses = 0;
  
  for (const round of rounds) {
    const holes = round.holes.sort((a, b) => a.holeNumber - b.holeNumber);
    
    // Closing holes (16-18) when within 3 of lead/cutoff
    if (round.isCompetitive && round.positionFromLead <= 3) {
      const closingHoles = holes.filter(h => h.holeNumber >= 16);
      clutchMoments += closingHoles.length;
      clutchSuccesses += closingHoles.filter(h => h.score <= h.par).length;
    }
    
    // Any hole where a birdie was "needed" (based on situation)
    // This would require more context about the competitive situation
  }
  
  if (clutchMoments === 0) return 0.5; // Neutral if no data
  
  return clutchSuccesses / clutchMoments;
}
```

---

# Part 2: Pattern Mining Engine

The core of V2 — discovering patterns that humans wouldn't notice.

## 2.1 Multi-Dimensional Pattern Mining

```typescript
// src/lib/coachhelm/v2/mining/pattern-miner.ts

export interface MinedPattern {
  id: string;
  type: PatternType;
  
  // The pattern definition
  conditions: PatternCondition[];
  outcome: PatternOutcome;
  
  // Statistical validity
  support: number; // How often conditions occur
  confidence: number; // When conditions occur, how often outcome happens
  lift: number; // How much more likely than random
  conviction: number; // Strength of implication
  
  // Practical significance
  strokeImpact: number; // Average strokes when pattern occurs
  actionability: number; // 0-1, how addressable is this?
  
  // Metadata
  sampleSize: number;
  firstDetected: Date;
  lastOccurrence: Date;
  trend: 'new' | 'growing' | 'stable' | 'declining' | 'resolved';
}

export interface PatternCondition {
  type: 'temporal' | 'sequence' | 'contextual' | 'statistical';
  field: string;
  operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'between';
  value: any;
  humanReadable: string;
}

export interface PatternOutcome {
  type: 'score' | 'stat' | 'behavior';
  metric: string;
  direction: 'positive' | 'negative';
  magnitude: number;
  humanReadable: string;
}

export class PatternMiner {
  private readonly minSupport = 0.1; // Pattern must occur in 10%+ of opportunities
  private readonly minConfidence = 0.6; // 60%+ of the time when conditions met
  private readonly minLift = 1.5; // 50% more likely than random
  private readonly minSampleSize = 10; // At least 10 occurrences
  
  async minePatterns(playerId: string): Promise<MinedPattern[]> {
    // Get all data
    const rounds = await this.getRoundsWithFeatures(playerId);
    
    // Mine different pattern types
    const patterns: MinedPattern[] = [];
    
    // 1. Conditional performance patterns
    patterns.push(...await this.mineConditionalPatterns(rounds));
    
    // 2. Sequence patterns (temporal)
    patterns.push(...await this.mineSequencePatterns(rounds));
    
    // 3. Compound patterns (multiple conditions)
    patterns.push(...await this.mineCompoundPatterns(rounds));
    
    // 4. Anomaly patterns (unusual situations)
    patterns.push(...await this.mineAnomalyPatterns(rounds));
    
    // 5. Regression patterns (what predicts bad outcomes)
    patterns.push(...await this.mineRegressionPatterns(rounds));
    
    // Filter and rank
    const validPatterns = patterns
      .filter(p => this.isStatisticallyValid(p))
      .filter(p => this.isPracticallySignificant(p))
      .sort((a, b) => this.rankPattern(b) - this.rankPattern(a));
    
    // Deduplicate (remove patterns that are subsets of others)
    return this.deduplicatePatterns(validPatterns);
  }
  
  private async mineConditionalPatterns(rounds: RoundWithFeatures[]): Promise<MinedPattern[]> {
    const patterns: MinedPattern[] = [];
    
    // Define condition candidates
    const conditionCandidates: PatternCondition[] = [
      // Temporal conditions
      { type: 'temporal', field: 'daysSinceLastRound', operator: 'gte', value: 7, humanReadable: 'after 7+ days off' },
      { type: 'temporal', field: 'daysSinceLastRound', operator: 'lte', value: 1, humanReadable: 'on consecutive days' },
      { type: 'temporal', field: 'roundsInLast7Days', operator: 'gte', value: 4, humanReadable: 'during heavy play' },
      { type: 'temporal', field: 'daysUntilNextEvent', operator: 'lte', value: 3, humanReadable: 'right before tournament' },
      
      // Contextual conditions
      { type: 'contextual', field: 'formCycle', operator: 'eq', value: 'struggling', humanReadable: 'while in struggling form' },
      { type: 'contextual', field: 'pressureExposure', operator: 'gte', value: 0.7, humanReadable: 'under high pressure' },
      { type: 'contextual', field: 'courseDifficulty', operator: 'gte', value: 2, humanReadable: 'on difficult courses' },
      { type: 'contextual', field: 'qualifyingStatus', operator: 'eq', value: 'bubble', humanReadable: 'when on the bubble' },
      
      // Previous hole conditions
      { type: 'sequence', field: 'previousHoleScore', operator: 'gte', value: 2, humanReadable: 'after double+' },
      { type: 'sequence', field: 'previousHoleScore', operator: 'lte', value: -1, humanReadable: 'after birdie' },
      { type: 'sequence', field: 'last3HolesTotal', operator: 'gte', value: 3, humanReadable: 'after rough 3-hole stretch' },
      
      // Statistical conditions
      { type: 'statistical', field: 'puttingStrokesGained', operator: 'lt', value: -0.5, humanReadable: 'when putting poorly' },
      { type: 'statistical', field: 'approachProximity', operator: 'gt', value: 30, humanReadable: 'when approach is off' },
    ];
    
    // Test each condition against outcomes
    for (const condition of conditionCandidates) {
      const { with: withCondition, without: withoutCondition } = this.splitByCondition(rounds, condition);
      
      if (withCondition.length < this.minSampleSize) continue;
      
      // Check various outcomes
      const outcomes = this.checkOutcomes(withCondition, withoutCondition);
      
      for (const outcome of outcomes) {
        if (outcome.lift >= this.minLift && outcome.confidence >= this.minConfidence) {
          patterns.push({
            id: generateId(),
            type: this.categorizePattern(condition, outcome),
            conditions: [condition],
            outcome,
            support: withCondition.length / rounds.length,
            confidence: outcome.confidence,
            lift: outcome.lift,
            conviction: this.calculateConviction(outcome.confidence, withCondition.length / rounds.length),
            strokeImpact: outcome.magnitude,
            actionability: this.assessActionability(condition, outcome),
            sampleSize: withCondition.length,
            firstDetected: new Date(),
            lastOccurrence: new Date(withCondition[0].playedAt),
            trend: 'new',
          });
        }
      }
    }
    
    return patterns;
  }
  
  private async mineCompoundPatterns(rounds: RoundWithFeatures[]): Promise<MinedPattern[]> {
    // Look for patterns that require MULTIPLE conditions to be true
    // These are often the most valuable because they're non-obvious
    
    const patterns: MinedPattern[] = [];
    const simplePatterns = await this.mineConditionalPatterns(rounds);
    
    // Try combining top simple patterns
    for (let i = 0; i < simplePatterns.length && i < 10; i++) {
      for (let j = i + 1; j < simplePatterns.length && j < 10; j++) {
        const p1 = simplePatterns[i];
        const p2 = simplePatterns[j];
        
        // Skip if conditions are redundant
        if (this.areConditionsRedundant(p1.conditions[0], p2.conditions[0])) continue;
        
        // Split rounds by both conditions
        const withBoth = rounds.filter(r => 
          this.matchesCondition(r, p1.conditions[0]) && 
          this.matchesCondition(r, p2.conditions[0])
        );
        
        if (withBoth.length < this.minSampleSize) continue;
        
        const withoutBoth = rounds.filter(r => 
          !this.matchesCondition(r, p1.conditions[0]) || 
          !this.matchesCondition(r, p2.conditions[0])
        );
        
        const outcomes = this.checkOutcomes(withBoth, withoutBoth);
        
        for (const outcome of outcomes) {
          // Compound pattern must be STRONGER than individual patterns
          const compoundLift = outcome.lift;
          const individualLift = Math.max(p1.lift, p2.lift);
          
          if (compoundLift > individualLift * 1.2) { // At least 20% stronger
            patterns.push({
              id: generateId(),
              type: 'compound',
              conditions: [p1.conditions[0], p2.conditions[0]],
              outcome,
              support: withBoth.length / rounds.length,
              confidence: outcome.confidence,
              lift: compoundLift,
              conviction: this.calculateConviction(outcome.confidence, withBoth.length / rounds.length),
              strokeImpact: outcome.magnitude,
              actionability: Math.min(p1.actionability, p2.actionability),
              sampleSize: withBoth.length,
              firstDetected: new Date(),
              lastOccurrence: new Date(withBoth[0].playedAt),
              trend: 'new',
            });
          }
        }
      }
    }
    
    return patterns;
  }
  
  private async mineAnomalyPatterns(rounds: RoundWithFeatures[]): Promise<MinedPattern[]> {
    // Find unusual situations that lead to unusual outcomes
    // These are the "hidden gems" — things the player might not realize
    
    const patterns: MinedPattern[] = [];
    
    // Use isolation forest-like approach for anomaly detection
    const anomalies = this.detectAnomalies(rounds);
    
    for (const anomaly of anomalies) {
      // What made this round anomalous?
      const distinguishingFeatures = this.findDistinguishingFeatures(anomaly, rounds);
      
      if (distinguishingFeatures.length === 0) continue;
      
      // Is this a good or bad anomaly?
      const isPositive = anomaly.scoreToPar < this.getAverageScoreToPar(rounds);
      
      patterns.push({
        id: generateId(),
        type: 'anomaly',
        conditions: distinguishingFeatures.map(f => ({
          type: 'statistical' as const,
          field: f.field,
          operator: f.direction === 'high' ? 'gte' as const : 'lte' as const,
          value: f.threshold,
          humanReadable: `${f.field} ${f.direction === 'high' ? 'above' : 'below'} ${f.threshold}`,
        })),
        outcome: {
          type: 'score',
          metric: 'scoreToPar',
          direction: isPositive ? 'positive' : 'negative',
          magnitude: Math.abs(anomaly.scoreToPar - this.getAverageScoreToPar(rounds)),
          humanReadable: isPositive 
            ? `scores ${Math.abs(anomaly.scoreToPar - this.getAverageScoreToPar(rounds)).toFixed(1)} strokes better`
            : `scores ${Math.abs(anomaly.scoreToPar - this.getAverageScoreToPar(rounds)).toFixed(1)} strokes worse`,
        },
        support: this.countSimilarAnomalies(anomaly, rounds) / rounds.length,
        confidence: 0.8, // Anomalies by definition don't have high confidence
        lift: 2.0, // Anomalies are by definition unusual
        conviction: 1.5,
        strokeImpact: anomaly.scoreToPar - this.getAverageScoreToPar(rounds),
        actionability: this.assessAnomalyActionability(distinguishingFeatures),
        sampleSize: this.countSimilarAnomalies(anomaly, rounds),
        firstDetected: new Date(),
        lastOccurrence: new Date(anomaly.playedAt),
        trend: 'new',
      });
    }
    
    return patterns;
  }
  
  private async mineRegressionPatterns(rounds: RoundWithFeatures[]): Promise<MinedPattern[]> {
    // Use regression analysis to find what PREDICTS bad outcomes
    // This is different from conditional patterns — it's about predictive power
    
    const patterns: MinedPattern[] = [];
    
    // Target variable: scoring (higher = worse)
    const targets = rounds.map(r => r.scoreToPar);
    
    // Feature matrix: all numeric features
    const featureNames = Object.keys(rounds[0].features).filter(
      k => typeof rounds[0].features[k] === 'number'
    );
    
    const featureMatrix = rounds.map(r => 
      featureNames.map(name => r.features[name] as number)
    );
    
    // Calculate correlation of each feature with target
    const correlations = featureNames.map((name, i) => ({
      name,
      correlation: this.calculateCorrelation(
        featureMatrix.map(row => row[i]),
        targets
      ),
    }));
    
    // Find strong predictors
    const strongPredictors = correlations
      .filter(c => Math.abs(c.correlation) > 0.3)
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    
    for (const predictor of strongPredictors.slice(0, 5)) {
      const isPositivePredictor = predictor.correlation > 0;
      
      patterns.push({
        id: generateId(),
        type: 'predictive',
        conditions: [{
          type: 'statistical',
          field: predictor.name,
          operator: isPositivePredictor ? 'gte' : 'lte',
          value: this.getThreshold(rounds, predictor.name, isPositivePredictor ? 0.75 : 0.25),
          humanReadable: `high ${predictor.name}`,
        }],
        outcome: {
          type: 'score',
          metric: 'scoreToPar',
          direction: 'negative',
          magnitude: Math.abs(predictor.correlation) * standardDeviation(targets),
          humanReadable: `predicts worse scoring (r=${predictor.correlation.toFixed(2)})`,
        },
        support: 0.25, // By definition, top quartile
        confidence: 0.5 + Math.abs(predictor.correlation) * 0.3,
        lift: 1 + Math.abs(predictor.correlation),
        conviction: 1 + Math.abs(predictor.correlation),
        strokeImpact: Math.abs(predictor.correlation) * standardDeviation(targets),
        actionability: this.assessPredictorActionability(predictor.name),
        sampleSize: Math.floor(rounds.length * 0.25),
        firstDetected: new Date(),
        lastOccurrence: new Date(),
        trend: 'new',
      });
    }
    
    return patterns;
  }
  
  private isStatisticallyValid(pattern: MinedPattern): boolean {
    return (
      pattern.sampleSize >= this.minSampleSize &&
      pattern.support >= this.minSupport &&
      pattern.confidence >= this.minConfidence &&
      pattern.lift >= this.minLift
    );
  }
  
  private isPracticallySignificant(pattern: MinedPattern): boolean {
    return (
      Math.abs(pattern.strokeImpact) >= 0.3 && // At least 0.3 strokes
      pattern.actionability >= 0.3 // Reasonably addressable
    );
  }
  
  private rankPattern(pattern: MinedPattern): number {
    // Weighted score for ranking patterns
    return (
      pattern.lift * 2 +
      pattern.strokeImpact * 3 +
      pattern.actionability * 2 +
      Math.log(pattern.sampleSize) * 0.5
    );
  }
  
  private deduplicatePatterns(patterns: MinedPattern[]): MinedPattern[] {
    // Remove patterns that are subsets of stronger patterns
    return patterns.filter((pattern, index) => {
      for (let i = 0; i < index; i++) {
        if (this.isSubsetOf(pattern, patterns[i])) {
          return false;
        }
      }
      return true;
    });
  }
}
```

## 2.2 Causal Discovery Engine

```typescript
// src/lib/coachhelm/v2/mining/causal-engine.ts

export interface CausalRelationship {
  cause: string;
  effect: string;
  strength: number; // -1 to 1
  confidence: number; // 0 to 1
  mechanism: string; // How/why this causes that
  confounders: string[]; // Things that might explain this away
  interventionPotential: number; // Can we actually change the cause?
}

export class CausalEngine {
  /**
   * Discover causal relationships, not just correlations.
   * 
   * The key insight: correlation ≠ causation.
   * We need to test if changing X actually changes Y.
   */
  
  async discoverCausalRelationships(
    playerId: string
  ): Promise<CausalRelationship[]> {
    const rounds = await this.getRoundsWithFeatures(playerId);
    const relationships: CausalRelationship[] = [];
    
    // 1. Find correlations first
    const correlations = this.findCorrelations(rounds);
    
    // 2. For each correlation, test for causality
    for (const corr of correlations) {
      const causalTest = await this.testCausality(rounds, corr.x, corr.y);
      
      if (causalTest.isCausal) {
        relationships.push({
          cause: corr.x,
          effect: corr.y,
          strength: causalTest.strength,
          confidence: causalTest.confidence,
          mechanism: this.inferMechanism(corr.x, corr.y),
          confounders: causalTest.confounders,
          interventionPotential: this.assessInterventionPotential(corr.x),
        });
      }
    }
    
    // 3. Look for mediating relationships
    // (X causes M which causes Y)
    relationships.push(...await this.findMediators(rounds, relationships));
    
    return relationships;
  }
  
  private async testCausality(
    rounds: RoundWithFeatures[],
    x: string,
    y: string
  ): Promise<{ isCausal: boolean; strength: number; confidence: number; confounders: string[] }> {
    // Test 1: Temporal precedence
    // Does X happen before Y? (For within-round patterns)
    const temporalPrecedence = this.checkTemporalPrecedence(rounds, x, y);
    
    // Test 2: Dose-response relationship
    // Does more X lead to more Y?
    const doseResponse = this.checkDoseResponse(rounds, x, y);
    
    // Test 3: Confounder elimination
    // Is the relationship explained by a third variable?
    const { remainingEffect, confounders } = await this.controlForConfounders(rounds, x, y);
    
    // Test 4: Natural experiments
    // When X changed "naturally", did Y follow?
    const naturalExperiment = this.analyzeNaturalExperiments(rounds, x, y);
    
    // Combine evidence
    const evidence = [
      temporalPrecedence ? 0.3 : 0,
      doseResponse ? 0.3 : 0,
      remainingEffect > 0.5 ? 0.3 : 0,
      naturalExperiment ? 0.3 : 0,
    ];
    
    const totalEvidence = evidence.reduce((a, b) => a + b, 0);
    
    return {
      isCausal: totalEvidence >= 0.6,
      strength: remainingEffect,
      confidence: totalEvidence,
      confounders,
    };
  }
  
  private checkDoseResponse(rounds: RoundWithFeatures[], x: string, y: string): boolean {
    // Split X into quartiles and check if Y changes monotonically
    const xValues = rounds.map(r => r.features[x] as number);
    const yValues = rounds.map(r => r.features[y] as number);
    
    const quartiles = [0.25, 0.5, 0.75, 1].map(q => percentile(xValues, q));
    
    const yByQuartile = quartiles.map((threshold, i) => {
      const prevThreshold = i === 0 ? -Infinity : quartiles[i - 1];
      const relevantY = yValues.filter((_, idx) => 
        xValues[idx] > prevThreshold && xValues[idx] <= threshold
      );
      return average(relevantY);
    });
    
    // Check for monotonic relationship
    let isMonotonic = true;
    for (let i = 1; i < yByQuartile.length; i++) {
      if (yByQuartile[i] < yByQuartile[i - 1] - 0.1) {
        isMonotonic = false;
        break;
      }
    }
    
    return isMonotonic;
  }
  
  private async controlForConfounders(
    rounds: RoundWithFeatures[],
    x: string,
    y: string
  ): Promise<{ remainingEffect: number; confounders: string[] }> {
    const potentialConfounders = this.getPotentialConfounders(x, y);
    const confounders: string[] = [];
    
    let originalCorrelation = this.calculateCorrelation(
      rounds.map(r => r.features[x] as number),
      rounds.map(r => r.features[y] as number)
    );
    
    let currentCorrelation = originalCorrelation;
    
    for (const confounder of potentialConfounders) {
      // Partial correlation controlling for confounder
      const partialCorr = this.calculatePartialCorrelation(
        rounds.map(r => r.features[x] as number),
        rounds.map(r => r.features[y] as number),
        rounds.map(r => r.features[confounder] as number)
      );
      
      // If correlation drops significantly, it's a confounder
      if (Math.abs(partialCorr) < Math.abs(currentCorrelation) * 0.7) {
        confounders.push(confounder);
        currentCorrelation = partialCorr;
      }
    }
    
    return {
      remainingEffect: Math.abs(currentCorrelation / originalCorrelation),
      confounders,
    };
  }
  
  private analyzeNaturalExperiments(
    rounds: RoundWithFeatures[],
    x: string,
    y: string
  ): boolean {
    // Find times when X changed significantly between rounds
    // and see if Y changed in the expected direction
    
    const changes: { xChange: number; yChange: number }[] = [];
    
    for (let i = 1; i < rounds.length; i++) {
      const xChange = (rounds[i].features[x] as number) - (rounds[i-1].features[x] as number);
      const yChange = (rounds[i].features[y] as number) - (rounds[i-1].features[y] as number);
      
      // Only consider significant X changes
      if (Math.abs(xChange) > standardDeviation(rounds.map(r => r.features[x] as number)) * 0.5) {
        changes.push({ xChange, yChange });
      }
    }
    
    if (changes.length < 5) return false;
    
    // Count how often Y changed in the expected direction
    const expectedDirection = this.getExpectedDirection(x, y);
    const correctDirection = changes.filter(c => 
      (expectedDirection > 0 && Math.sign(c.xChange) === Math.sign(c.yChange)) ||
      (expectedDirection < 0 && Math.sign(c.xChange) !== Math.sign(c.yChange))
    ).length;
    
    return correctDirection / changes.length > 0.6;
  }
  
  private inferMechanism(cause: string, effect: string): string {
    // Knowledge-based mechanism inference
    const mechanisms: Record<string, Record<string, string>> = {
      'daysSinceLastRound': {
        'scoreToPar': 'Rust from lack of practice affects timing and feel',
        'puttsPerRound': 'Green reading and speed calibration degrade without play',
        'fairwayPct': 'Driving rhythm suffers from layoff',
      },
      'threePuttsPrevRound': {
        'puttingConfidence': 'Recent failures create doubt over short putts',
        'scoreToPar': 'Putting anxiety leads to tentative strokes',
      },
      'bogeyFollowUpRate': {
        'scoreToPar': 'Mental recovery ability determines damage control',
        'emotionalVolatility': 'Poor bounce-back compounds emotional swings',
      },
      'pressureExposure': {
        'clutchPerformance': 'Repeated pressure situations build or erode composure',
        'closingHoleScoring': 'Pressure tolerance transfers to clutch moments',
      },
    };
    
    return mechanisms[cause]?.[effect] || `Changes in ${cause} influence ${effect}`;
  }
  
  private assessInterventionPotential(cause: string): number {
    // How controllable is this cause?
    const controllability: Record<string, number> = {
      // Highly controllable (player can change)
      'practiceFrequency': 0.9,
      'sleepQuality': 0.8,
      'preRoundRoutine': 0.9,
      'mentalPreparation': 0.8,
      
      // Moderately controllable
      'daysSinceLastRound': 0.6,
      'pressureExposure': 0.5,
      'courseType': 0.3,
      
      // Low controllability (situational)
      'weatherConditions': 0.1,
      'fieldStrength': 0.1,
      'eventImportance': 0.2,
    };
    
    return controllability[cause] || 0.5;
  }
}
```

---

# Part 3: Predictive Engine

The system that sees the future.

## 3.1 Performance Prediction

```typescript
// src/lib/coachhelm/v2/prediction/performance-predictor.ts

export interface PerformancePrediction {
  playerId: string;
  targetDate: Date;
  
  // Score prediction
  predictedScore: {
    expected: number;
    lowConfidence: number; // 25th percentile
    highConfidence: number; // 75th percentile
    factors: PredictionFactor[];
  };
  
  // Risk assessment
  riskOfPoorRound: number; // 0-1, probability of >+5
  riskOfGreatRound: number; // 0-1, probability of <-2
  
  // Key factors for this prediction
  positiveFactors: PredictionFactor[];
  negativeFactors: PredictionFactor[];
  uncertainFactors: PredictionFactor[];
  
  // Confidence
  overallConfidence: number; // 0-1
  dataQuality: 'high' | 'medium' | 'low';
  
  // What could change the prediction
  sensitivities: {
    factor: string;
    currentValue: number;
    ifImproved: number; // Predicted score if this improved
    ifWorsened: number; // Predicted score if this worsened
  }[];
}

export interface PredictionFactor {
  name: string;
  currentValue: number;
  typicalValue: number;
  impact: number; // Strokes
  direction: 'positive' | 'negative' | 'neutral';
  humanReadable: string;
}

export class PerformancePredictor {
  async predictPerformance(
    playerId: string,
    targetDate: Date,
    context?: Partial<PredictionContext>
  ): Promise<PerformancePrediction> {
    // 1. Get player baseline
    const baseline = await this.getPlayerBaseline(playerId);
    
    // 2. Extract features as of target date
    const features = await this.extractPredictiveFeatures(playerId, targetDate, context);
    
    // 3. Apply learned model
    const rawPrediction = this.applyModel(baseline, features);
    
    // 4. Adjust for context
    const contextAdjustment = this.calculateContextAdjustment(features, context);
    
    // 5. Calculate confidence intervals
    const uncertainty = this.calculateUncertainty(features, baseline);
    
    // 6. Identify key factors
    const factors = this.identifyKeyFactors(features, baseline);
    
    // 7. Calculate sensitivities
    const sensitivities = await this.calculateSensitivities(playerId, features, rawPrediction);
    
    const predictedScore = rawPrediction + contextAdjustment;
    
    return {
      playerId,
      targetDate,
      predictedScore: {
        expected: predictedScore,
        lowConfidence: predictedScore - uncertainty * 1.5,
        highConfidence: predictedScore + uncertainty * 1.5,
        factors: factors.all,
      },
      riskOfPoorRound: this.calculateTailRisk(predictedScore, uncertainty, 5),
      riskOfGreatRound: this.calculateTailRisk(predictedScore, uncertainty, -2),
      positiveFactors: factors.positive,
      negativeFactors: factors.negative,
      uncertainFactors: factors.uncertain,
      overallConfidence: this.calculateConfidence(features, baseline),
      dataQuality: this.assessDataQuality(features),
      sensitivities,
    };
  }
  
  private applyModel(
    baseline: PlayerBaseline,
    features: PredictiveFeatures
  ): number {
    // Multi-factor model combining:
    // 1. Historical baseline
    // 2. Recent form adjustment
    // 3. Temporal factors
    // 4. Contextual factors
    // 5. Pattern-based adjustments
    
    let prediction = baseline.expectedScore;
    
    // Recent form (weighted heavily)
    const formAdjustment = (features.recentAverage - baseline.expectedScore) * 0.6;
    prediction += formAdjustment;
    
    // Trend momentum
    if (features.trendSlope < -0.2) {
      // Improving trend, expect continuation
      prediction += features.trendSlope * 2;
    } else if (features.trendSlope > 0.2) {
      // Declining trend
      prediction += features.trendSlope * 2;
    }
    
    // Rest/rust factor
    if (features.daysSinceLastRound > 7) {
      prediction += (features.daysSinceLastRound - 7) * 0.1; // Rust penalty
    } else if (features.daysSinceLastRound < 2 && features.roundsLast7Days > 4) {
      prediction += 0.5; // Fatigue penalty
    }
    
    // Pressure adjustment
    if (features.upcomingEventImportance > 7) {
      prediction += baseline.pressureEffect * (features.upcomingEventImportance / 10);
    }
    
    // Form cycle adjustment
    const formCycleAdjustments = {
      'peaking': -1.0,
      'building': -0.3,
      'maintaining': 0,
      'recovering': 0.3,
      'struggling': 1.0,
    };
    prediction += formCycleAdjustments[features.formCycle] || 0;
    
    // Active pattern adjustments
    for (const pattern of features.activePatterns) {
      if (pattern.relevanceToContext > 0.5) {
        prediction += pattern.expectedImpact * pattern.relevanceToContext;
      }
    }
    
    return prediction;
  }
  
  private calculateContextAdjustment(
    features: PredictiveFeatures,
    context?: Partial<PredictionContext>
  ): number {
    let adjustment = 0;
    
    if (context?.courseId) {
      const courseHistory = features.courseHistory;
      if (courseHistory && courseHistory.rounds >= 3) {
        // Adjust based on player's history on this course
        adjustment += (courseHistory.averageVsExpected) * 0.5;
      }
    }
    
    if (context?.weather === 'windy') {
      adjustment += features.windPerformanceAdjustment;
    }
    
    if (context?.isCompetitive) {
      adjustment += features.competitiveAdjustment;
    }
    
    return adjustment;
  }
  
  private identifyKeyFactors(
    features: PredictiveFeatures,
    baseline: PlayerBaseline
  ): { all: PredictionFactor[]; positive: PredictionFactor[]; negative: PredictionFactor[]; uncertain: PredictionFactor[] } {
    const factors: PredictionFactor[] = [];
    
    // Recent form
    const formDiff = features.recentAverage - baseline.expectedScore;
    factors.push({
      name: 'Recent Form',
      currentValue: features.recentAverage,
      typicalValue: baseline.expectedScore,
      impact: formDiff * 0.6,
      direction: formDiff < 0 ? 'positive' : formDiff > 0 ? 'negative' : 'neutral',
      humanReadable: formDiff < -0.5 
        ? `Playing ${Math.abs(formDiff).toFixed(1)} strokes better than average recently`
        : formDiff > 0.5
          ? `Playing ${formDiff.toFixed(1)} strokes worse than average recently`
          : 'Playing near average',
    });
    
    // Trend
    if (Math.abs(features.trendSlope) > 0.2) {
      factors.push({
        name: 'Trend Momentum',
        currentValue: features.trendSlope,
        typicalValue: 0,
        impact: features.trendSlope * 2,
        direction: features.trendSlope < 0 ? 'positive' : 'negative',
        humanReadable: features.trendSlope < 0
          ? `On an improving trajectory (${Math.abs(features.trendSlope).toFixed(2)} strokes/round)`
          : `On a declining trajectory (${features.trendSlope.toFixed(2)} strokes/round)`,
      });
    }
    
    // Rest/fatigue
    if (features.daysSinceLastRound > 7) {
      const rustPenalty = (features.daysSinceLastRound - 7) * 0.1;
      factors.push({
        name: 'Rust Factor',
        currentValue: features.daysSinceLastRound,
        typicalValue: 4,
        impact: rustPenalty,
        direction: 'negative',
        humanReadable: `${features.daysSinceLastRound} days since last round may cause some rust`,
      });
    } else if (features.roundsLast7Days > 4) {
      factors.push({
        name: 'Fatigue Risk',
        currentValue: features.roundsLast7Days,
        typicalValue: 2,
        impact: 0.5,
        direction: 'negative',
        humanReadable: `Heavy recent workload (${features.roundsLast7Days} rounds in 7 days)`,
      });
    }
    
    // Active patterns
    for (const pattern of features.activePatterns.slice(0, 3)) {
      factors.push({
        name: `Pattern: ${pattern.name}`,
        currentValue: pattern.recentFrequency,
        typicalValue: pattern.historicalFrequency,
        impact: pattern.expectedImpact,
        direction: pattern.expectedImpact > 0 ? 'negative' : 'positive',
        humanReadable: pattern.description,
      });
    }
    
    // Sort by absolute impact
    factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
    
    return {
      all: factors,
      positive: factors.filter(f => f.direction === 'positive'),
      negative: factors.filter(f => f.direction === 'negative'),
      uncertain: factors.filter(f => f.direction === 'neutral'),
    };
  }
  
  private async calculateSensitivities(
    playerId: string,
    features: PredictiveFeatures,
    basePrediction: number
  ): Promise<PerformancePrediction['sensitivities']> {
    const sensitivities: PerformancePrediction['sensitivities'] = [];
    
    // Key factors to test sensitivity for
    const sensitiveFactors = [
      'recentAverage',
      'daysSinceLastRound',
      'formCycle',
      'pressureExposure',
    ];
    
    for (const factor of sensitiveFactors) {
      const currentValue = features[factor as keyof PredictiveFeatures] as number;
      
      // Test with improved value
      const improvedFeatures = { ...features, [factor]: this.getImprovedValue(factor, currentValue) };
      const improvedPrediction = this.applyModel(
        await this.getPlayerBaseline(playerId),
        improvedFeatures as PredictiveFeatures
      );
      
      // Test with worsened value
      const worsenedFeatures = { ...features, [factor]: this.getWorsenedValue(factor, currentValue) };
      const worsenedPrediction = this.applyModel(
        await this.getPlayerBaseline(playerId),
        worsenedFeatures as PredictiveFeatures
      );
      
      sensitivities.push({
        factor,
        currentValue,
        ifImproved: improvedPrediction,
        ifWorsened: worsenedPrediction,
      });
    }
    
    return sensitivities.sort((a, b) => 
      (b.ifWorsened - b.ifImproved) - (a.ifWorsened - a.ifImproved)
    );
  }
  
  private calculateTailRisk(
    prediction: number,
    uncertainty: number,
    threshold: number
  ): number {
    // Assume normal distribution
    // Calculate P(score > prediction + threshold) for poor round
    // or P(score < prediction + threshold) for great round
    
    const zScore = (threshold) / uncertainty;
    
    // Approximate normal CDF
    return 1 - this.normalCDF(zScore);
  }
  
  private normalCDF(z: number): number {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    
    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);
    
    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    
    return 0.5 * (1.0 + sign * y);
  }
}
```

## 3.2 Trajectory Forecasting

```typescript
// src/lib/coachhelm/v2/prediction/trajectory-forecaster.ts

export interface TrajectoryForecast {
  playerId: string;
  forecastDate: Date;
  horizon: '1_week' | '1_month' | '3_months' | 'season';
  
  // Where are they heading?
  trajectory: {
    current: number; // Current scoring average
    projected: number; // Projected scoring average at horizon
    confidence: [number, number]; // 80% confidence interval
    trend: 'improving' | 'stable' | 'declining';
    velocity: number; // Strokes per month change
    acceleration: number; // Is improvement speeding up or slowing down?
  };
  
  // Milestones
  milestones: {
    target: number;
    probabilityOfAchieving: number;
    expectedDate: Date | null;
    requiredImprovement: number;
  }[];
  
  // Risk factors
  risks: {
    factor: string;
    probability: number;
    impact: string;
    mitigation: string;
  }[];
  
  // Opportunities
  opportunities: {
    area: string;
    potentialGain: number;
    confidence: number;
    howToCapture: string;
  }[];
  
  // Scenarios
  scenarios: {
    name: string;
    probability: number;
    outcome: number;
    keyDrivers: string[];
  }[];
}

export class TrajectoryForecaster {
  async forecastTrajectory(
    playerId: string,
    horizon: TrajectoryForecast['horizon']
  ): Promise<TrajectoryForecast> {
    const player = await this.getPlayerWithHistory(playerId);
    const rounds = await this.getRoundsWithFeatures(playerId);
    const patterns = await this.getActivePatterns(playerId);
    const goals = await this.getPlayerGoals(playerId);
    
    // 1. Calculate current state
    const currentState = this.analyzeCurrentState(rounds);
    
    // 2. Project trajectory using multiple models
    const linearProjection = this.linearProjection(rounds, horizon);
    const seasonalProjection = this.seasonalProjection(rounds, horizon);
    const patternBasedProjection = this.patternBasedProjection(rounds, patterns, horizon);
    const ensembleProjection = this.ensembleProjection([
      { projection: linearProjection, weight: 0.3 },
      { projection: seasonalProjection, weight: 0.3 },
      { projection: patternBasedProjection, weight: 0.4 },
    ]);
    
    // 3. Calculate milestone probabilities
    const milestones = await this.calculateMilestoneProbabilities(
      player,
      goals,
      ensembleProjection
    );
    
    // 4. Identify risks
    const risks = this.identifyRisks(rounds, patterns, ensembleProjection);
    
    // 5. Identify opportunities
    const opportunities = this.identifyOpportunities(rounds, patterns);
    
    // 6. Generate scenarios
    const scenarios = this.generateScenarios(ensembleProjection, risks, opportunities);
    
    return {
      playerId,
      forecastDate: new Date(),
      horizon,
      trajectory: ensembleProjection,
      milestones,
      risks,
      opportunities,
      scenarios,
    };
  }
  
  private linearProjection(
    rounds: RoundWithFeatures[],
    horizon: TrajectoryForecast['horizon']
  ): TrajectoryForecast['trajectory'] {
    // Simple linear regression on recent scores
    const recentRounds = rounds.slice(0, 20);
    const scores = recentRounds.map(r => r.totalScore);
    const timestamps = recentRounds.map((r, i) => i);
    
    const slope = this.calculateSlope(timestamps, scores);
    const intercept = average(scores) - slope * average(timestamps);
    
    const horizonRounds = this.horizonToRounds(horizon);
    const projected = intercept + slope * (timestamps.length + horizonRounds);
    
    // Confidence interval based on residual standard error
    const residuals = scores.map((s, i) => s - (intercept + slope * i));
    const rse = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / (scores.length - 2));
    
    return {
      current: scores[0],
      projected,
      confidence: [projected - 1.96 * rse, projected + 1.96 * rse],
      trend: slope < -0.1 ? 'improving' : slope > 0.1 ? 'declining' : 'stable',
      velocity: slope * 4, // Convert to strokes per month (assuming ~4 rounds/month)
      acceleration: this.calculateAcceleration(scores),
    };
  }
  
  private seasonalProjection(
    rounds: RoundWithFeatures[],
    horizon: TrajectoryForecast['horizon']
  ): TrajectoryForecast['trajectory'] {
    // Account for seasonal patterns
    // Golf performance often follows seasonal cycles
    
    const seasonalAdjustment = this.getSeasonalAdjustment(new Date());
    const horizonSeasonalAdjustment = this.getSeasonalAdjustment(
      this.addHorizonToDate(new Date(), horizon)
    );
    
    const baseProjection = this.linearProjection(rounds, horizon);
    
    // Adjust for seasonal difference
    const seasonalDelta = horizonSeasonalAdjustment - seasonalAdjustment;
    
    return {
      ...baseProjection,
      projected: baseProjection.projected + seasonalDelta,
      confidence: [
        baseProjection.confidence[0] + seasonalDelta,
        baseProjection.confidence[1] + seasonalDelta,
      ],
    };
  }
  
  private patternBasedProjection(
    rounds: RoundWithFeatures[],
    patterns: MinedPattern[],
    horizon: TrajectoryForecast['horizon']
  ): TrajectoryForecast['trajectory'] {
    const baseProjection = this.linearProjection(rounds, horizon);
    
    // Adjust based on pattern trends
    let patternAdjustment = 0;
    
    for (const pattern of patterns) {
      if (pattern.trend === 'declining') {
        // Pattern is getting better, expect improvement
        patternAdjustment -= pattern.strokeImpact * 0.3;
      } else if (pattern.trend === 'growing') {
        // Pattern is getting worse, expect decline
        patternAdjustment += pattern.strokeImpact * 0.3;
      }
    }
    
    return {
      ...baseProjection,
      projected: baseProjection.projected + patternAdjustment,
    };
  }
  
  private ensembleProjection(
    projections: { projection: TrajectoryForecast['trajectory']; weight: number }[]
  ): TrajectoryForecast['trajectory'] {
    const weightedProjected = projections.reduce(
      (sum, p) => sum + p.projection.projected * p.weight,
      0
    );
    
    const weightedVelocity = projections.reduce(
      (sum, p) => sum + p.projection.velocity * p.weight,
      0
    );
    
    // Confidence is the union of all confidence intervals
    const allLows = projections.map(p => p.projection.confidence[0]);
    const allHighs = projections.map(p => p.projection.confidence[1]);
    
    const trend = weightedVelocity < -0.2 ? 'improving' 
      : weightedVelocity > 0.2 ? 'declining' 
      : 'stable';
    
    return {
      current: projections[0].projection.current,
      projected: weightedProjected,
      confidence: [Math.min(...allLows), Math.max(...allHighs)],
      trend,
      velocity: weightedVelocity,
      acceleration: projections.reduce(
        (sum, p) => sum + p.projection.acceleration * p.weight,
        0
      ),
    };
  }
  
  private generateScenarios(
    projection: TrajectoryForecast['trajectory'],
    risks: TrajectoryForecast['risks'],
    opportunities: TrajectoryForecast['opportunities']
  ): TrajectoryForecast['scenarios'] {
    return [
      {
        name: 'Best Case',
        probability: 0.15,
        outcome: projection.confidence[0] - 1,
        keyDrivers: opportunities.slice(0, 2).map(o => o.area),
      },
      {
        name: 'Likely Case',
        probability: 0.5,
        outcome: projection.projected,
        keyDrivers: ['Current trajectory continues', 'Normal variance'],
      },
      {
        name: 'Conservative Case',
        probability: 0.25,
        outcome: projection.confidence[1],
        keyDrivers: ['Minor setbacks', 'Slower progress than expected'],
      },
      {
        name: 'Worst Case',
        probability: 0.1,
        outcome: projection.confidence[1] + 2,
        keyDrivers: risks.slice(0, 2).map(r => r.factor),
      },
    ];
  }
}
```

---

# Part 4: Adaptive Learning System

How the system gets smarter over time.

## 4.1 Behavior Learning

```typescript
// src/lib/coachhelm/v2/learning/behavior-learner.ts

export interface LearnedBehavior {
  entityId: string; // Coach or player ID
  entityType: 'coach' | 'player';
  
  // Interaction patterns
  interactions: {
    feature: string;
    interactionCount: number;
    averageEngagementTime: number;
    actionRate: number;
    dismissalRate: number;
    feedbackScore: number;
  }[];
  
  // Preferences (inferred)
  preferences: {
    preferredInsightTypes: string[];
    preferredDetailLevel: 'brief' | 'detailed' | 'comprehensive';
    preferredVisualizations: string[];
    noiseToleranceLevel: 'low' | 'medium' | 'high';
    actionOrientation: 'proactive' | 'reactive' | 'mixed';
  };
  
  // Thresholds (learned)
  learnedThresholds: {
    metric: string;
    learnedThreshold: number;
    confidence: number;
    basedOnInteractions: number;
  }[];
  
  // Time patterns
  engagementPatterns: {
    preferredTimeOfDay: 'morning' | 'afternoon' | 'evening';
    preferredDayOfWeek: number[];
    averageSessionLength: number;
    frequencyPerWeek: number;
  };
}

export class BehaviorLearner {
  async learnFromInteraction(
    entityId: string,
    entityType: 'coach' | 'player',
    interaction: Interaction
  ): Promise<void> {
    const currentBehavior = await this.getBehavior(entityId, entityType);
    
    // Update interaction counts
    const featureInteraction = currentBehavior.interactions.find(
      i => i.feature === interaction.feature
    );
    
    if (featureInteraction) {
      featureInteraction.interactionCount++;
      featureInteraction.averageEngagementTime = this.updateRunningAverage(
        featureInteraction.averageEngagementTime,
        featureInteraction.interactionCount,
        interaction.engagementTime
      );
      
      if (interaction.action === 'acted') {
        featureInteraction.actionRate = this.updateRunningAverage(
          featureInteraction.actionRate,
          featureInteraction.interactionCount,
          1
        );
      } else if (interaction.action === 'dismissed') {
        featureInteraction.dismissalRate = this.updateRunningAverage(
          featureInteraction.dismissalRate,
          featureInteraction.interactionCount,
          1
        );
      }
      
      if (interaction.feedback) {
        featureInteraction.feedbackScore = this.updateRunningAverage(
          featureInteraction.feedbackScore,
          featureInteraction.interactionCount,
          interaction.feedback
        );
      }
    }
    
    // Update preferences based on patterns
    await this.updatePreferences(entityId, entityType, interaction);
    
    // Update learned thresholds
    await this.updateThresholds(entityId, entityType, interaction);
    
    // Save
    await this.saveBehavior(currentBehavior);
  }
  
  private async updatePreferences(
    entityId: string,
    entityType: 'coach' | 'player',
    interaction: Interaction
  ): Promise<void> {
    const behavior = await this.getBehavior(entityId, entityType);
    
    // Infer preferred insight types from engagement
    const highEngagement = behavior.interactions
      .filter(i => i.actionRate > 0.3 && i.feedbackScore > 3)
      .map(i => i.feature);
    
    behavior.preferences.preferredInsightTypes = highEngagement;
    
    // Infer detail level from engagement time
    const avgEngagementTime = average(
      behavior.interactions.map(i => i.averageEngagementTime)
    );
    
    if (avgEngagementTime < 10) {
      behavior.preferences.preferredDetailLevel = 'brief';
    } else if (avgEngagementTime < 30) {
      behavior.preferences.preferredDetailLevel = 'detailed';
    } else {
      behavior.preferences.preferredDetailLevel = 'comprehensive';
    }
    
    // Infer noise tolerance from dismissal patterns
    const avgDismissalRate = average(
      behavior.interactions.map(i => i.dismissalRate)
    );
    
    if (avgDismissalRate > 0.5) {
      behavior.preferences.noiseToleranceLevel = 'low';
    } else if (avgDismissalRate > 0.2) {
      behavior.preferences.noiseToleranceLevel = 'medium';
    } else {
      behavior.preferences.noiseToleranceLevel = 'high';
    }
    
    // Infer action orientation
    const avgActionRate = average(
      behavior.interactions.map(i => i.actionRate)
    );
    
    if (avgActionRate > 0.4) {
      behavior.preferences.actionOrientation = 'proactive';
    } else if (avgActionRate < 0.1) {
      behavior.preferences.actionOrientation = 'reactive';
    } else {
      behavior.preferences.actionOrientation = 'mixed';
    }
    
    await this.saveBehavior(behavior);
  }
  
  private async updateThresholds(
    entityId: string,
    entityType: 'coach' | 'player',
    interaction: Interaction
  ): Promise<void> {
    if (interaction.action !== 'acted' && interaction.action !== 'dismissed') {
      return;
    }
    
    const behavior = await this.getBehavior(entityId, entityType);
    
    // If they acted on an alert, the threshold was right or too conservative
    // If they dismissed, the threshold was too aggressive
    
    const metric = interaction.relatedMetric;
    const value = interaction.metricValue;
    
    if (!metric || value === undefined) return;
    
    let learnedThreshold = behavior.learnedThresholds.find(
      t => t.metric === metric
    );
    
    if (!learnedThreshold) {
      learnedThreshold = {
        metric,
        learnedThreshold: value,
        confidence: 0.1,
        basedOnInteractions: 0,
      };
      behavior.learnedThresholds.push(learnedThreshold);
    }
    
    // Update threshold using exponential moving average
    const learningRate = 0.1;
    
    if (interaction.action === 'acted') {
      // Value was worth alerting at or maybe even earlier
      // Move threshold slightly lower
      learnedThreshold.learnedThreshold = 
        learnedThreshold.learnedThreshold * (1 - learningRate) +
        (value - 0.5) * learningRate;
    } else {
      // Value wasn't worth alerting
      // Move threshold higher
      learnedThreshold.learnedThreshold = 
        learnedThreshold.learnedThreshold * (1 - learningRate) +
        (value + 0.5) * learningRate;
    }
    
    learnedThreshold.basedOnInteractions++;
    learnedThreshold.confidence = Math.min(
      0.95,
      learnedThreshold.basedOnInteractions / 50
    );
    
    await this.saveBehavior(behavior);
  }
  
  async getPersonalizedThreshold(
    entityId: string,
    entityType: 'coach' | 'player',
    metric: string,
    defaultThreshold: number
  ): Promise<number> {
    const behavior = await this.getBehavior(entityId, entityType);
    
    const learned = behavior.learnedThresholds.find(t => t.metric === metric);
    
    if (!learned || learned.confidence < 0.3) {
      return defaultThreshold;
    }
    
    // Blend learned with default based on confidence
    return (
      learned.learnedThreshold * learned.confidence +
      defaultThreshold * (1 - learned.confidence)
    );
  }
}
```

## 4.2 Outcome Validator

```typescript
// src/lib/coachhelm/v2/learning/outcome-validator.ts

export interface ValidationResult {
  predictionId: string;
  predictionType: 'alert' | 'forecast' | 'pattern' | 'insight';
  
  // What we predicted
  prediction: {
    metric: string;
    predictedValue: number;
    confidence: number;
    conditions: string[];
  };
  
  // What actually happened
  outcome: {
    actualValue: number;
    observedAt: Date;
  };
  
  // How accurate were we?
  accuracy: {
    absoluteError: number;
    relativeError: number;
    withinConfidenceInterval: boolean;
    directionCorrect: boolean;
  };
  
  // Learning signals
  learningSignals: {
    featureImportanceUpdate: Record<string, number>;
    thresholdAdjustment: number;
    confidenceCalibration: number;
  };
}

export class OutcomeValidator {
  async validatePredictions(): Promise<void> {
    // Get predictions that are now due for validation
    const pendingValidations = await this.getPendingValidations();
    
    for (const prediction of pendingValidations) {
      // Get actual outcome
      const outcome = await this.getActualOutcome(prediction);
      
      if (!outcome) continue; // Outcome not yet available
      
      // Calculate accuracy
      const validation = this.calculateAccuracy(prediction, outcome);
      
      // Record validation
      await this.recordValidation(validation);
      
      // Update models based on validation
      await this.updateModels(validation);
      
      // Update confidence calibration
      await this.updateConfidenceCalibration(validation);
    }
  }
  
  private calculateAccuracy(
    prediction: Prediction,
    outcome: Outcome
  ): ValidationResult {
    const absoluteError = Math.abs(outcome.actualValue - prediction.predictedValue);
    const relativeError = absoluteError / Math.abs(prediction.predictedValue);
    
    const withinConfidenceInterval = 
      outcome.actualValue >= prediction.confidenceInterval[0] &&
      outcome.actualValue <= prediction.confidenceInterval[1];
    
    const directionCorrect = 
      (prediction.predictedDirection === 'up' && outcome.actualValue > prediction.baselineValue) ||
      (prediction.predictedDirection === 'down' && outcome.actualValue < prediction.baselineValue) ||
      (prediction.predictedDirection === 'stable' && Math.abs(outcome.actualValue - prediction.baselineValue) < 0.5);
    
    return {
      predictionId: prediction.id,
      predictionType: prediction.type,
      prediction: {
        metric: prediction.metric,
        predictedValue: prediction.predictedValue,
        confidence: prediction.confidence,
        conditions: prediction.conditions,
      },
      outcome: {
        actualValue: outcome.actualValue,
        observedAt: new Date(),
      },
      accuracy: {
        absoluteError,
        relativeError,
        withinConfidenceInterval,
        directionCorrect,
      },
      learningSignals: this.calculateLearningSignals(prediction, outcome, absoluteError),
    };
  }
  
  private calculateLearningSignals(
    prediction: Prediction,
    outcome: Outcome,
    error: number
  ): ValidationResult['learningSignals'] {
    // Calculate feature importance updates
    // Features that were weighted heavily in a wrong prediction should be downweighted
    const featureImportanceUpdate: Record<string, number> = {};
    
    for (const feature of prediction.usedFeatures) {
      if (error > prediction.expectedError * 2) {
        // Prediction was way off — this feature might be misleading
        featureImportanceUpdate[feature.name] = -0.1 * feature.weight;
      } else if (error < prediction.expectedError * 0.5) {
        // Prediction was very accurate — reinforce these features
        featureImportanceUpdate[feature.name] = 0.05 * feature.weight;
      }
    }
    
    // Calculate threshold adjustment
    // If we predicted an alert and it was wrong, threshold was too aggressive
    let thresholdAdjustment = 0;
    if (prediction.type === 'alert') {
      if (!this.wasAlertWarranted(prediction, outcome)) {
        thresholdAdjustment = 0.1; // Raise threshold (less sensitive)
      } else if (this.wasAlertLate(prediction, outcome)) {
        thresholdAdjustment = -0.1; // Lower threshold (more sensitive)
      }
    }
    
    // Calculate confidence calibration
    // If we said 80% confidence and we're only right 60% of the time, calibrate down
    const confidenceCalibration = this.calculateConfidenceCalibration(prediction);
    
    return {
      featureImportanceUpdate,
      thresholdAdjustment,
      confidenceCalibration,
    };
  }
  
  private async updateModels(validation: ValidationResult): Promise<void> {
    // Update feature importance in pattern miner
    for (const [feature, adjustment] of Object.entries(validation.learningSignals.featureImportanceUpdate)) {
      await this.adjustFeatureImportance(feature, adjustment);
    }
    
    // Update alert thresholds
    if (validation.learningSignals.thresholdAdjustment !== 0) {
      await this.adjustAlertThreshold(
        validation.prediction.metric,
        validation.learningSignals.thresholdAdjustment
      );
    }
    
    // Update confidence calibration
    await this.updateConfidenceModel(
      validation.prediction.metric,
      validation.learningSignals.confidenceCalibration
    );
  }
  
  async getModelAccuracy(): Promise<ModelAccuracyReport> {
    const validations = await this.getRecentValidations(100);
    
    return {
      overall: {
        meanAbsoluteError: average(validations.map(v => v.accuracy.absoluteError)),
        directionAccuracy: validations.filter(v => v.accuracy.directionCorrect).length / validations.length,
        confidenceCalibration: this.calculateOverallCalibration(validations),
      },
      byType: {
        alerts: this.calculateTypeAccuracy(validations.filter(v => v.predictionType === 'alert')),
        forecasts: this.calculateTypeAccuracy(validations.filter(v => v.predictionType === 'forecast')),
        patterns: this.calculateTypeAccuracy(validations.filter(v => v.predictionType === 'pattern')),
      },
      trends: {
        improving: this.isAccuracyImproving(validations),
        recentMae: average(validations.slice(0, 20).map(v => v.accuracy.absoluteError)),
        olderMae: average(validations.slice(50, 70).map(v => v.accuracy.absoluteError)),
      },
    };
  }
}
```

## 4.3 Cross-Learning Engine

```typescript
// src/lib/coachhelm/v2/learning/cross-learner.ts

export class CrossLearner {
  /**
   * Learn from ALL players to improve predictions for individual players.
   * 
   * Key insight: Patterns that work across many players are probably real.
   * Patterns that only work for one player might be noise.
   */
  
  async buildGlobalPatternLibrary(): Promise<GlobalPatternLibrary> {
    const allPlayers = await this.getAllPlayers();
    const patternCounts: Map<string, PatternInstance[]> = new Map();
    
    // Collect patterns from all players
    for (const player of allPlayers) {
      const patterns = await this.getPlayerPatterns(player.id);
      
      for (const pattern of patterns) {
        const key = this.getPatternSignature(pattern);
        
        if (!patternCounts.has(key)) {
          patternCounts.set(key, []);
        }
        
        patternCounts.get(key)!.push({
          playerId: player.id,
          pattern,
          playerTier: player.tier,
          playerStyle: player.playStyle,
        });
      }
    }
    
    // Filter to patterns seen across multiple players
    const globalPatterns: GlobalPattern[] = [];
    
    for (const [key, instances] of patternCounts.entries()) {
      if (instances.length >= 5) { // Seen in at least 5 players
        globalPatterns.push({
          signature: key,
          instances,
          prevalence: instances.length / allPlayers.length,
          averageImpact: average(instances.map(i => i.pattern.strokeImpact)),
          variedByTier: this.calculateTierVariation(instances),
          variedByStyle: this.calculateStyleVariation(instances),
          confidence: Math.min(0.95, instances.length / 20),
        });
      }
    }
    
    return {
      patterns: globalPatterns,
      updatedAt: new Date(),
      playerCount: allPlayers.length,
    };
  }
  
  async findSimilarPlayers(playerId: string): Promise<SimilarPlayer[]> {
    const player = await this.getPlayerWithFeatures(playerId);
    const allPlayers = await this.getAllPlayersWithFeatures();
    
    const similarities: SimilarPlayer[] = [];
    
    for (const other of allPlayers) {
      if (other.id === playerId) continue;
      
      const similarity = this.calculatePlayerSimilarity(player, other);
      
      if (similarity > 0.7) { // At least 70% similar
        similarities.push({
          playerId: other.id,
          similarity,
          sharedPatterns: await this.findSharedPatterns(playerId, other.id),
          differingPatterns: await this.findDifferingPatterns(playerId, other.id),
          performanceComparison: this.comparePerformance(player, other),
        });
      }
    }
    
    return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
  }
  
  async transferLearning(
    fromPlayerId: string,
    toPlayerId: string
  ): Promise<TransferredInsights> {
    const fromPatterns = await this.getPlayerPatterns(fromPlayerId);
    const toPatterns = await this.getPlayerPatterns(toPlayerId);
    
    const insights: TransferredInsight[] = [];
    
    // Find patterns that work for similar player but haven't been discovered for target
    for (const fromPattern of fromPatterns) {
      const alreadyKnown = toPatterns.some(
        p => this.patternsAreSimilar(p, fromPattern)
      );
      
      if (!alreadyKnown && fromPattern.confidence > 0.7) {
        // Check if pattern might apply to target player
        const applicability = await this.checkPatternApplicability(
          fromPattern,
          toPlayerId
        );
        
        if (applicability > 0.5) {
          insights.push({
            pattern: fromPattern,
            sourcePlayerId: fromPlayerId,
            applicability,
            suggestion: `Based on similar player data, you might also struggle with ${fromPattern.description}. Consider monitoring this.`,
          });
        }
      }
    }
    
    // Find successful interventions from similar player
    const fromInterventions = await this.getSuccessfulInterventions(fromPlayerId);
    
    for (const intervention of fromInterventions) {
      const applicable = await this.checkInterventionApplicability(
        intervention,
        toPlayerId
      );
      
      if (applicable) {
        insights.push({
          type: 'intervention',
          intervention,
          sourcePlayerId: fromPlayerId,
          suggestion: `A similar player improved their ${intervention.targetArea} by ${intervention.improvement.toFixed(1)} strokes using this approach: ${intervention.description}`,
        });
      }
    }
    
    return {
      insights,
      sourcePlayers: [fromPlayerId],
      confidence: average(insights.map(i => i.applicability || 0.5)),
    };
  }
  
  private calculatePlayerSimilarity(
    player1: PlayerWithFeatures,
    player2: PlayerWithFeatures
  ): number {
    // Multi-dimensional similarity based on:
    // 1. Skill level (scoring average)
    // 2. Play style (stat profile)
    // 3. Pattern profile
    // 4. Response to situations
    
    const skillSimilarity = 1 - Math.abs(
      player1.scoringAverage - player2.scoringAverage
    ) / 10;
    
    const styleSimilarity = this.cosineSimilarity(
      player1.statProfile,
      player2.statProfile
    );
    
    const patternSimilarity = this.calculatePatternOverlap(
      player1.patterns,
      player2.patterns
    );
    
    const responseSimilarity = this.calculateResponseSimilarity(
      player1.situationalResponses,
      player2.situationalResponses
    );
    
    return (
      skillSimilarity * 0.3 +
      styleSimilarity * 0.3 +
      patternSimilarity * 0.2 +
      responseSimilarity * 0.2
    );
  }
  
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    
    return dotProduct / (magnitudeA * magnitudeB);
  }
}
```

---

# Part 5: Reasoning Engine

How CoachHelm "thinks" about insights.

## 5.1 Multi-Type Reasoning

```typescript
// src/lib/coachhelm/v2/reasoning/reasoning-engine.ts

export interface ReasoningResult {
  conclusion: string;
  confidence: number;
  reasoningType: 'deductive' | 'inductive' | 'abductive';
  
  // The logical chain
  chain: ReasoningStep[];
  
  // Alternative conclusions considered
  alternatives: {
    conclusion: string;
    probability: number;
    whyRejected: string;
  }[];
  
  // What would change our mind
  sensitivities: {
    assumption: string;
    ifFalse: string;
  }[];
}

export interface ReasoningStep {
  type: 'premise' | 'inference' | 'observation' | 'hypothesis';
  content: string;
  confidence: number;
  evidence?: string[];
}

export class ReasoningEngine {
  /**
   * Three types of reasoning:
   * 
   * 1. Deductive: If A→B and A, then B.
   *    "If scoring average increases by 2+ strokes for 5 rounds, alert. 
   *     Scoring increased by 2.3 over 5 rounds. Therefore, alert."
   * 
   * 2. Inductive: Pattern recognition from data.
   *    "In 8 of 10 rounds after a layoff of 7+ days, scoring was 2+ over average.
   *     Therefore, layoffs probably cause rust."
   * 
   * 3. Abductive: Best explanation for observations.
   *    "Putting deteriorated suddenly. Recent equipment change? Injury? Yips?
   *     Most likely: New putter hasn't been dialed in yet."
   */
  
  async reason(
    observation: Observation,
    context: ReasoningContext
  ): Promise<ReasoningResult> {
    // Try each reasoning type
    const deductiveResult = await this.reasonDeductively(observation, context);
    const inductiveResult = await this.reasonInductively(observation, context);
    const abductiveResult = await this.reasonAbductively(observation, context);
    
    // Select best reasoning approach based on confidence
    const results = [deductiveResult, inductiveResult, abductiveResult]
      .filter(r => r !== null)
      .sort((a, b) => b!.confidence - a!.confidence);
    
    if (results.length === 0) {
      return this.createUncertainResult(observation);
    }
    
    const best = results[0]!;
    
    // Add alternatives from other reasoning types
    best.alternatives = results.slice(1).map(r => ({
      conclusion: r!.conclusion,
      probability: r!.confidence,
      whyRejected: `Lower confidence (${(r!.confidence * 100).toFixed(0)}%)`,
    }));
    
    return best;
  }
  
  private async reasonDeductively(
    observation: Observation,
    context: ReasoningContext
  ): Promise<ReasoningResult | null> {
    // Find applicable rules
    const rules = this.findApplicableRules(observation, context);
    
    for (const rule of rules) {
      // Check if all premises are satisfied
      const premiseCheck = this.checkPremises(rule, context);
      
      if (premiseCheck.allSatisfied) {
        return {
          conclusion: rule.conclusion,
          confidence: Math.min(...premiseCheck.confidences),
          reasoningType: 'deductive',
          chain: [
            {
              type: 'premise',
              content: rule.premises.join(' AND '),
              confidence: Math.min(...premiseCheck.confidences),
              evidence: premiseCheck.evidence,
            },
            {
              type: 'inference',
              content: `Therefore: ${rule.conclusion}`,
              confidence: Math.min(...premiseCheck.confidences),
            },
          ],
          alternatives: [],
          sensitivities: rule.premises.map(p => ({
            assumption: p,
            ifFalse: `Conclusion would not follow if "${p}" were false`,
          })),
        };
      }
    }
    
    return null;
  }
  
  private async reasonInductively(
    observation: Observation,
    context: ReasoningContext
  ): Promise<ReasoningResult | null> {
    // Look for patterns that match this observation
    const patterns = await this.findMatchingPatterns(observation, context);
    
    if (patterns.length === 0) return null;
    
    const strongestPattern = patterns[0];
    
    return {
      conclusion: strongestPattern.conclusion,
      confidence: strongestPattern.confidence,
      reasoningType: 'inductive',
      chain: [
        {
          type: 'observation',
          content: `Observed: ${observation.description}`,
          confidence: 1.0,
        },
        {
          type: 'premise',
          content: `In ${(strongestPattern.frequency * 100).toFixed(0)}% of similar situations, ${strongestPattern.outcome}`,
          confidence: strongestPattern.confidence,
          evidence: strongestPattern.evidence,
        },
        {
          type: 'inference',
          content: `Therefore, likely: ${strongestPattern.conclusion}`,
          confidence: strongestPattern.confidence,
        },
      ],
      alternatives: patterns.slice(1).map(p => ({
        conclusion: p.conclusion,
        probability: p.confidence,
        whyRejected: `Lower frequency (${(p.frequency * 100).toFixed(0)}%)`,
      })),
      sensitivities: [{
        assumption: 'Past patterns predict future behavior',
        ifFalse: 'This time could be different if circumstances have changed',
      }],
    };
  }
  
  private async reasonAbductively(
    observation: Observation,
    context: ReasoningContext
  ): Promise<ReasoningResult | null> {
    // Generate possible explanations
    const explanations = await this.generateExplanations(observation, context);
    
    if (explanations.length === 0) return null;
    
    // Rank by likelihood (considering prior probability and fit with evidence)
    const ranked = explanations
      .map(e => ({
        ...e,
        score: this.scoreExplanation(e, observation, context),
      }))
      .sort((a, b) => b.score - a.score);
    
    const bestExplanation = ranked[0];
    
    return {
      conclusion: bestExplanation.explanation,
      confidence: bestExplanation.score,
      reasoningType: 'abductive',
      chain: [
        {
          type: 'observation',
          content: `Observed: ${observation.description}`,
          confidence: 1.0,
        },
        {
          type: 'hypothesis',
          content: `Possible explanations: ${ranked.map(r => r.explanation).join(', ')}`,
          confidence: 0.8,
        },
        {
          type: 'inference',
          content: `Best explanation: ${bestExplanation.explanation}`,
          confidence: bestExplanation.score,
          evidence: bestExplanation.supportingEvidence,
        },
      ],
      alternatives: ranked.slice(1, 4).map(r => ({
        conclusion: r.explanation,
        probability: r.score,
        whyRejected: r.weaknesses[0] || 'Lower overall fit with evidence',
      })),
      sensitivities: bestExplanation.supportingEvidence.map(e => ({
        assumption: e,
        ifFalse: `Would need to reconsider explanation if this weren't true`,
      })),
    };
  }
  
  private async generateExplanations(
    observation: Observation,
    context: ReasoningContext
  ): Promise<Explanation[]> {
    const explanations: Explanation[] = [];
    
    // Domain-specific explanation templates
    const templates = this.getExplanationTemplates(observation.type);
    
    for (const template of templates) {
      // Check if this explanation is plausible given context
      const plausibility = this.checkPlausibility(template, context);
      
      if (plausibility > 0.2) {
        explanations.push({
          explanation: template.fill(context),
          priorProbability: template.baseProbability,
          supportingEvidence: this.findSupportingEvidence(template, context),
          contradictingEvidence: this.findContradictingEvidence(template, context),
          weaknesses: template.knownWeaknesses,
        });
      }
    }
    
    return explanations;
  }
  
  private scoreExplanation(
    explanation: Explanation,
    observation: Observation,
    context: ReasoningContext
  ): number {
    // Bayesian-ish scoring
    // P(explanation | observation) ∝ P(observation | explanation) * P(explanation)
    
    const prior = explanation.priorProbability;
    
    // Likelihood: How well does this explanation fit the observation?
    const supportScore = explanation.supportingEvidence.length * 0.1;
    const contradictScore = explanation.contradictingEvidence.length * -0.2;
    const fitScore = 0.5 + supportScore + contradictScore;
    
    // Simplicity bonus (Occam's razor)
    const simplicityBonus = 1 / (1 + explanation.weaknesses.length * 0.1);
    
    return Math.min(0.95, prior * fitScore * simplicityBonus);
  }
  
  private getExplanationTemplates(observationType: string): ExplanationTemplate[] {
    const templates: Record<string, ExplanationTemplate[]> = {
      'putting_decline': [
        {
          id: 'green_reading',
          baseProbability: 0.3,
          fill: (ctx) => 'Struggles reading greens on unfamiliar course types',
          knownWeaknesses: ['May not apply to home courses'],
        },
        {
          id: 'speed_control',
          baseProbability: 0.25,
          fill: (ctx) => 'Lag putting distance control has deteriorated',
          knownWeaknesses: ['Could be course-specific'],
        },
        {
          id: 'confidence',
          baseProbability: 0.2,
          fill: (ctx) => 'Mental confidence on short putts has declined',
          knownWeaknesses: ['Hard to directly measure'],
        },
        {
          id: 'equipment',
          baseProbability: 0.15,
          fill: (ctx) => ctx.hasEquipmentChange ? 'New putter not yet dialed in' : 'Equipment not the cause',
          knownWeaknesses: ['Only relevant if equipment changed'],
        },
        {
          id: 'physical',
          baseProbability: 0.1,
          fill: (ctx) => 'Physical issue affecting stroke',
          knownWeaknesses: ['Requires player confirmation'],
        },
      ],
      'scoring_spike': [
        {
          id: 'course_difficulty',
          baseProbability: 0.25,
          fill: (ctx) => `Course was significantly harder (${ctx.courseDifficulty} vs typical)`,
          knownWeaknesses: ['May not fully explain magnitude'],
        },
        {
          id: 'one_bad_hole',
          baseProbability: 0.3,
          fill: (ctx) => 'One or two blow-up holes skewed the round',
          knownWeaknesses: ['Underlying cause of blow-ups still unknown'],
        },
        {
          id: 'mental',
          baseProbability: 0.2,
          fill: (ctx) => 'Mental focus was off (external factors?)',
          knownWeaknesses: ['Hard to verify'],
        },
        {
          id: 'variance',
          baseProbability: 0.25,
          fill: (ctx) => 'Normal variance - bad days happen',
          knownWeaknesses: ['Doesn\'t explain if pattern continues'],
        },
      ],
    };
    
    return templates[observationType] || [];
  }
}
```

## 5.2 Confidence Calibration

```typescript
// src/lib/coachhelm/v2/reasoning/confidence-calibrator.ts

export class ConfidenceCalibrator {
  /**
   * Ensure our confidence scores are calibrated.
   * When we say "80% confident", we should be right ~80% of the time.
   * 
   * Many AI systems are overconfident. We must not be.
   */
  
  private calibrationCurve: Map<number, number> = new Map();
  
  async calibrate(rawConfidence: number): Promise<number> {
    // Load calibration curve from historical accuracy
    const curve = await this.getCalibrationCurve();
    
    // Find nearest calibration points
    const lower = Math.floor(rawConfidence * 10) / 10;
    const upper = Math.ceil(rawConfidence * 10) / 10;
    
    const lowerCalibrated = curve.get(lower) || lower;
    const upperCalibrated = curve.get(upper) || upper;
    
    // Linear interpolation
    const t = (rawConfidence - lower) / 0.1;
    return lowerCalibrated + t * (upperCalibrated - lowerCalibrated);
  }
  
  async updateCalibrationCurve(): Promise<void> {
    const validations = await this.getHistoricalValidations();
    
    // Group by confidence bucket
    const buckets: Map<number, { correct: number; total: number }> = new Map();
    
    for (const v of validations) {
      const bucket = Math.round(v.statedConfidence * 10) / 10;
      
      if (!buckets.has(bucket)) {
        buckets.set(bucket, { correct: 0, total: 0 });
      }
      
      buckets.get(bucket)!.total++;
      if (v.wasCorrect) {
        buckets.get(bucket)!.correct++;
      }
    }
    
    // Calculate actual accuracy per bucket
    const newCurve: Map<number, number> = new Map();
    
    for (const [bucket, stats] of buckets) {
      if (stats.total >= 20) { // Minimum sample size
        const actualAccuracy = stats.correct / stats.total;
        newCurve.set(bucket, actualAccuracy);
      }
    }
    
    // Save calibration curve
    await this.saveCalibrationCurve(newCurve);
    this.calibrationCurve = newCurve;
  }
  
  async getConfidenceAnalysis(): Promise<ConfidenceAnalysis> {
    const curve = await this.getCalibrationCurve();
    
    // Calculate overall calibration error
    let totalError = 0;
    let points = 0;
    
    for (const [stated, actual] of curve) {
      totalError += Math.abs(stated - actual);
      points++;
    }
    
    const averageError = points > 0 ? totalError / points : 0;
    
    // Determine if we're over or under confident
    const biasSum = Array.from(curve.entries())
      .reduce((sum, [stated, actual]) => sum + (stated - actual), 0);
    
    const bias = points > 0 ? biasSum / points : 0;
    
    return {
      averageCalibrationError: averageError,
      bias: bias > 0.05 ? 'overconfident' : bias < -0.05 ? 'underconfident' : 'well-calibrated',
      biasAmount: bias,
      curve: Object.fromEntries(curve),
      sampleSize: points,
      recommendations: this.getCalibrationRecommendations(averageError, bias),
    };
  }
  
  private getCalibrationRecommendations(
    error: number,
    bias: number
  ): string[] {
    const recommendations: string[] = [];
    
    if (error > 0.15) {
      recommendations.push('Confidence scores need significant recalibration');
    }
    
    if (bias > 0.1) {
      recommendations.push('System is overconfident - consider reducing stated confidence by ~10%');
    } else if (bias < -0.1) {
      recommendations.push('System is underconfident - predictions are better than stated');
    }
    
    return recommendations;
  }
}
```

---

# Part 6: Natural Language Generation

How CoachHelm communicates insights.

## 6.1 Insight Composer

```typescript
// src/lib/coachhelm/v2/nlg/insight-composer.ts

export interface ComposedInsight {
  headline: string;
  body: string;
  evidence: string[];
  callToAction: string | null;
  tone: 'neutral' | 'encouraging' | 'cautionary' | 'celebratory';
  verbosityLevel: 'brief' | 'detailed' | 'comprehensive';
}

export class InsightComposer {
  async compose(
    insight: RawInsight,
    context: CompositionContext
  ): Promise<ComposedInsight> {
    // 1. Determine tone based on insight and context
    const tone = this.determineTone(insight, context);
    
    // 2. Get verbosity preference
    const verbosity = context.coachPreferences?.preferredDetailLevel || 'detailed';
    
    // 3. Compose headline
    const headline = this.composeHeadline(insight, tone);
    
    // 4. Compose body
    const body = this.composeBody(insight, context, verbosity);
    
    // 5. Extract evidence
    const evidence = this.formatEvidence(insight.evidence);
    
    // 6. Generate call to action
    const callToAction = this.generateCallToAction(insight, context);
    
    return {
      headline,
      body,
      evidence,
      callToAction,
      tone,
      verbosityLevel: verbosity,
    };
  }
  
  private determineTone(insight: RawInsight, context: CompositionContext): ComposedInsight['tone'] {
    // Consider player state
    if (context.playerContext?.formCycle === 'struggling') {
      // Be more encouraging when player is struggling
      if (insight.direction === 'positive') {
        return 'celebratory';
      }
      return 'encouraging'; // Even for negative insights
    }
    
    // Consider insight type
    if (insight.type === 'highlight') {
      return 'celebratory';
    }
    
    if (insight.type === 'concern' && insight.severity === 'high') {
      return 'cautionary';
    }
    
    if (insight.direction === 'positive') {
      return 'encouraging';
    }
    
    return 'neutral';
  }
  
  private composeHeadline(insight: RawInsight, tone: ComposedInsight['tone']): string {
    // Use templates with variation
    const templates = this.getHeadlineTemplates(insight.type, tone);
    const template = this.selectTemplate(templates, insight);
    
    return this.fillTemplate(template, insight);
  }
  
  private composeBody(
    insight: RawInsight,
    context: CompositionContext,
    verbosity: ComposedInsight['verbosityLevel']
  ): string {
    const paragraphs: string[] = [];
    
    // Opening: What we observed
    paragraphs.push(this.composeOpening(insight, context));
    
    // Middle: Why it matters (if detailed or comprehensive)
    if (verbosity !== 'brief') {
      paragraphs.push(this.composeMiddle(insight, context));
    }
    
    // Context: What else to consider (if comprehensive)
    if (verbosity === 'comprehensive') {
      paragraphs.push(this.composeContext(insight, context));
    }
    
    // Closing: What this means going forward
    if (insight.actionable) {
      paragraphs.push(this.composeClosing(insight, context));
    }
    
    return paragraphs.filter(p => p).join('\n\n');
  }
  
  private composeOpening(insight: RawInsight, context: CompositionContext): string {
    const openers: Record<string, (i: RawInsight) => string> = {
      scoring_decline: (i) => `Scoring has increased by ${i.magnitude.toFixed(1)} strokes over the last ${i.window} rounds.`,
      pattern_detected: (i) => `A pattern has emerged: ${i.patternDescription}.`,
      trend_change: (i) => `The ${i.direction === 'positive' ? 'improvement' : 'decline'} trend that started ${i.trendStart} has ${i.trendStatus}.`,
      anomaly: (i) => `Something unusual: ${i.anomalyDescription}.`,
      milestone: (i) => `Milestone reached: ${i.milestoneDescription}.`,
      prediction: (i) => `Looking ahead: ${i.predictionDescription}.`,
    };
    
    const opener = openers[insight.type];
    return opener ? opener(insight) : insight.observation;
  }
  
  private composeMiddle(insight: RawInsight, context: CompositionContext): string {
    // Why this matters
    const reasons: string[] = [];
    
    if (insight.strokeImpact) {
      reasons.push(`This is costing approximately ${Math.abs(insight.strokeImpact).toFixed(1)} strokes per round.`);
    }
    
    if (insight.comparisonToBenchmark) {
      const diff = insight.currentValue - insight.benchmarkValue;
      const better = diff < 0;
      reasons.push(`This is ${Math.abs(diff).toFixed(1)} strokes ${better ? 'better' : 'worse'} than ${insight.benchmarkName}.`);
    }
    
    if (insight.trend) {
      const trendDescriptions = {
        'worsening': 'and the trend is heading in the wrong direction',
        'improving': 'but the trend is positive',
        'stable': 'and has been consistent',
      };
      reasons.push(trendDescriptions[insight.trend] || '');
    }
    
    return reasons.join(' ');
  }
  
  private composeContext(insight: RawInsight, context: CompositionContext): string {
    const contextNotes: string[] = [];
    
    // Add player context
    if (context.playerContext?.flags?.swingChange) {
      contextNotes.push('Note: Player is currently working on swing changes, which may explain some variance.');
    }
    
    if (context.playerContext?.formCycle === 'recovering') {
      contextNotes.push('The player appears to be recovering from a rough stretch.');
    }
    
    // Add comparative context
    if (context.teamContext) {
      const teamComparison = this.compareToTeam(insight, context.teamContext);
      if (teamComparison) {
        contextNotes.push(teamComparison);
      }
    }
    
    // Add historical context
    if (insight.historicalComparison) {
      contextNotes.push(`For context, ${insight.historicalComparison}.`);
    }
    
    return contextNotes.join(' ');
  }
  
  private composeClosing(insight: RawInsight, context: CompositionContext): string {
    if (!insight.actionable) return '';
    
    const closings: string[] = [];
    
    if (insight.suggestedFocus) {
      closings.push(`Suggested focus: ${insight.suggestedFocus}.`);
    }
    
    if (insight.relatedPattern) {
      closings.push(`This connects to the ${insight.relatedPattern} pattern we've been tracking.`);
    }
    
    return closings.join(' ');
  }
  
  private generateCallToAction(
    insight: RawInsight,
    context: CompositionContext
  ): string | null {
    if (!insight.actionable) return null;
    
    const ctas: Record<string, string> = {
      'scoring_decline': 'Review strokes gained breakdown to identify the root cause',
      'pattern_detected': 'Add this pattern to focus areas for dedicated practice',
      'bubble_alert': 'Consider scheduling a check-in with this player',
      'trend_change': 'Monitor over the next 2-3 rounds to confirm the trend',
      'equipment_change': 'Allow 5-10 rounds for equipment adjustment period',
    };
    
    return ctas[insight.type] || null;
  }
  
  private getHeadlineTemplates(
    type: string,
    tone: ComposedInsight['tone']
  ): string[] {
    const templates: Record<string, Record<string, string[]>> = {
      scoring_decline: {
        neutral: [
          'Scoring average has increased',
          'Recent rounds trending above average',
        ],
        cautionary: [
          'Attention needed: Scoring has climbed',
          'Worth watching: Scoring trend moving up',
        ],
        encouraging: [
          'A few higher scores recently — opportunity to bounce back',
          'Room for improvement in recent rounds',
        ],
      },
      milestone: {
        celebratory: [
          '🎉 ${milestone} achieved!',
          'Goal reached: ${milestone}',
          'Breakthrough: ${milestone}',
        ],
        encouraging: [
          'Progress milestone: ${milestone}',
          'Step forward: ${milestone}',
        ],
      },
      pattern_detected: {
        neutral: [
          'Pattern identified: ${patternName}',
          'New insight: ${patternName}',
        ],
        cautionary: [
          'Recurring issue: ${patternName}',
          'Pattern to address: ${patternName}',
        ],
      },
    };
    
    return templates[type]?.[tone] || templates[type]?.neutral || ['Update: ${type}'];
  }
  
  private selectTemplate(templates: string[], insight: RawInsight): string {
    // Add some variation by selecting randomly, but consistently for same insight
    const hash = this.hashInsight(insight);
    return templates[hash % templates.length];
  }
  
  private fillTemplate(template: string, insight: RawInsight): string {
    return template.replace(/\$\{(\w+)\}/g, (match, key) => {
      return insight[key as keyof RawInsight]?.toString() || match;
    });
  }
  
  private hashInsight(insight: RawInsight): number {
    // Simple hash for consistent but varied selection
    let hash = 0;
    const str = insight.id || insight.type;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}
```

---

# Part 7: Putting It All Together

The main orchestration.

## 7.1 Intelligence Orchestrator

```typescript
// src/lib/coachhelm/v2/orchestrator.ts

export class CoachHelmIntelligence {
  private patternMiner: PatternMiner;
  private causalEngine: CausalEngine;
  private predictor: PerformancePredictor;
  private trajectoryForecaster: TrajectoryForecaster;
  private reasoningEngine: ReasoningEngine;
  private behaviorLearner: BehaviorLearner;
  private crossLearner: CrossLearner;
  private outcomeValidator: OutcomeValidator;
  private insightComposer: InsightComposer;
  private confidenceCalibrator: ConfidenceCalibrator;
  
  constructor() {
    this.patternMiner = new PatternMiner();
    this.causalEngine = new CausalEngine();
    this.predictor = new PerformancePredictor();
    this.trajectoryForecaster = new TrajectoryForecaster();
    this.reasoningEngine = new ReasoningEngine();
    this.behaviorLearner = new BehaviorLearner();
    this.crossLearner = new CrossLearner();
    this.outcomeValidator = new OutcomeValidator();
    this.insightComposer = new InsightComposer();
    this.confidenceCalibrator = new ConfidenceCalibrator();
  }
  
  /**
   * Main entry point: Analyze a player and generate insights.
   */
  async analyzePlayer(
    playerId: string,
    options: AnalysisOptions = {}
  ): Promise<PlayerAnalysis> {
    // 1. Extract all features
    const features = await this.extractAllFeatures(playerId);
    
    // 2. Mine patterns
    const patterns = await this.patternMiner.minePatterns(playerId);
    
    // 3. Discover causal relationships
    const causalRelationships = await this.causalEngine.discoverCausalRelationships(playerId);
    
    // 4. Generate predictions
    const prediction = await this.predictor.predictPerformance(playerId, new Date());
    const trajectory = await this.trajectoryForecaster.forecastTrajectory(playerId, '1_month');
    
    // 5. Apply reasoning to generate insights
    const rawInsights = await this.generateRawInsights(
      playerId,
      features,
      patterns,
      causalRelationships,
      prediction,
      trajectory
    );
    
    // 6. Calibrate confidence
    for (const insight of rawInsights) {
      insight.confidence = await this.confidenceCalibrator.calibrate(insight.confidence);
    }
    
    // 7. Personalize based on learned behavior
    const coachBehavior = await this.behaviorLearner.getBehavior(
      options.coachId || playerId,
      options.coachId ? 'coach' : 'player'
    );
    
    const personalizedInsights = this.personalizeInsights(rawInsights, coachBehavior);
    
    // 8. Compose natural language
    const composedInsights = await Promise.all(
      personalizedInsights.map(insight =>
        this.insightComposer.compose(insight, {
          playerContext: features.contextual,
          coachPreferences: coachBehavior.preferences,
        })
      )
    );
    
    // 9. Cross-learning insights
    const crossInsights = await this.crossLearner.transferLearning(
      await this.findMostSimilarPlayer(playerId),
      playerId
    );
    
    return {
      playerId,
      analyzedAt: new Date(),
      features,
      patterns,
      causalRelationships,
      prediction,
      trajectory,
      insights: composedInsights,
      crossInsights: crossInsights.insights,
      confidence: {
        overall: average(composedInsights.map(i => i.confidence || 0.5)),
        dataQuality: this.assessDataQuality(features),
        modelAccuracy: await this.outcomeValidator.getModelAccuracy(),
      },
    };
  }
  
  /**
   * Generate round review with full intelligence.
   */
  async generateRoundReview(
    roundId: string,
    playerId: string
  ): Promise<IntelligentRoundReview> {
    // Standard review generation
    const baseReview = await this.generateBaseReview(roundId, playerId);
    
    // Enhance with V2 intelligence
    const patterns = await this.patternMiner.minePatterns(playerId);
    const relevantPatterns = patterns.filter(p => 
      this.patternAppliedThisRound(p, baseReview)
    );
    
    // Causal analysis of problem areas
    const causalAnalysis = await this.analyzeCauses(baseReview.areasToReview);
    
    // Predictive context
    const whatThisMeansForFuture = await this.predictor.predictPerformance(
      playerId,
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 1 week out
    );
    
    // Reasoning about the round
    const roundReasoning = await this.reasoningEngine.reason(
      {
        type: 'round_performance',
        description: `Shot ${baseReview.roundScore} (${baseReview.roundScoreToPar > 0 ? '+' : ''}${baseReview.roundScoreToPar})`,
        data: baseReview,
      },
      { playerId, patterns }
    );
    
    return {
      ...baseReview,
      patterns: {
        applied: relevantPatterns,
        new: patterns.filter(p => p.trend === 'new'),
        improving: patterns.filter(p => p.trend === 'declining'),
        worsening: patterns.filter(p => p.trend === 'growing'),
      },
      causalAnalysis,
      futurePrediction: whatThisMeansForFuture,
      reasoning: roundReasoning,
      intelligentSummary: await this.composeIntelligentSummary(
        baseReview,
        relevantPatterns,
        causalAnalysis,
        roundReasoning
      ),
    };
  }
  
  /**
   * Generate alerts with full intelligence.
   */
  async generateAlerts(
    coachId: string,
    teamId: string
  ): Promise<IntelligentAlert[]> {
    const players = await this.getTeamPlayers(teamId);
    const alerts: IntelligentAlert[] = [];
    
    for (const player of players) {
      // Analyze player
      const analysis = await this.analyzePlayer(player.id, { coachId });
      
      // Generate alerts from analysis
      const playerAlerts = await this.convertToAlerts(analysis, player);
      
      // Filter based on coach's learned thresholds
      const filteredAlerts = await this.filterByLearnedThresholds(
        playerAlerts,
        coachId
      );
      
      alerts.push(...filteredAlerts);
    }
    
    // Rank alerts
    const rankedAlerts = this.rankAlerts(alerts);
    
    // Add cross-player insights
    const crossPlayerInsights = await this.generateCrossPlayerInsights(players);
    
    return [...rankedAlerts, ...crossPlayerInsights];
  }
  
  /**
   * Learning loop: Call this after interactions.
   */
  async learn(interaction: Interaction): Promise<void> {
    // Update behavior model
    await this.behaviorLearner.learnFromInteraction(
      interaction.entityId,
      interaction.entityType,
      interaction
    );
    
    // If this was a prediction that resolved, validate it
    if (interaction.type === 'prediction_resolved') {
      await this.outcomeValidator.validatePredictions();
    }
    
    // Update calibration periodically
    if (Math.random() < 0.1) { // 10% of interactions
      await this.confidenceCalibrator.updateCalibrationCurve();
    }
    
    // Update cross-learning models periodically
    if (Math.random() < 0.01) { // 1% of interactions
      await this.crossLearner.buildGlobalPatternLibrary();
    }
  }
  
  private personalizeInsights(
    insights: RawInsight[],
    behavior: LearnedBehavior
  ): RawInsight[] {
    return insights
      // Filter out insight types this user dismisses frequently
      .filter(i => {
        const typeStats = behavior.interactions.find(
          int => int.feature === i.type
        );
        if (!typeStats) return true;
        return typeStats.dismissalRate < 0.7; // Keep if <70% dismissal
      })
      // Reorder based on user's preferred types
      .sort((a, b) => {
        const aPreferred = behavior.preferences.preferredInsightTypes.includes(a.type);
        const bPreferred = behavior.preferences.preferredInsightTypes.includes(b.type);
        if (aPreferred && !bPreferred) return -1;
        if (!aPreferred && bPreferred) return 1;
        return b.importance - a.importance;
      })
      // Limit based on noise tolerance
      .slice(0, behavior.preferences.noiseToleranceLevel === 'low' ? 3 : 
             behavior.preferences.noiseToleranceLevel === 'medium' ? 5 : 10);
  }
}
```

---

## Database Tables for V2

```sql
-- Pattern storage with full V2 fields
CREATE TABLE golf_patterns_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id),
  
  -- Pattern definition
  pattern_type TEXT NOT NULL,
  conditions JSONB NOT NULL,
  outcome JSONB NOT NULL,
  
  -- Statistical validity
  support DECIMAL(5,4) NOT NULL,
  confidence DECIMAL(5,4) NOT NULL,
  lift DECIMAL(6,3) NOT NULL,
  conviction DECIMAL(6,3),
  
  -- Practical significance
  stroke_impact DECIMAL(4,2) NOT NULL,
  actionability DECIMAL(3,2) NOT NULL,
  
  -- Metadata
  sample_size INTEGER NOT NULL,
  first_detected TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_occurrence TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trend TEXT DEFAULT 'new',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Causal relationships
CREATE TABLE golf_causal_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES golf_players(id), -- NULL for global
  
  cause TEXT NOT NULL,
  effect TEXT NOT NULL,
  strength DECIMAL(4,3) NOT NULL,
  confidence DECIMAL(4,3) NOT NULL,
  mechanism TEXT NOT NULL,
  confounders JSONB DEFAULT '[]',
  intervention_potential DECIMAL(3,2) NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  validated_at TIMESTAMPTZ
);

-- Predictions (for validation)
CREATE TABLE golf_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id),
  prediction_type TEXT NOT NULL,
  
  -- What we predicted
  metric TEXT NOT NULL,
  predicted_value DECIMAL(6,2) NOT NULL,
  confidence DECIMAL(4,3) NOT NULL,
  confidence_interval JSONB NOT NULL,
  
  -- Context at prediction time
  features_snapshot JSONB NOT NULL,
  
  -- For validation
  due_date DATE NOT NULL,
  actual_value DECIMAL(6,2),
  validated_at TIMESTAMPTZ,
  was_correct BOOLEAN,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learned behavior
CREATE TABLE golf_learned_behavior (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('coach', 'player')),
  
  interactions JSONB DEFAULT '[]',
  preferences JSONB DEFAULT '{}',
  learned_thresholds JSONB DEFAULT '[]',
  engagement_patterns JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(entity_id, entity_type)
);

-- Validation results (for learning)
CREATE TABLE golf_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID NOT NULL REFERENCES golf_predictions(id),
  
  stated_confidence DECIMAL(4,3) NOT NULL,
  was_correct BOOLEAN NOT NULL,
  absolute_error DECIMAL(6,2),
  relative_error DECIMAL(5,4),
  within_confidence_interval BOOLEAN,
  direction_correct BOOLEAN,
  
  learning_signals JSONB NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Global pattern library (cross-learning)
CREATE TABLE golf_global_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature TEXT NOT NULL UNIQUE,
  
  prevalence DECIMAL(5,4) NOT NULL,
  average_impact DECIMAL(4,2) NOT NULL,
  confidence DECIMAL(4,3) NOT NULL,
  
  varied_by_tier JSONB,
  varied_by_style JSONB,
  
  instance_count INTEGER NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Confidence calibration
CREATE TABLE golf_confidence_calibration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket DECIMAL(3,2) NOT NULL,
  actual_accuracy DECIMAL(4,3) NOT NULL,
  sample_size INTEGER NOT NULL,
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(bucket)
);

-- Indexes for performance
CREATE INDEX idx_patterns_v2_player ON golf_patterns_v2(player_id);
CREATE INDEX idx_patterns_v2_type ON golf_patterns_v2(pattern_type);
CREATE INDEX idx_predictions_player ON golf_predictions(player_id);
CREATE INDEX idx_predictions_due ON golf_predictions(due_date) WHERE validated_at IS NULL;
CREATE INDEX idx_validations_correct ON golf_validations(was_correct);
CREATE INDEX idx_learned_behavior_entity ON golf_learned_behavior(entity_id, entity_type);
```

---

This is the V2 brain. It's:

1. **Pattern Mining** — Discovers non-obvious patterns across multiple dimensions
2. **Causal Inference** — Distinguishes correlation from causation
3. **Predictive** — Forecasts performance and trajectory
4. **Self-Calibrating** — Knows when it doesn't know
5. **Learning** — Gets smarter from every interaction
6. **Cross-Learning** — Applies lessons from similar players
7. **Reasoning** — Can explain its thinking
8. **Personalized** — Adapts to each coach and player

Want me to output this as a downloadable file?
