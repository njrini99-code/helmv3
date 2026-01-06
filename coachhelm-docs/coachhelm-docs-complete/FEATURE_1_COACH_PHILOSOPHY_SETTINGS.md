# CoachHelm Feature 1: Coach Philosophy Settings

## Complete Implementation Specification

---

## What This Feature Does

Coaches configure their coaching philosophy. This affects how CoachHelm:
- Prioritizes which stats matter most
- Decides when to surface alerts
- Weights player comparisons
- Generates insights

**This is the foundation. Build this first.**

---

## Files to Create

```
src/
├── app/golf/(dashboard)/dashboard/settings/
│   └── coaching-intelligence/
│       └── page.tsx                          # Main settings page
│
├── components/golf/coachhelm/
│   └── settings/
│       ├── index.ts                          # Barrel export
│       ├── PriorityRanker.tsx               # Drag-to-reorder priorities
│       ├── SensitivitySlider.tsx            # 3-way sensitivity toggle
│       ├── ThresholdSlider.tsx              # Numeric threshold sliders
│       ├── WeightDistributor.tsx            # Percentage weight bars
│       └── AlertTypeToggles.tsx             # Checkbox groups
│
├── hooks/coachhelm/
│   └── useCoachPhilosophy.ts                # Data fetching hook
│
├── lib/coachhelm/
│   ├── types.ts                             # TypeScript types
│   └── constants.ts                         # Default values
│
└── supabase/migrations/
    └── XXX_create_coach_philosophy.sql      # Database migration
```

---

## Step 1: Database Migration

Create file: `supabase/migrations/030_create_coach_philosophy.sql`

```sql
-- ============================================================================
-- COACH PHILOSOPHY SETTINGS
-- ============================================================================

CREATE TABLE golf_coach_philosophy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES golf_coaches(id) ON DELETE CASCADE UNIQUE,
  
  -- Priority metrics (1 = highest priority, 5 = lowest)
  priority_ball_striking INTEGER NOT NULL DEFAULT 1 
    CHECK (priority_ball_striking BETWEEN 1 AND 5),
  priority_short_game INTEGER NOT NULL DEFAULT 3 
    CHECK (priority_short_game BETWEEN 1 AND 5),
  priority_putting INTEGER NOT NULL DEFAULT 2 
    CHECK (priority_putting BETWEEN 1 AND 5),
  priority_course_management INTEGER NOT NULL DEFAULT 4 
    CHECK (priority_course_management BETWEEN 1 AND 5),
  priority_mental_game INTEGER NOT NULL DEFAULT 5 
    CHECK (priority_mental_game BETWEEN 1 AND 5),
  
  -- Alert sensitivity: aggressive | balanced | conservative
  alert_sensitivity TEXT NOT NULL DEFAULT 'balanced' 
    CHECK (alert_sensitivity IN ('aggressive', 'balanced', 'conservative')),
  
  -- Numeric thresholds
  decline_threshold DECIMAL(3,1) NOT NULL DEFAULT 2.0,      -- strokes over 5 rounds
  pressure_gap_threshold DECIMAL(3,1) NOT NULL DEFAULT 2.5, -- tournament vs practice
  bubble_zone_range DECIMAL(3,1) NOT NULL DEFAULT 1.0,      -- strokes from cutoff
  
  -- Comparison weights (must sum to 100)
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
  alert_closing_holes BOOLEAN NOT NULL DEFAULT FALSE,
  alert_par_3_issues BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Display preferences
  show_strokes_gained BOOLEAN NOT NULL DEFAULT TRUE,
  show_advanced_stats BOOLEAN NOT NULL DEFAULT TRUE,
  insight_verbosity TEXT NOT NULL DEFAULT 'detailed' 
    CHECK (insight_verbosity IN ('brief', 'detailed')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update timestamp
CREATE TRIGGER update_golf_coach_philosophy_timestamp
  BEFORE UPDATE ON golf_coach_philosophy
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- RLS
ALTER TABLE golf_coach_philosophy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage own philosophy"
  ON golf_coach_philosophy FOR ALL
  USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));
```

