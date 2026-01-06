# CoachHelm Feature: Round Review

## Complete Implementation Specification

---

## What This Feature Does

After a player submits a round, they see a **Round Review** — an intelligent analysis of what just happened. Not just stats, but insights:

- **Highlights** — Best moments worth celebrating
- **Areas to Review** — Concerning patterns with root cause
- **Goal Impact** — How this round affected their goals
- **Strokes Gained Breakdown** — Where they gained/lost vs benchmarks
- **Patterns Detected** — Recurring issues or strengths
- **Summary** — 2-3 paragraph synthesis with next practice priority

**This transforms round submission from data entry into a coaching conversation.**

---

## User Flow

```
Player submits round
        ↓
    [Processing]
        ↓
┌─────────────────────────────────┐
│     ROUND REVIEW PAGE           │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Completion Card           │  │
│  │ Score: 74 (+2)            │  │
│  │ Scoring avg: 75.2 → 75.0  │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Goal Impact               │  │
│  │ "Make Travel Roster"      │  │
│  │ Gap closed: 0.2 strokes   │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Scorecard (visual)        │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Highlights (2-3 moments)  │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Areas to Review           │  │
│  │ (patterns + root cause)   │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Strokes Gained Breakdown  │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ CoachHelm Summary         │  │
│  │ (synthesis + next steps)  │  │
│  └───────────────────────────┘  │
│                                 │
│         [Share with Coach]      │
│         [View Full Stats]       │
└─────────────────────────────────┘
```

---

## Files to Create

```
src/
├── app/golf/(dashboard)/dashboard/
│   └── rounds/
│       └── [id]/
│           └── review/
│               └── page.tsx                    # Main review page
│
├── components/golf/coachhelm/
│   └── round-review/
│       ├── index.ts                            # Barrel export
│       ├── RoundReviewPage.tsx                 # Page container
│       ├── CompletionCard.tsx                  # Score + impact summary
│       ├── GoalImpactCard.tsx                  # How round affected goals
│       ├── ReviewScorecard.tsx                 # Visual 18-hole scorecard
│       ├── HighlightsSection.tsx               # Best moments
│       ├── AreasToReviewSection.tsx            # Concerning patterns
│       ├── StrokesGainedSection.tsx            # SG breakdown bars
│       ├── PatternAlert.tsx                    # Individual pattern card
│       ├── ReviewSummary.tsx                   # AI synthesis
│       └── HoleScoreChip.tsx                   # Single hole score display
│
├── lib/coachhelm/
│   ├── round-review-generator.ts               # Core generation logic
│   ├── highlight-detector.ts                   # Find highlights
│   ├── area-detector.ts                        # Find areas to review
│   ├── pattern-detector.ts                     # Detect patterns
│   └── summary-generator.ts                    # Generate text summary
│
├── hooks/coachhelm/
│   └── useRoundReview.ts                       # Fetch/generate review
│
└── supabase/migrations/
    └── XXX_create_round_reviews.sql            # Database migration
```

---

## Step 1: Database Migration

Create file: `supabase/migrations/031_create_round_reviews.sql`

```sql
-- ============================================================================
-- ROUND REVIEWS
-- ============================================================================

CREATE TABLE golf_round_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE UNIQUE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  
  -- Scoring context
  round_score INTEGER NOT NULL,
  round_score_to_par INTEGER NOT NULL,
  scoring_avg_before DECIMAL(4,1),
  scoring_avg_after DECIMAL(4,1),
  
  -- Position context (for qualifying)
  qualifying_position_before INTEGER,
  qualifying_position_after INTEGER,
  gap_to_next_position DECIMAL(4,2),
  
  -- Goal impacts (array of impacts)
  goal_impacts JSONB DEFAULT '[]',
  -- Example: [{ "goalId": "uuid", "goalType": "make_travel_roster", "valueBefore": 6, "valueAfter": 5.8, "change": -0.2, "direction": "positive" }]
  
  -- Highlights (best moments)
  highlights JSONB DEFAULT '[]',
  -- Example: [{ "holeNumber": 7, "type": "birdie_streak", "title": "Back-to-back birdies", "description": "...", "shots": [...], "impact": "+2 vs expected" }]
  
  -- Areas to review (concerning moments)
  areas_to_review JSONB DEFAULT '[]',
  -- Example: [{ "holeNumber": 12, "type": "three_putt", "title": "Three-putt from 15 feet", "description": "...", "pattern": "lag_putting", "rootCause": "First putt left 6 feet", "linkedFocusArea": "putting_lag" }]
  
  -- Round stats snapshot
  round_stats JSONB NOT NULL,
  -- All calculated stats for this round
  
  -- Comparison averages
  player_averages JSONB NOT NULL,
  -- Player's season averages at time of round
  
  team_averages JSONB,
  -- Team averages (if on a team)
  
  -- Strokes gained breakdown
  strokes_gained JSONB NOT NULL,
  -- { "total": 1.2, "tee": 0.5, "approach": 0.8, "aroundGreen": -0.3, "putting": 0.2 }
  
  -- Patterns
  patterns_detected JSONB DEFAULT '[]',
  -- New patterns found in this round
  
  patterns_recurring JSONB DEFAULT '[]',
  -- Patterns that appeared again
  
  -- Summary
  summary TEXT NOT NULL,
  -- 2-3 paragraph synthesis
  
  primary_takeaway TEXT NOT NULL,
  -- Single most important insight
  
  next_practice_priority TEXT,
  -- What to work on next
  
  linked_focus_area_id UUID REFERENCES golf_focus_areas(id) ON DELETE SET NULL,
  
  -- Sharing
  shared_with_coach BOOLEAN DEFAULT FALSE,
  shared_at TIMESTAMPTZ,
  coach_viewed_at TIMESTAMPTZ,
  coach_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_round_reviews_player ON golf_round_reviews(player_id);
CREATE INDEX idx_round_reviews_round ON golf_round_reviews(round_id);
CREATE INDEX idx_round_reviews_created ON golf_round_reviews(created_at DESC);

-- RLS
ALTER TABLE golf_round_reviews ENABLE ROW LEVEL SECURITY;

-- Players can view their own reviews
CREATE POLICY "Players can view own reviews"
  ON golf_round_reviews FOR SELECT
  USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- Players can update sharing status
CREATE POLICY "Players can update own reviews"
  ON golf_round_reviews FOR UPDATE
  USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- Coaches can view shared reviews from their team
CREATE POLICY "Coaches can view shared team reviews"
  ON golf_round_reviews FOR SELECT
  USING (
    shared_with_coach = TRUE 
    AND player_id IN (
      SELECT p.id FROM golf_players p
      JOIN golf_coaches c ON c.team_id = p.team_id
      WHERE c.user_id = auth.uid()
    )
  );

-- Coaches can add notes to shared reviews
CREATE POLICY "Coaches can update shared reviews"
  ON golf_round_reviews FOR UPDATE
  USING (
    shared_with_coach = TRUE 
    AND player_id IN (
      SELECT p.id FROM golf_players p
      JOIN golf_coaches c ON c.team_id = p.team_id
      WHERE c.user_id = auth.uid()
    )
  );

-- System can insert reviews (via service role)
CREATE POLICY "System can insert reviews"
  ON golf_round_reviews FOR INSERT
  WITH CHECK (TRUE);
```

---

## Step 2: TypeScript Types

Add to `src/lib/coachhelm/types.ts`:

