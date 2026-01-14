# CoachHelm Intelligence Engine

## How the Brain Works

---

## The Problem

Raw golf data is useless without context.

- A 2-stroke scoring increase might be catastrophic... or expected during a swing change.
- A 75 might be great for one player and terrible for another.
- Three-putts happen — but WHEN and WHY matters more than how many.

CoachHelm's job is to transform data into **contextual insight**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        COACHHELM INTELLIGENCE                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│   │   CONTEXT   │    │  BENCHMARK  │    │   PATTERN   │                │
│   │   ENGINE    │    │   ENGINE    │    │   ENGINE    │                │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                │
│          │                  │                  │                        │
│          └──────────────────┼──────────────────┘                        │
│                             │                                           │
│                    ┌────────▼────────┐                                  │
│                    │    INFERENCE    │                                  │
│                    │     ENGINE      │                                  │
│                    └────────┬────────┘                                  │
│                             │                                           │
│          ┌──────────────────┼──────────────────┐                        │
│          │                  │                  │                        │
│   ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐                │
│   │   ALERT     │    │   FOCUS     │    │   INSIGHT   │                │
│   │  GENERATOR  │    │  CALCULATOR │    │  GENERATOR  │                │
│   └─────────────┘    └─────────────┘    └─────────────┘                │
│                                                                         │
│                    ┌────────────────┐                                   │
│                    │    LEARNING    │                                   │
│                    │     LOOP       │◄──── Feedback                     │
│                    └────────────────┘                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Context Engine

The Context Engine answers: **"What's happening in this player's world right now?"**

### Player Context

```typescript
interface PlayerContext {
  // Current phase
  phase: 'preseason' | 'early_season' | 'mid_season' | 'championship' | 'postseason';
  
  // Active flags (from golf_player_context_flags)
  flags: {
    swingChange: boolean;
    equipmentChange: boolean;
    injury: 'none' | 'minor' | 'major';
    peakTarget: { eventId: string; daysUntil: number } | null;
    developmentMode: boolean;
  };
  
  // Current trajectory
  trajectory: 'improving' | 'stable' | 'declining' | 'volatile';
  trajectoryConfidence: number; // 0-1
  
  // Roster status
  rosterStatus: {
    currentPosition: number;
    travelCutoff: number;
    gapToCutoff: number; // positive = safe, negative = outside
    bubbleZone: boolean;
    trend: 'rising' | 'stable' | 'falling';
  };
  
  // Recent events
  recentEvents: {
    lastRoundDaysAgo: number;
    roundsLast14Days: number;
    lastTournamentResult: { position: number; field: number } | null;
  };
  
  // Goals
  activeGoals: {
    primary: { type: string; progress: number; onTrack: boolean } | null;
    secondary: { type: string; progress: number }[];
  };
}
```

### Team Context

```typescript
interface TeamContext {
  // Season phase
  seasonPhase: 'fall' | 'spring' | 'summer';
  
  // Next event
  nextEvent: {
    name: string;
    daysUntil: number;
    importance: 'practice' | 'regular' | 'major' | 'championship';
  } | null;
  
  // Roster urgency
  rosterUrgency: 'low' | 'medium' | 'high';
  qualifyingActive: boolean;
  spotsAvailable: number;
  
  // Team health
  playersWithFlags: number;
  playersInBubbleZone: number;
}
```

### How Context Affects Everything

```typescript
function shouldSuppressAlert(alert: Alert, context: PlayerContext): boolean {
  // During swing change, suppress scoring decline alerts unless extreme
  if (context.flags.swingChange && alert.type === 'scoring_decline') {
    return alert.severity !== 'high'; // Only show high severity
  }
  
  // During development mode, suppress most performance alerts
  if (context.flags.developmentMode) {
    return ['scoring_decline', 'stat_regression', 'plateau'].includes(alert.type);
  }
  
  // During major injury, suppress all non-critical alerts
  if (context.flags.injury === 'major') {
    return alert.severity !== 'high';
  }
  
  return false;
}

function adjustExpectations(baseline: number, context: PlayerContext): number {
  let adjusted = baseline;
  
  // Swing change: expect 5-10% worse performance
  if (context.flags.swingChange) {
    adjusted *= 1.07; // 7% buffer
  }
  
  // Minor injury: 5% buffer
  if (context.flags.injury === 'minor') {
    adjusted *= 1.05;
  }
  
  // Major injury: 15% buffer
  if (context.flags.injury === 'major') {
    adjusted *= 1.15;
  }
  
  // Peak target approaching: tighten expectations
  if (context.flags.peakTarget && context.flags.peakTarget.daysUntil < 14) {
    adjusted *= 0.98; // Expect them to be sharper
  }
  
  return adjusted;
}
```