Run: `npx supabase db push` or add to your migration queue.

---

## Step 2: TypeScript Types

Create file: `src/lib/coachhelm/types.ts`

```typescript
// ============================================================================
// COACH PHILOSOPHY TYPES
// ============================================================================

export interface CoachPhilosophy {
  id: string;
  coachId: string;
  
  // Priorities (1-5, 1 = most important)
  priorityBallStriking: number;
  priorityShortGame: number;
  priorityPutting: number;
  priorityCourseManagement: number;
  priorityMentalGame: number;
  
  // Sensitivity
  alertSensitivity: 'aggressive' | 'balanced' | 'conservative';
  
  // Thresholds
  declineThreshold: number;
  pressureGapThreshold: number;
  bubbleZoneRange: number;
  
  // Weights (sum to 100)
  weightHistorical: number;
  weightRecentForm: number;
  weightTournament: number;
  weightQualifying: number;
  weightSubjective: number;
  
  // Alert toggles
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
  
  // Display
  showStrokesGained: boolean;
  showAdvancedStats: boolean;
  insightVerbosity: 'brief' | 'detailed';
  
  createdAt: string;
  updatedAt: string;
}

// For the priority ranker UI
export interface PriorityMetric {
  key: 'priorityBallStriking' | 'priorityShortGame' | 'priorityPutting' | 'priorityCourseManagement' | 'priorityMentalGame';
  label: string;
  description: string;
  icon: string;
}

export const PRIORITY_METRICS: PriorityMetric[] = [
  {
    key: 'priorityBallStriking',
    label: 'Ball Striking',
    description: 'Fairways, GIR, approach proximity',
    icon: '🎯',
  },
  {
    key: 'priorityShortGame',
    label: 'Short Game',
    description: 'Scrambling, sand saves, up-and-down',
    icon: '⛳',
  },
  {
    key: 'priorityPutting',
    label: 'Putting',
    description: 'Putts per round, make %, 3-putt avoidance',
    icon: '🏌️',
  },
  {
    key: 'priorityCourseManagement',
    label: 'Course Management',
    description: 'Penalty avoidance, smart misses',
    icon: '🗺️',
  },
  {
    key: 'priorityMentalGame',
    label: 'Mental Game',
    description: 'Tournament performance, closing holes',
    icon: '🧠',
  },
];

// Alert type groupings for the UI
export interface AlertGroup {
  title: string;
  alerts: {
    key: keyof CoachPhilosophy;
    label: string;
  }[];
}

export const ALERT_GROUPS: AlertGroup[] = [
  {
    title: 'Performance',
    alerts: [
      { key: 'alertScoringDecline', label: 'Scoring decline' },
      { key: 'alertStatRegression', label: 'Stat regression' },
      { key: 'alertTournamentPressure', label: 'Tournament pressure gap' },
      { key: 'alertPlateau', label: 'Performance plateau' },
    ],
  },
  {
    title: 'Roster & Qualifying',
    alerts: [
      { key: 'alertBubblePlayer', label: 'Bubble player movement' },
      { key: 'alertSurgePlayer', label: 'Surge player (rapid improvement)' },
      { key: 'alertStreaks', label: 'Hot/cold streaks' },
    ],
  },
  {
    title: 'Patterns',
    alerts: [
      { key: 'alertRecurringWeakness', label: 'Recurring weaknesses' },
      { key: 'alertClosingHoles', label: 'Closing hole problems' },
      { key: 'alertPar3Issues', label: 'Par 3 scoring issues' },
    ],
  },
];
```

---

## Step 3: Constants

Create file: `src/lib/coachhelm/constants.ts`

