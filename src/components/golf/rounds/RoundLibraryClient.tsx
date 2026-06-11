'use client';

/**
 * RoundLibraryClient — the redesigned /golf/dashboard/rounds surface.
 *
 * Architecture:
 *   - Hero plinth (surface-stone + PageHeader + dynamic subtitle)
 *   - Stat strip (5 AnimatedNumber cards, cascade slot-machine on mount)
 *   - Filter chips + Week/Month toggle (sticky, glass-prominent on scroll)
 *   - Period groups: header (label + Sparkline + mini stats) + RoundCardV2 grid
 *   - RoundCardV2: hover-reveal of secondary stats drawer, best-of-period
 *     accent, color-graded score chip
 *
 * All animations use the cubic-bezier(0.16, 1, 0.3, 1) shared with the
 * rest of the system so this surface breathes on the same timing curve.
 *
 * Reduced motion is honored: the hero `<Reveal>` collapses to instant
 * and Sparkline draws are skipped.
 */

import * as React from 'react';
import Link from 'next/link';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Avatar } from '@/components/ui/avatar';
import { IconGolf, IconFlag, IconTrophy, IconTrendingDown, IconTrendingUp, IconArrowRight } from '@/components/icons';
import { Sparkline } from './Sparkline';
import { Button } from '@/components/ui/button';

// -- Types -------------------------------------------------------------------

