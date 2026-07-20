'use client';

import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  IconSparkles,
  IconCheck,
  IconClock,
  IconPlus,
  IconActivity,
} from '@/components/icons';
import { createFocusArea } from '@/app/golf/actions/development';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { Surface, Inset, Button, StatusPill, type FwStatusTone } from '@/components/fairway';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoryBreakdown {
  teeGame: number;
  approach: number;
  shortGame: number;
  putting: number;
  scoring: number;
}

interface PatternLike {
  id: string;
  pattern_type: string | null;
  name: string | null;
  description: string | null;
  stroke_impact: number | null;
  metadata: Record<string, unknown> | null;
}

interface FocusAreaLike {
  id: string;
  title: string | null;
  area_type: string | null;
}

interface PrescribedPracticePlanCardProps {
  playerId: string;
  coachId: string | null;
  insights: EvidenceInsight[];
  patterns: PatternLike[];
  categoryBreakdown: CategoryBreakdown;
  focusAreas: FocusAreaLike[];
  /** True while the parent is running the engine refresh. Drives the
   *  card's empty-state copy so it reads "generating…" vs "run refresh". */
  isRefreshing?: boolean;
}

interface PrescribedDrill {
  id: string;
  title: string;
  reason: string;
  drillText?: string;
  timeMin?: number;
  areaType: string;
  sourceInsightId?: string;
  impactLabel?: string;
  priority: 'high' | 'medium' | 'low';
}

// ---------------------------------------------------------------------------
// Category helpers — kept local so the engine's 0-100 breakdown can seed a
// fallback drill when insights + patterns are both thin.
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<keyof CategoryBreakdown, string> = {
  teeGame: 'Tee Game',
  approach: 'Approach',
  shortGame: 'Short Game',
  putting: 'Putting',
  scoring: 'Scoring',
};

const CATEGORY_AREA_TYPE: Record<keyof CategoryBreakdown, string> = {
  teeGame: 'driving',
  approach: 'approach',
  shortGame: 'short_game',
  putting: 'putting',
  scoring: 'scoring',
};

const CATEGORY_TEMPLATES: Record<keyof CategoryBreakdown, string> = {
  teeGame: '15 minutes at the range working a shoulder-wide alignment cue — track fairways hit across 9 drive attempts.',
  approach: 'Tour-player ladder: 3 shots each from 100, 125, 150, 175 yd. Score GIR-style hit/miss and note direction of miss.',
  shortGame: '3x5 chipping ladder from 10, 20, 30 yd; every ball must finish inside 6 ft.',
  putting: '10-ball ladder from 3, 5, 7, 10 ft — repeat until the player makes 9/10 from 3 ft twice in a row.',
  scoring: 'Play a 9-hole solo scorecard with a strict one-ball rule and write the score + 3 notes on decision-making afterwards.',
};

function humanizeAreaType(area: string | null | undefined): string {
  if (!area) return 'Focus area';
  const map: Record<string, string> = {
    putting: 'Putting',
    approach: 'Approach',
    driving: 'Driving',
    tee: 'Driving',
    short_game: 'Short Game',
    scoring: 'Scoring',
    pattern_detected: 'Active Pattern',
    recurring_weakness: 'Recurring Weakness',
    tournament_pressure: 'Tournament Play',
    scoring_decline: 'Scoring',
    stat_regression: 'Stat Regression',
    plateau: 'Plateau',
    general: 'General',
  };
  return map[area] ?? area.split('_').map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ');
}

/** Priority → StatusPill tone. Replaces the old hand-rolled raw red/amber/warm
 *  chip classes with the token-backed legend (danger/warning/neutral) shared
 *  by every other Fairway status chip. */
function priorityTone(priority: PrescribedDrill['priority']): FwStatusTone {
  if (priority === 'high') return 'danger';
  if (priority === 'medium') return 'warning';
  return 'neutral';
}