---

## 2. Benchmark Engine

The Benchmark Engine answers: **"Compared to WHAT?"**

A raw number means nothing. "32 putts" — is that good? Bad? It depends on:
- This player's history
- The team average
- The course difficulty
- The player's current phase

### Benchmark Layers

```typescript
interface BenchmarkLayers {
  // Layer 1: Self (most important)
  self: {
    seasonAverage: number;
    last5Rounds: number;
    last10Rounds: number;
    bestRound: number;
    tournamentAverage: number;
    practiceAverage: number;
  };
  
  // Layer 2: Team
  team: {
    teamAverage: number;
    topQuartile: number;
    medianPlayer: number;
    travelRosterAverage: number;
  };
  
  // Layer 3: Tier (D1 elite, D1 competitive, D2/D3, etc.)
  tier: {
    tierAverage: number;
    tierTopQuartile: number;
    tierMedian: number;
  };
  
  // Layer 4: Course-adjusted
  courseAdjusted: {
    expectedScore: number;
    scoringAvgOnCourse: number;
    courseRating: number;
    slopeRating: number;
  };
}
```

### Benchmark Selection Logic

```typescript
function selectBenchmark(
  metric: string,
  context: PlayerContext,
  purpose: 'alert' | 'comparison' | 'goal'
): number {
  const benchmarks = getBenchmarksForPlayer(context.playerId);
  
  // For alerts: Compare to self (recent form)
  if (purpose === 'alert') {
    // Use last 5 rounds as primary benchmark
    // This catches recent decline even if overall season is good
    return benchmarks.self.last5Rounds;
  }
  
  // For comparisons: Weight based on coach philosophy
  if (purpose === 'comparison') {
    const philosophy = getCoachPhilosophy(context.coachId);
    
    return (
      benchmarks.self.seasonAverage * (philosophy.weightHistorical / 100) +
      benchmarks.self.last5Rounds * (philosophy.weightRecentForm / 100) +
      benchmarks.self.tournamentAverage * (philosophy.weightTournament / 100)
    );
  }
  
  // For goals: Compare to tier benchmark
  if (purpose === 'goal') {
    // What does "good" look like for their level?
    return benchmarks.tier.tierTopQuartile;
  }
  
  return benchmarks.self.seasonAverage;
}
```

### Adaptive Benchmarks

Benchmarks evolve over time. A freshman in fall has different benchmarks than a senior in spring.

```typescript
function buildAdaptiveBenchmark(playerId: string): AdaptiveBenchmark {
  const rounds = getPlayerRounds(playerId, { limit: 50 });
  
  // Calculate rolling averages
  const windows = [5, 10, 20, 50];
  const rollingAverages = windows.map(w => ({
    window: w,
    average: calculateAverage(rounds.slice(0, w)),
    trend: calculateTrend(rounds.slice(0, w)),
  }));
  
  // Detect improvement trajectory
  const improvementRate = calculateImprovementRate(rounds);
  
  // Project forward
  const projectedBaseline = rounds[0].average + (improvementRate * 5); // 5 rounds ahead
  
  return {
    current: rounds[0].average,
    rollingAverages,
    improvementRate,
    projectedBaseline,
    
    // Dynamic thresholds
    declineThreshold: projectedBaseline * 1.03, // 3% above projected
    plateauThreshold: improvementRate * 0.5, // Less than half normal improvement
  };
}
```

---

## 3. Pattern Engine

The Pattern Engine answers: **"What keeps happening?"**

This is where the intelligence gets interesting. Patterns are discovered, not hardcoded.

### Pattern Detection

```typescript
interface DetectedPattern {
  id: string;
  type: PatternType;
  
  // What's happening
  description: string;
  evidence: PatternEvidence[];
  
  // How often
  frequency: number; // 0-1, percentage of rounds
  confidence: number; // 0-1, statistical confidence
  
  // Impact
  strokesPerRound: number; // Average strokes lost to this pattern
  
  // Trend
  trend: 'new' | 'recurring' | 'improving' | 'worsening';
  firstDetected: string;
  lastSeen: string;
  occurrences: number;
}

interface PatternEvidence {
  roundId: string;
  date: string;
  holeNumbers: number[];
  details: string;
  strokesLost: number;
}
```

### Pattern Mining Algorithm

