<!--
STATUS: SUPERSEDED
DATE: 2026-07-10
SUPERSEDED BY / WHY: Part of the pre-build docs/features/coachhelm/ implementation-guide package (untouched since 2026-01-14), superseded by the shipped V2 engine and its 2026-06 audits. Live reference: memory/context/coachhelm-ai.md.
KEPT FOR HISTORY -- do not delete this file.
-->

# CoachHelm Implementation Specification
## Detailed Feature Specs for Cursor Implementation

---

# Table of Contents

1. [System Overview](#1-system-overview)
2. [Feature 1: Coach Philosophy Settings](#2-feature-1-coach-philosophy-settings)
3. [Feature 2: Player Goals & Preferences](#3-feature-2-player-goals--preferences)
4. [Feature 3: Context Flags System](#4-feature-3-context-flags-system)
5. [Feature 4: Focus Areas](#5-feature-4-focus-areas)
6. [Feature 5: Attention Alerts](#6-feature-5-attention-alerts)
7. [Feature 6: Round Review](#7-feature-6-round-review)
8. [Feature 7: Compare Tool](#8-feature-7-compare-tool)
9. [Shared Components & Utilities](#9-shared-components--utilities)
10. [Database Migration](#10-database-migration)

---

# 1. System Overview

## 1.1 What is CoachHelm?

CoachHelm is an AI coaching intelligence layer for GolfHelm. It transforms raw golf data into actionable insights calibrated to each coach's philosophy and each player's goals.

**Core Principle:** Insight over advice. CoachHelm tells you WHAT is happening and WHY. The coach decides WHAT TO DO.

## 1.2 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        COACHHELM                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   CONTEXT    │  │  PHILOSOPHY  │  │   LEARNING   │          │
│  │   ENGINE     │  │   ENGINE     │  │   ENGINE     │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └────────────┬────┴────────────────┘                   │
│                      │                                          │
│              ┌───────▼───────┐                                  │
│              │   INSIGHT     │                                  │
│              │   ENGINE      │                                  │
│              └───────┬───────┘                                  │
│                      │                                          │
│    ┌─────────────────┼─────────────────┐                       │
│    │                 │                 │                        │
│    ▼                 ▼                 ▼                        │
│ ┌──────┐      ┌──────────┐      ┌──────────┐                   │
│ │FOCUS │      │ ALERTS   │      │ ROUND    │                   │
│ │AREAS │      │          │      │ REVIEW   │                   │
│ └──────┘      └──────────┘      └──────────┘                   │
│                                                                 │
│              ┌──────────────┐                                   │
│              │   COMPARE    │                                   │
│              │   TOOL       │                                   │
│              └──────────────┘                                   │
└─────────────────────────────────────────────────────────────────┘
```

## 1.3 File Structure

```
src/
├── app/
│   └── golf/
│       └── (dashboard)/
│           └── dashboard/
│               ├── settings/
│               │   ├── page.tsx                    # Existing
│               │   └── coaching-intelligence/
│               │       └── page.tsx                # NEW: Coach settings
│               ├── alerts/
│               │   └── page.tsx                    # NEW: Full alerts page
│               ├── compare/
│               │   └── page.tsx                    # NEW: Compare tool
│               ├── rounds/
│               │   └── [id]/
│               │       └── review/
│               │           └── page.tsx            # NEW: Round review
│               └── focus-areas/
│                   └── page.tsx                    # NEW: Focus areas detail
│
├── components/
│   └── golf/
│       └── coachhelm/
│           ├── index.ts
│           │
│           │ # Settings Components
│           ├── settings/
│           │   ├── CoachPhilosophyForm.tsx
│           │   ├── PriorityRanker.tsx
│           │   ├── SensitivitySlider.tsx
│           │   ├── ThresholdSlider.tsx
│           │   ├── WeightDistributor.tsx
│           │   └── AlertTypeToggles.tsx
│           │
│           │ # Player Goals Components
│           ├── goals/
│           │   ├── PlayerGoalsForm.tsx
│           │   ├── GoalCard.tsx
│           │   ├── GoalProgressBar.tsx
│           │   ├── AddGoalModal.tsx
│           │   └── ContextFlagCard.tsx
│           │
│           │ # Focus Areas Components
│           ├── focus-areas/
│           │   ├── FocusAreasSection.tsx
│           │   ├── FocusAreaCard.tsx
│           │   ├── FocusAreaDetailModal.tsx
│           │   ├── PracticePlanView.tsx
│           │   ├── DrillCard.tsx
│           │   └── ProgressMilestones.tsx
│           │
│           │ # Alerts Components
│           ├── alerts/
│           │   ├── AlertsSection.tsx
│           │   ├── AlertCard.tsx
│           │   ├── AlertDetailModal.tsx
│           │   ├── RootCauseAnalysis.tsx
│           │   ├── AlertActions.tsx
│           │   └── AlertBadge.tsx
│           │
│           │ # Round Review Components
│           ├── round-review/
│           │   ├── RoundReview.tsx
│           │   ├── ReviewHeader.tsx
│           │   ├── ReviewScorecard.tsx
│           │   ├── ReviewHighlights.tsx
│           │   ├── ReviewAreasToReview.tsx
│           │   ├── ReviewStatsComparison.tsx
│           │   ├── ReviewStrokesGained.tsx
│           │   ├── ReviewSummary.tsx
│           │   └── GoalImpactCard.tsx
│           │
│           │ # Compare Tool Components
│           ├── compare/
│           │   ├── CompareTool.tsx
│           │   ├── PlayerSelector.tsx
│           │   ├── CompareCard.tsx
│           │   ├── CompareAnalysis.tsx
│           │   ├── CompareMetricRow.tsx
│           │   ├── AdvantageIndicator.tsx
│           │   └── VsBadge.tsx
│           │
│           │ # Shared Components
│           └── shared/
│               ├── StrokesGainedBar.tsx
│               ├── TrendSparkline.tsx
│               ├── AnimatedNumber.tsx
│               ├── InsightCard.tsx
│               ├── DataCascade.tsx
│               └── EmptyInsight.tsx
│
├── lib/
│   └── coachhelm/
│       ├── index.ts
│       ├── types.ts                    # All TypeScript interfaces
│       ├── context-engine.ts           # Context calculations
│       ├── philosophy-engine.ts        # Philosophy weighting
│       ├── insight-engine.ts           # Core insight generation
│       ├── focus-area-calculator.ts    # Focus area logic
│       ├── alert-detector.ts           # Alert detection
│       ├── root-cause-analyzer.ts      # Root cause analysis
│       ├── round-review-generator.ts   # Round review logic
│       ├── comparison-analyzer.ts      # Compare tool logic
│       ├── benchmark-service.ts        # Benchmark calculations
│       └── constants.ts                # Thresholds, defaults
│
├── hooks/
│   └── coachhelm/
│       ├── useCoachPhilosophy.ts
│       ├── usePlayerGoals.ts
│       ├── useContextFlags.ts
│       ├── useFocusAreas.ts
│       ├── useAlerts.ts
│       ├── useRoundReview.ts
│       └── useComparison.ts
│
└── types/
    └── coachhelm.ts                    # Export all types
```

## 1.4 Design System Constants

```typescript
// src/lib/coachhelm/constants.ts

export const COACHHELM_COLORS = {
  // Severity colors
  severity: {
    high: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      accent: 'border-l-red-500',
      text: 'text-red-700',
      badge: 'bg-red-100 text-red-700',
      glow: 'shadow-red-500/20',
    },
    medium: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      accent: 'border-l-amber-500',
      text: 'text-amber-700',
      badge: 'bg-amber-100 text-amber-700',
      glow: 'shadow-amber-500/20',
    },
    low: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      accent: 'border-l-blue-500',
      text: 'text-blue-700',
      badge: 'bg-blue-100 text-blue-700',
      glow: 'shadow-blue-500/20',
    },
  },
  
  // Trend colors
  trend: {
    positive: 'text-green-600',
    negative: 'text-red-500',
    neutral: 'text-slate-400',
  },
  
  // Strokes gained colors
  strokesGained: {
    positive: {
      bar: 'bg-gradient-to-r from-green-400 to-green-500',
      text: 'text-green-600',
    },
    negative: {
      bar: 'bg-gradient-to-l from-red-400 to-red-500',
      text: 'text-red-500',
    },
  },
  
  // Advantage indicator colors
  advantage: {
    left: 'text-green-500',
    right: 'text-amber-500',
  },
};

export const COACHHELM_ANIMATIONS = {
  // Duration tokens
  duration: {
    instant: 100,
    fast: 150,
    normal: 220,
    slow: 320,
    dramatic: 500,
  },
  
  // Easing tokens
  ease: {
    out: [0.16, 1, 0.3, 1],
    outGentle: [0.33, 1, 0.68, 1],
    in: [0.7, 0, 0.84, 0],
    inOut: [0.65, 0, 0.35, 1],
    bounce: [0.34, 1.56, 0.64, 1],
    spring: [0.175, 0.885, 0.32, 1.275],
  },
  
  // Stagger delays
  stagger: {
    fast: 30,
    normal: 50,
    slow: 80,
  },
};

export const COACHHELM_DEFAULTS = {
  // Coach philosophy defaults
  philosophy: {
    priorityBallStriking: 2,
    priorityShortGame: 3,
    priorityPutting: 2,
    priorityCourseManagement: 4,
    priorityMentalGame: 3,
    alertSensitivity: 'balanced' as const,
    declineThreshold: 2.0,
    plateauWeeks: 4,
    pressureGapThreshold: 2.5,
    bubbleZoneRange: 1.0,
    weightHistorical: 35,
    weightRecentForm: 30,
    weightTournament: 20,
    weightQualifying: 10,
    weightSubjective: 5,
  },
  
  // Focus area thresholds
  focusAreas: {
    maxAreas: 5,
    minStrokeImpact: 0.2,
    improvabilityScores: {
      putting: 0.8,
      shortGame: 0.9,
      approach: 0.7,
      driving: 0.5,
    },
  },
  
  // Alert thresholds
  alerts: {
    declineLookback: 5, // rounds
    trendMinRounds: 10,
    patternMinFrequency: 0.6,
    patternMinImpact: 0.5,
  },
};
```

---

# 2. Feature 1: Coach Philosophy Settings

## 2.1 Overview

The Coach Philosophy Settings page allows coaches to configure how CoachHelm analyzes their team. This is the foundation—all other features reference these settings.

**Location:** `/golf/dashboard/settings/coaching-intelligence`

**Access:** Coach role only

## 2.2 Database Schema

```sql
-- Add to your next migration file

CREATE TABLE golf_coach_philosophy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES golf_coaches(id) ON DELETE CASCADE UNIQUE,
  
  -- Priority metrics (1-5, 1 = highest)
  priority_ball_striking INTEGER NOT NULL DEFAULT 2 
    CHECK (priority_ball_striking BETWEEN 1 AND 5),
  priority_short_game INTEGER NOT NULL DEFAULT 3 
    CHECK (priority_short_game BETWEEN 1 AND 5),
  priority_putting INTEGER NOT NULL DEFAULT 2 
    CHECK (priority_putting BETWEEN 1 AND 5),
  priority_course_management INTEGER NOT NULL DEFAULT 4 
    CHECK (priority_course_management BETWEEN 1 AND 5),
  priority_mental_game INTEGER NOT NULL DEFAULT 3 
    CHECK (priority_mental_game BETWEEN 1 AND 5),
  
  -- Alert sensitivity
  alert_sensitivity TEXT NOT NULL DEFAULT 'balanced' 
    CHECK (alert_sensitivity IN ('aggressive', 'balanced', 'conservative')),
  
  -- Thresholds
  decline_threshold DECIMAL(3,1) NOT NULL DEFAULT 2.0,
  plateau_weeks INTEGER NOT NULL DEFAULT 4,
  pressure_gap_threshold DECIMAL(3,1) NOT NULL DEFAULT 2.5,
  bubble_zone_range DECIMAL(3,1) NOT NULL DEFAULT 1.0,
  
  -- Comparison weights (should sum to 100)
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
  insight_verbosity TEXT NOT NULL DEFAULT 'detailed' 
    CHECK (insight_verbosity IN ('brief', 'detailed')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for updated_at
CREATE TRIGGER update_golf_coach_philosophy_updated_at
  BEFORE UPDATE ON golf_coach_philosophy
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- RLS Policy
ALTER TABLE golf_coach_philosophy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage their own philosophy"
  ON golf_coach_philosophy
  FOR ALL
  USING (
    coach_id IN (
      SELECT id FROM golf_coaches WHERE user_id = auth.uid()
    )
  );
```

## 2.3 TypeScript Types

```typescript
// src/lib/coachhelm/types.ts

export interface CoachPhilosophy {
  id: string;
  coachId: string;
  
  // Priority metrics (1-5, 1 = highest)
  priorityBallStriking: number;
  priorityShortGame: number;
  priorityPutting: number;
  priorityCourseManagement: number;
  priorityMentalGame: number;
  
  // Alert sensitivity
  alertSensitivity: 'aggressive' | 'balanced' | 'conservative';
  
  // Thresholds
  declineThreshold: number;
  plateauWeeks: number;
  pressureGapThreshold: number;
  bubbleZoneRange: number;
  
  // Comparison weights
  weightHistorical: number;
  weightRecentForm: number;
  weightTournament: number;
  weightQualifying: number;
  weightSubjective: number;
  
  // Alert type toggles
  alertScoringDecline: boolean;
  alertStatRegression: boolean;
  alertTournamentPressure: boolean;
  alertPlateau: boolean;
  alertBubblePlayer: boolean;
  alertSurgePlayer: boolean;
  alertStreaks: boolean;
  alertRecurringWeakness: boolean;
  alertClosingHoles: boolean;
  alertPar3Issues: boolean;
  
  // Notification preferences
  notifyHighRealtime: boolean;
  notifyMediumRealtime: boolean;
  notifyLowRealtime: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  dailyDigest: boolean;
  
  // Display preferences
  showStrokesGained: boolean;
  showAdvancedStats: boolean;
  preferVisualizations: boolean;
  compactView: boolean;
  insightVerbosity: 'brief' | 'detailed';
  
  createdAt: string;
  updatedAt: string;
}

export type PriorityMetric = {
  key: keyof Pick<CoachPhilosophy, 
    'priorityBallStriking' | 'priorityShortGame' | 'priorityPutting' | 
    'priorityCourseManagement' | 'priorityMentalGame'
  >;
  label: string;
  description: string;
  icon: string;
};

export const PRIORITY_METRICS: PriorityMetric[] = [
  {
    key: 'priorityBallStriking',
    label: 'Ball Striking',
    description: 'Fairways hit, greens in regulation, approach proximity',
    icon: '🎯',
  },
  {
    key: 'priorityShortGame',
    label: 'Short Game',
    description: 'Scrambling, sand saves, up-and-down percentage',
    icon: '⛳',
  },
  {
    key: 'priorityPutting',
    label: 'Putting',
    description: 'Putts per round, make percentages, 3-putt avoidance',
    icon: '🏌️',
  },
  {
    key: 'priorityCourseManagement',
    label: 'Course Management',
    description: 'Penalty avoidance, bogey-free holes, smart misses',
    icon: '🗺️',
  },
  {
    key: 'priorityMentalGame',
    label: 'Mental Game',
    description: 'Tournament vs practice performance, closing holes',
    icon: '🧠',
  },
];
```

## 2.4 Hook Implementation

```typescript
// src/hooks/coachhelm/useCoachPhilosophy.ts

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CoachPhilosophy } from '@/lib/coachhelm/types';
import { COACHHELM_DEFAULTS } from '@/lib/coachhelm/constants';

interface UseCoachPhilosophyReturn {
  philosophy: CoachPhilosophy | null;
  loading: boolean;
  error: Error | null;
  updatePhilosophy: (updates: Partial<CoachPhilosophy>) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

export function useCoachPhilosophy(coachId?: string): UseCoachPhilosophyReturn {
  const [philosophy, setPhilosophy] = useState<CoachPhilosophy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const supabase = createClient();
  
  // Fetch philosophy
  useEffect(() => {
    if (!coachId) {
      setLoading(false);
      return;
    }
    
    async function fetchPhilosophy() {
      try {
        const { data, error: fetchError } = await supabase
          .from('golf_coach_philosophy')
          .select('*')
          .eq('coach_id', coachId)
          .maybeSingle();
        
        if (fetchError) throw fetchError;
        
        if (data) {
          setPhilosophy(mapDbToPhilosophy(data));
        } else {
          // Create with defaults if doesn't exist
          const { data: newData, error: createError } = await supabase
            .from('golf_coach_philosophy')
            .insert({ coach_id: coachId })
            .select()
            .single();
          
          if (createError) throw createError;
          setPhilosophy(mapDbToPhilosophy(newData));
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch philosophy'));
      } finally {
        setLoading(false);
      }
    }
    
    fetchPhilosophy();
  }, [coachId, supabase]);
  
  // Update philosophy
  const updatePhilosophy = useCallback(async (updates: Partial<CoachPhilosophy>) => {
    if (!philosophy?.id) return;
    
    const dbUpdates = mapPhilosophyToDb(updates);
    
    const { data, error: updateError } = await supabase
      .from('golf_coach_philosophy')
      .update(dbUpdates)
      .eq('id', philosophy.id)
      .select()
      .single();
    
    if (updateError) throw updateError;
    setPhilosophy(mapDbToPhilosophy(data));
  }, [philosophy?.id, supabase]);
  
  // Reset to defaults
  const resetToDefaults = useCallback(async () => {
    if (!philosophy?.id) return;
    
    const { data, error: updateError } = await supabase
      .from('golf_coach_philosophy')
      .update({
        ...COACHHELM_DEFAULTS.philosophy,
        // Reset all toggles to defaults
        alert_scoring_decline: true,
        alert_stat_regression: true,
        // ... etc
      })
      .eq('id', philosophy.id)
      .select()
      .single();
    
    if (updateError) throw updateError;
    setPhilosophy(mapDbToPhilosophy(data));
  }, [philosophy?.id, supabase]);
  
  return { philosophy, loading, error, updatePhilosophy, resetToDefaults };
}

// Helper functions to map between DB snake_case and TS camelCase
function mapDbToPhilosophy(db: any): CoachPhilosophy {
  return {
    id: db.id,
    coachId: db.coach_id,
    priorityBallStriking: db.priority_ball_striking,
    priorityShortGame: db.priority_short_game,
    priorityPutting: db.priority_putting,
    priorityCourseManagement: db.priority_course_management,
    priorityMentalGame: db.priority_mental_game,
    alertSensitivity: db.alert_sensitivity,
    declineThreshold: db.decline_threshold,
    plateauWeeks: db.plateau_weeks,
    pressureGapThreshold: db.pressure_gap_threshold,
    bubbleZoneRange: db.bubble_zone_range,
    weightHistorical: db.weight_historical,
    weightRecentForm: db.weight_recent_form,
    weightTournament: db.weight_tournament,
    weightQualifying: db.weight_qualifying,
    weightSubjective: db.weight_subjective,
    alertScoringDecline: db.alert_scoring_decline,
    alertStatRegression: db.alert_stat_regression,
    alertTournamentPressure: db.alert_tournament_pressure,
    alertPlateau: db.alert_plateau,
    alertBubblePlayer: db.alert_bubble_player,
    alertSurgePlayer: db.alert_surge_player,
    alertStreaks: db.alert_streaks,
    alertRecurringWeakness: db.alert_recurring_weakness,
    alertClosingHoles: db.alert_closing_holes,
    alertPar3Issues: db.alert_par_3_issues,
    notifyHighRealtime: db.notify_high_realtime,
    notifyMediumRealtime: db.notify_medium_realtime,
    notifyLowRealtime: db.notify_low_realtime,
    emailNotifications: db.email_notifications,
    pushNotifications: db.push_notifications,
    dailyDigest: db.daily_digest,
    showStrokesGained: db.show_strokes_gained,
    showAdvancedStats: db.show_advanced_stats,
    preferVisualizations: db.prefer_visualizations,
    compactView: db.compact_view,
    insightVerbosity: db.insight_verbosity,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function mapPhilosophyToDb(philosophy: Partial<CoachPhilosophy>): Record<string, any> {
  const map: Record<string, string> = {
    priorityBallStriking: 'priority_ball_striking',
    priorityShortGame: 'priority_short_game',
    priorityPutting: 'priority_putting',
    priorityCourseManagement: 'priority_course_management',
    priorityMentalGame: 'priority_mental_game',
    alertSensitivity: 'alert_sensitivity',
    declineThreshold: 'decline_threshold',
    plateauWeeks: 'plateau_weeks',
    pressureGapThreshold: 'pressure_gap_threshold',
    bubbleZoneRange: 'bubble_zone_range',
    weightHistorical: 'weight_historical',
    weightRecentForm: 'weight_recent_form',
    weightTournament: 'weight_tournament',
    weightQualifying: 'weight_qualifying',
    weightSubjective: 'weight_subjective',
    alertScoringDecline: 'alert_scoring_decline',
    alertStatRegression: 'alert_stat_regression',
    alertTournamentPressure: 'alert_tournament_pressure',
    alertPlateau: 'alert_plateau',
    alertBubblePlayer: 'alert_bubble_player',
    alertSurgePlayer: 'alert_surge_player',
    alertStreaks: 'alert_streaks',
    alertRecurringWeakness: 'alert_recurring_weakness',
    alertClosingHoles: 'alert_closing_holes',
    alertPar3Issues: 'alert_par_3_issues',
    notifyHighRealtime: 'notify_high_realtime',
    notifyMediumRealtime: 'notify_medium_realtime',
    notifyLowRealtime: 'notify_low_realtime',
    emailNotifications: 'email_notifications',
    pushNotifications: 'push_notifications',
    dailyDigest: 'daily_digest',
    showStrokesGained: 'show_strokes_gained',
    showAdvancedStats: 'show_advanced_stats',
    preferVisualizations: 'prefer_visualizations',
    compactView: 'compact_view',
    insightVerbosity: 'insight_verbosity',
  };
  
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(philosophy)) {
    if (map[key]) {
      result[map[key]] = value;
    }
  }
  return result;
}
```

## 2.5 UI Components

### 2.5.1 Priority Ranker Component (Drag & Drop)

```typescript
// src/components/golf/coachhelm/settings/PriorityRanker.tsx

'use client';

import { useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { IconGripVertical } from '@/components/icons';
import { PRIORITY_METRICS, PriorityMetric, CoachPhilosophy } from '@/lib/coachhelm/types';

interface PriorityRankerProps {
  values: Pick<CoachPhilosophy, 
    'priorityBallStriking' | 'priorityShortGame' | 'priorityPutting' | 
    'priorityCourseManagement' | 'priorityMentalGame'
  >;
  onChange: (newValues: typeof values) => void;
}

interface SortableItemProps {
  metric: PriorityMetric;
  rank: number;
}

function SortableItem({ metric, rank }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: metric.key });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-4 p-4 rounded-xl border transition-all duration-200',
        isDragging 
          ? 'bg-white shadow-lg border-green-200 scale-[1.02] z-10' 
          : 'bg-white/60 border-white/40 hover:bg-white/80'
      )}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 p-1 rounded hover:bg-slate-100 cursor-grab active:cursor-grabbing"
      >
        <IconGripVertical size={20} className="text-slate-400" />
      </button>
      
      {/* Rank Number */}
      <div className={cn(
        'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm',
        rank === 1 && 'bg-green-100 text-green-700',
        rank === 2 && 'bg-green-50 text-green-600',
        rank === 3 && 'bg-slate-100 text-slate-600',
        rank === 4 && 'bg-slate-50 text-slate-500',
        rank === 5 && 'bg-slate-50 text-slate-400',
      )}>
        {rank}
      </div>
      
      {/* Icon */}
      <span className="text-2xl flex-shrink-0">{metric.icon}</span>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-900">{metric.label}</div>
        <div className="text-sm text-slate-500 truncate">{metric.description}</div>
      </div>
      
      {/* Priority Bar */}
      <div className="flex-shrink-0 w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-300"
          style={{ width: `${(6 - rank) * 20}%` }}
        />
      </div>
    </div>
  );
}

export function PriorityRanker({ values, onChange }: PriorityRankerProps) {
  // Sort metrics by their current priority values
  const sortedMetrics = [...PRIORITY_METRICS].sort((a, b) => values[a.key] - values[b.key]);
  const [items, setItems] = useState(sortedMetrics.map(m => m.key));
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  function handleDragEnd(event: any) {
    const { active, over } = event;
    
    if (active.id !== over.id) {
      const oldIndex = items.indexOf(active.id);
      const newIndex = items.indexOf(over.id);
      
      const newItems = arrayMove(items, oldIndex, newIndex);
      setItems(newItems);
      
      // Convert to priority values (index + 1)
      const newValues = {} as typeof values;
      newItems.forEach((key, index) => {
        newValues[key as keyof typeof values] = index + 1;
      });
      
      onChange(newValues);
    }
  }
  
  return (
    <div className="space-y-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {items.map((key, index) => {
            const metric = PRIORITY_METRICS.find(m => m.key === key)!;
            return (
              <SortableItem 
                key={key} 
                metric={metric} 
                rank={index + 1} 
              />
            );
          })}
        </SortableContext>
      </DndContext>
    </div>
  );
}
```

### 2.5.2 Sensitivity Slider Component

```typescript
// src/components/golf/coachhelm/settings/SensitivitySlider.tsx

'use client';

import { cn } from '@/lib/utils';

type Sensitivity = 'aggressive' | 'balanced' | 'conservative';

interface SensitivitySliderProps {
  value: Sensitivity;
  onChange: (value: Sensitivity) => void;
}

const options: { value: Sensitivity; label: string; description: string }[] = [
  {
    value: 'aggressive',
    label: 'Aggressive',
    description: 'Surface issues early, accept some false positives',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Standard thresholds and timing',
  },
  {
    value: 'conservative',
    label: 'Conservative',
    description: 'Only high-confidence issues with strong statistical backing',
  },
];

export function SensitivitySlider({ value, onChange }: SensitivitySliderProps) {
  const selectedIndex = options.findIndex(o => o.value === value);
  
  return (
    <div className="space-y-4">
      {/* Track */}
      <div className="relative h-12 bg-slate-100 rounded-full p-1">
        {/* Selected indicator */}
        <div 
          className="absolute top-1 bottom-1 w-1/3 bg-white rounded-full shadow-md transition-all duration-300 ease-out"
          style={{ left: `calc(${selectedIndex * 33.33}% + 4px)`, width: 'calc(33.33% - 8px)' }}
        />
        
        {/* Options */}
        <div className="relative flex h-full">
          {options.map((option, index) => (
            <button
              key={option.value}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex-1 flex items-center justify-center rounded-full text-sm font-medium transition-colors duration-200',
                value === option.value ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Description */}
      <div 
        className="text-sm text-slate-500 text-center h-10 flex items-center justify-center transition-all duration-300"
        key={value} // Force re-render for animation
      >
        <span className="animate-fade-in">{options[selectedIndex].description}</span>
      </div>
    </div>
  );
}
```

### 2.5.3 Threshold Slider Component

```typescript
// src/components/golf/coachhelm/settings/ThresholdSlider.tsx

'use client';

import { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ThresholdSliderProps {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  marks?: number[];
}

export function ThresholdSlider({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  marks,
}: ThresholdSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const percentage = ((value - min) / (max - min)) * 100;
  const displayMarks = marks || generateMarks(min, max, step);
  
  function handleTrackClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!trackRef.current) return;
    
    const rect = trackRef.current.getBoundingClientRect();
    const percentage = (e.clientX - rect.left) / rect.width;
    const newValue = min + percentage * (max - min);
    const snapped = Math.round(newValue / step) * step;
    onChange(Math.max(min, Math.min(max, snapped)));
  }
  
  return (
    <div className="space-y-3">
      {/* Label and value */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-700">{label}</div>
          <div className="text-xs text-slate-500">{description}</div>
        </div>
        <div className="text-lg font-semibold text-slate-900 tabular-nums">
          {value.toFixed(1)} {unit}
        </div>
      </div>
      
      {/* Track */}
      <div 
        ref={trackRef}
        onClick={handleTrackClick}
        className="relative h-2 bg-slate-100 rounded-full cursor-pointer group"
      >
        {/* Fill */}
        <div 
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-150"
          style={{ width: `${percentage}%` }}
        />
        
        {/* Thumb */}
        <div 
          className={cn(
            'absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full shadow-md border-2 border-green-500 transition-transform duration-150',
            'group-hover:scale-110',
            isDragging && 'scale-110'
          )}
          style={{ left: `calc(${percentage}% - 10px)` }}
        />
      </div>
      
      {/* Marks */}
      <div className="flex justify-between px-2">
        {displayMarks.map((mark) => (
          <button
            key={mark}
            onClick={() => onChange(mark)}
            className={cn(
              'text-xs transition-colors duration-150',
              value === mark ? 'text-green-600 font-medium' : 'text-slate-400 hover:text-slate-600'
            )}
          >
            {mark.toFixed(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

function generateMarks(min: number, max: number, step: number): number[] {
  const marks: number[] = [];
  for (let i = min; i <= max; i += (max - min) / 4) {
    marks.push(Math.round(i / step) * step);
  }
  return marks;
}
```

### 2.5.4 Weight Distributor Component

```typescript
// src/components/golf/coachhelm/settings/WeightDistributor.tsx

'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface Weight {
  key: string;
  label: string;
  value: number;
}

interface WeightDistributorProps {
  weights: Weight[];
  onChange: (weights: Weight[]) => void;
  total?: number;
}

export function WeightDistributor({ weights, onChange, total = 100 }: WeightDistributorProps) {
  const currentTotal = weights.reduce((sum, w) => sum + w.value, 0);
  const isValid = currentTotal === total;
  
  function handleWeightChange(key: string, newValue: number) {
    const oldValue = weights.find(w => w.key === key)?.value || 0;
    const diff = newValue - oldValue;
    
    if (diff === 0) return;
    
    // Distribute the difference proportionally among other weights
    const others = weights.filter(w => w.key !== key);
    const othersTotal = others.reduce((sum, w) => sum + w.value, 0);
    
    const newWeights = weights.map(w => {
      if (w.key === key) {
        return { ...w, value: newValue };
      }
      
      // Proportionally adjust other weights
      const proportion = othersTotal > 0 ? w.value / othersTotal : 1 / others.length;
      const adjustment = Math.round(diff * proportion);
      const adjusted = Math.max(0, Math.min(100, w.value - adjustment));
      
      return { ...w, value: adjusted };
    });
    
    // Ensure total is exactly 100
    const newTotal = newWeights.reduce((sum, w) => sum + w.value, 0);
    if (newTotal !== total) {
      // Adjust the largest weight to compensate
      const largest = newWeights.reduce((max, w) => 
        w.key !== key && w.value > max.value ? w : max
      , newWeights[0]);
      largest.value += total - newTotal;
    }
    
    onChange(newWeights);
  }
  
  return (
    <div className="space-y-4">
      {weights.map((weight) => (
        <div key={weight.key} className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">{weight.label}</span>
            <span className="text-sm font-semibold text-slate-900 tabular-nums">
              {weight.value}%
            </span>
          </div>
          
          {/* Bar */}
          <div className="relative h-6 bg-slate-100 rounded-lg overflow-hidden">
            {/* Fill */}
            <div 
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-400 to-green-500 transition-all duration-200"
              style={{ width: `${weight.value}%` }}
            />
            
            {/* Interactive range input (invisible but functional) */}
            <input
              type="range"
              min={0}
              max={total}
              step={5}
              value={weight.value}
              onChange={(e) => handleWeightChange(weight.key, parseInt(e.target.value))}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>
        </div>
      ))}
      
      {/* Total indicator */}
      <div className={cn(
        'flex items-center justify-between text-sm font-medium pt-2 border-t border-slate-200',
        isValid ? 'text-green-600' : 'text-red-500'
      )}>
        <span>Total</span>
        <span className="tabular-nums">{currentTotal}%</span>
      </div>
    </div>
  );
}
```

### 2.5.5 Alert Type Toggles Component

```typescript
// src/components/golf/coachhelm/settings/AlertTypeToggles.tsx

'use client';

import { cn } from '@/lib/utils';
import { CoachPhilosophy } from '@/lib/coachhelm/types';

interface AlertGroup {
  title: string;
  alerts: {
    key: keyof CoachPhilosophy;
    label: string;
    description?: string;
  }[];
}

const ALERT_GROUPS: AlertGroup[] = [
  {
    title: 'Performance',
    alerts: [
      { key: 'alertScoringDecline', label: 'Scoring decline', description: 'When scoring average increases significantly' },
      { key: 'alertStatRegression', label: 'Stat regression', description: 'Category-specific performance drops' },
      { key: 'alertTournamentPressure', label: 'Tournament pressure issues', description: 'Practice-to-tournament gap' },
      { key: 'alertPlateau', label: 'Performance plateau', description: 'No improvement over time' },
    ],
  },
  {
    title: 'Roster & Qualifying',
    alerts: [
      { key: 'alertBubblePlayer', label: 'Bubble player movement', description: 'Players near the cutoff line' },
      { key: 'alertSurgePlayer', label: 'Surge player', description: 'Rapid improvement' },
      { key: 'alertStreaks', label: 'Hot/cold streaks', description: 'Unusual performance runs' },
    ],
  },
  {
    title: 'Patterns',
    alerts: [
      { key: 'alertRecurringWeakness', label: 'Recurring weaknesses', description: 'Persistent problem areas' },
      { key: 'alertClosingHoles', label: 'Closing hole problems', description: 'Struggles on final holes' },
      { key: 'alertPar3Issues', label: 'Par 3 scoring issues', description: 'Par 3 performance concerns' },
    ],
  },
];

interface AlertTypeTogglesProps {
  values: Partial<CoachPhilosophy>;
  onChange: (key: keyof CoachPhilosophy, value: boolean) => void;
}

export function AlertTypeToggles({ values, onChange }: AlertTypeTogglesProps) {
  return (
    <div className="space-y-6">
      {ALERT_GROUPS.map((group) => (
        <div key={group.title}>
          <h4 className="text-sm font-medium text-slate-700 mb-3">{group.title}</h4>
          <div className="space-y-2">
            {group.alerts.map((alert) => (
              <label
                key={alert.key}
                className="flex items-start gap-3 p-3 rounded-xl bg-white/50 hover:bg-white/80 border border-white/40 cursor-pointer transition-colors duration-150"
              >
                {/* Custom checkbox */}
                <div className="relative flex-shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={values[alert.key] as boolean ?? true}
                    onChange={(e) => onChange(alert.key, e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className={cn(
                    'w-5 h-5 rounded border-2 transition-all duration-150',
                    'peer-checked:bg-green-500 peer-checked:border-green-500',
                    'peer-focus-visible:ring-2 peer-focus-visible:ring-green-500/40',
                    !values[alert.key] && 'border-slate-300 bg-white'
                  )}>
                    {values[alert.key] && (
                      <svg className="w-full h-full text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900">{alert.label}</div>
                  {alert.description && (
                    <div className="text-xs text-slate-500 mt-0.5">{alert.description}</div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

## 2.6 Page Implementation

```typescript
// src/app/golf/(dashboard)/dashboard/settings/coaching-intelligence/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { IconChevronLeft, IconSparkles, IconRefresh } from '@/components/icons';
import { GlassCard } from '@/components/ui/glass-card';
import { PageLoading } from '@/components/ui/loading';
import { useToast } from '@/components/ui/toast';
import { useCoachPhilosophy } from '@/hooks/coachhelm/useCoachPhilosophy';
import { PriorityRanker } from '@/components/golf/coachhelm/settings/PriorityRanker';
import { SensitivitySlider } from '@/components/golf/coachhelm/settings/SensitivitySlider';
import { ThresholdSlider } from '@/components/golf/coachhelm/settings/ThresholdSlider';
import { WeightDistributor } from '@/components/golf/coachhelm/settings/WeightDistributor';
import { AlertTypeToggles } from '@/components/golf/coachhelm/settings/AlertTypeToggles';
import Link from 'next/link';

export default function CoachingIntelligencePage() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  
  const [coachId, setCoachId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Get coach ID
  useEffect(() => {
    async function getCoachId() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/golf/login');
        return;
      }
      
      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('id')
        .eq('user_id', user.id)
        .single();
      
      if (coach) {
        setCoachId(coach.id);
      } else {
        router.push('/golf/dashboard');
      }
    }
    
    getCoachId();
  }, [supabase, router]);
  
  const { philosophy, loading, error, updatePhilosophy, resetToDefaults } = useCoachPhilosophy(coachId || undefined);
  
  // Local state for form
  const [formState, setFormState] = useState(philosophy);
  
  useEffect(() => {
    if (philosophy) {
      setFormState(philosophy);
    }
  }, [philosophy]);
  
  if (loading || !formState) {
    return <PageLoading />;
  }
  
  async function handleSave() {
    if (!formState) return;
    
    setSaving(true);
    try {
      await updatePhilosophy(formState);
      toast({ title: 'Settings saved', variant: 'success' });
      setHasChanges(false);
    } catch (err) {
      toast({ title: 'Failed to save settings', variant: 'error' });
    } finally {
      setSaving(false);
    }
  }
  
  async function handleReset() {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      await resetToDefaults();
      toast({ title: 'Settings reset to defaults', variant: 'success' });
      setHasChanges(false);
    }
  }
  
  function updateFormState(updates: Partial<typeof formState>) {
    setFormState(prev => prev ? { ...prev, ...updates } : null);
    setHasChanges(true);
  }
  
  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/golf/dashboard/settings"
                className="p-2 -ml-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <IconChevronLeft size={20} className="text-slate-600" />
              </Link>
              <div>
                <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                  <IconSparkles size={20} className="text-green-600" />
                  Coaching Intelligence
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Configure how CoachHelm analyzes your team
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <IconRefresh size={16} />
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        
        {/* Section: Philosophy */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">My Coaching Philosophy</h2>
          <p className="text-sm text-slate-500 mb-4">
            What matters most to your program? Drag to reorder by priority.
          </p>
          
          <GlassCard padding="md">
            <PriorityRanker
              values={{
                priorityBallStriking: formState.priorityBallStriking,
                priorityShortGame: formState.priorityShortGame,
                priorityPutting: formState.priorityPutting,
                priorityCourseManagement: formState.priorityCourseManagement,
                priorityMentalGame: formState.priorityMentalGame,
              }}
              onChange={(newValues) => updateFormState(newValues)}
            />
          </GlassCard>
        </section>
        
        {/* Section: Alert Sensitivity */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Alert Sensitivity</h2>
          <p className="text-sm text-slate-500 mb-4">
            How early should CoachHelm flag potential issues?
          </p>
          
          <GlassCard padding="md">
            <SensitivitySlider
              value={formState.alertSensitivity}
              onChange={(value) => updateFormState({ alertSensitivity: value })}
            />
          </GlassCard>
        </section>
        
        {/* Section: Thresholds */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Alert Thresholds</h2>
          <p className="text-sm text-slate-500 mb-4">
            Fine-tune when CoachHelm considers something noteworthy.
          </p>
          
          <GlassCard padding="md" className="space-y-8">
            <ThresholdSlider
              label="Performance Decline"
              description="Alert when scoring increases by this amount over 5 rounds"
              value={formState.declineThreshold}
              onChange={(value) => updateFormState({ declineThreshold: value })}
              min={1.5}
              max={3.5}
              step={0.5}
              unit="strokes"
            />
            
            <ThresholdSlider
              label="Tournament Pressure Gap"
              description="Alert when practice-to-tournament gap exceeds"
              value={formState.pressureGapThreshold}
              onChange={(value) => updateFormState({ pressureGapThreshold: value })}
              min={1.5}
              max={3.5}
              step={0.5}
              unit="strokes"
            />
            
            <ThresholdSlider
              label="Bubble Zone Range"
              description="Consider a player 'on the bubble' when within"
              value={formState.bubbleZoneRange}
              onChange={(value) => updateFormState({ bubbleZoneRange: value })}
              min={0.5}
              max={2.5}
              step={0.5}
              unit="strokes of cutoff"
            />
          </GlassCard>
        </section>
        
        {/* Section: Comparison Weighting */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Comparison Weighting</h2>
          <p className="text-sm text-slate-500 mb-4">
            When comparing players for roster decisions, how much weight should each factor carry?
          </p>
          
          <GlassCard padding="md">
            <WeightDistributor
              weights={[
                { key: 'weightHistorical', label: 'Historical Performance (full season)', value: formState.weightHistorical },
                { key: 'weightRecentForm', label: 'Recent Form (last 5 rounds)', value: formState.weightRecentForm },
                { key: 'weightTournament', label: 'Tournament Performance', value: formState.weightTournament },
                { key: 'weightQualifying', label: 'Qualifying Performance', value: formState.weightQualifying },
                { key: 'weightSubjective', label: 'My Subjective Input', value: formState.weightSubjective },
              ]}
              onChange={(weights) => {
                const updates: any = {};
                weights.forEach(w => {
                  updates[w.key] = w.value;
                });
                updateFormState(updates);
              }}
            />
          </GlassCard>
        </section>
        
        {/* Section: Alert Types */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Alert Types</h2>
          <p className="text-sm text-slate-500 mb-4">
            Which types of alerts do you want to receive?
          </p>
          
          <GlassCard padding="md">
            <AlertTypeToggles
              values={formState}
              onChange={(key, value) => updateFormState({ [key]: value })}
            />
          </GlassCard>
        </section>
        
        {/* Section: Notification Preferences */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Notification Preferences</h2>
          
          <GlassCard padding="md" className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'High Priority Alerts', keys: ['notifyHighRealtime'] },
                { label: 'Medium Priority Alerts', keys: ['notifyMediumRealtime'] },
                { label: 'Low Priority Alerts', keys: ['notifyLowRealtime'] },
              ].map(({ label, keys }) => (
                <div key={label} className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">{label}</div>
                  <div className="flex gap-2">
                    {['Real-time', 'Daily', 'Weekly'].map((timing, i) => (
                      <button
                        key={timing}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                          (i === 0 && formState[keys[0] as keyof typeof formState])
                            ? 'bg-green-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        onClick={() => {
                          // Toggle logic here
                        }}
                      >
                        {timing}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="border-t border-slate-200 pt-4 space-y-3">
              {[
                { key: 'emailNotifications', label: 'Email notifications' },
                { key: 'pushNotifications', label: 'Push notifications (mobile)' },
                { key: 'dailyDigest', label: 'Daily digest email' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState[key as keyof typeof formState] as boolean}
                    onChange={(e) => updateFormState({ [key]: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-slate-600">{label}</span>
                </label>
              ))}
            </div>
          </GlassCard>
        </section>
        
        {/* Section: Display Preferences */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Display Preferences</h2>
          
          <GlassCard padding="md" className="space-y-3">
            {[
              { key: 'showStrokesGained', label: 'Show Strokes Gained metrics' },
              { key: 'showAdvancedStats', label: 'Show advanced statistics' },
              { key: 'preferVisualizations', label: 'Prefer visual charts over tables' },
              { key: 'compactView', label: 'Compact view (less whitespace)' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState[key as keyof typeof formState] as boolean}
                  onChange={(e) => updateFormState({ [key]: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm text-slate-600">{label}</span>
              </label>
            ))}
            
            <div className="border-t border-slate-200 pt-4">
              <div className="text-sm font-medium text-slate-700 mb-2">Insight verbosity</div>
              <div className="flex gap-2">
                {['brief', 'detailed'].map((option) => (
                  <button
                    key={option}
                    onClick={() => updateFormState({ insightVerbosity: option as any })}
                    className={`px-4 py-2 text-sm rounded-lg transition-colors capitalize ${
                      formState.insightVerbosity === option
                        ? 'bg-green-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </GlassCard>
        </section>
        
        {/* Save button (mobile sticky) */}
        <div className="lg:hidden fixed bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent">
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
        
        {/* Bottom padding for mobile sticky button */}
        <div className="lg:hidden h-20" />
      </div>
    </div>
  );
}
```

## 2.7 Integration with Existing Settings Page

Add a link to the existing settings page:

```typescript
// In src/app/golf/(dashboard)/dashboard/settings/page.tsx
// Add to the settings menu:

<Link href="/golf/dashboard/settings/coaching-intelligence">
  <GlassCard
    className="group flex items-center gap-4 cursor-pointer"
    padding="md"
    hover
  >
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
      <IconSparkles size={20} className="text-white" />
    </div>
    <div className="flex-1">
      <div className="font-medium text-slate-900">Coaching Intelligence</div>
      <div className="text-sm text-slate-500">Configure how CoachHelm analyzes your team</div>
    </div>
    <IconChevronRight size={20} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
  </GlassCard>
</Link>
```

---

# 3. Feature 2: Player Goals & Preferences

## 3.1 Overview

Players set goals and preferences that personalize how CoachHelm works for them. Goals are tracked, progress is visualized, and insights are calibrated to what matters to each player.

**Location:** `/golf/dashboard/settings/goals` (for players)

**Access:** Player role only

## 3.2 Database Schema

```sql
-- Player Goals
CREATE TABLE golf_player_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  
  goal_type TEXT NOT NULL CHECK (goal_type IN (
    'make_travel_roster', 
    'improve_scoring_average', 
    'improve_handicap',
    'improve_specific_stat', 
    'peak_for_event', 
    'earn_starting_spot', 
    'custom'
  )),
  priority TEXT NOT NULL DEFAULT 'secondary' CHECK (priority IN ('primary', 'secondary')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'abandoned')),
  
  -- Target details (flexible JSON)
  target JSONB NOT NULL,
  -- Example for make_travel_roster: { "targetPosition": 5 }
  -- Example for improve_scoring_average: { "targetValue": 73.0 }
  -- Example for improve_specific_stat: { "statKey": "girPercentage", "targetValue": 55 }
  -- Example for peak_for_event: { "eventId": "uuid", "eventName": "Conference Championship", "targetDate": "2026-03-15" }
  
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

-- Player Preferences
CREATE TABLE golf_player_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE UNIQUE,
  
  -- Focus area preferences
  auto_prioritize_focus_areas BOOLEAN NOT NULL DEFAULT TRUE,
  boost_priority JSONB DEFAULT '[]', -- array of category strings
  deprioritize JSONB DEFAULT '[]',   -- array of category strings
  
  -- Practice reminders
  practice_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  practice_reminder_frequency TEXT DEFAULT 'every_other_day' 
    CHECK (practice_reminder_frequency IN ('daily', 'every_other_day', 'weekly')),
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

-- Player Context Flags
CREATE TABLE golf_player_context_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  
  flag_type TEXT NOT NULL CHECK (flag_type IN (
    'swing_change', 
    'equipment_change', 
    'injury_minor', 
    'injury_major',
    'personal_situation', 
    'peak_target', 
    'development_mode', 
    'confidence_building'
  )),
  
  title TEXT NOT NULL,
  description TEXT,
  
  -- Dates
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_end_date DATE,
  
  -- Impact on intelligence
  suppress_decline_alerts BOOLEAN NOT NULL DEFAULT FALSE,
  adjust_expectations_percent INTEGER DEFAULT 0,
  
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

-- RLS Policies
ALTER TABLE golf_player_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_player_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_player_context_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can manage their own goals"
  ON golf_player_goals
  FOR ALL
  USING (
    player_id IN (
      SELECT id FROM golf_players WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can view team player goals"
  ON golf_player_goals
  FOR SELECT
  USING (
    player_id IN (
      SELECT p.id FROM golf_players p
      JOIN golf_coaches c ON c.team_id = p.team_id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "Players can manage their own preferences"
  ON golf_player_preferences
  FOR ALL
  USING (
    player_id IN (
      SELECT id FROM golf_players WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Players can manage their own context flags"
  ON golf_player_context_flags
  FOR ALL
  USING (
    player_id IN (
      SELECT id FROM golf_players WHERE user_id = auth.uid()
    )
    OR 
    added_by IN (
      SELECT id FROM golf_coaches WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can add context flags to team players"
  ON golf_player_context_flags
  FOR INSERT
  WITH CHECK (
    player_id IN (
      SELECT p.id FROM golf_players p
      JOIN golf_coaches c ON c.team_id = p.team_id
      WHERE c.user_id = auth.uid()
    )
  );
```

## 3.3 TypeScript Types

```typescript
// Add to src/lib/coachhelm/types.ts

export interface PlayerGoal {
  id: string;
  playerId: string;
  goalType: GoalType;
  priority: 'primary' | 'secondary';
  status: 'active' | 'achieved' | 'abandoned';
  target: GoalTarget;
  startingValue: number | null;
  currentValue: number | null;
  targetValue: number | null;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  achievedAt: string | null;
  
  // Computed fields
  progressPercentage?: number;
  onTrack?: boolean;
  projectedCompletion?: string | null;
}

export type GoalType = 
  | 'make_travel_roster'
  | 'improve_scoring_average'
  | 'improve_handicap'
  | 'improve_specific_stat'
  | 'peak_for_event'
  | 'earn_starting_spot'
  | 'custom';

export type GoalTarget = 
  | { type: 'roster_position'; targetPosition: number }
  | { type: 'scoring_average'; targetValue: number }
  | { type: 'handicap'; targetValue: number }
  | { type: 'stat'; statKey: string; statLabel: string; targetValue: number }
  | { type: 'event'; eventId: string; eventName: string; targetDate: string }
  | { type: 'custom'; description: string; metric: string; targetValue: number };

export interface PlayerPreferences {
  id: string;
  playerId: string;
  
  // Focus area preferences
  autoPrioritizeFocusAreas: boolean;
  boostPriority: string[];
  deprioritize: string[];
  
  // Practice reminders
  practiceRemindersEnabled: boolean;
  practiceReminderFrequency: 'daily' | 'every_other_day' | 'weekly';
  practiceReminderTime: string;
  includeDrillsInReminders: boolean;
  includeProgressInReminders: boolean;
  
  // Round review preferences
  reviewShowGoalImpact: boolean;
  reviewShowHighlights: boolean;
  reviewShowAreasToReview: boolean;
  reviewShowPatterns: boolean;
  reviewShowStatsComparison: boolean;
  reviewShowNextPriority: boolean;
  autoShareReviewsWithCoach: boolean;
  
  createdAt: string;
  updatedAt: string;
}

export interface ContextFlag {
  id: string;
  playerId: string;
  flagType: ContextFlagType;
  title: string;
  description: string | null;
  startDate: string;
  expectedEndDate: string | null;
  suppressDeclineAlerts: boolean;
  adjustExpectationsPercent: number;
  addedByCoach: boolean;
  addedBy: string | null;
  status: 'active' | 'resolved' | 'expired';
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export type ContextFlagType = 
  | 'swing_change'
  | 'equipment_change'
  | 'injury_minor'
  | 'injury_major'
  | 'personal_situation'
  | 'peak_target'
  | 'development_mode'
  | 'confidence_building';

export const CONTEXT_FLAG_CONFIG: Record<ContextFlagType, {
  label: string;
  icon: string;
  description: string;
  defaultSuppressAlerts: boolean;
  defaultAdjustment: number;
}> = {
  swing_change: {
    label: 'Swing Change',
    icon: '🔧',
    description: 'Working on swing mechanics',
    defaultSuppressAlerts: true,
    defaultAdjustment: 0,
  },
  equipment_change: {
    label: 'Equipment Change',
    icon: '🏌️',
    description: 'New clubs, ball, or equipment',
    defaultSuppressAlerts: false,
    defaultAdjustment: 0,
  },
  injury_minor: {
    label: 'Minor Injury',
    icon: '🩹',
    description: 'Playing through minor injury',
    defaultSuppressAlerts: false,
    defaultAdjustment: -10,
  },
  injury_major: {
    label: 'Major Injury',
    icon: '🏥',
    description: 'Significant injury affecting play',
    defaultSuppressAlerts: true,
    defaultAdjustment: -25,
  },
  personal_situation: {
    label: 'Personal Situation',
    icon: '💭',
    description: 'Personal matters affecting focus',
    defaultSuppressAlerts: false,
    defaultAdjustment: 0,
  },
  peak_target: {
    label: 'Peak Target',
    icon: '🎯',
    description: 'Building toward a specific event',
    defaultSuppressAlerts: false,
    defaultAdjustment: 0,
  },
  development_mode: {
    label: 'Development Mode',
    icon: '📈',
    description: 'Focus on long-term growth over short-term results',
    defaultSuppressAlerts: true,
    defaultAdjustment: 0,
  },
  confidence_building: {
    label: 'Confidence Building',
    icon: '💪',
    description: 'Prioritize positive reinforcement',
    defaultSuppressAlerts: false,
    defaultAdjustment: 0,
  },
};

export const GOAL_TYPE_CONFIG: Record<GoalType, {
  label: string;
  icon: string;
  description: string;
}> = {
  make_travel_roster: {
    label: 'Make Travel Roster',
    icon: '✈️',
    description: 'Earn a spot on the travel team',
  },
  improve_scoring_average: {
    label: 'Improve Scoring Average',
    icon: '📉',
    description: 'Lower your scoring average',
  },
  improve_handicap: {
    label: 'Improve Handicap',
    icon: '🎯',
    description: 'Lower your handicap index',
  },
  improve_specific_stat: {
    label: 'Improve Specific Stat',
    icon: '📊',
    description: 'Target a specific performance metric',
  },
  peak_for_event: {
    label: 'Peak for Event',
    icon: '🏆',
    description: 'Peak performance for a specific tournament',
  },
  earn_starting_spot: {
    label: 'Earn Starting Spot',
    icon: '⭐',
    description: 'Become a consistent starter',
  },
  custom: {
    label: 'Custom Goal',
    icon: '✨',
    description: 'Define your own goal',
  },
};
```

## 3.4 Goal Card Component

```typescript
// src/components/golf/coachhelm/goals/GoalCard.tsx

'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { IconCheck, IconTrash, IconEdit, IconTrendingUp, IconTrendingDown } from '@/components/icons';
import { PlayerGoal, GOAL_TYPE_CONFIG } from '@/lib/coachhelm/types';
import { GoalProgressBar } from './GoalProgressBar';

interface GoalCardProps {
  goal: PlayerGoal;
  onEdit?: () => void;
  onMarkAchieved?: () => void;
  onRemove?: () => void;
  variant?: 'primary' | 'secondary';
}

export function GoalCard({ 
  goal, 
  onEdit, 
  onMarkAchieved, 
  onRemove,
  variant = 'secondary' 
}: GoalCardProps) {
  const config = GOAL_TYPE_CONFIG[goal.goalType];
  
  const progress = useMemo(() => {
    if (goal.startingValue === null || goal.currentValue === null || goal.targetValue === null) {
      return null;
    }
    
    const totalChange = goal.targetValue - goal.startingValue;
    const currentChange = goal.currentValue - goal.startingValue;
    
    if (totalChange === 0) return goal.currentValue === goal.targetValue ? 100 : 0;
    
    return Math.min(100, Math.max(0, (currentChange / totalChange) * 100));
  }, [goal.startingValue, goal.currentValue, goal.targetValue]);
  
  const isImproving = goal.currentValue !== null && goal.startingValue !== null && 
    ((goal.targetValue ?? 0) < goal.startingValue 
      ? goal.currentValue < goal.startingValue 
      : goal.currentValue > goal.startingValue);
  
  const targetDescription = useMemo(() => {
    const target = goal.target as any;
    switch (target.type) {
      case 'roster_position':
        return `Top ${target.targetPosition}`;
      case 'scoring_average':
        return target.targetValue.toFixed(1);
      case 'handicap':
        return target.targetValue.toFixed(1);
      case 'stat':
        return `${target.targetValue}${target.statKey.includes('Percentage') || target.statKey.includes('Pct') ? '%' : ''}`;
      case 'event':
        return target.eventName;
      default:
        return goal.targetValue?.toString() ?? '';
    }
  }, [goal.target, goal.targetValue]);
  
  return (
    <div 
      className={cn(
        'relative rounded-2xl border p-5 transition-all duration-200',
        variant === 'primary' 
          ? 'bg-gradient-to-br from-green-50 to-white border-green-200' 
          : 'bg-white/70 border-white/40 hover:bg-white/90',
        goal.status === 'achieved' && 'bg-green-50 border-green-200'
      )}
      style={{
        animation: 'fadeInUp 0.4s ease-out both',
      }}
    >
      {/* Badge for primary */}
      {variant === 'primary' && (
        <div className="absolute -top-2 left-4 px-2 py-0.5 bg-green-500 text-white text-xs font-medium rounded-full">
          Primary Goal
        </div>
      )}
      
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="text-2xl">{config.icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900">{config.label}</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Target: {targetDescription}
            {goal.deadline && ` by ${new Date(goal.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
          </p>
        </div>
        
        {/* Status badge */}
        {goal.status === 'achieved' && (
          <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            <IconCheck size={12} />
            Achieved
          </div>
        )}
      </div>
      
      {/* Progress */}
      {progress !== null && goal.status === 'active' && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-600">
              Current: <span className="font-semibold text-slate-900">{goal.currentValue?.toFixed(1)}</span>
            </span>
            <span className={cn(
              'flex items-center gap-1',
              isImproving ? 'text-green-600' : 'text-slate-400'
            )}>
              {isImproving ? <IconTrendingUp size={14} /> : <IconTrendingDown size={14} />}
              {progress.toFixed(0)}%
            </span>
          </div>
          <GoalProgressBar progress={progress} />
        </div>
      )}
      
      {/* Gap info for roster goals */}
      {goal.goalType === 'make_travel_roster' && goal.status === 'active' && (
        <div className="text-sm text-slate-600 mb-4">
          <span className="font-medium">Gap to target:</span> {Math.abs((goal.currentValue ?? 0) - (goal.targetValue ?? 0)).toFixed(1)} strokes
        </div>
      )}
      
      {/* Actions */}
      {goal.status === 'active' && (
        <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
          {onEdit && (
            <button 
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <IconEdit size={14} />
              Edit
            </button>
          )}
          {onMarkAchieved && (
            <button 
              onClick={onMarkAchieved}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
            >
              <IconCheck size={14} />
              Mark Achieved
            </button>
          )}
          {onRemove && (
            <button 
              onClick={onRemove}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-auto"
            >
              <IconTrash size={14} />
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

## 3.5 Goal Progress Bar Component

```typescript
// src/components/golf/coachhelm/goals/GoalProgressBar.tsx

'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface GoalProgressBarProps {
  progress: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

export function GoalProgressBar({ 
  progress, 
  showLabel = false,
  size = 'md',
  animated = true 
}: GoalProgressBarProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  
  useEffect(() => {
    if (animated) {
      // Animate progress bar fill
      const timer = setTimeout(() => {
        setAnimatedProgress(progress);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setAnimatedProgress(progress);
    }
  }, [progress, animated]);
  
  const heights = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  };
  
  return (
    <div className="w-full">
      <div className={cn('w-full bg-slate-100 rounded-full overflow-hidden', heights[size])}>
        <div 
          className={cn(
            'h-full rounded-full transition-all duration-700 ease-out',
            progress >= 100 
              ? 'bg-gradient-to-r from-green-400 to-green-500' 
              : progress >= 50 
                ? 'bg-gradient-to-r from-green-400 to-green-500' 
                : 'bg-gradient-to-r from-amber-400 to-amber-500'
          )}
          style={{ 
            width: `${animatedProgress}%`,
            // Add momentum overshoot effect
            transform: animated ? `scaleX(${animatedProgress > 0 ? 1 : 0})` : undefined,
          }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>0%</span>
          <span>100%</span>
        </div>
      )}
    </div>
  );
}
```

## 3.6 Context Flag Card Component

```typescript
// src/components/golf/coachhelm/goals/ContextFlagCard.tsx

'use client';

import { cn } from '@/lib/utils';
import { IconX, IconCalendar } from '@/components/icons';
import { ContextFlag, CONTEXT_FLAG_CONFIG } from '@/lib/coachhelm/types';

interface ContextFlagCardProps {
  flag: ContextFlag;
  onRemove?: () => void;
  onResolve?: () => void;
  compact?: boolean;
}

export function ContextFlagCard({ flag, onRemove, onResolve, compact = false }: ContextFlagCardProps) {
  const config = CONTEXT_FLAG_CONFIG[flag.flagType];
  
  const daysActive = Math.floor(
    (new Date().getTime() - new Date(flag.startDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  
  const daysRemaining = flag.expectedEndDate 
    ? Math.floor((new Date(flag.expectedEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;
  
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
        <span>{config.icon}</span>
        <span className="text-sm font-medium text-amber-800">{flag.title}</span>
        {onRemove && (
          <button onClick={onRemove} className="ml-auto p-1 hover:bg-amber-100 rounded">
            <IconX size={14} className="text-amber-600" />
          </button>
        )}
      </div>
    );
  }
  
  return (
    <div 
      className="relative rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4"
      style={{
        animation: 'fadeInUp 0.3s ease-out both',
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="text-2xl">{config.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-slate-900">{flag.title}</h4>
            {flag.addedByCoach && (
              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                Coach Added
              </span>
            )}
          </div>
          {flag.description && (
            <p className="text-sm text-slate-500 mt-0.5">{flag.description}</p>
          )}
        </div>
        
        {onRemove && (
          <button 
            onClick={onRemove}
            className="p-1.5 hover:bg-amber-100 rounded-lg transition-colors"
          >
            <IconX size={16} className="text-slate-400" />
          </button>
        )}
      </div>
      
      {/* Timeline */}
      <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <IconCalendar size={12} />
          <span>Active {daysActive} days</span>
        </div>
        {flag.expectedEndDate && daysRemaining !== null && (
          <div className={cn(
            daysRemaining < 0 ? 'text-red-500' : daysRemaining < 7 ? 'text-amber-600' : ''
          )}>
            {daysRemaining < 0 
              ? `${Math.abs(daysRemaining)} days overdue` 
              : `${daysRemaining} days remaining`
            }
          </div>
        )}
      </div>
      
      {/* Impact note */}
      <div className="mt-3 p-2 bg-white/60 rounded-lg text-xs text-slate-600">
        <span className="text-slate-500">Impact:</span>{' '}
        {flag.suppressDeclineAlerts 
          ? 'Performance decline alerts suppressed. '
          : ''
        }
        {flag.adjustExpectationsPercent !== 0 
          ? `Expectations adjusted by ${flag.adjustExpectationsPercent}%.`
          : ''
        }
        {!flag.suppressDeclineAlerts && flag.adjustExpectationsPercent === 0 
          ? 'CoachHelm will note this context in insights.'
          : ''
        }
      </div>
      
      {/* Actions */}
      {onResolve && (
        <button
          onClick={onResolve}
          className="mt-3 w-full py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
        >
          Mark as Resolved
        </button>
      )}
    </div>
  );
}
```

## 3.7 Add Goal Modal Component

```typescript
// src/components/golf/coachhelm/goals/AddGoalModal.tsx

'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { IconX, IconChevronRight } from '@/components/icons';
import { GoalType, GOAL_TYPE_CONFIG, GoalTarget } from '@/lib/coachhelm/types';

interface AddGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (goal: {
    goalType: GoalType;
    priority: 'primary' | 'secondary';
    target: GoalTarget;
    targetValue: number;
    deadline?: string;
  }) => void;
  existingPrimaryGoal?: boolean;
}

type Step = 'type' | 'details' | 'confirm';

export function AddGoalModal({ isOpen, onClose, onSubmit, existingPrimaryGoal }: AddGoalModalProps) {
  const [step, setStep] = useState<Step>('type');
  const [selectedType, setSelectedType] = useState<GoalType | null>(null);
  const [priority, setPriority] = useState<'primary' | 'secondary'>('secondary');
  const [targetValue, setTargetValue] = useState<number>(0);
  const [deadline, setDeadline] = useState<string>('');
  const [customDescription, setCustomDescription] = useState('');
  const [selectedStat, setSelectedStat] = useState<string>('');
  
  if (!isOpen) return null;
  
  const handleTypeSelect = (type: GoalType) => {
    setSelectedType(type);
    setStep('details');
  };
  
  const handleSubmit = () => {
    if (!selectedType) return;
    
    let target: GoalTarget;
    
    switch (selectedType) {
      case 'make_travel_roster':
        target = { type: 'roster_position', targetPosition: targetValue };
        break;
      case 'improve_scoring_average':
        target = { type: 'scoring_average', targetValue };
        break;
      case 'improve_handicap':
        target = { type: 'handicap', targetValue };
        break;
      case 'improve_specific_stat':
        target = { type: 'stat', statKey: selectedStat, statLabel: selectedStat, targetValue };
        break;
      default:
        target = { type: 'custom', description: customDescription, metric: '', targetValue };
    }
    
    onSubmit({
      goalType: selectedType,
      priority,
      target,
      targetValue,
      deadline: deadline || undefined,
    });
    
    // Reset
    setStep('type');
    setSelectedType(null);
    setPriority('secondary');
    setTargetValue(0);
    setDeadline('');
    onClose();
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div 
        className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{
          animation: 'scaleIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">
            {step === 'type' && 'Add New Goal'}
            {step === 'details' && GOAL_TYPE_CONFIG[selectedType!]?.label}
            {step === 'confirm' && 'Confirm Goal'}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <IconX size={20} className="text-slate-400" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6">
          {step === 'type' && (
            <div className="space-y-2">
              {(Object.entries(GOAL_TYPE_CONFIG) as [GoalType, typeof GOAL_TYPE_CONFIG[GoalType]][]).map(([type, config]) => (
                <button
                  key={type}
                  onClick={() => handleTypeSelect(type)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-green-300 hover:bg-green-50 transition-all duration-150 text-left group"
                >
                  <span className="text-2xl">{config.icon}</span>
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">{config.label}</div>
                    <div className="text-sm text-slate-500">{config.description}</div>
                  </div>
                  <IconChevronRight 
                    size={20} 
                    className="text-slate-300 group-hover:text-green-500 transition-colors" 
                  />
                </button>
              ))}
            </div>
          )}
          
          {step === 'details' && selectedType && (
            <div className="space-y-6">
              {/* Priority selection */}
              {!existingPrimaryGoal && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Goal Priority
                  </label>
                  <div className="flex gap-2">
                    {(['primary', 'secondary'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPriority(p)}
                        className={cn(
                          'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors capitalize',
                          priority === p
                            ? 'bg-green-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Target value input - varies by goal type */}
              {selectedType === 'make_travel_roster' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Target Position
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={targetValue || ''}
                    onChange={(e) => setTargetValue(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 outline-none"
                    placeholder="e.g., 5 for Top 5"
                  />
                </div>
              )}
              
              {selectedType === 'improve_scoring_average' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Target Scoring Average
                  </label>
                  <input
                    type="number"
                    step={0.1}
                    value={targetValue || ''}
                    onChange={(e) => setTargetValue(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 outline-none"
                    placeholder="e.g., 73.0"
                  />
                </div>
              )}
              
              {selectedType === 'improve_specific_stat' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Select Stat
                    </label>
                    <select
                      value={selectedStat}
                      onChange={(e) => setSelectedStat(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 outline-none"
                    >
                      <option value="">Choose a stat...</option>
                      <option value="girPercentage">GIR %</option>
                      <option value="fairwayPercentage">Fairway %</option>
                      <option value="puttsPerRound">Putts per Round</option>
                      <option value="scramblingPercentage">Scrambling %</option>
                      <option value="sandSavePercentage">Sand Save %</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Target Value
                    </label>
                    <input
                      type="number"
                      step={selectedStat.includes('Percentage') ? 1 : 0.1}
                      value={targetValue || ''}
                      onChange={(e) => setTargetValue(parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 outline-none"
                      placeholder={selectedStat.includes('Percentage') ? 'e.g., 55' : 'e.g., 30.5'}
                    />
                  </div>
                </>
              )}
              
              {/* Deadline */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Target Date (optional)
                </label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 outline-none"
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50">
          {step === 'details' && (
            <>
              <button
                onClick={() => setStep('type')}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!targetValue}
                className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add Goal
              </button>
            </>
          )}
          
          {step === 'type' && (
            <button
              onClick={onClose}
              className="ml-auto px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

This is getting quite long. Let me continue with the remaining features in a separate file to keep things organized. Should I continue with:

- **Feature 4: Focus Areas** (the player-facing improvement priorities)
- **Feature 5: Attention Alerts** (the coach-facing proactive notifications)
- **Feature 6: Round Review** (post-round analysis)
- **Feature 7: Compare Tool** (player comparison for roster decisions)

Which feature would you like me to detail next, or should I continue with all of them in sequence?