```typescript
// ============================================================================
// ROUND REVIEW TYPES
// ============================================================================

export interface RoundReview {
  id: string;
  roundId: string;
  playerId: string;
  
  // Scoring context
  roundScore: number;
  roundScoreToPar: number;
  scoringAvgBefore: number | null;
  scoringAvgAfter: number | null;
  
  // Position context
  qualifyingPositionBefore: number | null;
  qualifyingPositionAfter: number | null;
  gapToNextPosition: number | null;
  
  // Analysis
  goalImpacts: GoalImpact[];
  highlights: Highlight[];
  areasToReview: AreaToReview[];
  roundStats: RoundStats;
  playerAverages: RoundStats;
  teamAverages: RoundStats | null;
  strokesGained: StrokesGainedBreakdown;
  patternsDetected: Pattern[];
  patternsRecurring: Pattern[];
  
  // Summary
  summary: string;
  primaryTakeaway: string;
  nextPracticePriority: string | null;
  linkedFocusAreaId: string | null;
  
  // Sharing
  sharedWithCoach: boolean;
  sharedAt: string | null;
  coachViewedAt: string | null;
  coachNotes: string | null;
  
  createdAt: string;
}

export interface GoalImpact {
  goalId: string;
  goalType: string;
  goalLabel: string;
  valueBefore: number;
  valueAfter: number;
  change: number;
  direction: 'positive' | 'negative' | 'neutral';
  message: string;
}

export interface Highlight {
  id: string;
  holeNumber: number;
  type: HighlightType;
  title: string;
  description: string;
  shots?: ShotDetail[];
  impact: string; // e.g., "+2 vs expected"
  emoji: string;
}

export type HighlightType = 
  | 'eagle'
  | 'birdie'
  | 'birdie_streak'
  | 'long_putt_made'
  | 'great_approach'
  | 'sand_save'
  | 'up_and_down'
  | 'par_save'
  | 'bounce_back'
  | 'strong_finish';

export interface AreaToReview {
  id: string;
  holeNumber: number;
  type: AreaType;
  title: string;
  description: string;
  shots?: ShotDetail[];
  pattern: string | null;
  rootCause: string;
  linkedFocusArea: string | null;
  severity: 'high' | 'medium' | 'low';
}

export type AreaType = 
  | 'three_putt'
  | 'double_bogey_plus'
  | 'penalty'
  | 'missed_short_putt'
  | 'poor_approach'
  | 'missed_fairway_trouble'
  | 'poor_course_management'
  | 'failed_up_and_down';

export interface ShotDetail {
  shotNumber: number;
  club: string;
  result: string;
  distance?: number;
}

export interface Pattern {
  id: string;
  type: PatternType;
  title: string;
  description: string;
  frequency: number; // percentage of rounds
  impactStrokes: number;
  evidence: string[];
  isNew: boolean;
}

export type PatternType = 
  | 'miss_direction'      // Always missing one way
  | 'distance_gap'        // Struggles at specific yardage
  | 'lie_weakness'        // Bad from rough/sand
  | 'hole_type'           // Par 3s, par 5s, etc.
  | 'pressure'            // Back nine, closing holes
  | 'momentum'            // After bogey, after birdie
  | 'putting_distance'    // Specific putt lengths
  | 'three_putt_trigger'; // What causes 3-putts

export interface StrokesGainedBreakdown {
  total: number;
  tee: number;
  approach: number;
  aroundGreen: number;
  putting: number;
}

export interface RoundStats {
  // Scoring
  totalScore: number;
  scoreToPar: number;
  frontNine: number;
  backNine: number;
  
  // Birdies/Bogeys
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
  
  // Driving
  fairwaysHit: number;
  fairwaysPossible: number;
  fairwayPct: number;
  
  // Approach
  greensHit: number;
  greensPossible: number;
  girPct: number;
  
  // Putting
  totalPutts: number;
  puttsPerHole: number;
  puttsPerGir: number;
  onePutts: number;
  threePutts: number;
  
  // Short game
  upAndDowns: number;
  upAndDownAttempts: number;
  scramblePct: number;
  sandSaves: number;
  sandAttempts: number;
  sandPct: number;
}

// Highlight config for UI
export const HIGHLIGHT_CONFIG: Record<HighlightType, { emoji: string; color: string }> = {
  eagle: { emoji: '🦅', color: 'text-purple-600' },
  birdie: { emoji: '🐦', color: 'text-green-600' },
  birdie_streak: { emoji: '🔥', color: 'text-orange-500' },
  long_putt_made: { emoji: '🎯', color: 'text-blue-600' },
  great_approach: { emoji: '💫', color: 'text-yellow-500' },
  sand_save: { emoji: '🏖️', color: 'text-amber-600' },
  up_and_down: { emoji: '⬆️', color: 'text-green-500' },
  par_save: { emoji: '💪', color: 'text-slate-600' },
  bounce_back: { emoji: '🔄', color: 'text-blue-500' },
  strong_finish: { emoji: '🏁', color: 'text-green-600' },
};

// Area config for UI
export const AREA_CONFIG: Record<AreaType, { emoji: string; color: string }> = {
  three_putt: { emoji: '😓', color: 'text-red-500' },
  double_bogey_plus: { emoji: '💥', color: 'text-red-600' },
  penalty: { emoji: '🚫', color: 'text-red-500' },
  missed_short_putt: { emoji: '😤', color: 'text-amber-600' },
  poor_approach: { emoji: '📉', color: 'text-amber-500' },
  missed_fairway_trouble: { emoji: '🌲', color: 'text-amber-600' },
  poor_course_management: { emoji: '🗺️', color: 'text-amber-500' },
  failed_up_and_down: { emoji: '⬇️', color: 'text-amber-500' },
};
```

---

## Step 3: Review Generation Logic

Create file: `src/lib/coachhelm/round-review-generator.ts`

