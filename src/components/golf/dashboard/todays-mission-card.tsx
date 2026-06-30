'use client';

/**
 * TodaysMissionCard — action-oriented hero for the player dashboard.
 *
 * Fills the gap left of the Scoring Trend with something the rest of the
 * dashboard doesn't provide: a direct answer to "what should I do today?"
 *
 * Pulls the #1 priority Focus Area, stages it as a prescription with three
 * concrete drills, and lets the player tick them off locally. Visually
 * distinct from the glass-card stack — leaves a kelly-green rail on the
 * left, uses a Fraunces display accent on the hero line, warm-cream body.
 */

import { useState, useEffect } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { IconTarget, IconCheck, IconArrowRight, IconSparkles } from '@/components/icons';
import { getPlayerFocusAreas } from '@/app/golf/actions/insights';
import { Button } from '@/components/ui/button';

interface MissionDrill {
  id: string;
  label: string;
  minutes: number;
}

interface TodaysMissionCardProps {
  playerId: string;
  /** Injected for testing; defaults to the real server action. */
  loader?: (playerId: string) => Promise<{
    success: boolean;
    focus_areas: Array<Record<string, unknown>>;
  }>;
}

// Category → drill set. These are deliberately simple, coach-grade drills;
// the fancier per-focus-area drill library lives in DrillSheet.
const DRILL_LIBRARY: Record<string, MissionDrill[]> = {
  putting: [
    { id: 'p1', label: 'Gate drill, 10 reps from 4 ft', minutes: 10 },
    { id: 'p2', label: '50 chalk-line putts from 6 ft', minutes: 15 },
    { id: 'p3', label: 'Lag ladder: 20, 30, 40 ft', minutes: 10 },
  ],
  ball_striking: [
    { id: 'b1', label: '10-ball fairway finder, 3 clubs', minutes: 15 },
    { id: 'b2', label: 'Mid-iron ladder into pin high', minutes: 15 },
    { id: 'b3', label: 'Tempo swings with alignment sticks', minutes: 10 },
  ],
  short_game: [
    { id: 's1', label: 'Clock drill from 50/70/100 yards', minutes: 15 },
    { id: 's2', label: 'Up-and-down from rough, 10 balls', minutes: 15 },
    { id: 's3', label: 'Bunker clock: short, middle, long', minutes: 10 },
  ],
  course_management: [
    { id: 'c1', label: 'Review last round — 3 worst holes', minutes: 10 },
    { id: 'c2', label: 'Plan tee shot shape on each hole', minutes: 10 },
    { id: 'c3', label: 'Simulator round at tournament pace', minutes: 30 },
  ],
  mental_game: [
    { id: 'm1', label: 'Pre-shot routine, 20 reps', minutes: 10 },
    { id: 'm2', label: 'Breathing reset between holes', minutes: 5 },
    { id: 'm3', label: 'Visualize 3 pressure putts', minutes: 5 },
  ],
};

const DEFAULT_DRILLS: MissionDrill[] = [
  { id: 'd1', label: 'Warm-up routine, 10 minutes', minutes: 10 },
  { id: 'd2', label: 'Focused practice on your weakest shot', minutes: 20 },
  { id: 'd3', label: 'Finish with 5 pressure putts', minutes: 10 },
];

function pickDrills(areaKey?: string | null): MissionDrill[] {
  if (!areaKey) return DEFAULT_DRILLS;
  return DRILL_LIBRARY[areaKey] ?? DEFAULT_DRILLS;
}

