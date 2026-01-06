# CoachHelm Master Blueprint v2.0
## Intelligence-First Design with Deep Configurability

---

## Philosophy

**CoachHelm is not a dashboard. It's a coaching intelligence system.**

The difference:
- Dashboard: "Here's your data"
- Intelligence: "Here's what matters, why it matters, and it's calibrated to YOUR priorities"

Every coach has a philosophy. Some live and die by GIR. Others believe scrambling wins championships. Some prioritize mental game over mechanics. CoachHelm learns what matters to each coach and surfaces insights through that lens.

Every player has goals. Some want to make the travel roster. Others are rebuilding their swing. Some are seniors trying to peak for conference championships. CoachHelm understands context and personalizes accordingly.

**The Core Insight:**
The same data point can be critical or irrelevant depending on context:
- A 2-stroke scoring increase during swing changes? Expected.
- A 2-stroke scoring increase during tournament week? Red alert.
- A player at #4 dropping 0.5 strokes? Not urgent.
- A player at #5 (bubble) dropping 0.5 strokes? Needs attention.

Intelligence means understanding context.

---

## Part 1: The Intelligence Layer

### 1.1 Context Engine

The Context Engine understands the "when" and "why" behind every insight.

```typescript
interface PlayerContext {
  // Current state
  currentPhase: 'preseason' | 'early_season' | 'mid_season' | 'championship_prep' | 'offseason';
  activeGoals: Goal[];
  recentEvents: ContextEvent[]; // injury, swing change, personal issue flag
  
  // Position context
  qualifyingPosition: number;
  gapToNextPosition: number;
  gapToPreviousPosition: number;
  isBubblePlayer: boolean; // within 1 stroke of cutoff
  isLockPlayer: boolean;   // >3 strokes ahead of cutoff
  
  // Trajectory
  trendDirection: 'improving' | 'stable' | 'declining';
  trendMagnitude: number; // strokes
  trendConfidence: number; // 0-1
  
  // Comparisons
  vsTeamAverage: number;
  vsSelfSeasonBest: number;
  vsGoalTarget: number;
}

interface TeamContext {
  currentPhase: SeasonPhase;
  nextTournament: Tournament | null;
  daysUntilNextEvent: number;
  travelRosterSize: number;
  activeQualifier: Qualifier | null;
  
  // Team health
  playersImproving: number;
  playersStable: number;
  playersDeclining: number;
  
  // Urgency
  urgencyLevel: 'low' | 'normal' | 'high' | 'critical';
}

type ContextEvent = 
  | { type: 'swing_change'; startDate: Date; expectedDuration: string; }
  | { type: 'injury'; severity: 'minor' | 'moderate' | 'major'; affectedArea: string; }
  | { type: 'personal_flag'; note: string; } // coach-added flag
  | { type: 'equipment_change'; details: string; }
  | { type: 'peak_target'; targetDate: Date; targetEvent: string; };
```

### 1.2 Coach Philosophy Profile

Every coach configures their philosophy. This shapes how CoachHelm prioritizes and presents information.

```typescript
interface CoachPhilosophy {
  // What matters most (ranked 1-5, 1 = highest priority)
  priorityMetrics: {
    ballStriking: number;      // Fairways + GIR
    shortGame: number;         // Scrambling + Sand Saves
    putting: number;           // Putts per round, make %
    courseManagement: number;  // Penalties, bogey avoidance
    mentalGame: number;        // Tournament vs practice gap
  };
  
  // Alert sensitivity
  alertSensitivity: 'aggressive' | 'balanced' | 'conservative';
  // aggressive: Surface early, risk false positives
  // balanced: Standard thresholds
  // conservative: Only surface high-confidence issues
  
  // What triggers concern
  declineThreshold: number; // strokes over 5 rounds (default: 2.0)
  plateauWeeks: number;     // weeks without improvement (default: 4)
  pressureGapThreshold: number; // tournament-practice gap (default: 2.5)
  
  // Comparison philosophy
  comparisonWeights: {
    historicalPerformance: number;  // 0-100
    recentForm: number;             // 0-100
    tournamentPerformance: number;  // 0-100
    practicePerformance: number;    // 0-100
    intangibles: number;            // 0-100 (coach's subjective input)
  };
  
  // Display preferences
  showStrokesGained: boolean;
  showAdvancedStats: boolean;
  preferVisualizations: boolean;
  
  // Communication style
  insightVerbosity: 'brief' | 'detailed';
  alertFrequency: 'realtime' | 'daily_digest' | 'weekly_summary';
}
```

### 1.3 Player Goal System

Players set goals. CoachHelm tracks progress and calibrates insights to those goals.

```typescript
interface PlayerGoal {
  id: string;
  type: GoalType;
  target: GoalTarget;
  deadline: Date | null;
  priority: 'primary' | 'secondary';
  status: 'active' | 'achieved' | 'abandoned';
  
  // Progress tracking
  startingValue: number;
  currentValue: number;
  targetValue: number;
  progressPercentage: number;
  projectedCompletion: Date | null;
  onTrack: boolean;
}

type GoalType = 
  | 'make_travel_roster'
  | 'improve_scoring_average'
  | 'improve_handicap'
  | 'improve_specific_stat'
  | 'peak_for_event'
  | 'earn_starting_spot'
  | 'custom';

type GoalTarget = 
  | { type: 'roster_position'; position: number; }
  | { type: 'scoring_average'; target: number; }
  | { type: 'handicap'; target: number; }
  | { type: 'stat'; statKey: string; target: number; }
  | { type: 'event'; eventId: string; targetScore: number; }
  | { type: 'custom'; description: string; metric: string; target: number; };
```

### 1.4 Adaptive Benchmarking

Static benchmarks are useless. CoachHelm builds dynamic, contextual benchmarks.

```typescript
interface BenchmarkSystem {
  // Tier benchmarks (baseline)
  tierBenchmarks: {
    elite_d1: Benchmarks;      // Top 25 programs
    competitive_d1: Benchmarks; // D1 average
    d2_d3: Benchmarks;
  };
  
  // Team-specific benchmarks (learned from team data)
  teamBenchmarks: Benchmarks; // Calculated from team's last 2 seasons
  
  // Player-specific benchmarks
  playerBenchmarks: Map<PlayerId, {
    personal: Benchmarks;           // Their own history
    yearAdjusted: Benchmarks;       // Adjusted for freshman vs senior
    phaseAdjusted: Benchmarks;      // Adjusted for season phase
  }>;
  
  // Contextual adjustments
  adjustments: {
    courseType: Map<CourseType, number>;     // Links, parkland, desert
    altitude: Map<AltitudeRange, number>;    // Sea level, mile high
    conditions: Map<Conditions, number>;     // Wind, rain, cold
  };
}

// Benchmark selection logic
function getBenchmark(
  player: Player,
  context: PlayerContext,
  coachPhilosophy: CoachPhilosophy
): Benchmarks {
  // 1. Start with tier benchmark
  let benchmark = tierBenchmarks[player.team.tier];
  
  // 2. Blend with team benchmark if sufficient data
  if (teamBenchmarks.sampleSize > 500) {
    benchmark = blend(benchmark, teamBenchmarks, 0.3);
  }
  
  // 3. Adjust for player year
  benchmark = adjustForYear(benchmark, player.year);
  
  // 4. Adjust for season phase
  benchmark = adjustForPhase(benchmark, context.currentPhase);
  
  // 5. Apply coach sensitivity
  if (coachPhilosophy.alertSensitivity === 'aggressive') {
    benchmark = tighten(benchmark, 0.1); // Stricter expectations
  }
  
  return benchmark;
}
```

### 1.5 Learning from Coach Behavior

CoachHelm learns from how coaches interact with it.