```typescript
function minePatterns(playerId: string): DetectedPattern[] {
  const rounds = getPlayerRounds(playerId, { limit: 20, includeHoles: true });
  const patterns: Map<string, PatternCandidate> = new Map();
  
  // 1. Scan for hole-level patterns
  for (const round of rounds) {
    for (const hole of round.holes) {
      // Three-putt patterns
      if (hole.putts >= 3) {
        const trigger = identifyThreePuttTrigger(hole);
        addOrUpdatePattern(patterns, `three_putt_${trigger}`, {
          roundId: round.id,
          holeNumber: hole.holeNumber,
          details: trigger,
          strokesLost: hole.putts - 2,
        });
      }
      
      // Big number patterns
      if (hole.scoreToPar >= 2) {
        const cause = identifyBigNumberCause(hole);
        addOrUpdatePattern(patterns, `big_number_${cause}`, {
          roundId: round.id,
          holeNumber: hole.holeNumber,
          details: cause,
          strokesLost: hole.scoreToPar,
        });
      }
      
      // Hole type patterns
      const holeType = `par_${hole.par}`;
      const scoreDiff = hole.score - hole.par;
      addOrUpdatePattern(patterns, `${holeType}_performance`, {
        roundId: round.id,
        holeNumber: hole.holeNumber,
        details: `${scoreDiff >= 0 ? '+' : ''}${scoreDiff}`,
        strokesLost: Math.max(0, scoreDiff),
      });
    }
    
    // 2. Scan for sequence patterns
    const sequences = detectSequences(round.holes);
    for (const seq of sequences) {
      addOrUpdatePattern(patterns, seq.type, seq.evidence);
    }
    
    // 3. Scan for positional patterns (front vs back, closing holes)
    const positional = detectPositionalPatterns(round.holes);
    for (const pos of positional) {
      addOrUpdatePattern(patterns, pos.type, pos.evidence);
    }
  }
  
  // 4. Filter to statistically significant patterns
  const significant = Array.from(patterns.values())
    .filter(p => p.occurrences >= 3) // Minimum 3 times
    .filter(p => p.frequency >= 0.25) // In at least 25% of rounds
    .filter(p => p.strokesPerRound >= 0.5) // Costs at least 0.5 strokes/round
    .map(p => finalizePattern(p));
  
  // 5. Rank by impact
  return significant.sort((a, b) => b.strokesPerRound - a.strokesPerRound);
}

function identifyThreePuttTrigger(hole: HoleData): string {
  // Look at first putt distance
  if (hole.firstPuttDistance > 40) return 'lag_distance_40plus';
  if (hole.firstPuttDistance > 25) return 'lag_distance_25_40';
  
  // Look at leave distance
  if (hole.secondPuttDistance > 5) return 'poor_lag_leave';
  
  // Short putt miss
  if (hole.secondPuttDistance <= 5) return 'short_putt_miss';
  
  return 'unknown';
}

function detectSequences(holes: HoleData[]): SequencePattern[] {
  const sequences: SequencePattern[] = [];
  
  // Detect: bogey followed by double+
  for (let i = 1; i < holes.length; i++) {
    if (holes[i-1].scoreToPar === 1 && holes[i].scoreToPar >= 2) {
      sequences.push({
        type: 'bogey_snowball',
        evidence: {
          holeNumbers: [holes[i-1].holeNumber, holes[i].holeNumber],
          details: 'Bogey followed by double or worse',
          strokesLost: holes[i].scoreToPar,
        },
      });
    }
  }
  
  // Detect: birdie followed by bogey+
  for (let i = 1; i < holes.length; i++) {
    if (holes[i-1].scoreToPar <= -1 && holes[i].scoreToPar >= 1) {
      sequences.push({
        type: 'birdie_giveaway',
        evidence: {
          holeNumbers: [holes[i-1].holeNumber, holes[i].holeNumber],
          details: 'Gave back stroke immediately after birdie',
          strokesLost: holes[i].scoreToPar,
        },
      });
    }
  }
  
  return sequences;
}

function detectPositionalPatterns(holes: HoleData[]): PositionalPattern[] {
  const patterns: PositionalPattern[] = [];
  
  // Closing holes (16, 17, 18)
  const closingHoles = holes.filter(h => h.holeNumber >= 16);
  const closingScoreToPar = closingHoles.reduce((sum, h) => sum + h.scoreToPar, 0);
  const averageScoreToPar = holes.reduce((sum, h) => sum + h.scoreToPar, 0) / holes.length;
  
  if (closingScoreToPar / 3 > averageScoreToPar + 0.5) {
    patterns.push({
      type: 'closing_hole_struggle',
      evidence: {
        holeNumbers: closingHoles.map(h => h.holeNumber),
        details: `+${closingScoreToPar} on closing stretch`,
        strokesLost: closingScoreToPar - (averageScoreToPar * 3),
      },
    });
  }
  
  // Front nine vs back nine
  const frontNine = holes.filter(h => h.holeNumber <= 9);
  const backNine = holes.filter(h => h.holeNumber > 9);
  const frontTotal = frontNine.reduce((sum, h) => sum + h.score, 0);
  const backTotal = backNine.reduce((sum, h) => sum + h.score, 0);
  
  if (backTotal - frontTotal >= 4) {
    patterns.push({
      type: 'back_nine_fade',
      evidence: {
        details: `Front: ${frontTotal}, Back: ${backTotal}`,
        strokesLost: backTotal - frontTotal,
      },
    });
  }
  
  return patterns;
}
```