export function TodaysMissionCard({
  playerId,
  loader = getPlayerFocusAreas,
}: TodaysMissionCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const [loading, setLoading] = useState(true);
  const [topArea, setTopArea] = useState<{
    id: string;
    title: string;
    description: string | null;
    area_type: string | null;
  } | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    loader(playerId).then((res) => {
      if (cancelled) return;
      if (res.success && res.focus_areas.length > 0) {
        const top = res.focus_areas[0] as Record<string, unknown>;
        setTopArea({
          id: String(top.id ?? ''),
          title: String(top.title ?? 'Today’s Focus'),
          description: (top.description as string | null) ?? null,
          area_type: (top.area_type as string | null) ?? null,
        });
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [playerId, loader]);

  const drills = pickDrills(topArea?.area_type);
  const totalMinutes = drills.reduce((s, d) => s + d.minutes, 0);
  const completed = checked.size;

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary-50/80 via-white/60 to-primary-50/40 border border-primary-100/60 min-h-[360px]">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500" />
        <div className="p-6 space-y-4">
          <div className="h-3 w-24 bg-primary-200/50 rounded skeleton-shimmer" />
          <div className="h-8 w-64 bg-warm-200/60 rounded skeleton-shimmer" />
          <div className="space-y-2 pt-4">
            <div className="h-10 bg-cream-100/60 rounded-xl skeleton-shimmer" />
            <div className="h-10 bg-cream-100/60 rounded-xl skeleton-shimmer" />
            <div className="h-10 bg-cream-100/60 rounded-xl skeleton-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  // Empty state — if no focus areas, render a motivational placeholder
  // rather than a blank card.
  if (!topArea) {
    return (
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary-50/80 via-white/60 to-primary-50/40 border border-primary-100/60 min-h-[360px]">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500" />
        <div className="p-7 flex flex-col h-full min-h-[360px]">
          <div className="flex items-center gap-2 mb-4">
            <IconSparkles size={14} className="text-primary-600" />
            <span className="text-eyebrow font-medium uppercase tracking-[0.18em] text-primary-700">
              Today&apos;s Mission
            </span>
          </div>
          <h3
            className="text-h2 md:text-h1 leading-[1.1] font-medium text-warm-900 tracking-[-0.02em] mb-3"
            style={{ fontFamily: 'var(--font-fraunces), Georgia, serif' }}
          >
            Lock in your baseline.
          </h3>
          <p className="text-sm text-warm-600 leading-relaxed mb-6 max-w-md">
            Log two more rounds and CoachHelm will prescribe a focus area for your daily practice.
          </p>
          <Link
            href="/golf/dashboard/rounds/create"
            className="mt-auto inline-flex items-center gap-2 self-start px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            Log a round
            <IconArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.35, ease: [0.22, 1, 0.36, 1] })}
      className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary-50/80 via-white/70 to-primary-50/30 border border-primary-100/60 shadow-glow-green"
    >
      {/* Kelly green rail — the signature visual element that sets this
          card apart from the glass-card stack. */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary-400 via-primary-500 to-primary-600" />

      {/* Ambient glow */}
      <div className="absolute -top-16 -right-16 w-48 h-48 bg-primary-400/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative p-6 md:p-7 flex flex-col">
        {/* Kicker */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse"
              aria-hidden="true"
            />
            <span className="text-eyebrow font-medium uppercase tracking-[0.18em] text-primary-700">
              Today&apos;s Mission
            </span>
          </div>
          <span className="text-eyebrow text-warm-500 tabular-nums font-medium">
            ~{totalMinutes} min
          </span>
        </div>

        {/* Hero line */}
        <h3
          className="text-h2 md:text-h1 leading-[1.05] font-medium text-warm-900 tracking-[-0.025em] mb-2"
          style={{ fontFamily: 'var(--font-fraunces), Georgia, serif' }}
        >
          {topArea.title}
        </h3>
        {topArea.description && (
          <p className="text-sm text-warm-600 leading-relaxed mb-5 line-clamp-2">
            {topArea.description}
          </p>
        )}

        {/* Drill list */}
        <ul className="space-y-2 mb-5">
          {drills.map((drill, i) => {
            const isChecked = checked.has(drill.id);
            return (
              <li key={drill.id}>
                <Button variant="primary"
                  type="button"
                  onClick={() => toggle(drill.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all group',
                    'border',
                    isChecked
                      ? 'bg-primary-50/80 border-primary-200/60 text-warm-500'
                      : 'bg-cream-100/75 border-warm-200/55 hover:bg-white hover:border-primary-100 text-warm-800',
                  )}
                >
                  <span
                    className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
                      isChecked
                        ? 'bg-primary-500 border-2 border-primary-500'
                        : 'border-2 border-warm-300 group-hover:border-primary-400',
                    )}
                    aria-hidden="true"
                  >
                    {isChecked && <IconCheck size={11} className="text-white" />}
                  </span>
                  <span className="text-eyebrow font-medium text-warm-400 tabular-nums w-4 flex-shrink-0">
                    {i + 1}
                  </span>
                  <span
                    className={cn(
                      'flex-1 text-sm font-medium transition-colors',
                      isChecked && 'line-through',
                    )}
                  >
                    {drill.label}
                  </span>
                  <span className="text-eyebrow text-warm-400 tabular-nums flex-shrink-0">
                    {drill.minutes}m
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-primary-100/40">
          <div className="flex items-center gap-2 text-xs text-warm-500">
            <IconTarget size={13} className="text-primary-500" />
            <span>
              {completed} of {drills.length} complete
            </span>
          </div>
          <Link
            href="/golf/dashboard/my-development"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-800 transition-colors"
          >
            All focus areas
            <IconArrowRight size={12} />
          </Link>
        </div>
      </div>
    </m.div>
  );
}