```typescript
import { createClient } from '@/lib/supabase/server';
import {
  RoundReview,
  GoalImpact,
  Highlight,
  AreaToReview,
  Pattern,
  StrokesGainedBreakdown,
  RoundStats,
} from './types';
import { detectHighlights } from './highlight-detector';
import { detectAreasToReview } from './area-detector';
import { detectPatterns } from './pattern-detector';
import { generateSummary } from './summary-generator';
import { calculateStrokesGained } from './strokes-gained';

interface GenerateReviewInput {
  roundId: string;
  playerId: string;
}

export async function generateRoundReview(input: GenerateReviewInput): Promise<RoundReview> {
  const supabase = createClient();
  const { roundId, playerId } = input;

  // 1. Fetch round data with holes and shots
  const { data: round, error: roundError } = await supabase
    .from('golf_rounds')
    .select(`
      *,
      holes:golf_holes(*),
      shots:golf_shots(*)
    `)
    .eq('id', roundId)
    .single();

  if (roundError || !round) {
    throw new Error('Round not found');
  }

  // 2. Fetch player data and averages
  const { data: player } = await supabase
    .from('golf_players')
    .select('*, team:golf_teams(*)')
    .eq('id', playerId)
    .single();

  // 3. Fetch player's previous rounds for averages
  const { data: previousRounds } = await supabase
    .from('golf_rounds')
    .select('*, holes:golf_holes(*)')
    .eq('player_id', playerId)
    .neq('id', roundId)
    .order('played_at', { ascending: false })
    .limit(20);

  // 4. Fetch player's active goals
  const { data: goals } = await supabase
    .from('golf_player_goals')
    .select('*')
    .eq('player_id', playerId)
    .eq('status', 'active');

  // 5. Calculate round stats
  const roundStats = calculateRoundStats(round);

  // 6. Calculate player averages (before this round)
  const playerAverages = calculatePlayerAverages(previousRounds || []);

  // 7. Calculate team averages (if on team)
  let teamAverages: RoundStats | null = null;
  if (player?.team_id) {
    const { data: teamRounds } = await supabase
      .from('golf_rounds')
      .select('*, holes:golf_holes(*)')
      .eq('team_id', player.team_id)
      .neq('player_id', playerId)
      .order('played_at', { ascending: false })
      .limit(100);
    
    if (teamRounds && teamRounds.length > 0) {
      teamAverages = calculatePlayerAverages(teamRounds);
    }
  }

  // 8. Calculate strokes gained
  const strokesGained = calculateStrokesGained(round.shots, round.holes);

  // 9. Detect highlights
  const highlights = detectHighlights(round, roundStats, playerAverages);

  // 10. Detect areas to review
  const areasToReview = detectAreasToReview(round, roundStats, playerAverages);

  // 11. Detect patterns (comparing to previous rounds)
  const { newPatterns, recurringPatterns } = detectPatterns(round, previousRounds || []);

  // 12. Calculate goal impacts
  const goalImpacts = calculateGoalImpacts(goals || [], roundStats, playerAverages, player);

  // 13. Calculate scoring average change
  const scoringAvgBefore = playerAverages.totalScore || null;
  const allScores = [...(previousRounds || []).map(r => r.total_score), round.total_score];
  const scoringAvgAfter = allScores.length > 0 
    ? allScores.reduce((a, b) => a + b, 0) / allScores.length 
    : null;

  // 14. Generate summary
  const { summary, primaryTakeaway, nextPracticePriority } = generateSummary({
    round,
    roundStats,
    playerAverages,
    strokesGained,
    highlights,
    areasToReview,
    newPatterns,
    recurringPatterns,
    goalImpacts,
  });

  // 15. Find linked focus area (if any area to review matches)
  let linkedFocusAreaId: string | null = null;
  if (areasToReview.length > 0 && areasToReview[0].linkedFocusArea) {
    const { data: focusArea } = await supabase
      .from('golf_focus_areas')
      .select('id')
      .eq('player_id', playerId)
      .eq('category', areasToReview[0].linkedFocusArea)
      .single();
    
    if (focusArea) {
      linkedFocusAreaId = focusArea.id;
    }
  }

  // 16. Build review object
  const review: Omit<RoundReview, 'id' | 'createdAt'> = {
    roundId,
    playerId,
    roundScore: round.total_score,
    roundScoreToPar: round.score_to_par,
    scoringAvgBefore,
    scoringAvgAfter,
    qualifyingPositionBefore: null, // TODO: Calculate from qualifier
    qualifyingPositionAfter: null,
    gapToNextPosition: null,
    goalImpacts,
    highlights,
    areasToReview,
    roundStats,
    playerAverages,
    teamAverages,
    strokesGained,
    patternsDetected: newPatterns,
    patternsRecurring: recurringPatterns,
    summary,
    primaryTakeaway,
    nextPracticePriority,
    linkedFocusAreaId,
    sharedWithCoach: false,
    sharedAt: null,
    coachViewedAt: null,
    coachNotes: null,
  };

  // 17. Save to database
  const { data: saved, error: saveError } = await supabase
    .from('golf_round_reviews')
    .upsert({
      round_id: review.roundId,
      player_id: review.playerId,
      round_score: review.roundScore,
      round_score_to_par: review.roundScoreToPar,
      scoring_avg_before: review.scoringAvgBefore,
      scoring_avg_after: review.scoringAvgAfter,
      qualifying_position_before: review.qualifyingPositionBefore,
      qualifying_position_after: review.qualifyingPositionAfter,
      gap_to_next_position: review.gapToNextPosition,
      goal_impacts: review.goalImpacts,
      highlights: review.highlights,
      areas_to_review: review.areasToReview,
      round_stats: review.roundStats,
      player_averages: review.playerAverages,
      team_averages: review.teamAverages,
      strokes_gained: review.strokesGained,
      patterns_detected: review.patternsDetected,
      patterns_recurring: review.patternsRecurring,
      summary: review.summary,
      primary_takeaway: review.primaryTakeaway,
      next_practice_priority: review.nextPracticePriority,
      linked_focus_area_id: review.linkedFocusAreaId,
    }, { onConflict: 'round_id' })
    .select()
    .single();

  if (saveError) {
    throw new Error(`Failed to save review: ${saveError.message}`);
  }

  return {
    ...review,
    id: saved.id,
    createdAt: saved.created_at,
  };
}

// Helper: Calculate stats from a single round
function calculateRoundStats(round: any): RoundStats {
  const holes = round.holes || [];
  
  const totalScore = round.total_score;
  const scoreToPar = round.score_to_par;
  
  const frontNine = holes.slice(0, 9).reduce((sum: number, h: any) => sum + (h.score || 0), 0);
  const backNine = holes.slice(9, 18).reduce((sum: number, h: any) => sum + (h.score || 0), 0);
  
  let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doublePlus = 0;
  let fairwaysHit = 0, fairwaysPossible = 0;
  let greensHit = 0, greensPossible = 0;
  let totalPutts = 0, onePutts = 0, threePutts = 0;
  let upAndDowns = 0, upAndDownAttempts = 0;
  let sandSaves = 0, sandAttempts = 0;
  let girPutts = 0, girCount = 0;

  holes.forEach((hole: any) => {
    const scoreDiff = (hole.score || 0) - (hole.par || 4);
    
    if (scoreDiff <= -2) eagles++;
    else if (scoreDiff === -1) birdies++;
    else if (scoreDiff === 0) pars++;
    else if (scoreDiff === 1) bogeys++;
    else doublePlus++;
    
    // Fairways (par 4s and 5s)
    if (hole.par >= 4) {
      fairwaysPossible++;
      if (hole.fairway_hit) fairwaysHit++;
    }
    
    // GIR
    greensPossible++;
    if (hole.gir) {
      greensHit++;
      girCount++;
      girPutts += hole.putts || 0;
    }
    
    // Putts
    const putts = hole.putts || 0;
    totalPutts += putts;
    if (putts === 1) onePutts++;
    if (putts >= 3) threePutts++;
    
    // Scrambling (missed GIR, still made par or better)
    if (!hole.gir) {
      upAndDownAttempts++;
      if (scoreDiff <= 0) upAndDowns++;
    }
    
    // Sand saves
    if (hole.sand_save_attempt) {
      sandAttempts++;
      if (hole.sand_save_made) sandSaves++;
    }
  });

  return {
    totalScore,
    scoreToPar,
    frontNine,
    backNine,
    eagles,
    birdies,
    pars,
    bogeys,
    doublePlus,
    fairwaysHit,
    fairwaysPossible,
    fairwayPct: fairwaysPossible > 0 ? (fairwaysHit / fairwaysPossible) * 100 : 0,
    greensHit,
    greensPossible,
    girPct: greensPossible > 0 ? (greensHit / greensPossible) * 100 : 0,
    totalPutts,
    puttsPerHole: holes.length > 0 ? totalPutts / holes.length : 0,
    puttsPerGir: girCount > 0 ? girPutts / girCount : 0,
    onePutts,
    threePutts,
    upAndDowns,
    upAndDownAttempts,
    scramblePct: upAndDownAttempts > 0 ? (upAndDowns / upAndDownAttempts) * 100 : 0,
    sandSaves,
    sandAttempts,
    sandPct: sandAttempts > 0 ? (sandSaves / sandAttempts) * 100 : 0,
  };
}

// Helper: Calculate averages from multiple rounds
function calculatePlayerAverages(rounds: any[]): RoundStats {
  if (rounds.length === 0) {
    return {
      totalScore: 0,
      scoreToPar: 0,
      frontNine: 0,
      backNine: 0,
      eagles: 0,
      birdies: 0,
      pars: 0,
      bogeys: 0,
      doublePlus: 0,
      fairwaysHit: 0,
      fairwaysPossible: 0,
      fairwayPct: 0,
      greensHit: 0,
      greensPossible: 0,
      girPct: 0,
      totalPutts: 0,
      puttsPerHole: 0,
      puttsPerGir: 0,
      onePutts: 0,
      threePutts: 0,
      upAndDowns: 0,
      upAndDownAttempts: 0,
      scramblePct: 0,
      sandSaves: 0,
      sandAttempts: 0,
      sandPct: 0,
    };
  }

  const stats = rounds.map(r => calculateRoundStats(r));
  const n = stats.length;

  const avg = (key: keyof RoundStats) => stats.reduce((sum, s) => sum + s[key], 0) / n;

  return {
    totalScore: avg('totalScore'),
    scoreToPar: avg('scoreToPar'),
    frontNine: avg('frontNine'),
    backNine: avg('backNine'),
    eagles: avg('eagles'),
    birdies: avg('birdies'),
    pars: avg('pars'),
    bogeys: avg('bogeys'),
    doublePlus: avg('doublePlus'),
    fairwaysHit: avg('fairwaysHit'),
    fairwaysPossible: avg('fairwaysPossible'),
    fairwayPct: avg('fairwayPct'),
    greensHit: avg('greensHit'),
    greensPossible: avg('greensPossible'),
    girPct: avg('girPct'),
    totalPutts: avg('totalPutts'),
    puttsPerHole: avg('puttsPerHole'),
    puttsPerGir: avg('puttsPerGir'),
    onePutts: avg('onePutts'),
    threePutts: avg('threePutts'),
    upAndDowns: avg('upAndDowns'),
    upAndDownAttempts: avg('upAndDownAttempts'),
    scramblePct: avg('scramblePct'),
    sandSaves: avg('sandSaves'),
    sandAttempts: avg('sandAttempts'),
    sandPct: avg('sandPct'),
  };
}

// Helper: Calculate goal impacts
function calculateGoalImpacts(
  goals: any[],
  roundStats: RoundStats,
  playerAverages: RoundStats,
  player: any
): GoalImpact[] {
  return goals.map(goal => {
    const target = goal.target as any;
    let valueBefore = goal.current_value || 0;
    let valueAfter = valueBefore;
    let change = 0;
    let direction: 'positive' | 'negative' | 'neutral' = 'neutral';
    let message = '';

    switch (goal.goal_type) {
      case 'improve_scoring_average':
        valueBefore = playerAverages.totalScore;
        valueAfter = (playerAverages.totalScore * 19 + roundStats.totalScore) / 20; // Weighted avg
        change = valueAfter - valueBefore;
        direction = change < 0 ? 'positive' : change > 0 ? 'negative' : 'neutral';
        message = direction === 'positive' 
          ? `Scoring average improved by ${Math.abs(change).toFixed(1)} strokes`
          : `Scoring average increased by ${Math.abs(change).toFixed(1)} strokes`;
        break;

      case 'improve_specific_stat':
        // Would need to look up the specific stat
        break;

      case 'make_travel_roster':
        // Would need qualifying position data
        message = 'Qualifying position tracking requires active qualifier';
        break;
    }

    return {
      goalId: goal.id,
      goalType: goal.goal_type,
      goalLabel: getGoalLabel(goal.goal_type),
      valueBefore,
      valueAfter,
      change,
      direction,
      message,
    };
  });
}

function getGoalLabel(type: string): string {
  const labels: Record<string, string> = {
    make_travel_roster: 'Make Travel Roster',
    improve_scoring_average: 'Improve Scoring Average',
    improve_handicap: 'Improve Handicap',
    improve_specific_stat: 'Improve Stat',
    peak_for_event: 'Peak for Event',
  };
  return labels[type] || type;
}
```