```typescript
export const PHILOSOPHY_DEFAULTS = {
  priorityBallStriking: 1,
  priorityShortGame: 3,
  priorityPutting: 2,
  priorityCourseManagement: 4,
  priorityMentalGame: 5,
  alertSensitivity: 'balanced' as const,
  declineThreshold: 2.0,
  pressureGapThreshold: 2.5,
  bubbleZoneRange: 1.0,
  weightHistorical: 35,
  weightRecentForm: 30,
  weightTournament: 20,
  weightQualifying: 10,
  weightSubjective: 5,
};

export const THRESHOLD_RANGES = {
  declineThreshold: { min: 1.0, max: 4.0, step: 0.5 },
  pressureGapThreshold: { min: 1.0, max: 4.0, step: 0.5 },
  bubbleZoneRange: { min: 0.5, max: 3.0, step: 0.5 },
};
```

---

## Step 4: Data Hook

Create file: `src/hooks/coachhelm/useCoachPhilosophy.ts`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CoachPhilosophy } from '@/lib/coachhelm/types';

// Map database snake_case to TypeScript camelCase
function dbToTs(row: any): CoachPhilosophy {
  return {
    id: row.id,
    coachId: row.coach_id,
    priorityBallStriking: row.priority_ball_striking,
    priorityShortGame: row.priority_short_game,
    priorityPutting: row.priority_putting,
    priorityCourseManagement: row.priority_course_management,
    priorityMentalGame: row.priority_mental_game,
    alertSensitivity: row.alert_sensitivity,
    declineThreshold: parseFloat(row.decline_threshold),
    pressureGapThreshold: parseFloat(row.pressure_gap_threshold),
    bubbleZoneRange: parseFloat(row.bubble_zone_range),
    weightHistorical: row.weight_historical,
    weightRecentForm: row.weight_recent_form,
    weightTournament: row.weight_tournament,
    weightQualifying: row.weight_qualifying,
    weightSubjective: row.weight_subjective,
    alertScoringDecline: row.alert_scoring_decline,
    alertStatRegression: row.alert_stat_regression,
    alertTournamentPressure: row.alert_tournament_pressure,
    alertPlateau: row.alert_plateau,
    alertBubblePlayer: row.alert_bubble_player,
    alertSurgePlayer: row.alert_surge_player,
    alertStreaks: row.alert_streaks,
    alertRecurringWeakness: row.alert_recurring_weakness,
    alertClosingHoles: row.alert_closing_holes,
    alertPar3Issues: row.alert_par_3_issues,
    showStrokesGained: row.show_strokes_gained,
    showAdvancedStats: row.show_advanced_stats,
    insightVerbosity: row.insight_verbosity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Map TypeScript camelCase to database snake_case
function tsToDb(data: Partial<CoachPhilosophy>): Record<string, any> {
  const mapping: Record<string, string> = {
    priorityBallStriking: 'priority_ball_striking',
    priorityShortGame: 'priority_short_game',
    priorityPutting: 'priority_putting',
    priorityCourseManagement: 'priority_course_management',
    priorityMentalGame: 'priority_mental_game',
    alertSensitivity: 'alert_sensitivity',
    declineThreshold: 'decline_threshold',
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
    showStrokesGained: 'show_strokes_gained',
    showAdvancedStats: 'show_advanced_stats',
    insightVerbosity: 'insight_verbosity',
  };

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const dbKey = mapping[key];
    if (dbKey) result[dbKey] = value;
  }
  return result;
}

export function useCoachPhilosophy(coachId: string | null) {
  const [philosophy, setPhilosophy] = useState<CoachPhilosophy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch on mount
  useEffect(() => {
    if (!coachId) {
      setLoading(false);
      return;
    }

    async function fetch() {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('golf_coach_philosophy')
        .select('*')
        .eq('coach_id', coachId)
        .maybeSingle();

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      if (data) {
        setPhilosophy(dbToTs(data));
      } else {
        // Create default record
        const { data: newData, error: createError } = await supabase
          .from('golf_coach_philosophy')
          .insert({ coach_id: coachId })
          .select()
          .single();

        if (createError) {
          setError(createError.message);
        } else {
          setPhilosophy(dbToTs(newData));
        }
      }

      setLoading(false);
    }

    fetch();
  }, [coachId, supabase]);

  // Save changes
  const save = useCallback(
    async (updates: Partial<CoachPhilosophy>) => {
      if (!philosophy?.id) return;

      setSaving(true);
      setError(null);

      const { data, error: updateError } = await supabase
        .from('golf_coach_philosophy')
        .update(tsToDb(updates))
        .eq('id', philosophy.id)
        .select()
        .single();

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return false;
      }

      setPhilosophy(dbToTs(data));
      setSaving(false);
      return true;
    },
    [philosophy?.id, supabase]
  );

  return { philosophy, loading, saving, error, save };
}
```

---

## Step 5: UI Components

### 5.1 Priority Ranker (Drag & Drop)

Create file: `src/components/golf/coachhelm/settings/PriorityRanker.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { PRIORITY_METRICS, PriorityMetric, CoachPhilosophy } from '@/lib/coachhelm/types';