```typescript
interface CoachBehaviorLearning {
  // Alert interactions
  alertPatterns: {
    typesOftenDismissed: AlertType[];     // Stop showing these
    typesOftenActedUpon: AlertType[];     // Prioritize these
    averageTimeToAcknowledge: number;      // Hours
    preferredAlertTimes: TimeRange[];      // When they check
  };
  
  // Comparison patterns
  comparisonPatterns: {
    factorsCorrelatedWithDecision: StatKey[]; // What they actually use
    playersOftenCompared: PlayerId[][];       // Common matchups
    decisionsVsRecommendations: number;       // Agreement rate
  };
  
  // Insight engagement
  insightEngagement: {
    sectionsExpanded: string[];               // What they read
    sectionsSkipped: string[];                // What they ignore
    averageTimeOnReview: number;              // Seconds
  };
}

// Use learning to personalize
function prioritizeAlerts(
  alerts: Alert[],
  learning: CoachBehaviorLearning
): Alert[] {
  return alerts
    .filter(a => !learning.alertPatterns.typesOftenDismissed.includes(a.type))
    .sort((a, b) => {
      // Prioritize types they act upon
      const aScore = learning.alertPatterns.typesOftenActedUpon.includes(a.type) ? 1 : 0;
      const bScore = learning.alertPatterns.typesOftenActedUpon.includes(b.type) ? 1 : 0;
      return bScore - aScore;
    });
}
```

---

## Part 2: Configuration Interfaces

### 2.1 Coach Settings Page

**Location:** `/golf/dashboard/settings/coaching-intelligence`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Settings                                                                 │
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════╗ │
│  ║  🧠 COACHING INTELLIGENCE                                             ║ │
│  ║                                                                       ║ │
│  ║  Configure how CoachHelm analyzes your team and surfaces insights.    ║ │
│  ╚═══════════════════════════════════════════════════════════════════════╝ │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  MY COACHING PHILOSOPHY                                                     │
│                                                                             │
│  What matters most to your program? Drag to reorder.                       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ⋮⋮  1.  Ball Striking                                      ━━━━━  │   │
│  │       Fairways hit, greens in regulation, approach proximity        │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  ⋮⋮  2.  Mental Game                                        ━━━━━  │   │
│  │       Tournament vs practice performance, closing holes             │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  ⋮⋮  3.  Putting                                            ━━━━━  │   │
│  │       Putts per round, make percentages, 3-putt avoidance          │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  ⋮⋮  4.  Short Game                                         ━━━━━  │   │
│  │       Scrambling, sand saves, up-and-down percentage               │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  ⋮⋮  5.  Course Management                                  ━━━━━  │   │
│  │       Penalty avoidance, bogey-free holes, smart misses            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  ALERT SENSITIVITY                                                          │
│                                                                             │
│  How early should CoachHelm flag potential issues?                         │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │     Aggressive          Balanced           Conservative            │   │
│  │         ○───────────────────●───────────────────○                  │   │
│  │                                                                     │   │
│  │     Surface issues      Standard           Only high-confidence    │   │
│  │     early, accept       thresholds         issues with strong      │   │
│  │     some false          and timing         statistical backing     │   │
│  │     positives                                                       │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  ALERT THRESHOLDS                                                          │
│                                                                             │
│  Fine-tune when CoachHelm considers something noteworthy.                  │
│                                                                             │
│  Performance Decline                                                        │
│  Alert when a player's scoring increases by:                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  1.5      2.0      2.5      3.0      3.5    strokes over 5 rounds  │   │
│  │   ○────────●────────○────────○────────○                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Tournament Pressure Gap                                                    │
│  Alert when practice-to-tournament gap exceeds:                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  1.5      2.0      2.5      3.0      3.5    strokes                │   │
│  │   ○────────○────────●────────○────────○                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Bubble Zone Range                                                          │
│  Consider a player "on the bubble" when within:                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  0.5      1.0      1.5      2.0      2.5    strokes of cutoff      │   │
│  │   ○────────●────────○────────○────────○                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  COMPARISON WEIGHTING                                                       │
│                                                                             │
│  When comparing players for roster decisions, how much weight              │
│  should each factor carry?                                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Historical Performance (full season)                               │   │
│  │  ████████████████████████████████░░░░░░░░░░░░░░░░░  35%            │   │
│  │                                                                     │   │
│  │  Recent Form (last 5 rounds)                                        │   │
│  │  ████████████████████████████░░░░░░░░░░░░░░░░░░░░░  30%            │   │
│  │                                                                     │   │
│  │  Tournament Performance                                             │   │
│  │  ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  20%            │   │
│  │                                                                     │   │
│  │  Qualifying Performance                                             │   │
│  │  ██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  10%            │   │
│  │                                                                     │   │
│  │  My Subjective Input                                                │   │
│  │  ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   5%            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  ALERT TYPES                                                               │
│                                                                             │
│  Which types of alerts do you want to receive?                             │
│                                                                             │
│  Performance                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [✓] Scoring decline                                                │   │
│  │  [✓] Stat regression (category-specific drops)                      │   │
│  │  [✓] Tournament pressure issues                                     │   │
│  │  [ ] Performance plateau (no improvement)                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Roster & Qualifying                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [✓] Bubble player movement                                         │   │
│  │  [✓] Surge player (rapid improvement)                               │   │
│  │  [✓] Hot/cold streaks                                               │   │
│  │  [✓] Qualifying position changes                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Patterns                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [✓] Recurring weaknesses                                           │   │
│  │  [✓] Closing hole problems                                          │   │
│  │  [ ] Par 3 scoring issues                                           │   │
│  │  [✓] Miss direction patterns                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  NOTIFICATION PREFERENCES                                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  High Priority Alerts        ● Real-time  ○ Daily  ○ Weekly        │   │
│  │  Medium Priority Alerts      ○ Real-time  ● Daily  ○ Weekly        │   │
│  │  Low Priority Alerts         ○ Real-time  ○ Daily  ● Weekly        │   │
│  │                                                                     │   │
│  │  [✓] Email notifications                                           │   │
│  │  [✓] Push notifications (mobile)                                   │   │
│  │  [ ] Daily digest email                                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  DISPLAY PREFERENCES                                                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [✓] Show Strokes Gained metrics                                   │   │
│  │  [✓] Show advanced statistics                                       │   │
│  │  [✓] Prefer visual charts over tables                              │   │
│  │  [ ] Compact view (less whitespace)                                 │   │
│  │                                                                     │   │
│  │  Insight verbosity:    ○ Brief    ● Detailed                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│                                           [Cancel]    [Save Changes]       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Player Goals & Preferences