---

## Step 4: Highlight Detector

Create file: `src/lib/coachhelm/highlight-detector.ts`

```typescript
import { Highlight, HighlightType, RoundStats, HIGHLIGHT_CONFIG } from './types';

export function detectHighlights(
  round: any,
  roundStats: RoundStats,
  playerAverages: RoundStats
): Highlight[] {
  const highlights: Highlight[] = [];
  const holes = round.holes || [];

  // 1. Find eagles
  holes.forEach((hole: any, index: number) => {
    const scoreDiff = (hole.score || 0) - (hole.par || 4);
    
    if (scoreDiff <= -2) {
      highlights.push({
        id: `eagle-${hole.hole_number}`,
        holeNumber: hole.hole_number,
        type: 'eagle',
        title: scoreDiff === -2 ? 'Eagle!' : 'Albatross!',
        description: `Made ${scoreDiff === -2 ? 'eagle' : 'albatross'} on the par ${hole.par} ${getHoleDescription(hole.hole_number)}`,
        impact: `${Math.abs(scoreDiff)} under par`,
        emoji: '🦅',
      });
    }
  });

  // 2. Find birdie streaks (2+ consecutive)
  let streak = 0;
  let streakStart = 0;
  
  holes.forEach((hole: any, index: number) => {
    const scoreDiff = (hole.score || 0) - (hole.par || 4);
    
    if (scoreDiff === -1) {
      if (streak === 0) streakStart = index;
      streak++;
    } else {
      if (streak >= 2) {
        highlights.push({
          id: `birdie-streak-${streakStart}`,
          holeNumber: holes[streakStart].hole_number,
          type: 'birdie_streak',
          title: `${streak} Birdies in a Row`,
          description: `Made ${streak} consecutive birdies on holes ${holes[streakStart].hole_number}-${holes[streakStart + streak - 1].hole_number}`,
          impact: `${streak} under par in ${streak} holes`,
          emoji: '🔥',
        });
      }
      streak = 0;
    }
  });
  
  // Check end of round
  if (streak >= 2) {
    highlights.push({
      id: `birdie-streak-${streakStart}`,
      holeNumber: holes[streakStart].hole_number,
      type: 'birdie_streak',
      title: `${streak} Birdies in a Row`,
      description: `Finished with ${streak} consecutive birdies`,
      impact: `${streak} under par in ${streak} holes`,
      emoji: '🔥',
    });
  }

  // 3. Find standalone birdies (if no streaks already captured)
  if (!highlights.some(h => h.type === 'birdie_streak')) {
    holes.forEach((hole: any) => {
      const scoreDiff = (hole.score || 0) - (hole.par || 4);
      if (scoreDiff === -1) {
        highlights.push({
          id: `birdie-${hole.hole_number}`,
          holeNumber: hole.hole_number,
          type: 'birdie',
          title: 'Birdie',
          description: `Birdie on the par ${hole.par} ${getHoleDescription(hole.hole_number)}`,
          impact: '1 under par',
          emoji: '🐦',
        });
      }
    });
  }

  // 4. Find great sand saves
  holes.forEach((hole: any) => {
    if (hole.sand_save_made && hole.sand_save_attempt) {
      const scoreDiff = (hole.score || 0) - (hole.par || 4);
      if (scoreDiff <= 0) {
        highlights.push({
          id: `sand-save-${hole.hole_number}`,
          holeNumber: hole.hole_number,
          type: 'sand_save',
          title: 'Sand Save',
          description: `Got up and down from the bunker to save ${scoreDiff === 0 ? 'par' : 'birdie'}`,
          impact: 'Saved at least 1 stroke',
          emoji: '🏖️',
        });
      }
    }
  });

  // 5. Find bounce backs (birdie or par after double+)
  holes.forEach((hole: any, index: number) => {
    if (index === 0) return;
    
    const prevHole = holes[index - 1];
    const prevDiff = (prevHole.score || 0) - (prevHole.par || 4);
    const currDiff = (hole.score || 0) - (hole.par || 4);
    
    if (prevDiff >= 2 && currDiff <= 0) {
      highlights.push({
        id: `bounce-back-${hole.hole_number}`,
        holeNumber: hole.hole_number,
        type: 'bounce_back',
        title: 'Bounce Back',
        description: `Made ${currDiff < 0 ? 'birdie' : 'par'} right after a ${prevDiff === 2 ? 'double bogey' : 'big number'}`,
        impact: 'Great mental recovery',
        emoji: '🔄',
      });
    }
  });

  // 6. Strong finish (last 3 holes under par)
  const lastThree = holes.slice(-3);
  const lastThreeTotal = lastThree.reduce((sum: number, h: any) => {
    return sum + ((h.score || 0) - (h.par || 4));
  }, 0);
  
  if (lastThreeTotal < 0) {
    highlights.push({
      id: 'strong-finish',
      holeNumber: 16,
      type: 'strong_finish',
      title: 'Strong Finish',
      description: `Finished ${Math.abs(lastThreeTotal)} under par over the final 3 holes`,
      impact: `${Math.abs(lastThreeTotal)} under on 16-18`,
      emoji: '🏁',
    });
  }

  // Sort by hole number, limit to top 4
  return highlights
    .sort((a, b) => {
      // Prioritize: eagles > birdie streaks > strong finish > others
      const priority: Record<HighlightType, number> = {
        eagle: 1,
        birdie_streak: 2,
        strong_finish: 3,
        bounce_back: 4,
        sand_save: 5,
        birdie: 6,
        long_putt_made: 7,
        great_approach: 8,
        up_and_down: 9,
        par_save: 10,
      };
      return priority[a.type] - priority[b.type];
    })
    .slice(0, 4);
}

function getHoleDescription(holeNumber: number): string {
  if (holeNumber <= 9) return `${holeNumber}th`;
  const suffix = holeNumber === 11 ? 'th' : holeNumber === 12 ? 'th' : holeNumber === 13 ? 'th' : 
    holeNumber % 10 === 1 ? 'st' : holeNumber % 10 === 2 ? 'nd' : holeNumber % 10 === 3 ? 'rd' : 'th';
  return `${holeNumber}${suffix}`;
}
```

---

## Step 5: Areas to Review Detector

Create file: `src/lib/coachhelm/area-detector.ts`

```typescript
import { AreaToReview, AreaType, RoundStats, AREA_CONFIG } from './types';

export function detectAreasToReview(
  round: any,
  roundStats: RoundStats,
  playerAverages: RoundStats
): AreaToReview[] {
  const areas: AreaToReview[] = [];
  const holes = round.holes || [];

  // 1. Find three-putts
  holes.forEach((hole: any) => {
    if ((hole.putts || 0) >= 3) {
      areas.push({
        id: `three-putt-${hole.hole_number}`,
        holeNumber: hole.hole_number,
        type: 'three_putt',
        title: `Three-Putt on Hole ${hole.hole_number}`,
        description: `${hole.putts} putts on the ${hole.par === 3 ? 'par 3' : `par ${hole.par}`}`,
        rootCause: analyzeThreePuttCause(hole),
        pattern: 'putting_lag',
        linkedFocusArea: 'putting_lag',
        severity: hole.putts >= 4 ? 'high' : 'medium',
      });
    }
  });

  // 2. Find double bogeys or worse
  holes.forEach((hole: any) => {
    const scoreDiff = (hole.score || 0) - (hole.par || 4);
    if (scoreDiff >= 2) {
      // Don't duplicate if already have a three-putt for this hole
      if (areas.some(a => a.holeNumber === hole.hole_number && a.type === 'three_putt')) {
        return;
      }
      
      areas.push({
        id: `double-${hole.hole_number}`,
        holeNumber: hole.hole_number,
        type: 'double_bogey_plus',
        title: `${scoreDiff === 2 ? 'Double Bogey' : `+${scoreDiff}`} on Hole ${hole.hole_number}`,
        description: `Made ${hole.score} on the par ${hole.par}`,
        rootCause: analyzeDoubleCause(hole),
        pattern: null,
        linkedFocusArea: null,
        severity: scoreDiff >= 3 ? 'high' : 'medium',
      });
    }
  });

  // 3. Find penalties
  holes.forEach((hole: any) => {
    if ((hole.penalty_strokes || 0) > 0) {
      // Don't duplicate
      if (areas.some(a => a.holeNumber === hole.hole_number)) return;
      
      areas.push({
        id: `penalty-${hole.hole_number}`,
        holeNumber: hole.hole_number,
        type: 'penalty',
        title: `Penalty on Hole ${hole.hole_number}`,
        description: `Took ${hole.penalty_strokes} penalty stroke${hole.penalty_strokes > 1 ? 's' : ''}`,
        rootCause: 'Course management or execution error',
        pattern: null,
        linkedFocusArea: 'course_management',
        severity: hole.penalty_strokes >= 2 ? 'high' : 'medium',
      });
    }
  });

  // 4. Find missed short putts (< 5 feet that weren't made)
  // This would require shot-level data
  
  // 5. Find failed up-and-downs that led to bogey+
  holes.forEach((hole: any) => {
    if (!hole.gir && hole.up_and_down_attempt && !hole.up_and_down_made) {
      const scoreDiff = (hole.score || 0) - (hole.par || 4);
      if (scoreDiff >= 1) {
        // Don't duplicate
        if (areas.some(a => a.holeNumber === hole.hole_number)) return;
        
        areas.push({
          id: `failed-updown-${hole.hole_number}`,
          holeNumber: hole.hole_number,
          type: 'failed_up_and_down',
          title: `Missed Up-and-Down on Hole ${hole.hole_number}`,
          description: `Missed green and couldn't get up-and-down for par`,
          rootCause: 'Short game or putting execution',
          pattern: 'scrambling',
          linkedFocusArea: 'short_game',
          severity: 'low',
        });
      }
    }
  });

  // Sort by severity, limit to top 3
  const severityOrder = { high: 0, medium: 1, low: 2 };
  return areas
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 3);
}