// Types for the component
type PriorityKeys = 'priorityBallStriking' | 'priorityShortGame' | 'priorityPutting' | 'priorityCourseManagement' | 'priorityMentalGame';
type PriorityValues = Pick<CoachPhilosophy, PriorityKeys>;

interface PriorityRankerProps {
  values: PriorityValues;
  onChange: (values: PriorityValues) => void;
}

// Single draggable item
function SortableItem({ metric, rank }: { metric: PriorityMetric; rank: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: metric.key,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-4 p-4 rounded-xl border bg-white transition-all duration-150',
        isDragging
          ? 'shadow-xl border-green-300 scale-[1.02] z-10 relative'
          : 'border-slate-200 hover:border-slate-300'
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="p-1 rounded hover:bg-slate-100 cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-slate-400">
          <path d="M4 6h8M4 10h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Rank badge */}
      <div
        className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold',
          rank === 1 && 'bg-green-100 text-green-700',
          rank === 2 && 'bg-green-50 text-green-600',
          rank === 3 && 'bg-slate-100 text-slate-600',
          rank === 4 && 'bg-slate-50 text-slate-500',
          rank === 5 && 'bg-slate-50 text-slate-400'
        )}
      >
        {rank}
      </div>

      {/* Icon */}
      <span className="text-xl">{metric.icon}</span>

      {/* Label & description */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-900 text-sm">{metric.label}</div>
        <div className="text-xs text-slate-500 truncate">{metric.description}</div>
      </div>

      {/* Priority bar */}
      <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-300"
          style={{ width: `${(6 - rank) * 20}%` }}
        />
      </div>
    </div>
  );
}

export function PriorityRanker({ values, onChange }: PriorityRankerProps) {
  // Sort metrics by their current priority values to get initial order
  const getOrderFromValues = (vals: PriorityValues): PriorityKeys[] => {
    return [...PRIORITY_METRICS]
      .sort((a, b) => vals[a.key] - vals[b.key])
      .map((m) => m.key);
  };

  const [items, setItems] = useState<PriorityKeys[]>(() => getOrderFromValues(values));

  // Sync if values change externally
  useEffect(() => {
    setItems(getOrderFromValues(values));
  }, [values]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.indexOf(active.id as PriorityKeys);
    const newIndex = items.indexOf(over.id as PriorityKeys);
    const newItems = arrayMove(items, oldIndex, newIndex);

    setItems(newItems);

    // Convert order to priority values (index + 1)
    const newValues = {} as PriorityValues;
    newItems.forEach((key, index) => {
      newValues[key] = index + 1;
    });

    onChange(newValues);
  }

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {items.map((key, index) => {
            const metric = PRIORITY_METRICS.find((m) => m.key === key)!;
            return <SortableItem key={key} metric={metric} rank={index + 1} />;
          })}
        </SortableContext>
      </DndContext>
    </div>
  );
}
```

**Required package:** `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

---

### 5.2 Sensitivity Slider