**Location:** `/golf/dashboard/settings/goals` (for players)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Settings                                                                 │
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════╗ │
│  ║  🎯 MY GOALS & PREFERENCES                                            ║ │
│  ║                                                                       ║ │
│  ║  Set your goals. CoachHelm will track your progress and tailor       ║ │
│  ║  insights to help you get there.                                     ║ │
│  ╚═══════════════════════════════════════════════════════════════════════╝ │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  MY GOALS                                                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ⭐ PRIMARY GOAL                                                    │   │
│  │                                                                     │   │
│  │  ┌───────────────────────────────────────────────────────────────┐ │   │
│  │  │  Make Travel Roster                                           │ │   │
│  │  │                                                               │ │   │
│  │  │  Current: #6 of 9 players                                     │ │   │
│  │  │  Target: Top 5                                                │ │   │
│  │  │  Gap: 0.8 strokes                                             │ │   │
│  │  │                                                               │ │   │
│  │  │  Progress: ████████████░░░░░░░░░░░░░  48%                     │ │   │
│  │  │  Status: On track                                             │ │   │
│  │  │                                                               │ │   │
│  │  │  [Edit Goal]  [Mark Achieved]  [Remove]                       │ │   │
│  │  └───────────────────────────────────────────────────────────────┘ │   │
│  │                                                                     │   │
│  │  SECONDARY GOALS                                                    │   │
│  │                                                                     │   │
│  │  ┌───────────────────────────────────────────────────────────────┐ │   │
│  │  │  📉 Lower Scoring Average                                     │ │   │
│  │  │  Current: 74.2  →  Target: 73.0  by Spring Championship      │ │   │
│  │  │  Progress: ██████████░░░░░░░░░░░░░░░  42%                     │ │   │
│  │  └───────────────────────────────────────────────────────────────┘ │   │
│  │                                                                     │   │
│  │  ┌───────────────────────────────────────────────────────────────┐ │   │
│  │  │  🎯 Improve GIR to 55%                                        │ │   │
│  │  │  Current: 48%  →  Target: 55%  by End of Season              │ │   │
│  │  │  Progress: ████████░░░░░░░░░░░░░░░░░  32%                     │ │   │
│  │  └───────────────────────────────────────────────────────────────┘ │   │
│  │                                                                     │   │
│  │                                                 [+ Add New Goal]   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  CURRENT CONTEXT                                                            │
│                                                                             │
│  Help CoachHelm understand what's going on with your game.                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ⚡ Active Flags                                           [+ Add] │   │
│  │                                                                     │   │
│  │  ┌───────────────────────────────────────────────────────────────┐ │   │
│  │  │  🔧 Swing Change                                      [Remove] │ │   │
│  │  │  Started: Dec 15, 2025                                        │ │   │
│  │  │  Working on: Shallowing the club                              │ │   │
│  │  │  Expected duration: 4-6 weeks                                 │ │   │
│  │  │                                                               │ │   │
│  │  │  → CoachHelm will adjust expectations and not flag normal     │ │   │
│  │  │    swing change variance as concerning.                       │ │   │
│  │  └───────────────────────────────────────────────────────────────┘ │   │
│  │                                                                     │   │
│  │  No injuries or other flags active.                                │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  FOCUS AREA PREFERENCES                                                     │
│                                                                             │
│  CoachHelm identifies areas to work on. You can influence the priority.   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [ ] Let CoachHelm auto-prioritize based on stroke impact          │   │
│  │  [✓] I want to weight certain areas higher                         │   │
│  │                                                                     │   │
│  │  Boost priority:                                                    │   │
│  │  [✓] Putting (I feel this is my biggest opportunity)               │   │
│  │  [ ] Approach shots                                                 │   │
│  │  [✓] Scrambling                                                    │   │
│  │  [ ] Driving                                                        │   │
│  │                                                                     │   │
│  │  Deprioritize:                                                      │   │
│  │  [ ] Driving distance (I'm happy with my distance)                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  PRACTICE REMINDERS                                                         │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [✓] Send practice reminders for my focus areas                    │   │
│  │                                                                     │   │
│  │  Frequency:  ○ Daily  ● Every other day  ○ Weekly                  │   │
│  │  Best time:  [ 8:00 AM ▼ ]                                         │   │
│  │                                                                     │   │
│  │  [✓] Include specific drills in reminders                          │   │
│  │  [ ] Include progress update in reminders                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  ROUND REVIEW PREFERENCES                                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  After each round, show me:                                         │   │
│  │                                                                     │   │
│  │  [✓] Impact on my goals                                            │   │
│  │  [✓] Highlights (best moments)                                     │   │
│  │  [✓] Areas to review (concerning moments)                          │   │
│  │  [✓] Pattern alerts                                                │   │
│  │  [ ] Full stats comparison                                          │   │
│  │  [✓] Next practice priority                                        │   │
│  │                                                                     │   │
│  │  [✓] Automatically share reviews with my coach                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                                           [Cancel]    [Save Changes]       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Player Context Flags (Coach View)

Coaches can add context flags to players that affect intelligence.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Ryan Miller                                                    [Edit] [X]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CONTEXT FLAGS                                                              │
│                                                                             │
│  Active flags affect how CoachHelm interprets this player's data.          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🔧 Swing Change (Player-Added)                      Active 3 weeks │   │
│  │  Shallowing the club                                                │   │
│  │  Expected: 4-6 weeks                                                │   │
│  │                                                                     │   │
│  │  Impact: Scoring variance expected. Decline alerts suppressed.     │   │
│  │                                                        [Remove Flag]│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🎯 Peak Target (Coach-Added)                           Added Today │   │
│  │  Conference Championship - March 15, 2026                           │   │
│  │                                                                     │   │
│  │  Impact: Progress tracked toward peak date. Periodization aware.   │   │
│  │                                                        [Remove Flag]│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                                                         [+ Add Context Flag]│
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  AVAILABLE FLAG TYPES                                                       │
│                                                                             │
│  • Swing Change - Expect variance, suppress decline alerts                 │
│  • Equipment Change - New clubs, ball, etc.                                │
│  • Injury (Minor) - Reduced expectations, monitor                          │
│  • Injury (Major) - Significantly reduced expectations                     │
│  • Personal Situation - General flag, handle with care                     │
│  • Peak Target - Building toward specific event                            │
│  • Development Mode - Focus on long-term, not short-term results          │
│  • Confidence Building - Surface positives more prominently                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Premium UI System

### 3.1 Motion Design System

**Philosophy:** Motion should feel physical, purposeful, and alive—never decorative.

```typescript
// Motion Tokens
const motion = {
  // Durations (intentionally constrained)
  duration: {
    instant: '100ms',    // Micro-feedback (button press)
    fast: '150ms',       // Small UI (toggles, icons)
    normal: '220ms',     // Standard transitions
    slow: '320ms',       // Larger movements
    dramatic: '500ms',   // Page transitions, modals
  },
  
  // Easings (physics-based)
  ease: {
    // For entering elements (decelerating)
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',          // Aggressive decel
    outGentle: 'cubic-bezier(0.33, 1, 0.68, 1)',   // Softer decel
    
    // For exiting elements (accelerating)
    in: 'cubic-bezier(0.7, 0, 0.84, 0)',           // Quick exit
    
    // For continuous motion
    inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',       // Smooth arc
    
    // For bouncy/playful
    bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',   // Overshoot
    
    // For spring-like
    spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  },
  
  // Spring physics (for Framer Motion / React Spring)
  spring: {
    snappy: { stiffness: 400, damping: 30 },
    gentle: { stiffness: 200, damping: 20 },
    bouncy: { stiffness: 300, damping: 15 },
  }
};

// Motion Budget: Max 3-4 animation types per screen
type MotionType = 'fade' | 'slide' | 'scale' | 'stagger' | 'morph';
const MAX_MOTION_TYPES_PER_SCREEN = 4;
```

### 3.2 Signature Animations

**1. Intelligence Reveal**
When CoachHelm surfaces an insight, it should feel like discovery.

```css
/* The insight "materializes" from slight blur */
@keyframes intelligenceReveal {
  0% {
    opacity: 0;
    filter: blur(8px);
    transform: translateY(8px) scale(0.98);
  }
  40% {
    opacity: 1;
    filter: blur(2px);
  }
  100% {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0) scale(1);
  }
}

.insight-card {
  animation: intelligenceReveal 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* Staggered insights */
.insight-card:nth-child(1) { animation-delay: 0ms; }
.insight-card:nth-child(2) { animation-delay: 80ms; }
.insight-card:nth-child(3) { animation-delay: 160ms; }
```

**2. Data Cascade**
Numbers and stats should "cascade" in, feeling like data flowing.

```css
@keyframes dataCascade {
  0% {
    opacity: 0;
    transform: translateY(-12px);
  }
  60% {
    opacity: 1;
  }
  100% {
    transform: translateY(0);
  }
}

/* Applied to stat values in a row */
.stat-value {
  animation: dataCascade 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* Cascade delay based on position */
.stat-row:nth-child(1) .stat-value { animation-delay: 0ms; }
.stat-row:nth-child(2) .stat-value { animation-delay: 40ms; }
.stat-row:nth-child(3) .stat-value { animation-delay: 80ms; }
.stat-row:nth-child(4) .stat-value { animation-delay: 120ms; }
.stat-row:nth-child(5) .stat-value { animation-delay: 160ms; }
```

**3. Comparison Convergence**
When comparing players, cards slide toward center then "lock" into place.

```css
@keyframes compareLeft {
  0% {
    opacity: 0;
    transform: translateX(-40px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes compareRight {
  0% {
    opacity: 0;
    transform: translateX(40px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes vsBadge {
  0% {
    opacity: 0;
    transform: scale(0) rotate(-180deg);
  }
  60% {
    transform: scale(1.15) rotate(0deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

.compare-card-left {
  animation: compareLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.compare-card-right {
  animation: compareRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
}

.vs-badge {
  animation: vsBadge 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.35s both;
}
```

**4. Alert Urgency Pulse**
High-priority alerts should feel urgent without being annoying.

```css
/* Subtle border glow that pulses once then settles */
@keyframes urgencyPulse {
  0% {
    box-shadow: 
      0 0 0 0 rgba(239, 68, 68, 0.4),
      inset 0 0 0 1px rgba(239, 68, 68, 0.3);
  }
  30% {
    box-shadow: 
      0 0 20px 4px rgba(239, 68, 68, 0.3),
      inset 0 0 0 1px rgba(239, 68, 68, 0.5);
  }
  100% {
    box-shadow: 
      0 0 0 0 rgba(239, 68, 68, 0),
      inset 0 0 0 1px rgba(239, 68, 68, 0.3);
  }
}

.alert-high {
  animation: 
    intelligenceReveal 0.4s cubic-bezier(0.16, 1, 0.3, 1),
    urgencyPulse 1.5s ease-out 0.4s;
}
```

**5. Progress Fill with Momentum**
Progress bars should feel like they have physical momentum.

```css
@keyframes progressFillMomentum {
  0% {
    transform: scaleX(0);
    transform-origin: left;
  }
  60% {
    transform: scaleX(calc(var(--progress) * 1.03)); /* Slight overshoot */
  }
  100% {
    transform: scaleX(var(--progress));
  }
}

.progress-bar-fill {
  --progress: 0.48; /* Set via JS/inline style */
  animation: progressFillMomentum 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
```

**6. Scorecard Domino**
Individual hole scores reveal in a wave pattern.

```css
@keyframes holeDomino {
  0% {
    opacity: 0;
    transform: scale(0.8) translateY(-4px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.scorecard-hole {
  animation: holeDomino 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* Generate delays for all 18 holes */
@for $i from 1 through 18 {
  .scorecard-hole:nth-child(#{$i}) {
    animation-delay: #{($i - 1) * 35}ms;
  }
}

/* Special treatment for birdies/eagles - slight bounce */
.scorecard-hole.birdie,
.scorecard-hole.eagle {
  animation: holeDomino 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
```

### 3.3 Microinteractions

**Button Press (Physical Feel)**
```css
.btn {
  transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn:active {
  transform: scale(0.97);
}

/* Immediate visual feedback */
.btn:active {
  transition-duration: 0.05s;
}
```

**Card Hover (Lift with Shadow)**
```css
.glass-card {
  transition: 
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.glass-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.08),
    0 2px 8px rgba(0, 0, 0, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

/* Immediate response, slower settle */
.glass-card:hover {
  transition-duration: 0.15s;
}

.glass-card:not(:hover) {
  transition-duration: 0.3s;
}
```

**Toggle Switch**
```tsx
// Framer Motion for physics-based toggle
const toggleVariants = {
  off: { x: 0 },
  on: { x: 20 }
};

<motion.div
  className="toggle-thumb"
  variants={toggleVariants}
  animate={isOn ? 'on' : 'off'}
  transition={{
    type: 'spring',
    stiffness: 500,
    damping: 30
  }}
/>
```

**Number Counter**
```tsx
// Animated number counting
function AnimatedNumber({ value, duration = 500 }: { value: number; duration?: number }) {
  const [displayed, setDisplayed] = useState(0);
  
  useEffect(() => {
    const start = displayed;
    const end = value;
    const startTime = performance.now();
    
    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      
      setDisplayed(start + (end - start) * eased);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }
    
    requestAnimationFrame(animate);
  }, [value, duration]);
  
  return <span className="tabular-nums">{displayed.toFixed(1)}</span>;
}
```

### 3.4 Empty & Loading States

**Skeleton with Intelligence**
Not just gray boxes—skeletons that hint at the data structure.

```tsx
function InsightSkeleton() {
  return (
    <div className="glass-card p-6 animate-pulse">
      {/* Header skeleton with icon */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-slate-200" />
        <div className="flex-1">
          <div className="h-4 w-32 bg-slate-200 rounded mb-2" />
          <div className="h-3 w-24 bg-slate-100 rounded" />
        </div>
      </div>
      
      {/* Content skeleton with varying widths */}
      <div className="space-y-2">
        <div className="h-3 w-full bg-slate-100 rounded" />
        <div className="h-3 w-5/6 bg-slate-100 rounded" />
        <div className="h-3 w-4/6 bg-slate-100 rounded" />
      </div>
      
      {/* Shimmer overlay */}
      <div 
        className="absolute inset-0 -translate-x-full animate-shimmer"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)'
        }}
      />
    </div>
  );
}

/* Shimmer animation */
@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}

.animate-shimmer {
  animation: shimmer 1.5s infinite;
}
```

**Empty State with Personality**
```tsx
function NoAlertsEmpty() {
  return (
    <div className="text-center py-12">
      <div className="relative inline-block">
        {/* Calm water illustration */}
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center mb-4 mx-auto">
          <span className="text-3xl">🌊</span>
        </div>
        
        {/* Subtle pulse to show it's "alive" */}
        <div 
          className="absolute inset-0 rounded-full bg-green-500/10 animate-ping"
          style={{ animationDuration: '3s' }}
        />
      </div>
      
      <h3 className="text-lg font-semibold text-slate-900 mb-1">
        All Clear
      </h3>
      <p className="text-slate-500 max-w-xs mx-auto">
        No players need attention right now. CoachHelm is watching.
      </p>
    </div>
  );
}
```

### 3.5 Data Visualization Upgrades

**Strokes Gained Bar**
```tsx
function StrokesGainedBar({ 
  value, 
  label,
  delay = 0 
}: { 
  value: number; 
  label: string;
  delay?: number;
}) {
  const isPositive = value >= 0;
  const absValue = Math.abs(value);
  const maxValue = 2; // Scale for visualization
  const percentage = Math.min(absValue / maxValue * 100, 100);
  
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-sm text-slate-600">{label}</div>
      
      <div className="flex-1 h-6 relative">
        {/* Center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-200" />
        
        {/* Bar container */}
        <div className="absolute inset-0 flex items-center">
          {isPositive ? (
            // Positive bar (grows right from center)
            <div 
              className="h-4 rounded-r bg-gradient-to-r from-green-400 to-green-500 ml-[50%] origin-left"
              style={{
                width: `${percentage / 2}%`,
                animation: `progressFillMomentum 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms both`,
                '--progress': percentage / 200,
              } as React.CSSProperties}
            />
          ) : (
            // Negative bar (grows left from center)
            <div 
              className="h-4 rounded-l bg-gradient-to-l from-red-400 to-red-500 mr-[50%] origin-right"
              style={{
                width: `${percentage / 2}%`,
                marginLeft: `${50 - percentage / 2}%`,
                animation: `progressFillMomentum 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms both`,
              }}
            />
          )}
        </div>
      </div>
      
      {/* Value */}
      <div 
        className={cn(
          "w-12 text-right text-sm font-semibold tabular-nums",
          isPositive ? "text-green-600" : "text-red-500"
        )}
      >
        {isPositive ? '+' : ''}{value.toFixed(2)}
      </div>
    </div>
  );
}
```

**Trend Sparkline with Gradient**
```tsx
function TrendSparkline({ 
  data, 
  width = 120, 
  height = 32,
  positive = true 
}: { 
  data: number[]; 
  width?: number; 
  height?: number;
  positive?: boolean;
}) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  
  const gradientId = `trend-gradient-${positive ? 'up' : 'down'}`;
  
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop 
            offset="0%" 
            stopColor={positive ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'} 
            stopOpacity="0.3" 
          />
          <stop 
            offset="100%" 
            stopColor={positive ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'} 
            stopOpacity="0" 
          />
        </linearGradient>
      </defs>
      
      {/* Area fill */}
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#${gradientId})`}
        className="animate-fade-in"
      />
      
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={positive ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-draw-line"
        style={{
          strokeDasharray: 1000,
          strokeDashoffset: 1000,
          animation: 'drawLine 1s ease-out forwards'
        }}
      />
      
      {/* End dot */}
      <circle
        cx={width}
        cy={height - ((data[data.length - 1] - min) / range) * height}
        r="3"
        fill={positive ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'}
        className="animate-scale-in"
        style={{ animationDelay: '0.8s' }}
      />
    </svg>
  );
}