function pickTopPatternRecommendation(p: PatternLike): string | null {
  const meta = p.metadata ?? {};
  const rec = typeof meta.recommendation === 'string' ? meta.recommendation.trim() : '';
  if (rec) return rec;
  if (p.description) return p.description;
  return null;
}

function categoryToAreaType(category: string | null | undefined): string {
  if (!category) return 'general';
  // EvidenceInsight.category enum includes values like 'approach', 'putting',
  // 'driving', 'short_game', 'scoring' — passed through as-is.
  return category;
}

// ---------------------------------------------------------------------------
// Derivation — produce up to 3 drills, deduped by area type so a coach
// doesn't see three putting recommendations when other zones also need work.
// ---------------------------------------------------------------------------

export function derivePracticePlan(args: {
  insights: EvidenceInsight[];
  patterns: PatternLike[];
  categoryBreakdown: CategoryBreakdown;
  focusAreas: FocusAreaLike[];
  /** Area types to treat as already-covered beyond `focusAreas` — the coach
   *  side pins in-session saves here so a duplicate drill for a just-saved
   *  area can never re-derive while the parent's `focusAreas` prop is stale. */
  extraUsedAreas?: Iterable<string>;
}): PrescribedDrill[] {
  const { insights, patterns, categoryBreakdown, focusAreas, extraUsedAreas } = args;
  const drills: PrescribedDrill[] = [];
  const usedAreas = new Set<string>();
  for (const fa of focusAreas) {
    if (fa.area_type) usedAreas.add(fa.area_type);
  }
  for (const area of extraUsedAreas ?? []) {
    usedAreas.add(area);
  }

  // 1. Insight-sourced drills (strongest signal — evidence-backed).
  const rankedInsights = [...insights].sort((a, b) => {
    const pri = { urgent: 3, high: 2, medium: 1, low: 0 } as const;
    return (pri[b.priority] ?? 0) - (pri[a.priority] ?? 0);
  });
  for (const insight of rankedInsights) {
    if (drills.length >= 3) break;
    const areaType = categoryToAreaType(insight.category);
    if (usedAreas.has(areaType)) continue;
    const firstDrill = insight.drills?.[0];
    drills.push({
      id: `insight-${insight.id}`,
      title: insight.title,
      reason: insight.content,
      drillText: firstDrill?.title,
      timeMin: firstDrill?.duration_min,
      areaType,
      sourceInsightId: insight.id,
      impactLabel: insight.priority === 'urgent' ? 'Urgent' : insight.priority === 'high' ? 'High impact' : undefined,
      priority: insight.priority === 'urgent' || insight.priority === 'high'
        ? 'high'
        : insight.priority === 'medium'
          ? 'medium'
          : 'low',
    });
    usedAreas.add(areaType);
  }

  // 2. Pattern-sourced drills (fallback — mined from shot data).
  const rankedPatterns = [...patterns]
    .filter((p) => typeof p.stroke_impact === 'number' && p.stroke_impact < -0.2)
    .sort((a, b) => (a.stroke_impact ?? 0) - (b.stroke_impact ?? 0));
  for (const p of rankedPatterns) {
    if (drills.length >= 3) break;
    const areaType = p.pattern_type ?? 'pattern';
    if (usedAreas.has(areaType)) continue;
    const rec = pickTopPatternRecommendation(p);
    if (!rec) continue;
    const impact = typeof p.stroke_impact === 'number'
      ? `${p.stroke_impact.toFixed(2)} strokes/rd`
      : undefined;
    drills.push({
      id: `pattern-${p.id}`,
      title: p.name ?? humanizeAreaType(areaType),
      reason: p.description ?? 'Active performance pattern flagged by CoachHelm.',
      drillText: rec,
      areaType,
      impactLabel: impact,
      priority: (p.stroke_impact ?? 0) < -1 ? 'high' : (p.stroke_impact ?? 0) < -0.5 ? 'medium' : 'low',
    });
    usedAreas.add(areaType);
  }

  // 3. Category-sourced fallback — pick the weakest rating under 55.
  if (drills.length < 3) {
    const categoryEntries = (Object.entries(categoryBreakdown) as [
      keyof CategoryBreakdown,
      number,
    ][]).sort((a, b) => a[1] - b[1]);
    for (const [key, score] of categoryEntries) {
      if (drills.length >= 3) break;
      if (score >= 55) break;
      const areaType = CATEGORY_AREA_TYPE[key];
      if (usedAreas.has(areaType)) continue;
      drills.push({
        id: `category-${key}`,
        title: `Develop ${CATEGORY_LABELS[key]}`,
        reason: `${CATEGORY_LABELS[key]} sits at ${Math.round(score)}/100 — the lowest category in this player's breakdown.`,
        drillText: CATEGORY_TEMPLATES[key],
        areaType,
        priority: score < 35 ? 'high' : 'medium',
      });
      usedAreas.add(areaType);
    }
  }

  return drills;
}