Create file: `src/components/golf/coachhelm/settings/SensitivitySlider.tsx`

```typescript
'use client';

import { cn } from '@/lib/utils';

type Sensitivity = 'aggressive' | 'balanced' | 'conservative';

interface SensitivitySliderProps {
  value: Sensitivity;
  onChange: (value: Sensitivity) => void;
}

const OPTIONS: { value: Sensitivity; label: string; description: string }[] = [
  {
    value: 'aggressive',
    label: 'Aggressive',
    description: 'Surface issues early. May include some false positives.',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Standard thresholds. Good balance of signal to noise.',
  },
  {
    value: 'conservative',
    label: 'Conservative',
    description: 'Only high-confidence issues with strong data backing.',
  },
];

export function SensitivitySlider({ value, onChange }: SensitivitySliderProps) {
  const selectedIndex = OPTIONS.findIndex((o) => o.value === value);

  return (
    <div className="space-y-3">
      {/* Track with sliding indicator */}
      <div className="relative h-11 bg-slate-100 rounded-full p-1">
        {/* Sliding background */}
        <div
          className="absolute top-1 bottom-1 bg-white rounded-full shadow-sm transition-all duration-200 ease-out"
          style={{
            width: 'calc(33.333% - 4px)',
            left: `calc(${selectedIndex * 33.333}% + 2px)`,
          }}
        />

        {/* Buttons */}
        <div className="relative flex h-full">
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex-1 flex items-center justify-center rounded-full text-sm font-medium transition-colors duration-150 z-10',
                value === option.value ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-slate-500 text-center min-h-[40px]">
        {OPTIONS[selectedIndex].description}
      </p>
    </div>
  );
}
```

---

### 5.3 Threshold Slider

Create file: `src/components/golf/coachhelm/settings/ThresholdSlider.tsx`

```typescript
'use client';

import { useId } from 'react';
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
}: ThresholdSliderProps) {
  const id = useId();
  const percentage = ((value - min) / (max - min)) * 100;

  // Generate mark values
  const marks: number[] = [];
  for (let v = min; v <= max; v += step) {
    marks.push(Math.round(v * 10) / 10);
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <label htmlFor={id} className="text-sm font-medium text-slate-900">
            {label}
          </label>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        <div className="text-right">
          <span className="text-lg font-semibold text-slate-900 tabular-nums">
            {value.toFixed(1)}
          </span>
          <span className="text-sm text-slate-500 ml-1">{unit}</span>
        </div>
      </div>

      {/* Slider track */}
      <div className="relative pt-1">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-transparent cursor-pointer appearance-none [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-slate-100 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-green-500 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
        />

        {/* Fill overlay */}
        <div
          className="absolute top-1 left-0 h-2 bg-green-500 rounded-full pointer-events-none"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Marks */}
      <div className="flex justify-between px-2">
        {marks.map((mark) => (
          <button
            key={mark}
            type="button"
            onClick={() => onChange(mark)}
            className={cn(
              'text-xs tabular-nums transition-colors',
              Math.abs(value - mark) < step / 2
                ? 'text-green-600 font-semibold'
                : 'text-slate-400 hover:text-slate-600'
            )}
          >
            {mark.toFixed(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
```

---

### 5.4 Weight Distributor

Create file: `src/components/golf/coachhelm/settings/WeightDistributor.tsx`