/* Draw line animation */
@keyframes drawLine {
  to {
    stroke-dashoffset: 0;
  }
}
```

**Advantage Indicator (Compare Tool)**
```tsx
function AdvantageIndicator({
  leftValue,
  rightValue,
  higherIsBetter = true,
  format = (v: number) => v.toString()
}: {
  leftValue: number;
  rightValue: number;
  higherIsBetter?: boolean;
  format?: (v: number) => string;
}) {
  const diff = leftValue - rightValue;
  const absDiff = Math.abs(diff);
  const percentDiff = Math.abs((diff / rightValue) * 100);
  
  // Determine advantage level
  let leftAdvantage: 'significant' | 'clear' | 'slight' | 'none' = 'none';
  let rightAdvantage: 'significant' | 'clear' | 'slight' | 'none' = 'none';
  
  if (percentDiff > 20) {
    if ((diff > 0 && higherIsBetter) || (diff < 0 && !higherIsBetter)) {
      leftAdvantage = 'significant';
    } else {
      rightAdvantage = 'significant';
    }
  } else if (percentDiff > 10) {
    if ((diff > 0 && higherIsBetter) || (diff < 0 && !higherIsBetter)) {
      leftAdvantage = 'clear';
    } else {
      rightAdvantage = 'clear';
    }
  } else if (percentDiff > 5) {
    if ((diff > 0 && higherIsBetter) || (diff < 0 && !higherIsBetter)) {
      leftAdvantage = 'slight';
    } else {
      rightAdvantage = 'slight';
    }
  }
  
  const dots = {
    significant: '●●',
    clear: '●',
    slight: '○',
    none: ''
  };
  
  return (
    <div className="flex items-center gap-2">
      {/* Left value */}
      <div className="w-16 text-right">
        <span className={cn(
          "font-semibold tabular-nums",
          leftAdvantage !== 'none' && "text-green-600"
        )}>
          {format(leftValue)}
        </span>
      </div>
      
      {/* Advantage dots */}
      <div className="flex-1 flex items-center justify-center gap-1">
        <span className="text-green-500 text-xs">{dots[leftAdvantage]}</span>
        <div className="w-24 h-1 bg-slate-100 rounded-full relative">
          {/* Position indicator */}
          <div 
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-slate-400 transition-all duration-500"
            style={{
              left: `${50 - (diff / (Math.abs(leftValue) + Math.abs(rightValue)) * 50)}%`
            }}
          />
        </div>
        <span className="text-amber-500 text-xs">{dots[rightAdvantage]}</span>
      </div>
      
      {/* Right value */}
      <div className="w-16 text-left">
        <span className={cn(
          "font-semibold tabular-nums",
          rightAdvantage !== 'none' && "text-amber-600"
        )}>
          {format(rightValue)}
        </span>
      </div>
    </div>
  );
}
```

---

## Part 4: Intelligent Alert System

### 4.1 Alert Generation with Context

```typescript
interface AlertGenerationContext {
  player: Player;
  playerContext: PlayerContext;
  teamContext: TeamContext;
  coachPhilosophy: CoachPhilosophy;
  recentRounds: Round[];
  previousRounds: Round[];
}