export interface RoundLibraryRound {
  id: string;
  course_name: string | null;
  course_city: string | null;
  course_state: string | null;
  round_date: string;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  holes_played: number | null;
  status: string | null;
  player: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface RoundLibraryClientProps {
  rounds: RoundLibraryRound[];
  userRole: 'coach' | 'player';
  /** Computed once on the server; passed through so the client doesn't recalc. */
  stats: {
    totalRounds: number;
    avg: number;
    best: number;
    avgToPar: number | null;
    underParPct: number;
    trend: 'improving' | 'declining' | 'stable' | null;
  } | null;
}

type Grouping = 'month' | 'week';
type RoundFilter = 'all' | 'practice' | 'qualifier' | 'tournament';

// -- Helpers -----------------------------------------------------------------

function getMonthKey(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Returns the Monday of the week the date falls in (ISO weeks). */
function getWeekStart(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay() || 7; // Sunday → 7
  if (day !== 1) out.setDate(out.getDate() - (day - 1));
  return out;
}

function getWeekKey(date: Date): string {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  // "Apr 22 – 28" if same month; "Apr 29 – May 5" if crosses a month
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = sameMonth
    ? String(end.getDate())
    : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

function getRoundTypeMeta(type: string | null) {
  switch (type) {
    case 'tournament':
      return { label: 'Tournament', tone: 'amber' as const };
    case 'qualifier':
    case 'qualifying':
      return { label: 'Qualifier', tone: 'purple' as const };
    case 'practice':
      return { label: 'Practice', tone: 'warm' as const };
    case 'casual':
      return { label: 'Casual', tone: 'warm' as const };
    default:
      return { label: type || 'Round', tone: 'warm' as const };
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const PREMIUM_EASE = [0.16, 1, 0.3, 1] as const;

// -- Period Header -----------------------------------------------------------

interface PeriodHeaderProps {
  label: string;
  rounds: RoundLibraryRound[];
}

function PeriodHeader({ label, rounds }: PeriodHeaderProps) {
  const scored = rounds.filter((r) => r.total_score !== null && r.total_score > 0);
  const sparkValues = scored
    .slice()
    .reverse() // oldest → newest left to right
    .map((r) => {
      // normalize 9-hole rounds to 18 for visual consistency
      const hp = r.holes_played ?? 18;
      return Math.round((r.total_score! * 18) / Math.max(1, hp));
    });

  const avg =
    scored.length > 0
      ? scored.reduce((s, r) => s + (r.total_score! * 18) / Math.max(1, r.holes_played ?? 18), 0) /
        scored.length
      : null;
  const best = scored.length > 0 ? Math.min(...sparkValues) : null;

  return (
    <div className="flex items-end justify-between gap-4 mb-3 pl-1">
      <div className="flex items-baseline gap-3 min-w-0">
        <h2 className="font-serif text-body uppercase tracking-[0.16em] text-warm-500 whitespace-nowrap">
          {label}
        </h2>
        <div className="hidden sm:flex items-baseline gap-2.5 text-caption text-warm-400 min-w-0 truncate">
          <span className="tabular-nums">
            {scored.length} round{scored.length === 1 ? '' : 's'}
          </span>
          {avg !== null && (
            <>
              <span className="text-warm-300">·</span>
              <span className="tabular-nums">avg {avg.toFixed(1)}</span>
            </>
          )}
          {best !== null && (
            <>
              <span className="text-warm-300">·</span>
              <span className="tabular-nums text-primary-700">best {best}</span>
            </>
          )}
        </div>
      </div>
      {sparkValues.length >= 2 && (
        <Sparkline
          values={sparkValues}
          width={120}
          height={24}
          stroke="var(--color-primary-600)"
          filled
          label={`${label}: ${sparkValues.length} scores trend`}
          className="flex-shrink-0"
        />
      )}
    </div>
  );
}

// -- Round Card V2 -----------------------------------------------------------

interface RoundCardV2Props {
  round: RoundLibraryRound;
  isBestOfPeriod: boolean;
  userRole: 'coach' | 'player';
  staggerIndex?: number;
}

function RoundCardV2({ round, isBestOfPeriod, userRole, staggerIndex = 0 }: RoundCardV2Props) {
  const prefersReducedMotion = useReducedMotion();
  const stp = round.score_to_par ?? 0;
  const scoreTone =
    stp < 0 ? 'under' : stp === 0 ? 'par' : 'over';
  const typeMeta = getRoundTypeMeta(round.round_type);
  const holesPlayed = round.holes_played ?? 18;
  const playerName = round.player
    ? `${round.player.first_name || ''} ${round.player.last_name || ''}`.trim()
    : '';

  // Computed micro-stats for the hover drawer
  const fir =
    round.total_fairways && round.total_fairways > 0 && round.total_fairways_hit !== null
      ? Math.round(((round.total_fairways_hit ?? 0) / round.total_fairways) * 100)
      : null;
  const gir =
    round.total_gir_possible && round.total_gir_possible > 0 && round.total_gir !== null
      ? Math.round(((round.total_gir ?? 0) / round.total_gir_possible) * 100)
      : null;

  return (
    <Link href={`/golf/dashboard/rounds/${round.id}`} className="block">
      <m.article
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.32, ease: PREMIUM_EASE, delay: staggerIndex * 0.05 })}
        className={cn(
          'group/card relative overflow-clip rounded-2xl',
          'border border-warm-200/55 bg-white',
          // shared hover choreography from globals.css
          'surface-tile-hover',
          'shadow-[0_1px_2px_hsl(42_14%_22%/0.04),0_4px_10px_hsl(42_14%_22%/0.05)]',
        )}
      >
        {/* Best-of-period left rail accent */}
        {isBestOfPeriod && (
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-primary-500 to-primary-600"
          />
        )}

        <div className="relative px-4 pt-3 pb-3">
          {/* Top row: type chip + date */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <TypeChip tone={typeMeta.tone}>{typeMeta.label}</TypeChip>
              {isBestOfPeriod && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-px text-eyebrow font-semibold uppercase tracking-[0.08em] text-primary-700">
                  <IconTrophy size={9} className="-ml-0.5" />
                  Best
                </span>
              )}
            </div>
            <span className="text-eyebrow font-medium text-warm-400 tabular-nums">
              {formatDate(round.round_date)}
            </span>
          </div>

          {/* Hero score row */}
          <div className="flex items-center justify-between gap-3">
            {/* Left: score + chip */}
            <div className="flex items-baseline gap-2 min-w-0">
              <span
                className={cn(
                  'font-display tabular-nums leading-none transition-colors duration-300',
                  'text-display tracking-[-0.025em] font-medium',
                  scoreTone === 'under' && 'text-primary-700 group-hover/card:text-primary-800',
                  scoreTone === 'par' && 'text-warm-800 group-hover/card:text-warm-900',
                  scoreTone === 'over' && 'text-warm-800 group-hover/card:text-warm-900',
                )}
              >
                {round.total_score ?? '—'}
              </span>
              <span
                className={cn(
                  'rounded-md px-1.5 py-px text-eyebrow font-semibold tabular-nums',
                  'transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                  'group-hover/card:scale-[1.06] origin-left',
                  scoreTone === 'under' && 'bg-primary-100 text-primary-700',
                  scoreTone === 'par' && 'bg-warm-100 text-warm-700',
                  scoreTone === 'over' && 'bg-helm-amber-100/70 text-helm-amber-700',
                )}
              >
                {stp === 0 ? 'E' : stp > 0 ? `+${stp}` : `${stp}`}
              </span>
            </div>

            {/* Right (coach view): player name + avatar */}
            {userRole === 'coach' && round.player && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {playerName && (
                  <span className="truncate max-w-[140px] text-body-sm font-medium text-warm-700 group-hover/card:text-warm-900 transition-colors duration-200">
                    {playerName}
                  </span>
                )}
                <Avatar
                  src={round.player.avatar_url}
                  name={playerName}
                  size="sm"
                  className="flex-shrink-0"
                />
              </div>
            )}
          </div>

          {/* Course + city */}
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-body-sm font-medium text-warm-900 group-hover/card:text-primary-700 transition-colors duration-200">
                {round.course_name ?? 'Unknown course'}
              </p>
              {(round.course_city || round.course_state) && (
                <p className="truncate text-eyebrow text-warm-500">
                  {[round.course_city, round.course_state].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            <span className="flex-shrink-0 text-eyebrow font-medium text-warm-400 tabular-nums">
              {holesPlayed}h
            </span>
          </div>

          {/* Hover-reveal micro-stat drawer.
              max-h transition expands a row of micro-stats + a "View round" arrow.
              Collapsed when not hovered (max-h-0), expands to ~40px on hover. */}
          <div
            className={cn(
              'grid grid-rows-[0fr] transition-[grid-template-rows,opacity] duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
              'group-hover/card:grid-rows-[1fr]',
              'opacity-0 group-hover/card:opacity-100',
            )}
          >
            <div className="overflow-hidden">
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-warm-100 pt-2.5">
                <div className="flex items-center gap-3 text-eyebrow text-warm-600 min-w-0">
                  {round.total_putts !== null && (
                    <MicroStat label="Putts" value={`${round.total_putts}`} />
                  )}
                  {fir !== null && <MicroStat label="FIR" value={`${fir}%`} />}
                  {gir !== null && <MicroStat label="GIR" value={`${gir}%`} />}
                  {fir === null && gir === null && round.total_putts === null && (
                    <span className="text-warm-400 italic text-eyebrow">No stats logged</span>
                  )}
                </div>
                <span className="inline-flex items-center gap-1 text-eyebrow font-medium text-primary-700 whitespace-nowrap">
                  View round
                  <IconArrowRight
                    size={12}
                    className="transition-transform duration-300 group-hover/card:translate-x-0.5"
                  />
                </span>
              </div>
            </div>
          </div>
        </div>
      </m.article>
    </Link>
  );
}

// -- Sub-primitives ----------------------------------------------------------

function TypeChip({
  tone,
  children,
}: {
  tone: 'amber' | 'purple' | 'warm';
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-px text-eyebrow font-semibold uppercase tracking-[0.1em]',
        tone === 'amber' && 'bg-helm-amber-50 text-helm-amber-700',
        tone === 'purple' && 'bg-purple-50 text-purple-700',
        tone === 'warm' && 'bg-warm-100 text-warm-600',
      )}
    >
      {children}
    </span>
  );
}

function MicroStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="font-semibold text-warm-800 tabular-nums">{value}</span>
      <span className="text-eyebrow uppercase tracking-[0.08em] text-warm-400">{label}</span>
    </span>
  );
}

