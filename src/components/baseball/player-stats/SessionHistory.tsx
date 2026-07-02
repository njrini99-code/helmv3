'use client';

/**
 * SessionHistory — expandable list of individual stat sessions.
 *
 * Living Annual migration (design-system-living-annual.md §7). PRESENTATION
 * ONLY — same `BaseballPlayerStats[]` the caller already fetched, same
 * all/game/practice filter + single-expanded-row state. Each row settles in
 * via `<Reveal>` (Stage-0 interaction layer, §7.1) on load; the row toggle
 * uses the shared `<Button variant="ghost">` (which already owns its own
 * press feedback — no duplicate `pressableClass`). The old comma-joined
 * "3H, 1 2B, 0 3B, 1HR" strings become individual `<KPIContentsStrip>`
 * figures so every counting stat is its own `<StatReadout>`, and the session
 * slash line renders through the real `<SlashLine>` atom instead of a
 * hand-joined `.toFixed(3)` string.
 */
import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { IconChevronDown, IconChevronUp, IconCalendar } from '@/components/icons';
import type { BaseballPlayerStats } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  PaperCard,
  Eyebrow,
  SlashLine,
  StatReadout,
  KPIContentsStrip,
  EmptyIssue,
  Reveal,
  InkBadge,
  formatRate,
  formatInnings,
} from '@/components/baseball/living-annual';
import type { KPIContentsItem } from '@/components/baseball/living-annual';

interface SessionHistoryProps {
  stats: BaseballPlayerStats[];
  className?: string;
}

interface SessionRowProps {
  stat: BaseballPlayerStats;
  isExpanded: boolean;
  onToggle: () => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function SessionRow({ stat, isExpanded, onToggle }: SessionRowProps) {
  const avg = stat.at_bats > 0 ? stat.hits / stat.at_bats : NaN;
  const plateAppearances = stat.at_bats + stat.walks + stat.hit_by_pitch + stat.sacrifice_flies;
  const obp = plateAppearances > 0 ? (stat.hits + stat.walks + stat.hit_by_pitch) / plateAppearances : NaN;
  const totalBases = stat.hits + stat.doubles + stat.triples * 2 + stat.home_runs * 3;
  const slg = stat.at_bats > 0 ? totalBases / stat.at_bats : NaN;

  const detailItems: KPIContentsItem[] = [
    { label: '2B', value: stat.doubles },
    { label: '3B', value: stat.triples },
    { label: 'HR', value: stat.home_runs },
    { label: 'RBI', value: stat.rbis },
    { label: 'BB', value: stat.walks },
    { label: 'K', value: stat.strikeouts },
    { label: 'SB', value: stat.stolen_bases },
  ];
  if (stat.exit_velocity != null) detailItems.push({ label: 'Exit Velo', value: stat.exit_velocity, unit: 'MPH', decimals: 1 });
  if (stat.launch_angle != null) detailItems.push({ label: 'Launch', value: stat.launch_angle, unit: 'DEG', decimals: 1 });
  if (stat.innings_pitched > 0) {
    detailItems.push(
      { label: 'IP', value: formatInnings(stat.innings_pitched) },
      { label: 'K (P)', value: stat.strikeouts_thrown },
      { label: 'ER', value: stat.earned_runs },
    );
  }

  return (
    <div className="border-b border-[color:var(--hairline)] last:border-b-0">
      <Button
        variant="ghost"
        onClick={onToggle}
        className="flex h-auto w-full items-center justify-between gap-3 rounded-none px-1 py-3 text-left"
        aria-expanded={isExpanded}
        aria-label={`Session on ${formatDate(stat.session_date)}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex items-center gap-1.5 font-annual text-body-sm text-text-secondary">
            <IconCalendar size={14} aria-hidden />
            {formatDate(stat.session_date)}
          </span>
          <InkBadge label={stat.stat_type.toUpperCase()} tone={stat.stat_type === 'game' ? 'team' : 'neutral'} />
          {stat.session_name ? (
            <span className="hidden truncate font-annual text-body-sm text-text-tertiary sm:inline">{stat.session_name}</span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden items-baseline gap-1.5 sm:flex">
            <StatReadout value={formatRate(avg, 3)} ariaLabel="Session batting average" className="text-body-sm font-semibold" />
            <span className="text-eyebrow text-text-tertiary">
              ({stat.hits}/{stat.at_bats})
            </span>
          </span>
          {isExpanded ? <IconChevronUp size={16} aria-hidden /> : <IconChevronDown size={16} aria-hidden />}
        </div>
      </Button>

      {isExpanded ? (
        <div className="flex flex-col gap-5 px-1 pb-5 pt-1">
          <SlashLine avg={avg} obp={obp} slg={slg} leader="avg" size="sm" />
          <KPIContentsStrip columns={4} items={detailItems} />
          {stat.notes ? (
            <div className="border-t border-[color:var(--hairline)] pt-3">
              <span className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">Notes</span>
              <p className="mt-1 font-annual text-body-sm leading-relaxed text-text-secondary">{stat.notes}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SessionHistory({ stats, className }: SessionHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'game' | 'practice'>('all');

  const filteredStats = useMemo(() => {
    const sorted = [...stats].sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime());
    if (filter === 'all') return sorted;
    return sorted.filter((s) => s.stat_type === filter);
  }, [stats, filter]);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (stats.length === 0) {
    return <EmptyIssue variant="stats" className={className} />;
  }

  const gameSessions = stats.filter((s) => s.stat_type === 'game').length;
  const practiceSessions = stats.filter((s) => s.stat_type === 'practice').length;

  return (
    <PaperCard className={cn('overflow-hidden', className)}>
      <div className="flex flex-col gap-4 border-b border-[color:var(--hairline)] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Eyebrow ink="team">Session History</Eyebrow>
          <p className="mt-1 font-annual text-body-sm text-text-secondary">
            {stats.length} total · {gameSessions} games · {practiceSessions} practices
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Filter sessions"
          className="inline-flex items-center gap-1 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] p-1"
        >
          {(['all', 'game', 'practice'] as const).map((f) => (
            <Button
              key={f}
              type="button"
              variant="ghost"
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              haptic="none"
              className={cn(
                'min-h-0 rounded-md px-3 py-1.5 text-body-sm font-medium capitalize',
                filter === f ? 'bg-grade-plus text-white hover:bg-grade-plus' : 'text-text-secondary hover:bg-[color:var(--paper-canvas)]',
              )}
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      <div className="max-h-[480px] overflow-y-auto px-6">
        {filteredStats.length === 0 ? (
          <div className="py-8">
            <p className="text-center font-annual text-body-sm text-text-secondary">No {filter} sessions found.</p>
          </div>
        ) : (
          filteredStats.map((stat, i) => (
            <Reveal key={stat.id} staggerIndex={Math.min(i, 10)}>
              <SessionRow stat={stat} isExpanded={expandedId === stat.id} onToggle={() => handleToggle(stat.id)} />
            </Reveal>
          ))
        )}
      </div>
    </PaperCard>
  );
}