function generateAlerts(context: AlertGenerationContext): Alert[] {
  const alerts: Alert[] = [];
  
  // Skip alerts if player has suppressing flags
  if (hasActiveSwingChange(context.player)) {
    // Only generate if decline is EXTREME (beyond normal swing change variance)
    const extremeThreshold = context.coachPhilosophy.declineThreshold * 2;
    // ... generate only extreme alerts
    return alerts;
  }
  
  // Performance decline detection
  const scoringChange = calculateScoringChange(
    context.recentRounds, 
    context.previousRounds
  );
  
  if (scoringChange >= context.coachPhilosophy.declineThreshold) {
    const rootCause = analyzeRootCause(context.recentRounds, context.previousRounds);
    
    alerts.push({
      type: 'performance_decline',
      severity: calculateSeverity(scoringChange, context),
      player: context.player,
      title: `Performance Declining`,
      summary: generateDeclineSummary(scoringChange, rootCause),
      evidence: {
        previousScores: context.previousRounds.map(r => r.total_score),
        recentScores: context.recentRounds.map(r => r.total_score),
        previousAverage: average(context.previousRounds.map(r => r.total_score)),
        recentAverage: average(context.recentRounds.map(r => r.total_score)),
        change: scoringChange,
      },
      rootCause,
      detectedAt: new Date(),
    });
  }
  
  // Bubble player detection (context-aware)
  if (context.teamContext.activeQualifier || context.teamContext.nextTournament) {
    const gapToCutoff = calculateGapToCutoff(context.player, context.teamContext);
    const bubbleThreshold = context.coachPhilosophy.bubbleZoneRange ?? 1.0;
    
    if (Math.abs(gapToCutoff) <= bubbleThreshold) {
      alerts.push({
        type: 'bubble_player',
        severity: gapToCutoff > 0 ? 'medium' : 'high',
        player: context.player,
        title: gapToCutoff > 0 ? 'On the Bubble (In)' : 'On the Bubble (Out)',
        summary: `${gapToCutoff > 0 ? 'Currently' : 'Just'} ${Math.abs(gapToCutoff).toFixed(1)} strokes ${gapToCutoff > 0 ? 'ahead of' : 'behind'} the cutoff.`,
        evidence: {
          currentPosition: context.playerContext.qualifyingPosition,
          gapToCutoff,
          trendDirection: context.playerContext.trendDirection,
        },
        detectedAt: new Date(),
      });
    }
  }
  
  // Tournament pressure detection
  const pressureGap = calculatePressureGap(context.recentRounds);
  if (pressureGap >= context.coachPhilosophy.pressureGapThreshold) {
    alerts.push({
      type: 'tournament_pressure',
      severity: pressureGap >= 4 ? 'high' : 'medium',
      player: context.player,
      title: 'Tournament Performance Gap',
      summary: `Scoring ${pressureGap.toFixed(1)} strokes higher in tournaments vs practice.`,
      evidence: {
        practiceAverage: calculateAverageByType(context.recentRounds, 'practice'),
        tournamentAverage: calculateAverageByType(context.recentRounds, 'tournament'),
        gap: pressureGap,
      },
      detectedAt: new Date(),
    });
  }
  
  // Pattern-based alerts (only if enabled in coach philosophy)
  if (context.coachPhilosophy.alertTypes?.recurringWeakness) {
    const patterns = detectPatterns(context.recentRounds);
    for (const pattern of patterns) {
      if (pattern.frequency >= 0.6 && pattern.impactStrokes >= 0.5) {
        alerts.push({
          type: 'recurring_weakness',
          severity: pattern.impactStrokes >= 1.0 ? 'high' : 'medium',
          player: context.player,
          title: `Recurring Pattern: ${pattern.description}`,
          summary: `This pattern appears in ${(pattern.frequency * 100).toFixed(0)}% of rounds, costing ~${pattern.impactStrokes.toFixed(1)} strokes/round.`,
          evidence: pattern.evidence,
          detectedAt: new Date(),
        });
      }
    }
  }
  
  // Filter alerts based on coach preferences
  return alerts.filter(alert => {
    return context.coachPhilosophy.alertTypes?.[alert.type] !== false;
  });
}

// Severity calculation considers context
function calculateSeverity(
  scoringChange: number, 
  context: AlertGenerationContext
): 'high' | 'medium' | 'low' {
  // Higher severity if:
  // - Player is on the bubble
  // - Close to important tournament
  // - Player was previously performing well
  
  let baseSeverity = scoringChange >= 4 ? 'high' : scoringChange >= 2.5 ? 'medium' : 'low';
  
  if (context.playerContext.isBubblePlayer && baseSeverity === 'medium') {
    baseSeverity = 'high';
  }
  
  if (context.teamContext.daysUntilNextEvent <= 7 && baseSeverity === 'low') {
    baseSeverity = 'medium';
  }
  
  return baseSeverity as 'high' | 'medium' | 'low';
}
```

### 4.2 Root Cause Analysis Engine

```typescript
interface RootCauseAnalysis {
  primaryFactor: {
    category: 'tee' | 'approach' | 'around_green' | 'putting';
    change: number;  // SG change
    details: Record<string, any>;  // Category-specific metrics
  };
  secondaryFactors: Array<{
    category: string;
    change: number;
    details: Record<string, any>;
  }>;
  breakdown: {
    sgTee: { before: number; after: number; change: number };
    sgApproach: { before: number; after: number; change: number };
    sgAroundGreen: { before: number; after: number; change: number };
    sgPutting: { before: number; after: number; change: number };
    sgTotal: { before: number; after: number; change: number };
  };
}