// -- Main Client -------------------------------------------------------------

export function RoundLibraryClient({ rounds, userRole, stats }: RoundLibraryClientProps) {
  const [grouping, setGrouping] = React.useState<Grouping>('month');
  const [filter, setFilter] = React.useState<RoundFilter>('all');

  // Filter the rounds by type
  const filteredRounds = React.useMemo(() => {
    if (filter === 'all') return rounds;
    return rounds.filter((r) => {
      const t = (r.round_type || '').toLowerCase();
      if (filter === 'qualifier') return t === 'qualifier' || t === 'qualifying';
      return t === filter;
    });
  }, [rounds, filter]);

  // Group filtered rounds by selected grouping
  const grouped = React.useMemo(() => {
    const map: Record<string, { label: string; rounds: RoundLibraryRound[] }> = {};
    for (const r of filteredRounds) {
      const d = new Date(r.round_date);
      const key =
        grouping === 'month'
          ? `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
          : `${d.getFullYear()}-${String(getWeekStart(d).getTime())}`;
      const label = grouping === 'month' ? getMonthKey(d) : getWeekKey(d);
      if (!map[key]) map[key] = { label, rounds: [] };
      map[key].rounds.push(r);
    }
    // Order keys descending
    return Object.entries(map)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([, v]) => v);
  }, [filteredRounds, grouping]);

  const filterCounts = React.useMemo(() => {
    const counts: Record<RoundFilter, number> = {
      all: rounds.length,
      practice: 0,
      qualifier: 0,
      tournament: 0,
    };
    for (const r of rounds) {
      const t = (r.round_type || '').toLowerCase();
      if (t === 'practice') counts.practice++;
      else if (t === 'qualifier' || t === 'qualifying') counts.qualifier++;
      else if (t === 'tournament') counts.tournament++;
    }
    return counts;
  }, [rounds]);

  const heroSubtitle = (() => {
    if (!stats || stats.totalRounds === 0) return 'No rounds logged yet — start with one.';
    const underParBits =
      stats.underParPct > 0 ? `${stats.underParPct}% under par.` : 'tracking every stroke.';
    return `${stats.totalRounds} round${stats.totalRounds === 1 ? '' : 's'} — avg ${stats.avg.toFixed(1)}, ${underParBits}`;
  })();

  return (
    <LazyMotion features={domAnimation}>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-6">
        {/* Hero plinth */}
        <Reveal>
          <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
            <PageHeader
              eyebrow={userRole === 'coach' ? 'Team Rounds' : 'Your Rounds'}
              eyebrowAccent="primary"
              title={userRole === 'coach' ? 'The library.' : 'Your rounds.'}
              subtitle={heroSubtitle}
            />
          </div>
        </Reveal>

        {/* Stat strip — 5 numbers, slot-machine cascade on mount */}
        {stats && stats.totalRounds >= 3 && (
          <Reveal staggerIndex={1}>
            <div className="mb-7 grid grid-cols-2 md:grid-cols-5 gap-2">
              <StatTile
                icon={<IconGolf size={14} />}
                label="Rounds"
                staggerIndex={0}
                value={
                  <AnimatedNumber
                    value={stats.totalRounds}
                    decimals={0}
                    staggerIndex={0}
                    className="text-h1 font-light text-warm-900 tabular-nums tracking-[-0.025em]"
                  />
                }
              />
              <StatTile
                icon={<IconFlag size={14} />}
                label="Avg Score"
                staggerIndex={1}
                value={
                  <AnimatedNumber
                    value={stats.avg}
                    decimals={1}
                    staggerIndex={1}
                    className="text-h1 font-light text-warm-900 tabular-nums tracking-[-0.025em]"
                  />
                }
              />
              <StatTile
                icon={<IconTrophy size={14} className="text-primary-600" />}
                iconBg="bg-primary-50"
                label="Best Round"
                staggerIndex={2}
                value={
                  <AnimatedNumber
                    value={stats.best}
                    decimals={0}
                    staggerIndex={2}
                    className={cn(
                      'text-h1 font-light tabular-nums tracking-[-0.025em]',
                      stats.best < 72 ? 'text-primary-700' : 'text-warm-900',
                    )}
                  />
                }
              />
              <StatTile
                icon={
                  stats.avgToPar !== null && stats.avgToPar < 0 ? (
                    <IconTrendingDown size={14} className="text-primary-600" />
                  ) : (
                    <IconTrendingUp size={14} />
                  )
                }
                iconBg={
                  stats.avgToPar !== null && stats.avgToPar < 0 ? 'bg-primary-50' : undefined
                }
                label="Avg to Par"
                staggerIndex={3}
                value={
                  stats.avgToPar !== null ? (
                    <span
                      className={cn(
                        'text-h1 font-light tabular-nums tracking-[-0.025em]',
                        stats.avgToPar < 0 ? 'text-primary-700' : 'text-warm-900',
                      )}
                    >
                      {stats.avgToPar >= 0 ? '+' : ''}
                      <AnimatedNumber
                        value={stats.avgToPar}
                        decimals={1}
                        staggerIndex={3}
                        className=""
                      />
                    </span>
                  ) : (
                    <span className="text-h1 font-light text-warm-300">—</span>
                  )
                }
              />
              <StatTile
                label="Under Par"
                staggerIndex={4}
                topRight={
                  stats.trend ? (
                    <span
                      className={cn(
                        'text-eyebrow font-semibold uppercase tracking-[0.08em] px-1.5 py-px rounded-full',
                        stats.trend === 'improving' && 'text-primary-700 bg-primary-100',
                        stats.trend === 'declining' && 'text-helm-amber-700 bg-helm-amber-50',
                        stats.trend === 'stable' && 'text-warm-500 bg-warm-100',
                      )}
                    >
                      {stats.trend}
                    </span>
                  ) : null
                }
                value={
                  <span className="text-h1 font-light text-warm-900 tabular-nums tracking-[-0.025em]">
                    <AnimatedNumber value={stats.underParPct} decimals={0} staggerIndex={4} />%
                  </span>
                }
              />
            </div>
          </Reveal>
        )}

        {/* Filter chips + group toggle — sticky on scroll */}
        <Reveal staggerIndex={2}>
          <div
            className={cn(
              'sticky top-0 z-10 mb-4 -mx-4 md:-mx-6 px-4 md:px-6 py-2.5',
              'flex flex-wrap items-center gap-3',
              'bg-cream-50/80 backdrop-blur-md border-b border-warm-200/50',
            )}
          >
            <div className="inline-flex items-center gap-1 rounded-full bg-cream-100 p-1 text-eyebrow font-medium">
              {(['all', 'practice', 'qualifier', 'tournament'] as RoundFilter[]).map((f) => {
                const active = filter === f;
                const count = filterCounts[f];
                return (
                  <Button variant="ghost"
                    key={f}
                    onClick={() => setFilter(f)}
                    type="button"
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all duration-200',
                      active
                        ? 'bg-white text-warm-900 shadow-[0_1px_2px_hsl(42_14%_22%/0.06),0_4px_10px_hsl(42_14%_22%/0.08)]'
                        : 'text-warm-500 hover:text-warm-700',
                    )}
                  >
                    <span className="capitalize">{f === 'all' ? 'All' : f}</span>
                    <span
                      className={cn(
                        'tabular-nums text-eyebrow',
                        active ? 'text-warm-500' : 'text-warm-400',
                      )}
                    >
                      {count}
                    </span>
                  </Button>
                );
              })}
            </div>
            <div className="ml-auto">
              <ToggleGroup
                type="single"
                value={grouping}
                onValueChange={(v) => v && setGrouping(v as Grouping)}
                className="text-eyebrow"
              >
                <ToggleGroupItem value="month" className="px-3 py-1.5 rounded-full data-[state=on]:bg-white data-[state=on]:text-warm-900 data-[state=on]:shadow-[0_1px_2px_hsl(42_14%_22%/0.06),0_4px_10px_hsl(42_14%_22%/0.08)]">
                  Month
                </ToggleGroupItem>
                <ToggleGroupItem value="week" className="px-3 py-1.5 rounded-full data-[state=on]:bg-white data-[state=on]:text-warm-900 data-[state=on]:shadow-[0_1px_2px_hsl(42_14%_22%/0.06),0_4px_10px_hsl(42_14%_22%/0.08)]">
                  Week
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </Reveal>

        {/* Period groups */}
        {grouped.length === 0 ? (
          <Reveal staggerIndex={3}>
            <div className="surface-stone rounded-3xl p-12 text-center">
              <p className="text-warm-500 text-sm">
                No {filter === 'all' ? '' : filter + ' '}rounds in this view.
              </p>
            </div>
          </Reveal>
        ) : (
          <div className="space-y-7">
            {grouped.map((group, gi) => {
              // Find best (lowest score-to-par) of this period for the trophy accent
              let bestId: string | null = null;
              let bestScore = Infinity;
              for (const r of group.rounds) {
                if (r.score_to_par !== null && r.score_to_par < bestScore) {
                  bestScore = r.score_to_par;
                  bestId = r.id;
                }
              }
              return (
                <Reveal key={group.label + gi} staggerIndex={Math.min(gi + 3, 6)}>
                  <section>
                    <PeriodHeader label={group.label} rounds={group.rounds} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {group.rounds.map((round, ri) => (
                        <RoundCardV2
                          key={round.id}
                          round={round}
                          isBestOfPeriod={round.id === bestId && group.rounds.length > 1}
                          userRole={userRole}
                          staggerIndex={Math.min(ri, 8)}
                        />
                      ))}
                    </div>
                  </section>
                </Reveal>
              );
            })}
          </div>
        )}
      </div>
    </LazyMotion>
  );
}

// -- StatTile ----------------------------------------------------------------

function StatTile({
  icon,
  iconBg = 'bg-warm-100',
  label,
  value,
  topRight,
}: {
  icon?: React.ReactNode;
  iconBg?: string;
  label: string;
  value: React.ReactNode;
  topRight?: React.ReactNode;
  staggerIndex?: number;
}) {
  return (
    <div className="surface-matte relative overflow-clip rounded-2xl p-4 md:p-5">
      <div className="relative flex items-center justify-between mb-1.5">
        {icon ? (
          <div className={cn('w-6 h-6 rounded-md flex items-center justify-center text-warm-500', iconBg)}>
            {icon}
          </div>
        ) : (
          <span />
        )}
        {topRight}
      </div>
      <div className="relative">{value}</div>
      <p className="relative text-xs text-warm-400 font-medium uppercase tracking-wider mt-0.5">
        {label}
      </p>
    </div>
  );
}