```typescript
'use client';

import { cn } from '@/lib/utils';
import { CoachPhilosophy } from '@/lib/coachhelm/types';

type WeightKey = 'weightHistorical' | 'weightRecentForm' | 'weightTournament' | 'weightQualifying' | 'weightSubjective';

interface WeightItem {
  key: WeightKey;
  label: string;
}

const WEIGHTS: WeightItem[] = [
  { key: 'weightHistorical', label: 'Historical Performance (full season)' },
  { key: 'weightRecentForm', label: 'Recent Form (last 5 rounds)' },
  { key: 'weightTournament', label: 'Tournament Performance' },
  { key: 'weightQualifying', label: 'Qualifying Performance' },
  { key: 'weightSubjective', label: 'My Subjective Input' },
];

interface WeightDistributorProps {
  values: Pick<CoachPhilosophy, WeightKey>;
  onChange: (values: Pick<CoachPhilosophy, WeightKey>) => void;
}

export function WeightDistributor({ values, onChange }: WeightDistributorProps) {
  const total = WEIGHTS.reduce((sum, w) => sum + values[w.key], 0);
  const isValid = total === 100;

  function handleChange(key: WeightKey, newValue: number) {
    const oldValue = values[key];
    const diff = newValue - oldValue;

    if (diff === 0) return;

    // Get other keys and their total
    const otherKeys = WEIGHTS.filter((w) => w.key !== key).map((w) => w.key);
    const othersTotal = otherKeys.reduce((sum, k) => sum + values[k], 0);

    // Distribute the difference proportionally
    const newValues = { ...values, [key]: newValue };

    if (othersTotal > 0) {
      let remaining = -diff;
      otherKeys.forEach((k, i) => {
        if (i === otherKeys.length - 1) {
          // Last one gets whatever's left to ensure sum is 100
          newValues[k] = Math.max(0, values[k] + remaining);
        } else {
          const proportion = values[k] / othersTotal;
          const adjustment = Math.round(-diff * proportion);
          const adjusted = Math.max(0, Math.min(100, values[k] + adjustment));
          remaining -= adjusted - values[k];
          newValues[k] = adjusted;
        }
      });
    }

    onChange(newValues);
  }

  return (
    <div className="space-y-4">
      {WEIGHTS.map((weight) => (
        <div key={weight.key} className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">{weight.label}</span>
            <span className="font-semibold text-slate-900 tabular-nums w-12 text-right">
              {values[weight.key]}%
            </span>
          </div>

          {/* Slider */}
          <div className="relative h-6">
            <div className="absolute inset-0 bg-slate-100 rounded-lg overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-400 to-green-500 transition-all duration-150"
                style={{ width: `${values[weight.key]}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={values[weight.key]}
              onChange={(e) => handleChange(weight.key, parseInt(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
        </div>
      ))}

      {/* Total */}
      <div
        className={cn(
          'flex items-center justify-between pt-3 border-t border-slate-200 text-sm font-medium',
          isValid ? 'text-green-600' : 'text-red-500'
        )}
      >
        <span>Total</span>
        <span className="tabular-nums">{total}%</span>
      </div>
      {!isValid && (
        <p className="text-xs text-red-500">Weights must add up to 100%</p>
      )}
    </div>
  );
}
```

---

### 5.5 Alert Type Toggles

Create file: `src/components/golf/coachhelm/settings/AlertTypeToggles.tsx`

```typescript
'use client';