function analyzeThreePuttCause(hole: any): string {
  // If we have first putt distance data
  if (hole.first_putt_distance) {
    if (hole.first_putt_distance > 30) {
      return `Long lag putt from ${hole.first_putt_distance} feet left too much work`;
    } else if (hole.first_putt_leave && hole.first_putt_leave > 5) {
      return `First putt left ${hole.first_putt_leave} feet remaining`;
    }
  }
  return 'Lag putt distance control or short putt miss';
}

function analyzeDoubleCause(hole: any): string {
  if (hole.penalty_strokes > 0) {
    return `Penalty stroke(s) contributed to the big number`;
  }
  if ((hole.putts || 0) >= 3) {
    return `Three-putt added strokes`;
  }
  if (!hole.fairway_hit && hole.par >= 4) {
    return `Missed fairway led to difficult recovery`;
  }
  if (!hole.gir) {
    return `Missed green and couldn't save par`;
  }
  return 'Multiple small mistakes compounded';
}
```

---

## Step 6: Summary Generator

Create file: `src/lib/coachhelm/summary-generator.ts`

```typescript
import {
  RoundStats,
  StrokesGainedBreakdown,
  Highlight,
  AreaToReview,
  Pattern,
  GoalImpact,
} from './types';

interface SummaryInput {
  round: any;
  roundStats: RoundStats;
  playerAverages: RoundStats;
  strokesGained: StrokesGainedBreakdown;
  highlights: Highlight[];
  areasToReview: AreaToReview[];
  newPatterns: Pattern[];
  recurringPatterns: Pattern[];
  goalImpacts: GoalImpact[];
}

interface SummaryOutput {
  summary: string;
  primaryTakeaway: string;
  nextPracticePriority: string | null;
}

export function generateSummary(input: SummaryInput): SummaryOutput {
  const {
    round,
    roundStats,
    playerAverages,
    strokesGained,
    highlights,
    areasToReview,
    newPatterns,
    recurringPatterns,
    goalImpacts,
  } = input;

  const paragraphs: string[] = [];

  // Paragraph 1: Overall assessment
  const scoreDiff = roundStats.scoreToPar;
  const avgDiff = roundStats.totalScore - playerAverages.totalScore;
  
  let opening = '';
  if (scoreDiff <= -2) {
    opening = `Excellent round! Shot ${roundStats.totalScore} (${formatScoreToPar(scoreDiff)}), which is ${Math.abs(avgDiff).toFixed(1)} strokes better than your season average.`;
  } else if (scoreDiff <= 0) {
    opening = `Solid round of ${roundStats.totalScore} (${formatScoreToPar(scoreDiff)}). `;
    if (avgDiff < 0) {
      opening += `This is ${Math.abs(avgDiff).toFixed(1)} strokes better than your average.`;
    } else if (avgDiff > 1) {
      opening += `Slightly above your ${playerAverages.totalScore.toFixed(1)} average, but still a good score.`;
    }
  } else if (scoreDiff <= 4) {
    opening = `Shot ${roundStats.totalScore} (${formatScoreToPar(scoreDiff)}). `;
    if (avgDiff > 0) {
      opening += `This is ${avgDiff.toFixed(1)} strokes above your average, so there's room to clean things up.`;
    }
  } else {
    opening = `Tough day with a ${roundStats.totalScore} (${formatScoreToPar(scoreDiff)}). Every golfer has these rounds — what matters is what you learn from it.`;
  }
  paragraphs.push(opening);

  // Paragraph 2: What went well + what needs work
  let analysis = '';
  
  // Find best SG category
  const sgCategories = [
    { name: 'off the tee', value: strokesGained.tee },
    { name: 'on approach', value: strokesGained.approach },
    { name: 'around the green', value: strokesGained.aroundGreen },
    { name: 'on the greens', value: strokesGained.putting },
  ];
  const bestCategory = sgCategories.reduce((best, curr) => curr.value > best.value ? curr : best);
  const worstCategory = sgCategories.reduce((worst, curr) => curr.value < worst.value ? curr : worst);

  if (bestCategory.value > 0.3) {
    analysis += `Your strength today was ${bestCategory.name}, where you gained ${bestCategory.value.toFixed(1)} strokes versus your baseline. `;
  }

  if (highlights.length > 0) {
    const highlightMention = highlights[0].type === 'birdie_streak' 
      ? highlights[0].title.toLowerCase()
      : highlights[0].type === 'eagle'
        ? 'the eagle'
        : `the ${highlights[0].type.replace(/_/g, ' ')}`;
    analysis += `Highlights included ${highlightMention} on hole ${highlights[0].holeNumber}. `;
  }

  if (worstCategory.value < -0.3) {
    analysis += `The area that cost you strokes was ${worstCategory.name} (${worstCategory.value.toFixed(1)} SG). `;
  }

  if (areasToReview.length > 0) {
    const mainIssue = areasToReview[0];
    analysis += `The ${mainIssue.type.replace(/_/g, ' ')} on hole ${mainIssue.holeNumber} is worth reviewing.`;
  }

  if (analysis) {
    paragraphs.push(analysis);
  }

  // Paragraph 3: Patterns and next steps
  let nextSteps = '';
  
  if (recurringPatterns.length > 0) {
    const pattern = recurringPatterns[0];
    nextSteps += `This round reinforced a pattern we've seen before: ${pattern.description.toLowerCase()}. This pattern appears in ${(pattern.frequency * 100).toFixed(0)}% of your rounds and costs approximately ${pattern.impactStrokes.toFixed(1)} strokes per round. `;
  }

  if (newPatterns.length > 0) {
    const pattern = newPatterns[0];
    nextSteps += `Something new to watch: ${pattern.description.toLowerCase()}. `;
  }

  // Goal impact
  const positiveImpact = goalImpacts.find(g => g.direction === 'positive');
  if (positiveImpact) {
    nextSteps += `Good news for your goal to ${positiveImpact.goalLabel.toLowerCase()}: ${positiveImpact.message.toLowerCase()}.`;
  }

  if (nextSteps) {
    paragraphs.push(nextSteps);
  }

  // Primary takeaway
  let primaryTakeaway = '';
  if (worstCategory.value < -0.5) {
    primaryTakeaway = `Focus on ${worstCategory.name} — it cost you ${Math.abs(worstCategory.value).toFixed(1)} strokes today.`;
  } else if (recurringPatterns.length > 0) {
    primaryTakeaway = recurringPatterns[0].description;
  } else if (highlights.length > 0 && scoreDiff <= 0) {
    primaryTakeaway = `Strong round. ${highlights[0].title} on hole ${highlights[0].holeNumber} was a standout moment.`;
  } else {
    primaryTakeaway = `Keep working on consistency. Your ${bestCategory.name} showed promise today.`;
  }

  // Next practice priority
  let nextPracticePriority: string | null = null;
  if (areasToReview.length > 0 && areasToReview[0].linkedFocusArea) {
    const focusAreaLabels: Record<string, string> = {
      putting_lag: 'Lag putting distance control',
      putting_short: 'Short putts inside 5 feet',
      short_game: 'Chipping and pitching',
      course_management: 'Course management decisions',
      approach_mid: 'Approach shots 125-175 yards',
    };
    nextPracticePriority = focusAreaLabels[areasToReview[0].linkedFocusArea] || areasToReview[0].linkedFocusArea;
  } else if (worstCategory.value < -0.3) {
    const practicePriorities: Record<string, string> = {
      'off the tee': 'Driving accuracy and distance control',
      'on approach': 'Iron play and approach shots',
      'around the green': 'Short game: chips, pitches, bunker shots',
      'on the greens': 'Putting: speed control and read accuracy',
    };
    nextPracticePriority = practicePriorities[worstCategory.name];
  }

  return {
    summary: paragraphs.join('\n\n'),
    primaryTakeaway,
    nextPracticePriority,
  };
}