### Pattern Tracking Over Time

```typescript
function trackPatternEvolution(playerId: string, patternId: string): PatternEvolution {
  const history = getPatternHistory(playerId, patternId);
  
  if (history.length < 3) {
    return { status: 'insufficient_data' };
  }
  
  // Calculate trend
  const recentFrequency = average(history.slice(0, 5).map(h => h.frequency));
  const olderFrequency = average(history.slice(5, 10).map(h => h.frequency));
  
  const recentImpact = average(history.slice(0, 5).map(h => h.strokesLost));
  const olderImpact = average(history.slice(5, 10).map(h => h.strokesLost));
  
  let trend: 'improving' | 'stable' | 'worsening';
  
  if (recentFrequency < olderFrequency * 0.7 || recentImpact < olderImpact * 0.7) {
    trend = 'improving';
  } else if (recentFrequency > olderFrequency * 1.3 || recentImpact > olderImpact * 1.3) {
    trend = 'worsening';
  } else {
    trend = 'stable';
  }
  
  return {
    status: 'tracked',
    trend,
    frequencyChange: (recentFrequency - olderFrequency) / olderFrequency,
    impactChange: (recentImpact - olderImpact) / olderImpact,
    roundsSinceLastOccurrence: history[0].roundsSince,
  };
}
```

---

## 4. Inference Engine

The Inference Engine answers: **"What does this mean?"**

It takes raw data + context + benchmarks + patterns and produces actionable insight.

### Inference Pipeline