import { cn } from '@/lib/utils';
import { CoachPhilosophy, ALERT_GROUPS } from '@/lib/coachhelm/types';

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
            {group.alerts.map((alert) => {
              const isChecked = values[alert.key] as boolean;
              return (
                <label
                  key={alert.key}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-200 hover:border-slate-300 cursor-pointer transition-colors"
                >
                  {/* Checkbox */}
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={isChecked ?? true}
                      onChange={(e) => onChange(alert.key, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div
                      className={cn(
                        'w-5 h-5 rounded border-2 transition-all duration-150 flex items-center justify-center',
                        isChecked
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-slate-300'
                      )}
                    >
                      {isChecked && (
                        <svg
                          className="w-3 h-3 text-white"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2 6l3 3 5-6" />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Label */}
                  <span className="text-sm text-slate-700">{alert.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

### 5.6 Barrel Export

Create file: `src/components/golf/coachhelm/settings/index.ts`

```typescript
export { PriorityRanker } from './PriorityRanker';
export { SensitivitySlider } from './SensitivitySlider';
export { ThresholdSlider } from './ThresholdSlider';
export { WeightDistributor } from './WeightDistributor';
export { AlertTypeToggles } from './AlertTypeToggles';
```

---

## Step 6: Main Settings Page

Create file: `src/app/golf/(dashboard)/dashboard/settings/coaching-intelligence/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useCoachPhilosophy } from '@/hooks/coachhelm/useCoachPhilosophy';
import { CoachPhilosophy } from '@/lib/coachhelm/types';
import { THRESHOLD_RANGES } from '@/lib/coachhelm/constants';
import {
  PriorityRanker,
  SensitivitySlider,
  ThresholdSlider,
  WeightDistributor,
  AlertTypeToggles,
} from '@/components/golf/coachhelm/settings';
import { GlassCard } from '@/components/ui/glass-card';
import { useToast } from '@/components/ui/toast';

export default function CoachingIntelligencePage() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [coachId, setCoachId] = useState<string | null>(null);
  const [localValues, setLocalValues] = useState<Partial<CoachPhilosophy>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Get coach ID on mount
  useEffect(() => {
    async function fetchCoachId() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/golf/login');
        return;
      }

      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!coach) {
        router.push('/golf/dashboard');
        return;
      }

      setCoachId(coach.id);
    }

    fetchCoachId();
  }, [supabase, router]);

  const { philosophy, loading, saving, error, save } = useCoachPhilosophy(coachId);

  // Initialize local values when philosophy loads
  useEffect(() => {
    if (philosophy) {
      setLocalValues(philosophy);
    }
  }, [philosophy]);

  // Update local values
  function update(changes: Partial<CoachPhilosophy>) {
    setLocalValues((prev) => ({ ...prev, ...changes }));
    setHasChanges(true);
  }

  // Save handler
  async function handleSave() {
    const success = await save(localValues);
    if (success) {
      toast({ title: 'Settings saved', description: 'Your preferences have been updated.' });
      setHasChanges(false);
    } else {
      toast({ title: 'Failed to save', description: error || 'Please try again.', variant: 'destructive' });
    }
  }

  if (loading || !localValues.id) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/golf/dashboard/settings"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Settings
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <span className="text-2xl">🧠</span>
              Coaching Intelligence
            </h1>
            <p className="text-slate-500 mt-1">
              Configure how CoachHelm analyzes your team and surfaces insights.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-8">
        {/* Section: Priority */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">My Coaching Philosophy</h2>
          <p className="text-sm text-slate-500 mb-4">
            Drag to reorder what matters most to your program.
          </p>
          <GlassCard padding="lg">
            <PriorityRanker
              values={{
                priorityBallStriking: localValues.priorityBallStriking!,
                priorityShortGame: localValues.priorityShortGame!,
                priorityPutting: localValues.priorityPutting!,
                priorityCourseManagement: localValues.priorityCourseManagement!,
                priorityMentalGame: localValues.priorityMentalGame!,
              }}
              onChange={(values) => update(values)}
            />
          </GlassCard>
        </section>

        {/* Section: Sensitivity */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Alert Sensitivity</h2>
          <p className="text-sm text-slate-500 mb-4">
            How early should CoachHelm flag potential issues?
          </p>
          <GlassCard padding="lg">
            <SensitivitySlider
              value={localValues.alertSensitivity!}
              onChange={(value) => update({ alertSensitivity: value })}
            />
          </GlassCard>
        </section>

        {/* Section: Thresholds */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Alert Thresholds</h2>
          <p className="text-sm text-slate-500 mb-4">
            Fine-tune when CoachHelm considers something noteworthy.
          </p>
          <GlassCard padding="lg" className="space-y-8">
            <ThresholdSlider
              label="Performance Decline"
              description="Alert when scoring increases by this amount over 5 rounds"
              value={localValues.declineThreshold!}
              onChange={(v) => update({ declineThreshold: v })}
              {...THRESHOLD_RANGES.declineThreshold}
              unit="strokes"
            />
            <ThresholdSlider
              label="Tournament Pressure Gap"
              description="Alert when practice-to-tournament gap exceeds this"
              value={localValues.pressureGapThreshold!}
              onChange={(v) => update({ pressureGapThreshold: v })}
              {...THRESHOLD_RANGES.pressureGapThreshold}
              unit="strokes"
            />
            <ThresholdSlider
              label="Bubble Zone Range"
              description="Consider a player 'on the bubble' when within this of cutoff"
              value={localValues.bubbleZoneRange!}
              onChange={(v) => update({ bubbleZoneRange: v })}
              {...THRESHOLD_RANGES.bubbleZoneRange}
              unit="strokes"
            />
          </GlassCard>
        </section>

        {/* Section: Weights */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Comparison Weighting</h2>
          <p className="text-sm text-slate-500 mb-4">
            When comparing players for roster decisions, how much should each factor matter?
          </p>
          <GlassCard padding="lg">
            <WeightDistributor
              values={{
                weightHistorical: localValues.weightHistorical!,
                weightRecentForm: localValues.weightRecentForm!,
                weightTournament: localValues.weightTournament!,
                weightQualifying: localValues.weightQualifying!,
                weightSubjective: localValues.weightSubjective!,
              }}
              onChange={(values) => update(values)}
            />
          </GlassCard>
        </section>

        {/* Section: Alert Types */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Alert Types</h2>
          <p className="text-sm text-slate-500 mb-4">
            Which types of alerts do you want to receive?
          </p>
          <GlassCard padding="lg">
            <AlertTypeToggles
              values={localValues}
              onChange={(key, value) => update({ [key]: value })}
            />
          </GlassCard>
        </section>

        {/* Section: Display */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Display Preferences</h2>
          <GlassCard padding="lg" className="space-y-4">
            {[
              { key: 'showStrokesGained', label: 'Show Strokes Gained metrics' },
              { key: 'showAdvancedStats', label: 'Show advanced statistics' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localValues[key as keyof CoachPhilosophy] as boolean}
                  onChange={(e) => update({ [key]: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm text-slate-700">{label}</span>
              </label>
            ))}

            <div className="pt-4 border-t border-slate-200">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Insight Detail Level
              </label>
              <div className="flex gap-2">
                {(['brief', 'detailed'] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() => update({ insightVerbosity: option })}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors capitalize ${
                      localValues.insightVerbosity === option
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
      </div>

      {/* Bottom save button for mobile */}
      <div className="mt-8 pb-24 lg:pb-8">
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg lg:hidden"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
```

---

## Step 7: Link from Main Settings Page

Add this to your existing settings page (`src/app/golf/(dashboard)/dashboard/settings/page.tsx`):

```typescript
// In the settings list, add:

<Link href="/golf/dashboard/settings/coaching-intelligence">
  <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-green-300 hover:bg-green-50/50 transition-all cursor-pointer group">
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xl">
      🧠
    </div>
    <div className="flex-1">
      <div className="font-medium text-slate-900">Coaching Intelligence</div>
      <div className="text-sm text-slate-500">Configure how CoachHelm analyzes your team</div>
    </div>
    <svg className="w-5 h-5 text-slate-400 group-hover:text-green-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  </div>
</Link>
```

---

## Testing Checklist

After implementing:

1. [ ] Run migration: `npx supabase db push`
2. [ ] Install dnd-kit: `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
3. [ ] Navigate to `/golf/dashboard/settings/coaching-intelligence`
4. [ ] Verify default values load
5. [ ] Test priority drag-and-drop reordering
6. [ ] Test sensitivity toggle
7. [ ] Test threshold sliders
8. [ ] Test weight distributor (should always sum to 100)
9. [ ] Test alert toggles
10. [ ] Click "Save Changes" and verify toast appears
11. [ ] Refresh page and verify values persisted
12. [ ] Test as non-coach (should redirect)

---

## What's Next

Once this is working, the next feature to build is **Focus Areas** (for players) or **Attention Alerts** (for coaches).

Which would you like the spec for next?