function formatScoreToPar(scoreToPar: number): string {
  if (scoreToPar === 0) return 'E';
  if (scoreToPar > 0) return `+${scoreToPar}`;
  return scoreToPar.toString();
}
```

---

## Step 7: Data Hook

Create file: `src/hooks/coachhelm/useRoundReview.ts`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RoundReview } from '@/lib/coachhelm/types';

// Map database to TypeScript
function dbToReview(row: any): RoundReview {
  return {
    id: row.id,
    roundId: row.round_id,
    playerId: row.player_id,
    roundScore: row.round_score,
    roundScoreToPar: row.round_score_to_par,
    scoringAvgBefore: row.scoring_avg_before ? parseFloat(row.scoring_avg_before) : null,
    scoringAvgAfter: row.scoring_avg_after ? parseFloat(row.scoring_avg_after) : null,
    qualifyingPositionBefore: row.qualifying_position_before,
    qualifyingPositionAfter: row.qualifying_position_after,
    gapToNextPosition: row.gap_to_next_position ? parseFloat(row.gap_to_next_position) : null,
    goalImpacts: row.goal_impacts || [],
    highlights: row.highlights || [],
    areasToReview: row.areas_to_review || [],
    roundStats: row.round_stats,
    playerAverages: row.player_averages,
    teamAverages: row.team_averages,
    strokesGained: row.strokes_gained,
    patternsDetected: row.patterns_detected || [],
    patternsRecurring: row.patterns_recurring || [],
    summary: row.summary,
    primaryTakeaway: row.primary_takeaway,
    nextPracticePriority: row.next_practice_priority,
    linkedFocusAreaId: row.linked_focus_area_id,
    sharedWithCoach: row.shared_with_coach,
    sharedAt: row.shared_at,
    coachViewedAt: row.coach_viewed_at,
    coachNotes: row.coach_notes,
    createdAt: row.created_at,
  };
}

export function useRoundReview(roundId: string | null) {
  const [review, setReview] = useState<RoundReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch existing review
  useEffect(() => {
    if (!roundId) {
      setLoading(false);
      return;
    }

    async function fetch() {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('golf_round_reviews')
        .select('*')
        .eq('round_id', roundId)
        .maybeSingle();

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      if (data) {
        setReview(dbToReview(data));
      }
      // If no data, review needs to be generated

      setLoading(false);
    }

    fetch();
  }, [roundId, supabase]);

  // Generate review (calls API route)
  const generate = useCallback(async () => {
    if (!roundId) return;

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/golf/rounds/generate-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate review');
      }

      const data = await response.json();
      setReview(data.review);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate review');
    } finally {
      setGenerating(false);
    }
  }, [roundId]);

  // Share with coach
  const shareWithCoach = useCallback(async () => {
    if (!review?.id) return;

    const { error: updateError } = await supabase
      .from('golf_round_reviews')
      .update({
        shared_with_coach: true,
        shared_at: new Date().toISOString(),
      })
      .eq('id', review.id);

    if (updateError) {
      setError(updateError.message);
      return false;
    }

    setReview(prev => prev ? {
      ...prev,
      sharedWithCoach: true,
      sharedAt: new Date().toISOString(),
    } : null);

    return true;
  }, [review?.id, supabase]);

  return {
    review,
    loading,
    generating,
    error,
    generate,
    shareWithCoach,
    needsGeneration: !loading && !review,
  };
}
```

---

## Step 8: API Route for Generation

Create file: `src/app/api/golf/rounds/generate-review/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateRoundReview } from '@/lib/coachhelm/round-review-generator';

export async function POST(request: NextRequest) {
  try {
    const { roundId } = await request.json();

    if (!roundId) {
      return NextResponse.json({ error: 'Round ID required' }, { status: 400 });
    }

    const supabase = createClient();

    // Verify user owns this round
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: round } = await supabase
      .from('golf_rounds')
      .select('player_id, golf_players!inner(user_id)')
      .eq('id', roundId)
      .single();

    if (!round || round.golf_players.user_id !== user.id) {
      return NextResponse.json({ error: 'Round not found' }, { status: 404 });
    }

    // Generate review
    const review = await generateRoundReview({
      roundId,
      playerId: round.player_id,
    });

    return NextResponse.json({ review });
  } catch (error) {
    console.error('Generate review error:', error);
    return NextResponse.json(
      { error: 'Failed to generate review' },
      { status: 500 }
    );
  }
}
```

---

## Step 9: UI Components

### 9.1 Completion Card

Create file: `src/components/golf/coachhelm/round-review/CompletionCard.tsx`

```typescript
'use client';

import { cn } from '@/lib/utils';
import { RoundReview } from '@/lib/coachhelm/types';

interface CompletionCardProps {
  review: RoundReview;
}

export function CompletionCard({ review }: CompletionCardProps) {
  const scoreToPar = review.roundScoreToPar;
  const avgChange = review.scoringAvgAfter && review.scoringAvgBefore
    ? review.scoringAvgAfter - review.scoringAvgBefore
    : null;

  return (
    <div 
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6"
      style={{ animation: 'fadeInUp 0.5s ease-out' }}
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="white" />
          </pattern>
          <rect width="100" height="100" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative">
        {/* Score */}
        <div className="text-center mb-4">
          <div className="text-sm text-slate-400 mb-1">Round Complete</div>
          <div className="flex items-center justify-center gap-3">
            <span className="text-5xl font-bold">{review.roundScore}</span>
            <span className={cn(
              'text-2xl font-semibold px-3 py-1 rounded-lg',
              scoreToPar < 0 && 'bg-green-500/20 text-green-400',
              scoreToPar === 0 && 'bg-slate-500/20 text-slate-300',
              scoreToPar > 0 && 'bg-red-500/20 text-red-400',
            )}>
              {scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex justify-center gap-8 pt-4 border-t border-white/10">
          {/* Scoring average */}
          {review.scoringAvgAfter && (
            <div className="text-center">
              <div className="text-xs text-slate-400 mb-1">Scoring Avg</div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-semibold">{review.scoringAvgAfter.toFixed(1)}</span>
                {avgChange !== null && avgChange !== 0 && (
                  <span className={cn(
                    'text-xs font-medium',
                    avgChange < 0 ? 'text-green-400' : 'text-red-400'
                  )}>
                    {avgChange > 0 ? '+' : ''}{avgChange.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Front/Back */}
          <div className="text-center">
            <div className="text-xs text-slate-400 mb-1">Front / Back</div>
            <div className="text-lg font-semibold">
              {review.roundStats.frontNine} / {review.roundStats.backNine}
            </div>
          </div>

          {/* Birdies */}
          <div className="text-center">
            <div className="text-xs text-slate-400 mb-1">Birdies</div>
            <div className="text-lg font-semibold text-green-400">
              {review.roundStats.birdies}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 9.2 Goal Impact Card

Create file: `src/components/golf/coachhelm/round-review/GoalImpactCard.tsx`

```typescript
'use client';

import { cn } from '@/lib/utils';
import { GoalImpact } from '@/lib/coachhelm/types';

interface GoalImpactCardProps {
  impacts: GoalImpact[];
}