function analyzeRootCause(
  recentRounds: Round[],
  previousRounds: Round[]
): RootCauseAnalysis {
  // Calculate strokes gained for both periods
  const recentSG = calculateStrokesGained(recentRounds);
  const previousSG = calculateStrokesGained(previousRounds);
  
  const breakdown = {
    sgTee: {
      before: previousSG.tee,
      after: recentSG.tee,
      change: recentSG.tee - previousSG.tee,
    },
    sgApproach: {
      before: previousSG.approach,
      after: recentSG.approach,
      change: recentSG.approach - previousSG.approach,
    },
    sgAroundGreen: {
      before: previousSG.aroundGreen,
      after: recentSG.aroundGreen,
      change: recentSG.aroundGreen - previousSG.aroundGreen,
    },
    sgPutting: {
      before: previousSG.putting,
      after: recentSG.putting,
      change: recentSG.putting - previousSG.putting,
    },
    sgTotal: {
      before: previousSG.total,
      after: recentSG.total,
      change: recentSG.total - previousSG.total,
    },
  };
  
  // Find primary factor (biggest negative change)
  const factors = [
    { category: 'tee' as const, change: breakdown.sgTee.change },
    { category: 'approach' as const, change: breakdown.sgApproach.change },
    { category: 'around_green' as const, change: breakdown.sgAroundGreen.change },
    { category: 'putting' as const, change: breakdown.sgPutting.change },
  ];
  
  factors.sort((a, b) => a.change - b.change);
  
  const primaryCategory = factors[0].category;
  
  // Get detailed breakdown for primary factor
  const details = getDetailedBreakdown(primaryCategory, recentRounds, previousRounds);
  
  return {
    primaryFactor: {
      category: primaryCategory,
      change: factors[0].change,
      details,
    },
    secondaryFactors: factors.slice(1, 3).filter(f => f.change < -0.1).map(f => ({
      category: f.category,
      change: f.change,
      details: getDetailedBreakdown(f.category, recentRounds, previousRounds),
    })),
    breakdown,
  };
}

function getDetailedBreakdown(
  category: 'tee' | 'approach' | 'around_green' | 'putting',
  recentRounds: Round[],
  previousRounds: Round[]
): Record<string, any> {
  switch (category) {
    case 'putting':
      return {
        puttsPerRound: {
          before: calculatePuttsPerRound(previousRounds),
          after: calculatePuttsPerRound(recentRounds),
        },
        threePuttsPerRound: {
          before: calculateThreePuttsPerRound(previousRounds),
          after: calculateThreePuttsPerRound(recentRounds),
        },
        makePercent5_10: {
          before: calculateMakePercent(previousRounds, 5, 10),
          after: calculateMakePercent(recentRounds, 5, 10),
        },
        firstPuttProximity: {
          before: calculateFirstPuttProximity(previousRounds),
          after: calculateFirstPuttProximity(recentRounds),
        },
      };
      
    case 'approach':
      return {
        girPercentage: {
          before: calculateGIR(previousRounds),
          after: calculateGIR(recentRounds),
        },
        proximity: {
          before: calculateApproachProximity(previousRounds),
          after: calculateApproachProximity(recentRounds),
        },
        girByDistance: {
          '100-150': {
            before: calculateGIRByDistance(previousRounds, 100, 150),
            after: calculateGIRByDistance(recentRounds, 100, 150),
          },
          '150-200': {
            before: calculateGIRByDistance(previousRounds, 150, 200),
            after: calculateGIRByDistance(recentRounds, 150, 200),
          },
        },
      };
      
    // ... similar for tee and around_green
  }
}
```

---

## Part 5: Focus Area Intelligence

### 5.1 Personalized Focus Area Calculation

```typescript
interface FocusAreaCalculation {
  playerId: string;
  playerContext: PlayerContext;
  playerGoals: PlayerGoal[];
  coachPhilosophy: CoachPhilosophy;
  playerPreferences: PlayerPreferences;
}

function calculateFocusAreas(input: FocusAreaCalculation): FocusArea[] {
  const { playerId, playerContext, playerGoals, coachPhilosophy, playerPreferences } = input;
  
  // Get all potential focus areas with raw stroke impact
  const potentialAreas = calculateAllGaps(playerId);
  
  // Apply priority scoring
  const scoredAreas = potentialAreas.map(area => {
    let priorityScore = area.strokeImpact; // Base score
    
    // 1. Coach philosophy weighting
    const philosophyWeight = getPhilosophyWeight(area.category, coachPhilosophy);
    priorityScore *= philosophyWeight;
    
    // 2. Player preference boost
    if (playerPreferences.boostPriority?.includes(area.category)) {
      priorityScore *= 1.3; // 30% boost
    }
    if (playerPreferences.deprioritize?.includes(area.category)) {
      priorityScore *= 0.5; // 50% reduction
    }
    
    // 3. Goal alignment boost
    for (const goal of playerGoals) {
      if (areaAlignsWithGoal(area, goal)) {
        priorityScore *= 1.2; // 20% boost per aligned goal
      }
    }
    
    // 4. Improvability factor
    priorityScore *= area.improvability;
    
    // 5. Pattern support boost
    if (area.supportingPatterns.length > 0) {
      priorityScore *= (1 + area.supportingPatterns.length * 0.1); // 10% per pattern
    }
    
    return {
      ...area,
      priorityScore,
    };
  });
  
  // Sort and return top 5
  return scoredAreas
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5)
    .map((area, index) => ({
      ...area,
      priorityRank: index + 1,
    }));
}

function getPhilosophyWeight(
  category: string, 
  philosophy: CoachPhilosophy
): number {
  // Map category to philosophy priority
  const mapping: Record<string, keyof typeof philosophy.priorityMetrics> = {
    'putting_short': 'putting',
    'putting_medium': 'putting',
    'putting_lag': 'putting',
    'approach_short': 'ballStriking',
    'approach_mid': 'ballStriking',
    'approach_long': 'ballStriking',
    'driving_accuracy': 'ballStriking',
    'driving_distance': 'ballStriking',
    'scrambling': 'shortGame',
    'sand_saves': 'shortGame',
    'pressure_performance': 'mentalGame',
    'closing_holes': 'mentalGame',
  };
  
  const philosophyKey = mapping[category];
  if (!philosophyKey) return 1.0;
  
  const priority = philosophy.priorityMetrics[philosophyKey];
  
  // Priority 1 = 1.5x, Priority 5 = 0.7x
  return 1.5 - ((priority - 1) * 0.2);
}
```

### 5.2 Practice Plan Generation

```typescript
interface PracticePlan {
  focusAreaId: string;
  title: string;
  description: string;
  totalDuration: number;
  drills: Drill[];
  weeklyMilestones: Milestone[];
  successCriteria: string;
}

interface Drill {
  id: string;
  name: string;
  duration: number;
  focus: string;
  setup: string;
  execution: string[];
  successCriteria: string;
  whyThisWorks: string;
  variations: {
    easier: string;
    harder: string;
  };
  trackingMetric: string;
  targetValue: number;
}