```typescript
async function generateInferences(
  playerId: string,
  roundId: string
): Promise<Inference[]> {
  // 1. Gather all inputs
  const context = await buildPlayerContext(playerId);
  const benchmarks = await getBenchmarks(playerId);
  const patterns = await getActivePatterns(playerId);
  const round = await getRoundWithHoles(roundId);
  const philosophy = await getCoachPhilosophy(context.coachId);
  
  const inferences: Inference[] = [];
  
  // 2. Score-level inference
  const scoreInference = inferFromScore(round, context, benchmarks);
  if (scoreInference) inferences.push(scoreInference);
  
  // 3. Category-level inference (for each SG category)
  for (const category of ['tee', 'approach', 'aroundGreen', 'putting']) {
    const catInference = inferFromCategory(round, category, context, benchmarks, philosophy);
    if (catInference) inferences.push(catInference);
  }
  
  // 4. Pattern-level inference
  for (const pattern of patterns) {
    const patternInference = inferFromPattern(round, pattern, context);
    if (patternInference) inferences.push(patternInference);
  }
  
  // 5. Goal-level inference
  for (const goal of context.activeGoals.secondary) {
    const goalInference = inferGoalImpact(round, goal, context);
    if (goalInference) inferences.push(goalInference);
  }
  
  // 6. Rank by importance
  return rankInferences(inferences, philosophy);
}

interface Inference {
  id: string;
  type: 'observation' | 'concern' | 'highlight' | 'pattern' | 'goal_impact';
  
  // What we observed
  observation: string;
  
  // What it means
  interpretation: string;
  
  // How certain we are
  confidence: number; // 0-1
  
  // How important
  importance: number; // 0-10
  
  // Supporting data
  evidence: {
    metric: string;
    value: number;
    benchmark: number;
    deviation: number; // How far from benchmark (in std devs or %)
  }[];
  
  // Context factors that affected this inference
  contextFactors: string[];
  
  // What could be done about it (if anything)
  actionable: boolean;
  suggestedAction?: string;
}

function inferFromScore(
  round: Round,
  context: PlayerContext,
  benchmarks: BenchmarkLayers
): Inference | null {
  const score = round.totalScore;
  const benchmark = benchmarks.self.last5Rounds;
  const deviation = score - benchmark;
  
  // Adjust for context
  const adjustedBenchmark = adjustExpectations(benchmark, context);
  const adjustedDeviation = score - adjustedBenchmark;
  
  // No inference if within normal range
  if (Math.abs(adjustedDeviation) < 2) {
    return null;
  }
  
  // Positive inference (better than expected)
  if (adjustedDeviation < -2) {
    return {
      id: `score_${round.id}`,
      type: 'highlight',
      observation: `Shot ${score}, which is ${Math.abs(deviation).toFixed(1)} strokes better than recent average`,
      interpretation: context.flags.swingChange
        ? 'Excellent round, especially considering the swing work. Signs of progress.'
        : 'Strong performance. This is the kind of round to build on.',
      confidence: 0.9,
      importance: 7,
      evidence: [{
        metric: 'total_score',
        value: score,
        benchmark: benchmark,
        deviation: deviation,
      }],
      contextFactors: context.flags.swingChange ? ['swing_change'] : [],
      actionable: false,
    };
  }
  
  // Negative inference (worse than expected)
  if (adjustedDeviation > 2) {
    // But suppress if context explains it
    if (shouldSuppressAlert({ type: 'scoring_decline', severity: 'medium' }, context)) {
      return {
        id: `score_${round.id}`,
        type: 'observation',
        observation: `Shot ${score}, which is ${deviation.toFixed(1)} strokes above recent average`,
        interpretation: context.flags.swingChange
          ? 'Higher score expected during swing change period. Focus on process, not results.'
          : 'Tougher round. Let\'s look at what specifically cost strokes.',
        confidence: 0.9,
        importance: 4, // Lower importance because context explains it
        evidence: [{
          metric: 'total_score',
          value: score,
          benchmark: benchmark,
          deviation: deviation,
        }],
        contextFactors: ['swing_change'],
        actionable: false,
      };
    }
    
    return {
      id: `score_${round.id}`,
      type: 'concern',
      observation: `Shot ${score}, which is ${deviation.toFixed(1)} strokes above recent average`,
      interpretation: 'This round is outside the normal range. Worth examining what went wrong.',
      confidence: 0.85,
      importance: 6,
      evidence: [{
        metric: 'total_score',
        value: score,
        benchmark: benchmark,
        deviation: deviation,
      }],
      contextFactors: [],
      actionable: true,
      suggestedAction: 'Review strokes gained breakdown to identify primary issue',
    };
  }
  
  return null;
}
```

---

## 5. Learning Loop

The Learning Loop answers: **"How do we get better at this?"**

This is where CoachHelm improves over time based on feedback.

### What We Track

```typescript
interface CoachBehavior {
  coachId: string;
  
  // Alert interactions
  alertsShown: number;
  alertsDismissed: number;
  alertsActedUpon: number;
  
  // By alert type
  alertTypeStats: Map<string, {
    shown: number;
    dismissed: number;
    actedUpon: number;
    averageTimeToAction: number; // seconds
  }>;
  
  // Comparison behavior
  comparisonsRun: number;
  comparisonFactorsUsed: Map<string, number>; // Which factors they weight
  
  // Review behavior
  reviewSectionsExpanded: Map<string, number>;
  reviewSectionsSkipped: Map<string, number>;
  averageReviewTime: number; // seconds
  
  // Settings changes
  thresholdAdjustments: {
    field: string;
    oldValue: number;
    newValue: number;
    timestamp: string;
  }[];
}

interface PlayerBehavior {
  playerId: string;
  
  // Practice engagement
  practiceRecommendationsViewed: number;
  practiceRecommendationsCompleted: number;
  
  // Drill preferences
  drillCompletions: Map<string, number>;
  drillSkips: Map<string, number>;
  
  // Review engagement
  reviewsViewed: number;
  reviewsSharedWithCoach: number;
  averageReviewEngagementTime: number;
  
  // Goal engagement
  goalsSet: number;
  goalsAchieved: number;
  goalsAbandoned: number;
}
```

### Learning From Dismissals