// ---------------------------------------------------------------------------
// Per-drill row — its own component so useTransition state stays local
// (saving drill A doesn't briefly disable drill B).
// ---------------------------------------------------------------------------

function DrillRow({
  drill,
  onSave,
  initiallySaved = false,
}: {
  drill: PrescribedDrill;
  onSave: (drill: PrescribedDrill) => Promise<{ ok: boolean; error?: string }>;
  /** Pinned drills remount with a fresh id-keyed instance when the rendered
   *  list is rebuilt, so "saved" can't be recovered from local state — the
   *  parent hands it back in via this prop instead. */
  initiallySaved?: boolean;
}) {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'saved' }
    | { kind: 'error'; message: string }
  >(() => (initiallySaved ? { kind: 'saved' } : { kind: 'idle' }));

  const handleClick = useCallback(async () => {
    setState({ kind: 'saving' });
    const res = await onSave(drill);
    if (res.ok) {
      setState({ kind: 'saved' });
    } else {
      setState({ kind: 'error', message: res.error ?? 'Could not save focus area' });
    }
  }, [drill, onSave]);

  return (
    <Inset padding="md" className="space-y-3">
      {/* Row 1: area chip (tone = priority, via the shared StatusPill legend) + impact */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusPill tone={priorityTone(drill.priority)} size="sm">
            {humanizeAreaType(drill.areaType)}
          </StatusPill>
          {drill.impactLabel && (
            <span className="font-fw-sans text-eyebrow font-medium uppercase tracking-wider text-text-tertiary tabular-nums">
              {drill.impactLabel}
            </span>
          )}
        </div>
      </div>

      <div>
        <p className="font-fw-sans text-body-sm font-medium leading-snug text-text-primary">
          {drill.title}
        </p>
        <p className="mt-1 font-fw-sans text-caption leading-relaxed text-text-tertiary">
          {drill.reason}
        </p>
      </div>

      {drill.drillText && (
        <div className="rounded-fw-md border border-accent-200 bg-accent-50 px-3 py-2">
          <p className="font-fw-sans text-eyebrow font-medium uppercase tracking-wider text-accent-700">
            Drill
          </p>
          <p className="mt-1 font-fw-sans text-caption leading-relaxed text-accent-900">
            {drill.drillText}
          </p>
          {drill.timeMin && (
            <p className="mt-1.5 inline-flex items-center gap-1 font-fw-sans text-eyebrow font-medium text-accent-700">
              <IconClock size={12} /> {drill.timeMin} min
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-end">
        {state.kind === 'saved' ? (
          <span className="inline-flex items-center gap-1.5 font-fw-sans text-caption font-medium text-accent-700">
            <IconCheck size={14} /> Added to Focus Areas
          </span>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClick}
            busy={state.kind === 'saving'}
            leftIcon={<IconPlus size={14} />}
          >
            {state.kind === 'saving' ? 'Saving…' : 'Add to Focus Areas'}
          </Button>
        )}
      </div>

      {state.kind === 'error' && (
        <p className="font-fw-sans text-eyebrow text-fw-danger">{state.message}</p>
      )}
    </Inset>
  );
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function PrescribedPracticePlanCard({
  playerId,
  coachId,
  insights,
  patterns,
  categoryBreakdown,
  focusAreas,
  isRefreshing = false,
}: PrescribedPracticePlanCardProps) {
  // Drills saved this session — pinned in the list independent of props so
  // a parent refetch (which updates `focusAreas`/`insights`) can never make
  // the "Added to Focus Areas" confirmation the coach is looking at vanish.
  const [savedDrills, setSavedDrills] = useState<PrescribedDrill[]>([]);

  const derivedDrills = useMemo(
    () =>
      derivePracticePlan({
        insights,
        patterns,
        categoryBreakdown,
        focusAreas,
        extraUsedAreas: savedDrills.map((d) => d.areaType),
      }),
    [insights, patterns, categoryBreakdown, focusAreas, savedDrills],
  );

  // Pinned saves fill the front of the list in save order; freshly-derived
  // drills top up whatever's left, capped at 3 total.
  const remainingSlots = Math.max(0, 3 - savedDrills.length);
  const drills: Array<{ drill: PrescribedDrill; pinned: boolean }> = [
    ...savedDrills.map((drill) => ({ drill, pinned: true })),
    ...derivedDrills.slice(0, remainingSlots).map((drill) => ({ drill, pinned: false })),
  ];

  const handleSave = useCallback(
    async (drill: PrescribedDrill) => {
      if (!coachId) {
        return { ok: false, error: 'Missing coach id — reload and try again.' };
      }
      const description = [drill.reason, drill.drillText].filter(Boolean).join('\n\n') || null;
      const res = await createFocusArea({
        player_id: playerId,
        coach_id: coachId,
        area_type: drill.areaType,
        title: drill.title,
        description,
        target_metric: null,
        current_value: null,
        target_value: null,
        from_insight_id: drill.sourceInsightId ?? null,
      });
      if (res.success) {
        setSavedDrills((prev) => (prev.some((d) => d.id === drill.id) ? prev : [...prev, drill]));
      }
      return { ok: res.success, error: res.error };
    },
    [playerId, coachId],
  );

  return (
    <Surface data-testid="prescribed-practice-plan">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-fw-md bg-accent-50">
            <IconSparkles size={18} className="text-accent-700" />
          </div>
          <div className="min-w-0">
            <h3 className="font-fw-sans text-body font-medium leading-tight tracking-[-0.005em] text-text-primary">
              Prescribed Practice Plan
            </h3>
            <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">
              Generated from this player's most recent analysis
            </p>
          </div>
        </div>
        {drills.length > 0 && (
          <span className="shrink-0 font-fw-sans text-caption font-medium text-text-tertiary">
            {drills.length} drill{drills.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {drills.length === 0 ? (
        <Inset padding="lg" className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-fw-md bg-surface">
            <IconActivity size={20} className={cn('text-text-tertiary', isRefreshing && 'animate-pulse')} />
          </div>
          <p className="font-fw-sans text-body-sm font-medium text-text-secondary">
            {isRefreshing ? 'Analyzing this player…' : 'No drills to prescribe yet'}
          </p>
          <p className="mx-auto mt-1 max-w-sm font-fw-sans text-caption text-text-tertiary">
            {isRefreshing
              ? 'Hold tight — CoachHelm is reviewing the latest rounds to surface specific weaknesses.'
              : 'Click Refresh Analysis above to run the engine for this player, or wait for the nightly sweep to populate insights.'}
          </p>
        </Inset>
      ) : (
        <div className="space-y-3">
          {drills.map(({ drill, pinned }) => (
            <DrillRow key={drill.id} drill={drill} onSave={handleSave} initiallySaved={pinned} />
          ))}
        </div>
      )}
    </Surface>
  );
}