// Drill library organized by focus area
const drillLibrary: Record<string, Drill[]> = {
  putting_short: [
    {
      id: 'gate-drill',
      name: 'Gate Drill',
      duration: 10,
      focus: 'Start line and face control',
      setup: 'Place two tees just wider than your putter head, 6 feet from the hole.',
      execution: [
        'Set up 10 balls at 6 feet',
        'Stroke each putt through the gate',
        'Track makes vs misses',
        'Repeat at 8 feet, then 10 feet',
      ],
      successCriteria: 'Make 25+ out of 30 total putts',
      whyThisWorks: 'Forces square face at impact and proper start line. The narrow gate provides immediate feedback on stroke path.',
      variations: {
        easier: 'Widen the gate or move closer to the hole',
        harder: 'Narrow the gate to putter-width only',
      },
      trackingMetric: 'make_percentage_5_10',
      targetValue: 0.45,
    },
    {
      id: 'clock-drill',
      name: 'Clock Drill',
      duration: 15,
      focus: 'Short putt confidence from all angles',
      setup: 'Place 12 balls in a circle around the hole at 3 feet.',
      execution: [
        'Start at 12 o\'clock, make the putt',
        'Move clockwise to each position',
        'Must make all 12 consecutively',
        'If you miss, start over',
      ],
      successCriteria: 'Complete the clock 3 times in one session',
      whyThisWorks: 'Builds confidence on short putts while practicing different break reads. The pressure of starting over mimics tournament pressure.',
      variations: {
        easier: 'Allow one miss before restarting',
        harder: 'Move to 4 feet or add a second ring at 5 feet',
      },
      trackingMetric: 'make_percentage_0_5',
      targetValue: 0.92,
    },
    // ... more drills
  ],
  
  approach_150_175: [
    {
      id: 'distance-ladder',
      name: 'Distance Ladder',
      duration: 20,
      focus: 'Consistent distance control at 150-175 yards',
      setup: 'Find a range bay with distance markers or use a launch monitor.',
      execution: [
        'Hit 5 balls to 150 yards, note dispersion',
        'Hit 5 balls to 160 yards',
        'Hit 5 balls to 170 yards',
        'Return to 150 and repeat',
        'Track carry distances for each',
      ],
      successCriteria: 'Dispersion within 8 yards of target on 80% of shots',
      whyThisWorks: 'Builds feel for subtle distance adjustments. Most amateurs struggle to control 10-yard increments.',
      variations: {
        easier: 'Increase to 15-yard increments',
        harder: 'Add wind simulation or use 5-yard increments',
      },
      trackingMetric: 'approach_proximity_150_175',
      targetValue: 25,
    },
    // ... more drills
  ],
  
  // ... other focus area drills
};

function generatePracticePlan(
  focusArea: FocusArea,
  playerLevel: 'beginner' | 'intermediate' | 'advanced'
): PracticePlan {
  const drills = drillLibrary[focusArea.category] || [];
  
  // Select 3 drills appropriate for player level
  const selectedDrills = selectDrillsForLevel(drills, playerLevel, 3);
  
  // Generate weekly milestones
  const milestones = generateMilestones(focusArea, 8); // 8-week plan
  
  return {
    focusAreaId: focusArea.id,
    title: `${focusArea.displayName} Improvement Plan`,
    description: `Close the gap from ${focusArea.playerValue} to ${focusArea.targetValue}`,
    totalDuration: selectedDrills.reduce((sum, d) => sum + d.duration, 0),
    drills: selectedDrills,
    weeklyMilestones: milestones,
    successCriteria: `Achieve ${focusArea.targetValue} consistently over 5 rounds`,
  };
}
```

---

## Part 6: Database Schema (Updated)

```sql
-- ============================================================================
-- INTELLIGENCE & CONFIGURATION TABLES
-- ============================================================================

-- Coach Philosophy Configuration
CREATE TABLE golf_coach_philosophy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES golf_coaches(id) ON DELETE CASCADE UNIQUE,
  
  -- Priority metrics (1-5, 1 = highest)
  priority_ball_striking INTEGER NOT NULL DEFAULT 2 CHECK (priority_ball_striking BETWEEN 1 AND 5),
  priority_short_game INTEGER NOT NULL DEFAULT 3 CHECK (priority_short_game BETWEEN 1 AND 5),
  priority_putting INTEGER NOT NULL DEFAULT 2 CHECK (priority_putting BETWEEN 1 AND 5),
  priority_course_management INTEGER NOT NULL DEFAULT 4 CHECK (priority_course_management BETWEEN 1 AND 5),
  priority_mental_game INTEGER NOT NULL DEFAULT 3 CHECK (priority_mental_game BETWEEN 1 AND 5),
  
  -- Alert sensitivity
  alert_sensitivity TEXT NOT NULL DEFAULT 'balanced' CHECK (alert_sensitivity IN ('aggressive', 'balanced', 'conservative')),
  
  -- Thresholds
  decline_threshold DECIMAL(3,1) NOT NULL DEFAULT 2.0,
  plateau_weeks INTEGER NOT NULL DEFAULT 4,
  pressure_gap_threshold DECIMAL(3,1) NOT NULL DEFAULT 2.5,
  bubble_zone_range DECIMAL(3,1) NOT NULL DEFAULT 1.0,
  
  -- Comparison weights (sum to 100)
  weight_historical INTEGER NOT NULL DEFAULT 35,
  weight_recent_form INTEGER NOT NULL DEFAULT 30,
  weight_tournament INTEGER NOT NULL DEFAULT 20,
  weight_qualifying INTEGER NOT NULL DEFAULT 10,
  weight_subjective INTEGER NOT NULL DEFAULT 5,
  
  -- Alert type toggles
  alert_scoring_decline BOOLEAN NOT NULL DEFAULT TRUE,
  alert_stat_regression BOOLEAN NOT NULL DEFAULT TRUE,
  alert_tournament_pressure BOOLEAN NOT NULL DEFAULT TRUE,
  alert_plateau BOOLEAN NOT NULL DEFAULT FALSE,
  alert_bubble_player BOOLEAN NOT NULL DEFAULT TRUE,
  alert_surge_player BOOLEAN NOT NULL DEFAULT TRUE,
  alert_streaks BOOLEAN NOT NULL DEFAULT TRUE,
  alert_recurring_weakness BOOLEAN NOT NULL DEFAULT TRUE,
  alert_closing_holes BOOLEAN NOT NULL DEFAULT TRUE,
  alert_par_3_issues BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Notification preferences
  notify_high_realtime BOOLEAN NOT NULL DEFAULT TRUE,
  notify_medium_realtime BOOLEAN NOT NULL DEFAULT FALSE,
  notify_low_realtime BOOLEAN NOT NULL DEFAULT FALSE,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  push_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  daily_digest BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Display preferences
  show_strokes_gained BOOLEAN NOT NULL DEFAULT TRUE,
  show_advanced_stats BOOLEAN NOT NULL DEFAULT TRUE,
  prefer_visualizations BOOLEAN NOT NULL DEFAULT TRUE,
  compact_view BOOLEAN NOT NULL DEFAULT FALSE,
  insight_verbosity TEXT NOT NULL DEFAULT 'detailed' CHECK (insight_verbosity IN ('brief', 'detailed')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Player Goals
CREATE TABLE golf_player_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  
  goal_type TEXT NOT NULL CHECK (goal_type IN (
    'make_travel_roster', 'improve_scoring_average', 'improve_handicap',
    'improve_specific_stat', 'peak_for_event', 'earn_starting_spot', 'custom'
  )),
  priority TEXT NOT NULL DEFAULT 'secondary' CHECK (priority IN ('primary', 'secondary')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'abandoned')),
  
  -- Target details (JSON for flexibility)
  target JSONB NOT NULL,
  
  -- Progress tracking
  starting_value DECIMAL(6,2),
  current_value DECIMAL(6,2),
  target_value DECIMAL(6,2),
  deadline DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  achieved_at TIMESTAMPTZ
);

CREATE INDEX idx_golf_player_goals_player ON golf_player_goals(player_id);
CREATE INDEX idx_golf_player_goals_active ON golf_player_goals(player_id) WHERE status = 'active';

-- Player Context Flags
CREATE TABLE golf_player_context_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  
  flag_type TEXT NOT NULL CHECK (flag_type IN (
    'swing_change', 'equipment_change', 'injury_minor', 'injury_major',
    'personal_situation', 'peak_target', 'development_mode', 'confidence_building'
  )),
  
  title TEXT NOT NULL,
  description TEXT,
  
  -- Dates
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_end_date DATE,
  
  -- Impact on intelligence
  suppress_decline_alerts BOOLEAN NOT NULL DEFAULT FALSE,
  adjust_expectations_percent INTEGER DEFAULT 0, -- negative = lower expectations
  
  -- Tracking
  added_by_coach BOOLEAN NOT NULL DEFAULT FALSE,
  added_by UUID REFERENCES golf_coaches(id),
  
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'expired')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_golf_context_flags_player ON golf_player_context_flags(player_id);
CREATE INDEX idx_golf_context_flags_active ON golf_player_context_flags(player_id) WHERE status = 'active';