```typescript
async function learnFromDismissal(
  coachId: string,
  alertId: string,
  reason?: string
): Promise<void> {
  const alert = await getAlert(alertId);
  const behavior = await getCoachBehavior(coachId);
  
  // Update dismissal stats
  behavior.alertsDismissed++;
  behavior.alertTypeStats.get(alert.type).dismissed++;
  
  // If this alert type is frequently dismissed, adjust sensitivity
  const typeStats = behavior.alertTypeStats.get(alert.type);
  const dismissalRate = typeStats.dismissed / typeStats.shown;
  
  if (dismissalRate > 0.7 && typeStats.shown >= 10) {
    // This coach doesn't find this alert type useful
    // Option 1: Suggest they disable it
    await createSuggestion(coachId, {
      type: 'disable_alert_type',
      message: `You've dismissed ${Math.round(dismissalRate * 100)}% of "${alert.type}" alerts. Would you like to turn these off?`,
      alertType: alert.type,
    });
    
    // Option 2: Automatically raise threshold
    // (more aggressive, could be coach preference)
  }
  
  // If they provided a reason, learn from it
  if (reason) {
    await recordDismissalReason(coachId, alert.type, reason);
    
    // Common reasons we can learn from:
    // - "I already knew this" → Alert came too late
    // - "Not important right now" → Context wasn't considered
    // - "Player is working on something" → Need to check context flags
    // - "False positive" → Threshold too sensitive
  }
  
  await saveCoachBehavior(behavior);
}
```

### Learning From Actions

```typescript
async function learnFromAction(
  coachId: string,
  alertId: string,
  action: 'viewed_detail' | 'started_conversation' | 'adjusted_practice' | 'changed_lineup'
): Promise<void> {
  const alert = await getAlert(alertId);
  const behavior = await getCoachBehavior(coachId);
  
  // Update action stats
  behavior.alertsActedUpon++;
  behavior.alertTypeStats.get(alert.type).actedUpon++;
  
  // Track time to action
  const timeToAction = Date.now() - new Date(alert.createdAt).getTime();
  updateAverageTimeToAction(behavior, alert.type, timeToAction);
  
  // Learn which alert characteristics led to action
  await recordActionContext(coachId, {
    alertType: alert.type,
    severity: alert.severity,
    playerPosition: alert.playerContext?.rosterStatus?.currentPosition,
    daysToEvent: alert.teamContext?.nextEvent?.daysUntil,
    action,
  });
  
  // Over time, this builds a model of:
  // - Which alert types this coach acts on
  // - What severity threshold triggers action
  // - Whether roster position affects urgency
  // - Whether proximity to events affects urgency
  
  await saveCoachBehavior(behavior);
}

async function adjustAlertPrioritization(coachId: string): Promise<void> {
  const behavior = await getCoachBehavior(coachId);
  
  // Calculate action rate by alert type
  const actionRates = new Map<string, number>();
  
  for (const [type, stats] of behavior.alertTypeStats) {
    if (stats.shown >= 5) { // Minimum sample size
      actionRates.set(type, stats.actedUpon / stats.shown);
    }
  }
  
  // Adjust importance scores for future alerts
  // High action rate = boost importance
  // Low action rate = reduce importance (but don't hide completely)
  
  await updateAlertWeights(coachId, actionRates);
}
```

### Feedback Integration

```typescript
interface ExplicitFeedback {
  type: 'alert' | 'insight' | 'recommendation' | 'focus_area';
  itemId: string;
  rating: 'helpful' | 'not_helpful' | 'wrong';
  comment?: string;
}

async function processFeedback(
  userId: string,
  feedback: ExplicitFeedback
): Promise<void> {
  // Store feedback
  await saveFeedback(userId, feedback);
  
  // Update item-specific learning
  if (feedback.type === 'alert') {
    const alert = await getAlert(feedback.itemId);
    
    if (feedback.rating === 'helpful') {
      // Reinforce this type of alert
      await boostAlertType(alert.type, alert.conditions);
    } else if (feedback.rating === 'wrong') {
      // This was a false positive
      await recordFalsePositive(alert.type, alert.conditions);
      
      // If we get many false positives with similar conditions,
      // adjust the detection logic
      await maybeAdjustDetection(alert.type);
    }
  }
  
  // Aggregate feedback for model improvement
  await updateFeedbackAggregates(feedback);
}
```

---

## 6. Summary Generation

How we turn all of this into human-readable text.

### Template + Dynamic System

```typescript
interface SummaryContext {
  round: Round;
  inferences: Inference[];
  patterns: DetectedPattern[];
  benchmarks: BenchmarkLayers;
  playerContext: PlayerContext;
  philosophy: CoachPhilosophy;
}

function generateSummary(ctx: SummaryContext): string {
  const paragraphs: string[] = [];
  
  // Paragraph 1: Opening (score + context)
  paragraphs.push(generateOpening(ctx));
  
  // Paragraph 2: Analysis (what went well, what didn't)
  paragraphs.push(generateAnalysis(ctx));
  
  // Paragraph 3: Patterns + next steps
  if (ctx.patterns.length > 0 || ctx.inferences.some(i => i.actionable)) {
    paragraphs.push(generateNextSteps(ctx));
  }
  
  return paragraphs.join('\n\n');
}