export function GoalImpactCard({ impacts }: GoalImpactCardProps) {
  if (impacts.length === 0) return null;

  const positiveImpacts = impacts.filter(i => i.direction === 'positive');
  const negativeImpacts = impacts.filter(i => i.direction === 'negative');

  return (
    <div 
      className="rounded-xl border border-slate-200 bg-white p-5"
      style={{ animation: 'fadeInUp 0.5s ease-out 0.1s both' }}
    >
      <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <span className="text-lg">🎯</span>
        Goal Impact
      </h3>

      <div className="space-y-3">
        {impacts.map((impact) => (
          <div 
            key={impact.goalId}
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg',
              impact.direction === 'positive' && 'bg-green-50',
              impact.direction === 'negative' && 'bg-red-50',
              impact.direction === 'neutral' && 'bg-slate-50',
            )}
          >
            {/* Direction indicator */}
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm',
              impact.direction === 'positive' && 'bg-green-100 text-green-600',
              impact.direction === 'negative' && 'bg-red-100 text-red-600',
              impact.direction === 'neutral' && 'bg-slate-100 text-slate-600',
            )}>
              {impact.direction === 'positive' ? '↑' : impact.direction === 'negative' ? '↓' : '→'}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900">{impact.goalLabel}</div>
              <div className="text-xs text-slate-500">{impact.message}</div>
            </div>

            {/* Change value */}
            {impact.change !== 0 && (
              <div className={cn(
                'text-sm font-semibold tabular-nums',
                impact.direction === 'positive' ? 'text-green-600' : 'text-red-500',
              )}>
                {impact.change > 0 ? '+' : ''}{impact.change.toFixed(1)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 9.3 Review Scorecard

Create file: `src/components/golf/coachhelm/round-review/ReviewScorecard.tsx`

```typescript
'use client';

import { cn } from '@/lib/utils';
import { RoundStats } from '@/lib/coachhelm/types';

interface ReviewScorecardProps {
  holes: any[]; // From round.holes
}

export function ReviewScorecard({ holes }: ReviewScorecardProps) {
  const frontNine = holes.slice(0, 9);
  const backNine = holes.slice(9, 18);

  return (
    <div 
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
      style={{ animation: 'fadeInUp 0.5s ease-out 0.2s both' }}
    >
      <div className="p-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">Scorecard</h3>
      </div>

      <div className="overflow-x-auto">
        {/* Front nine */}
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500 mb-2">Front Nine</div>
          <div className="flex gap-1">
            {frontNine.map((hole, index) => (
              <HoleChip key={hole.hole_number} hole={hole} delay={index * 35} />
            ))}
            <div className="flex items-center justify-center w-10 h-10 bg-slate-100 rounded-lg text-sm font-semibold text-slate-700">
              {frontNine.reduce((sum, h) => sum + (h.score || 0), 0)}
            </div>
          </div>
        </div>

        {/* Back nine */}
        <div className="p-4 pt-0">
          <div className="text-xs font-medium text-slate-500 mb-2">Back Nine</div>
          <div className="flex gap-1">
            {backNine.map((hole, index) => (
              <HoleChip key={hole.hole_number} hole={hole} delay={(index + 9) * 35} />
            ))}
            <div className="flex items-center justify-center w-10 h-10 bg-slate-100 rounded-lg text-sm font-semibold text-slate-700">
              {backNine.reduce((sum, h) => sum + (h.score || 0), 0)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HoleChip({ hole, delay }: { hole: any; delay: number }) {
  const scoreDiff = (hole.score || 0) - (hole.par || 4);
  
  const colors = {
    eagle: 'bg-purple-500 text-white',
    birdie: 'bg-green-500 text-white',
    par: 'bg-slate-100 text-slate-700',
    bogey: 'bg-amber-100 text-amber-700',
    double: 'bg-red-100 text-red-700',
    triple: 'bg-red-200 text-red-800',
  };

  let colorKey: keyof typeof colors = 'par';
  if (scoreDiff <= -2) colorKey = 'eagle';
  else if (scoreDiff === -1) colorKey = 'birdie';
  else if (scoreDiff === 0) colorKey = 'par';
  else if (scoreDiff === 1) colorKey = 'bogey';
  else if (scoreDiff === 2) colorKey = 'double';
  else colorKey = 'triple';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center w-10 h-10 rounded-lg text-sm font-semibold transition-transform hover:scale-105',
        colors[colorKey]
      )}
      style={{
        animation: `scoreReveal 0.3s ease-out ${delay}ms both`,
      }}
      title={`Hole ${hole.hole_number}: Par ${hole.par}`}
    >
      {hole.score}
    </div>
  );
}
```

Add this animation to `globals.css`:

```css
@keyframes scoreReveal {
  0% {
    opacity: 0;
    transform: scale(0.8) translateY(-4px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
```

### 9.4 Highlights Section

Create file: `src/components/golf/coachhelm/round-review/HighlightsSection.tsx`

```typescript
'use client';

import { Highlight, HIGHLIGHT_CONFIG } from '@/lib/coachhelm/types';

interface HighlightsSectionProps {
  highlights: Highlight[];
}

export function HighlightsSection({ highlights }: HighlightsSectionProps) {
  if (highlights.length === 0) return null;

  return (
    <div 
      className="rounded-xl border border-slate-200 bg-white p-5"
      style={{ animation: 'fadeInUp 0.5s ease-out 0.3s both' }}
    >
      <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <span className="text-lg">✨</span>
        Highlights
      </h3>

      <div className="space-y-3">
        {highlights.map((highlight, index) => {
          const config = HIGHLIGHT_CONFIG[highlight.type];
          return (
            <div
              key={highlight.id}
              className="flex items-start gap-3 p-3 rounded-xl bg-gradient-to-r from-green-50 to-white border border-green-100"
              style={{
                animation: `fadeInUp 0.4s ease-out ${300 + index * 80}ms both`,
              }}
            >
              <span className="text-2xl">{highlight.emoji || config?.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{highlight.title}</span>
                  <span className="text-xs text-slate-500">Hole {highlight.holeNumber}</span>
                </div>
                <p className="text-sm text-slate-600 mt-0.5">{highlight.description}</p>
              </div>
              <div className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded">
                {highlight.impact}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### 9.5 Areas to Review Section

Create file: `src/components/golf/coachhelm/round-review/AreasToReviewSection.tsx`

```typescript
'use client';

import { cn } from '@/lib/utils';
import { AreaToReview, AREA_CONFIG } from '@/lib/coachhelm/types';

interface AreasToReviewSectionProps {
  areas: AreaToReview[];
}

export function AreasToReviewSection({ areas }: AreasToReviewSectionProps) {
  if (areas.length === 0) return null;

  return (
    <div 
      className="rounded-xl border border-slate-200 bg-white p-5"
      style={{ animation: 'fadeInUp 0.5s ease-out 0.4s both' }}
    >
      <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <span className="text-lg">🔍</span>
        Areas to Review
      </h3>

      <div className="space-y-3">
        {areas.map((area, index) => {
          const config = AREA_CONFIG[area.type];
          return (
            <div
              key={area.id}
              className={cn(
                'p-4 rounded-xl border-l-4',
                area.severity === 'high' && 'bg-red-50 border-l-red-500',
                area.severity === 'medium' && 'bg-amber-50 border-l-amber-500',
                area.severity === 'low' && 'bg-slate-50 border-l-slate-400',
              )}
              style={{
                animation: `fadeInUp 0.4s ease-out ${400 + index * 80}ms both`,
              }}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">{config?.emoji || '⚠️'}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-slate-900">{area.title}</span>
                  </div>
                  <p className="text-sm text-slate-600">{area.description}</p>
                  
                  {/* Root cause */}
                  <div className="mt-2 pt-2 border-t border-slate-200/60">
                    <div className="text-xs font-medium text-slate-500 mb-1">Root Cause</div>
                    <p className="text-sm text-slate-700">{area.rootCause}</p>
                  </div>

                  {/* Linked focus area */}
                  {area.linkedFocusArea && (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded">
                        Practice Focus: {area.linkedFocusArea.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### 9.6 Strokes Gained Section

Create file: `src/components/golf/coachhelm/round-review/StrokesGainedSection.tsx`

```typescript
'use client';

import { cn } from '@/lib/utils';
import { StrokesGainedBreakdown } from '@/lib/coachhelm/types';

interface StrokesGainedSectionProps {
  strokesGained: StrokesGainedBreakdown;
}

const CATEGORIES = [
  { key: 'tee' as const, label: 'Off the Tee' },
  { key: 'approach' as const, label: 'Approach' },
  { key: 'aroundGreen' as const, label: 'Around Green' },
  { key: 'putting' as const, label: 'Putting' },
];

export function StrokesGainedSection({ strokesGained }: StrokesGainedSectionProps) {
  const maxAbsValue = Math.max(
    ...CATEGORIES.map(c => Math.abs(strokesGained[c.key])),
    1 // Minimum scale
  );

  return (
    <div 
      className="rounded-xl border border-slate-200 bg-white p-5"
      style={{ animation: 'fadeInUp 0.5s ease-out 0.5s both' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <span className="text-lg">📊</span>
          Strokes Gained
        </h3>
        <div className={cn(
          'text-lg font-bold tabular-nums',
          strokesGained.total >= 0 ? 'text-green-600' : 'text-red-500'
        )}>
          {strokesGained.total >= 0 ? '+' : ''}{strokesGained.total.toFixed(1)}
        </div>
      </div>

      <div className="space-y-3">
        {CATEGORIES.map((category, index) => {
          const value = strokesGained[category.key];
          const isPositive = value >= 0;
          const barWidth = (Math.abs(value) / maxAbsValue) * 50; // Max 50% of half

          return (
            <div key={category.key} className="flex items-center gap-3">
              <div className="w-24 text-sm text-slate-600">{category.label}</div>
              
              {/* Bar container */}
              <div className="flex-1 h-6 relative">
                {/* Center line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-200" />
                
                {/* Bar */}
                <div className="absolute inset-0 flex items-center">
                  {isPositive ? (
                    <div 
                      className="absolute left-1/2 h-4 rounded-r bg-gradient-to-r from-green-400 to-green-500"
                      style={{
                        width: `${barWidth}%`,
                        animation: `barGrow 0.6s ease-out ${500 + index * 100}ms both`,
                        transformOrigin: 'left',
                      }}
                    />
                  ) : (
                    <div 
                      className="absolute right-1/2 h-4 rounded-l bg-gradient-to-l from-red-400 to-red-500"
                      style={{
                        width: `${barWidth}%`,
                        animation: `barGrow 0.6s ease-out ${500 + index * 100}ms both`,
                        transformOrigin: 'right',
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Value */}
              <div className={cn(
                'w-12 text-right text-sm font-semibold tabular-nums',
                isPositive ? 'text-green-600' : 'text-red-500'
              )}>
                {isPositive ? '+' : ''}{value.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Add animation to `globals.css`:

```css
@keyframes barGrow {
  0% {
    transform: scaleX(0);
  }
  60% {
    transform: scaleX(1.05);
  }
  100% {
    transform: scaleX(1);
  }
}
```

### 9.7 Review Summary

Create file: `src/components/golf/coachhelm/round-review/ReviewSummary.tsx`

```typescript
'use client';

import { RoundReview } from '@/lib/coachhelm/types';

interface ReviewSummaryProps {
  review: RoundReview;
}

export function ReviewSummary({ review }: ReviewSummaryProps) {
  return (
    <div 
      className="rounded-xl border border-green-200 bg-gradient-to-br from-green-50 to-white p-5"
      style={{ animation: 'fadeInUp 0.5s ease-out 0.6s both' }}
    >
      <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <span className="text-lg">🧠</span>
        CoachHelm Summary
      </h3>

      {/* Main summary */}
      <div className="prose prose-sm prose-slate max-w-none mb-4">
        {review.summary.split('\n\n').map((paragraph, index) => (
          <p key={index} className="text-slate-700 leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>

      {/* Primary takeaway */}
      <div className="p-3 bg-green-100/50 rounded-lg border border-green-200 mb-3">
        <div className="text-xs font-medium text-green-700 mb-1">Key Takeaway</div>
        <p className="text-sm font-medium text-green-900">{review.primaryTakeaway}</p>
      </div>

      {/* Next practice priority */}
      {review.nextPracticePriority && (
        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
          <div className="text-xs font-medium text-amber-700 mb-1">Next Practice Priority</div>
          <p className="text-sm font-medium text-amber-900">{review.nextPracticePriority}</p>
        </div>
      )}
    </div>
  );
}
```

### 9.8 Barrel Export

Create file: `src/components/golf/coachhelm/round-review/index.ts`

```typescript
export { CompletionCard } from './CompletionCard';
export { GoalImpactCard } from './GoalImpactCard';
export { ReviewScorecard } from './ReviewScorecard';
export { HighlightsSection } from './HighlightsSection';
export { AreasToReviewSection } from './AreasToReviewSection';
export { StrokesGainedSection } from './StrokesGainedSection';
export { ReviewSummary } from './ReviewSummary';
```

---

## Step 10: Main Review Page

Create file: `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx`

```typescript
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRoundReview } from '@/hooks/coachhelm/useRoundReview';
import { useToast } from '@/components/ui/toast';
import {
  CompletionCard,
  GoalImpactCard,
  ReviewScorecard,
  HighlightsSection,
  AreasToReviewSection,
  StrokesGainedSection,
  ReviewSummary,
} from '@/components/golf/coachhelm/round-review';
import Link from 'next/link';

export default function RoundReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const roundId = params.id as string;

  const [round, setRound] = useState<any>(null);
  const [loadingRound, setLoadingRound] = useState(true);

  const { 
    review, 
    loading, 
    generating, 
    error, 
    generate, 
    shareWithCoach,
    needsGeneration 
  } = useRoundReview(roundId);

  const supabase = createClient();

  // Fetch round data (for scorecard)
  useEffect(() => {
    async function fetchRound() {
      const { data } = await supabase
        .from('golf_rounds')
        .select('*, holes:golf_holes(*)')
        .eq('id', roundId)
        .single();

      if (data) {
        // Sort holes by hole_number
        data.holes = data.holes?.sort((a: any, b: any) => a.hole_number - b.hole_number);
        setRound(data);
      }
      setLoadingRound(false);
    }

    fetchRound();
  }, [roundId, supabase]);

  // Auto-generate if needed
  useEffect(() => {
    if (needsGeneration && !generating) {
      generate();
    }
  }, [needsGeneration, generating, generate]);

  // Handle share
  async function handleShare() {
    const success = await shareWithCoach();
    if (success) {
      toast({ title: 'Shared with coach', description: 'Your coach can now view this round review.' });
    }
  }

  // Loading state
  if (loading || loadingRound || generating) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-12 h-12 border-2 border-green-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-600">
            {generating ? 'Analyzing your round...' : 'Loading review...'}
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center py-20">
          <p className="text-red-500 mb-4">Failed to load review: {error}</p>
          <button
            onClick={() => generate()}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!review) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/golf/dashboard/rounds"
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Rounds
        </Link>

        {!review.sharedWithCoach && (
          <button
            onClick={handleShare}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share with Coach
          </button>
        )}

        {review.sharedWithCoach && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Shared with Coach
          </span>
        )}
      </div>

      {/* Content */}
      <div className="space-y-4">
        <CompletionCard review={review} />
        
        <GoalImpactCard impacts={review.goalImpacts} />
        
        {round?.holes && <ReviewScorecard holes={round.holes} />}
        
        <HighlightsSection highlights={review.highlights} />
        
        <AreasToReviewSection areas={review.areasToReview} />
        
        <StrokesGainedSection strokesGained={review.strokesGained} />
        
        <ReviewSummary review={review} />
      </div>

      {/* Bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent lg:relative lg:bg-none lg:p-0 lg:mt-6">
        <div className="max-w-2xl mx-auto flex gap-3">
          <Link
            href={`/golf/dashboard/rounds/${roundId}`}
            className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-center font-medium hover:bg-slate-200 transition-colors"
          >
            View Full Stats
          </Link>
          <Link
            href="/golf/dashboard/focus-areas"
            className="flex-1 py-3 bg-green-600 text-white rounded-xl text-center font-medium hover:bg-green-700 transition-colors"
          >
            Practice Plan
          </Link>
        </div>
      </div>
    </div>
  );
}
```

---

## Step 11: Integration Points

### 11.1 After Round Submission

In your round submission flow (wherever rounds are created), redirect to the review page:

```typescript
// After successful round save:
router.push(`/golf/dashboard/rounds/${newRound.id}/review`);
```

### 11.2 Link from Rounds List

Add a "Review" button to your rounds list:

```typescript
// In rounds list item
<Link 
  href={`/golf/dashboard/rounds/${round.id}/review`}
  className="text-sm text-green-600 hover:text-green-700 font-medium"
>
  View Review
</Link>
```

### 11.3 Required Animations in globals.css

Add these to your `src/app/globals.css`:

```css
/* Round Review Animations */
@keyframes fadeInUp {
  0% {
    opacity: 0;
    transform: translateY(12px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes scoreReveal {
  0% {
    opacity: 0;
    transform: scale(0.8) translateY(-4px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes barGrow {
  0% {
    transform: scaleX(0);
  }
  60% {
    transform: scaleX(1.05);
  }
  100% {
    transform: scaleX(1);
  }
}
```

---

## Testing Checklist

1. [ ] Run migration: `npx supabase db push`
2. [ ] Submit a round with at least 18 holes of data
3. [ ] Navigate to `/golf/dashboard/rounds/[id]/review`
4. [ ] Verify review generates (loading state shows)
5. [ ] Verify Completion Card shows correct score
6. [ ] Verify Scorecard animates in hole by hole
7. [ ] Verify Highlights section shows (if any birdies/eagles)
8. [ ] Verify Areas to Review shows (if any 3-putts/doubles)
9. [ ] Verify Strokes Gained bars animate correctly
10. [ ] Verify Summary generates meaningful text
11. [ ] Test "Share with Coach" button
12. [ ] Test navigation back to rounds list
13. [ ] Refresh page — verify review loads from database (not regenerated)

---

## What's Next

This feature is complete. The next features to build are:

1. **Focus Areas** — Player sees improvement priorities with practice plans
2. **Attention Alerts** — Coach dashboard section for players needing attention
3. **Compare Tool** — Side-by-side player comparison

Which one do you want next?