-- Player Preferences (for Focus Areas & Round Review)
CREATE TABLE golf_player_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE UNIQUE,
  
  -- Focus area preferences
  auto_prioritize_focus_areas BOOLEAN NOT NULL DEFAULT TRUE,
  boost_priority_putting BOOLEAN NOT NULL DEFAULT FALSE,
  boost_priority_approach BOOLEAN NOT NULL DEFAULT FALSE,
  boost_priority_scrambling BOOLEAN NOT NULL DEFAULT FALSE,
  boost_priority_driving BOOLEAN NOT NULL DEFAULT FALSE,
  deprioritize_driving_distance BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Practice reminders
  practice_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  practice_reminder_frequency TEXT DEFAULT 'every_other_day' CHECK (practice_reminder_frequency IN ('daily', 'every_other_day', 'weekly')),
  practice_reminder_time TIME DEFAULT '08:00',
  include_drills_in_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  include_progress_in_reminders BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Round review preferences
  review_show_goal_impact BOOLEAN NOT NULL DEFAULT TRUE,
  review_show_highlights BOOLEAN NOT NULL DEFAULT TRUE,
  review_show_areas_to_review BOOLEAN NOT NULL DEFAULT TRUE,
  review_show_patterns BOOLEAN NOT NULL DEFAULT TRUE,
  review_show_stats_comparison BOOLEAN NOT NULL DEFAULT FALSE,
  review_show_next_priority BOOLEAN NOT NULL DEFAULT TRUE,
  auto_share_reviews_with_coach BOOLEAN NOT NULL DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Coach Behavior Learning (for personalization)
CREATE TABLE golf_coach_behavior (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES golf_coaches(id) ON DELETE CASCADE UNIQUE,
  
  -- Alert patterns
  alerts_often_dismissed JSONB DEFAULT '[]', -- array of alert types
  alerts_often_acted_upon JSONB DEFAULT '[]',
  average_time_to_acknowledge_hours DECIMAL(6,2),
  
  -- Comparison patterns
  comparison_factors_used JSONB DEFAULT '[]', -- stats they correlate with decisions
  decision_agreement_rate DECIMAL(4,2), -- vs AI recommendations
  
  -- Engagement patterns
  sections_expanded JSONB DEFAULT '[]',
  sections_skipped JSONB DEFAULT '[]',
  average_review_time_seconds INTEGER,
  
  last_analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Focus Areas (with full intelligence)
CREATE TABLE golf_focus_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  
  category TEXT NOT NULL,
  display_name TEXT NOT NULL,
  priority_rank INTEGER NOT NULL,
  priority_score DECIMAL(6,2) NOT NULL,
  
  -- The gap analysis
  player_value DECIMAL(6,2) NOT NULL,
  team_average DECIMAL(6,2),
  benchmark_value DECIMAL(6,2),
  target_value DECIMAL(6,2) NOT NULL,
  
  gap_to_team DECIMAL(6,2),
  gap_to_benchmark DECIMAL(6,2),
  
  -- Impact
  stroke_impact DECIMAL(4,2) NOT NULL,
  opportunities_per_round DECIMAL(4,1),
  improvability DECIMAL(3,2) NOT NULL DEFAULT 1.0,
  
  -- Pattern support
  supporting_patterns JSONB DEFAULT '[]',
  
  -- Weighting factors applied
  philosophy_weight DECIMAL(3,2),
  player_preference_boost DECIMAL(3,2),
  goal_alignment_boost DECIMAL(3,2),
  
  -- Status
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  
  UNIQUE(player_id, category)
);

CREATE INDEX idx_golf_focus_areas_player ON golf_focus_areas(player_id);

-- Alerts (with full context)
CREATE TABLE golf_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  
  -- Evidence
  evidence JSONB NOT NULL,
  
  -- Root cause (for performance alerts)
  root_cause JSONB,
  
  -- Context at time of detection
  player_context JSONB NOT NULL, -- snapshot of PlayerContext
  team_context JSONB NOT NULL,   -- snapshot of TeamContext
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'dismissed', 'resolved', 'snoozed')),
  snoozed_until TIMESTAMPTZ,
  resolution_notes TEXT,
  
  -- Timestamps
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES golf_coaches(id),
  resolved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_golf_alerts_team ON golf_alerts(team_id);
CREATE INDEX idx_golf_alerts_player ON golf_alerts(player_id);
CREATE INDEX idx_golf_alerts_active ON golf_alerts(team_id) WHERE status = 'active';
CREATE INDEX idx_golf_alerts_severity ON golf_alerts(severity) WHERE status = 'active';

-- Round Reviews (with goal tracking)
CREATE TABLE golf_round_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE UNIQUE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  
  -- Impact on goals
  goal_impacts JSONB DEFAULT '[]', -- how this round affected each goal
  
  -- Impact on standings
  scoring_avg_before DECIMAL(4,1),
  scoring_avg_after DECIMAL(4,1),
  qualifying_position_before INTEGER,
  qualifying_position_after INTEGER,
  gap_to_next_position DECIMAL(4,2),
  
  -- Highlights
  highlights JSONB NOT NULL DEFAULT '[]',
  
  -- Areas to review
  areas_to_review JSONB NOT NULL DEFAULT '[]',
  
  -- Stats
  round_stats JSONB NOT NULL,
  player_averages JSONB NOT NULL,
  team_averages JSONB,
  
  -- Strokes gained
  strokes_gained JSONB NOT NULL,
  
  -- Patterns
  patterns_detected JSONB DEFAULT '[]',
  patterns_recurring JSONB DEFAULT '[]',
  
  -- Summary
  summary TEXT NOT NULL,
  primary_takeaway TEXT NOT NULL,
  next_practice_priority TEXT,
  linked_focus_area_id UUID REFERENCES golf_focus_areas(id) ON DELETE SET NULL,
  
  -- Sharing
  shared_with_coach_at TIMESTAMPTZ,
  coach_viewed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_golf_round_reviews_player ON golf_round_reviews(player_id);
CREATE INDEX idx_golf_round_reviews_created ON golf_round_reviews(created_at DESC);

-- Drill Library
CREATE TABLE golf_drill_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Categorization
  focus_area_category TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced', 'all')),
  
  -- Content
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  focus TEXT NOT NULL,
  setup TEXT NOT NULL,
  execution JSONB NOT NULL, -- array of steps
  success_criteria TEXT NOT NULL,
  why_this_works TEXT NOT NULL,
  
  -- Variations
  variation_easier TEXT,
  variation_harder TEXT,
  
  -- Tracking
  tracking_metric TEXT NOT NULL,
  target_value DECIMAL(6,2) NOT NULL,
  
  -- Metadata
  source TEXT, -- where drill came from
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_golf_drills_category ON golf_drill_library(focus_area_category);
CREATE INDEX idx_golf_drills_active ON golf_drill_library(is_active) WHERE is_active = TRUE;
```

---

## Part 7: Implementation Phases (Updated)

### Phase 1: Configuration Foundation (Week 1-2)
- [ ] Coach philosophy settings page + database
- [ ] Player goals & preferences page + database
- [ ] Context flags system
- [ ] Settings persistence and API

### Phase 2: Intelligence Core (Week 3-4)
- [ ] Context Engine implementation
- [ ] Adaptive benchmarking system
- [ ] Alert generation with context awareness
- [ ] Root cause analysis engine

### Phase 3: Focus Areas + Practice (Week 5-6)
- [ ] Focus area calculation with personalization
- [ ] Drill library seeding (30+ drills)
- [ ] Practice plan generation
- [ ] Player dashboard integration

### Phase 4: Round Review (Week 7-8)
- [ ] Round review generation
- [ ] Goal impact tracking
- [ ] Pattern detection + linking
- [ ] Round review page with animations

### Phase 5: Alerts + Coach Dashboard (Week 9-10)
- [ ] Alert dashboard section
- [ ] Alert detail modal
- [ ] Alert management (acknowledge, snooze, dismiss)
- [ ] Coach behavior learning

### Phase 6: Compare Tool + Polish (Week 11-12)
- [ ] Compare tool with philosophy weighting
- [ ] Analysis synthesis
- [ ] All premium animations
- [ ] Mobile optimization
- [ ] Performance optimization

---

This refined blueprint focuses on:

1. **True Intelligence**: Context-aware, personalized, learning from behavior
2. **Deep Configurability**: Coaches and players control how the system works for them
3. **Premium Feel**: Signature animations that feel physical and purposeful
4. **Insight Over Advice**: The system surfaces data and analysis; humans make decisions

Ready to start implementing?