function generateOpening(ctx: SummaryContext): string {
  const { round, benchmarks, playerContext } = ctx;
  const score = round.totalScore;
  const scoreToPar = round.scoreToPar;
  const avgDiff = score - benchmarks.self.last5Rounds;
  
  // Select opening based on performance + context
  if (scoreToPar <= -2) {
    return `Excellent round! Shot ${score} (${formatToPar(scoreToPar)}), which is ${Math.abs(avgDiff).toFixed(1)} strokes better than your recent average. ${getContextNote(playerContext)}`;
  }
  
  if (scoreToPar <= 0) {
    if (avgDiff < -1) {
      return `Solid round of ${score} (${formatToPar(scoreToPar)}). This is ${Math.abs(avgDiff).toFixed(1)} strokes better than your average — a step in the right direction.`;
    }
    return `Shot ${score} (${formatToPar(scoreToPar)}). A steady round right around your scoring average.`;
  }
  
  if (scoreToPar <= 4) {
    if (playerContext.flags.swingChange) {
      return `Shot ${score} (${formatToPar(scoreToPar)}). Given the swing work you're doing, this is understandable. Focus on the process.`;
    }
    return `Shot ${score} (${formatToPar(scoreToPar)}). A few strokes above your ${benchmarks.self.last5Rounds.toFixed(1)} average — let's look at what happened.`;
  }
  
  // Tough day
  if (playerContext.flags.injury !== 'none') {
    return `Tough day with a ${score} (${formatToPar(scoreToPar)}). Playing through ${playerContext.flags.injury === 'major' ? 'injury' : 'discomfort'} makes every round harder. Be patient with yourself.`;
  }
  
  return `Shot ${score} (${formatToPar(scoreToPar)}). Every golfer has these days. What matters is what we learn from it.`;
}

function generateAnalysis(ctx: SummaryContext): string {
  const { inferences, round } = ctx;
  const parts: string[] = [];
  
  // Find best and worst categories
  const categories = [
    { name: 'off the tee', value: round.strokesGained.tee },
    { name: 'on approach', value: round.strokesGained.approach },
    { name: 'around the green', value: round.strokesGained.aroundGreen },
    { name: 'on the greens', value: round.strokesGained.putting },
  ];
  
  const best = categories.reduce((a, b) => a.value > b.value ? a : b);
  const worst = categories.reduce((a, b) => a.value < b.value ? a : b);
  
  // Strength
  if (best.value > 0.3) {
    parts.push(`Your strength today was ${best.name}, where you gained ${best.value.toFixed(1)} strokes versus baseline.`);
  }
  
  // Highlights from inferences
  const highlights = inferences.filter(i => i.type === 'highlight');
  if (highlights.length > 0) {
    const top = highlights[0];
    parts.push(top.observation);
  }
  
  // Weakness
  if (worst.value < -0.3) {
    parts.push(`The area that cost strokes was ${worst.name} (${worst.value.toFixed(1)} SG).`);
  }
  
  // Concerns from inferences
  const concerns = inferences.filter(i => i.type === 'concern');
  if (concerns.length > 0) {
    const top = concerns[0];
    parts.push(top.interpretation);
  }
  
  return parts.join(' ');
}

