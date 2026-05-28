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

function derivePracticePlan(args: {
  insights: EvidenceInsight[];
  patterns: PatternLike[];
  categoryBreakdown: CategoryBreakdown;
  focusAreas: FocusAreaLike[];
}): PrescribedDrill[] {
  const { insights, patterns, categoryBreakdown, focusAreas } = args;
  const drills: PrescribedDrill[] = [];
  const usedAreas = new Set<string>();
  for (const fa of focusAreas) {
    if (fa.area_type) usedAreas.add(fa.area_type);
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
}: {
  drill: PrescribedDrill;
  onSave: (drill: PrescribedDrill) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'saved' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const handleClick = useCallback(async () => {
    setState({ kind: 'saving' });
    const res = await onSave(drill);
    if (res.ok) {
      setState({ kind: 'saved' });
    } else {
      setState({ kind: 'error', message: res.error ?? 'Could not save focus area' });
    }
  }, [drill, onSave]);

  const priorityStyles =
    drill.priority === 'high'
      ? 'bg-red-50 text-red-700 border-red-200'
      : drill.priority === 'medium'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-warm-50 text-warm-600 border-warm-200';

  return (
    <div className="rounded-xl border border-warm-200/70 bg-cream-100/68 p-4 space-y-3">
      {/* Row 1: area badge + priority + title */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span
            className={cn(
              'inline-flex items-center text-eyebrow font-medium uppercase tracking-wider px-2 py-0.5 rounded-full border',
              priorityStyles,
            )}
          >
            {humanizeAreaType(drill.areaType)}
          </span>
          {drill.impactLabel && (
            <span className="inline-flex items-center text-eyebrow font-medium text-warm-500 tabular-nums">
              {drill.impactLabel}
            </span>
          )}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-warm-900 leading-snug">
          {drill.title}
        </p>
        <p className="text-xs text-warm-500 mt-1 leading-relaxed">
          {drill.reason}
        </p>
      </div>

      {drill.drillText && (
        <div className="rounded-lg bg-primary-50/70 border border-primary-100 px-3 py-2">
          <p className="text-eyebrow font-medium uppercase tracking-wider text-primary-700 mb-1">
            Drill
          </p>
          <p className="text-xs text-primary-900 leading-relaxed">
            {drill.drillText}
          </p>
          {drill.timeMin && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-eyebrow font-medium text-primary-600">
              <IconClock size={12} /> {drill.timeMin} min
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-end">
        {state.kind === 'saved' ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <IconCheck size={14} /> Added to Focus Areas
          </span>
        ) : (
          <button
            type="button"
            onClick={handleClick}
            disabled={state.kind === 'saving'}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
              'border border-primary-200 bg-primary-50 text-primary-700',
              'hover:bg-primary-100 hover:border-primary-300 transition-colors',
              'disabled:opacity-60 disabled:cursor-not-allowed',
            )}
          >
            <IconPlus size={14} />
            {state.kind === 'saving' ? 'Saving…' : 'Add to Focus Areas'}
          </button>
        )}
      </div>

      {state.kind === 'error' && (
        <p className="text-eyebrow text-red-600">{state.message}</p>
      )}
    </div>
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
  const drills = useMemo(
    () =>
      derivePracticePlan({
        insights,
        patterns,
        categoryBreakdown,
        focusAreas,
      }),
    [insights, patterns, categoryBreakdown, focusAreas],
  );

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
      return { ok: res.success, error: res.error };
    },
    [playerId, coachId],
  );

  return (
    <div className="surface-matte rounded-3xl p-6" data-testid="prescribed-practice-plan">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
            <IconSparkles size={18} className="text-primary-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-body font-medium text-warm-900 tracking-[-0.005em] leading-tight">
              Prescribed Practice Plan
            </h3>
            <p className="text-xs text-warm-500 mt-0.5">
              Generated from this player's most recent analysis
            </p>
          </div>
        </div>
        {drills.length > 0 && (
          <span className="text-xs font-medium text-warm-400 shrink-0">
            {drills.length} drill{drills.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {drills.length === 0 ? (
        <div className="rounded-xl bg-warm-50/80 border border-warm-100 px-4 py-5 text-center">
          <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center mx-auto mb-3">
            <IconActivity size={20} className={cn('text-warm-400', isRefreshing && 'animate-pulse')} />
          </div>
          <p className="text-sm font-medium text-warm-700">
            {isRefreshing ? 'Analyzing this player…' : 'No drills to prescribe yet'}
          </p>
          <p className="text-xs text-warm-500 mt-1 max-w-sm mx-auto">
            {isRefreshing
              ? 'Hold tight — CoachHelm is reviewing the latest rounds to surface specific weaknesses.'
              : 'Click Refresh Analysis above to run the engine for this player, or wait for the nightly sweep to populate insights.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {drills.map((drill) => (
            <DrillRow key={drill.id} drill={drill} onSave={handleSave} />
          ))}
        </div>
      )}
    </div>
  );
}