function generateNextSteps(ctx: SummaryContext): string {
  const { patterns, inferences, playerContext } = ctx;
  const parts: string[] = [];
  
  // Recurring patterns
  const recurring = patterns.filter(p => p.trend === 'recurring' || p.trend === 'worsening');
  if (recurring.length > 0) {
    const pattern = recurring[0];
    parts.push(`This round reinforced a pattern we've seen: ${pattern.description.toLowerCase()}. It appears in ${Math.round(pattern.frequency * 100)}% of rounds and costs about ${pattern.strokesPerRound.toFixed(1)} strokes per round.`);
  }
  
  // New patterns
  const newPatterns = patterns.filter(p => p.trend === 'new');
  if (newPatterns.length > 0) {
    parts.push(`Something new to watch: ${newPatterns[0].description.toLowerCase()}.`);
  }
  
  // Actionable insights
  const actionable = inferences.filter(i => i.actionable && i.suggestedAction);
  if (actionable.length > 0) {
    parts.push(actionable[0].suggestedAction!);
  }
  
  // Goal progress
  if (playerContext.activeGoals.primary) {
    const goal = playerContext.activeGoals.primary;
    if (goal.onTrack) {
      parts.push(`Good news: you're on track for your ${goal.type.replace(/_/g, ' ')} goal.`);
    }
  }
  
  return parts.join(' ');
}
```

---

## 7. The Intelligence Flywheel

Everything connects in a reinforcing loop:

```
   ┌─────────────────────────────────────────────────────────┐
   │                                                         │
   │    More Rounds    ──────►    Better Patterns            │
   │         │                          │                    │
   │         │                          │                    │
   │         ▼                          ▼                    │
   │    Better Benchmarks    ◄────    Better Inferences      │
   │         │                          │                    │
   │         │                          │                    │
   │         ▼                          ▼                    │
   │    More Accurate Alerts  ────►   Coach Trusts System    │
   │         │                          │                    │
   │         │                          │                    │
   │         ▼                          ▼                    │
   │    Coach Acts on Alerts  ◄────   Coach Gives Feedback   │
   │         │                          │                    │
   │         │                          │                    │
   │         ▼                          ▼                    │
   │    System Learns         ────►   Better Prioritization  │
   │         │                          │                    │
   │         │                          │                    │
   │         └──────────────────────────┘                    │
   │                                                         │
   └─────────────────────────────────────────────────────────┘
```

### Phases of Intelligence

**Phase 1 (Rounds 1-10): Cold Start**
- Use tier benchmarks as baseline
- Apply default thresholds
- Simple pattern detection
- Generic insights

**Phase 2 (Rounds 11-30): Learning**
- Build player-specific benchmarks
- Detect player-specific patterns
- Learn coach preferences
- Personalize thresholds

**Phase 3 (Rounds 31+): Mature**
- Highly personalized insights
- Predictive capabilities ("Based on pattern X, watch for Y")
- Coach-calibrated alert sensitivity
- Pattern trend tracking

---

## 8. Implementation Priority

### MVP (Build First)
1. **Context Engine** — Player flags + basic context
2. **Simple Benchmarks** — Self (season avg, last 5)
3. **Rule-based Patterns** — Three-putts, doubles, closing holes
4. **Template Summaries** — Good/bad/neutral paths

### V2 (Add Later)
1. **Adaptive Benchmarks** — Trajectory-aware
2. **Pattern Mining** — Discover non-obvious patterns
3. **Learning Loop** — Track coach behavior
4. **Feedback Integration** — Explicit ratings

### V3 (Future)
1. **Predictive Insights** — "Watch for X"
2. **Cross-Player Learning** — Team-level patterns
3. **Coach Personality Model** — Fully calibrated to each coach
4. **Auto-Adjustment** — System tunes itself

---

## Key Principles

1. **Context is King** — Same data means different things in different contexts
2. **Benchmark Against Self** — Comparison to others is secondary
3. **Patterns Over Snapshots** — One bad round isn't a problem; a pattern is
4. **Insight Over Data** — Don't show numbers, show meaning
5. **Actionable > Interesting** — Only surface what can be acted upon
6. **Learn From Behavior** — Watch what coaches do, not just what they say
7. **Explain Your Reasoning** — Show evidence, build trust
8. **Know When To Shut Up** — Silence is better than noise

---

## Database Tables for Intelligence

```sql
-- Pattern storage
CREATE TABLE golf_patterns (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES golf_players(id),
  pattern_type TEXT NOT NULL,
  description TEXT NOT NULL,
  frequency DECIMAL(4,3) NOT NULL,
  confidence DECIMAL(4,3) NOT NULL,
  strokes_per_round DECIMAL(4,2) NOT NULL,
  trend TEXT NOT NULL,
  first_detected TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  occurrences INTEGER NOT NULL,
  evidence JSONB NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Coach behavior tracking
CREATE TABLE golf_coach_behavior (
  id UUID PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES golf_coaches(id) UNIQUE,
  alerts_shown INTEGER DEFAULT 0,
  alerts_dismissed INTEGER DEFAULT 0,
  alerts_acted_upon INTEGER DEFAULT 0,
  alert_type_stats JSONB DEFAULT '{}',
  comparison_factors_used JSONB DEFAULT '{}',
  review_sections_expanded JSONB DEFAULT '{}',
  average_review_time INTEGER,
  threshold_adjustments JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feedback storage
CREATE TABLE golf_feedback (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  feedback_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  rating TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inference cache (for debugging/learning)
CREATE TABLE golf_inferences (
  id UUID PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES golf_rounds(id),
  player_id UUID NOT NULL,
  inferences JSONB NOT NULL,
  context_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

This is the brain. Everything else is UI wrapping around it.
