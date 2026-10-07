'use client';

// REDESIGN-SCRATCH (docs/redesign/rounds): Direction A, season scorecard.
//
// The round list below the scorecard: type filters with counts, a course search, and one
// ledger grouped by month where every round is a compact scorecard line
// (date, course, type, OUT / IN / TOT with the same mark as the grid). A month header's
// count is the number of rows under it, so it can never disagree with what is listed.
import * as React from 'react';
import Link from 'next/link';

import { Chip } from '@/components/fairway/controls/badge';
import { Button } from '@/components/fairway/controls/button';
import { FilterPill } from '@/components/fairway/controls/filter-pill';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { SearchField } from '@/components/fairway/command/search-field';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { Surface } from '@/components/fairway/surfaces/surface';
import { cleanCourseName } from '@/lib/golf/course-name';
import { formatDateOnlyShort, formatDateOnlyWeekdayShort } from '@/lib/golf/date-only';

import { getRoundTypeLabel } from '../FairwayRoundCard';
import {
  DASH,
  ROUND_FILTERS,
  filterByType,
  filterCounts,
  groupByMonth,
  holesLabel,
  isShortRound,
  markKind,
  rowScores,
  searchRounds,
  show,
  type ARound,
  type RoundFilter,
} from './AModel';
import { ScoreMark } from './AScoreMark';

const FILTER_LABEL: Record<RoundFilter, string> = {
  all: 'All',
  practice: 'Practice',
  qualifier: 'Qualifier',
  tournament: 'Tournament',
};

// ── One round, as a scorecard line ──────────────────────────────────────────

function NineStat({ label, value, muted }: { label: string; value: number | null; muted: boolean }) {
  return (
    <span className="flex w-10 flex-col items-center leading-tight">
      <span className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.06em] text-text-tertiary">
        {label}
      </span>
      <span
        className={
          muted
            ? 'font-fw-mono text-body font-medium tabular-nums text-text-tertiary'
            : 'font-fw-mono text-body font-medium tabular-nums text-text-primary'
        }
      >
        {show(value)}
      </span>
    </span>
  );
}

export function ARoundRow({ round }: { round: ARound }) {
  const notCounted = round.countable === false;
  const { out, back, total } = rowScores(round);
  const short = isShortRound(round);
  const kind = notCounted ? 'none' : markKind(round.score_to_par);

  return (
    <Link
      href={`/golf/dashboard/rounds/${round.id}`}
      className="flex items-center gap-3 px-4 py-3 outline-none transition-colors duration-150 hover:bg-surface-tint focus-visible:bg-surface-tint focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus"
    >
      {/* Date */}
      <span className="w-12 shrink-0 leading-tight">
        <span className="block font-fw-sans text-caption text-text-tertiary">
          {formatDateOnlyWeekdayShort(round.round_date)}
        </span>
        <span className="block font-fw-sans text-body-sm font-medium tabular-nums text-text-primary">
          {formatDateOnlyShort(round.round_date)}
        </span>
      </span>

      {/* Course, type, and (on a phone) the two nines */}
      <span className="min-w-0 flex-1">
        <span
          className="block truncate font-fw-sans text-body font-medium text-text-primary"
          title={cleanCourseName(round.course_name) || undefined}
        >
          {cleanCourseName(round.course_name) || 'Unknown course'}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Chip tone="neutral" size="sm" className="shrink-0 uppercase tracking-[0.06em]">
            {getRoundTypeLabel(round.round_type)}
          </Chip>
          {short && (
            <span className="font-fw-sans text-caption text-text-secondary">{holesLabel(round)}</span>
          )}
          {notCounted && (
            <StatusPill
              tone="neutral"
              size="sm"
              dot={false}
              title="Incomplete or implausible score: left out of averages, bests and trends"
            >
              Not counted
            </StatusPill>
          )}
          <span
            className={
              notCounted
                ? 'font-fw-mono text-caption tabular-nums text-text-tertiary sm:hidden'
                : 'font-fw-mono text-caption tabular-nums text-text-secondary sm:hidden'
            }
          >
            OUT {show(out)} {'·'} IN {show(back)}
          </span>
        </span>
      </span>

      {/* OUT / IN as their own columns from sm up */}
      <span className="hidden shrink-0 items-center gap-5 sm:flex">
        <NineStat label="Out" value={out} muted={notCounted} />
        <NineStat label="In" value={back} muted={notCounted} />
      </span>

      {/* TOT, with the same mark as the scorecard grid */}
      <span className="flex w-10 shrink-0 flex-col items-center gap-0.5">
        <span className="font-fw-sans text-eyebrow font-semibold uppercase leading-none tracking-[0.06em] text-text-tertiary">
          Tot
        </span>
        {total === null ? (
          <span className="inline-flex h-8 w-8 items-center justify-center font-fw-mono text-body-sm text-text-tertiary">
            {DASH}
          </span>
        ) : (
          <ScoreMark kind={kind} size="sm" hollow={notCounted}>
            {total}
          </ScoreMark>
        )}
      </span>
    </Link>
  );
}

// ── Filters + grouped list ──────────────────────────────────────────────────

export function ARoundLedger({ rounds }: { rounds: readonly ARound[] }) {
  const [filter, setFilter] = React.useState<RoundFilter>('all');
  const [query, setQuery] = React.useState('');

  // Pill counts describe the search-scoped set, so they always match what a pill shows.
  const scoped = React.useMemo(() => searchRounds(rounds, query), [rounds, query]);
  const counts = React.useMemo(() => filterCounts(scoped), [scoped]);
  const visible = React.useMemo(() => filterByType(scoped, filter), [scoped, filter]);
  const groups = React.useMemo(() => groupByMonth(visible), [visible]);

  const isNarrowed = filter !== 'all' || query.trim() !== '';
  const resetFilters = () => {
    setFilter('all');
    setQuery('');
  };

  return (
    <section aria-label="Round history" className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        <SearchField
          size="md"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onClear={() => setQuery('')}
          aria-label="Search rounds by course"
          placeholder="Search course…"
          wrapperClassName="w-full sm:max-w-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          {ROUND_FILTERS.map((f) => (
            <FilterPill
              key={f}
              size="sm"
              selected={filter === f}
              showCheck={false}
              count={counts[f]}
              onClick={() => setFilter(f)}
            >
              {FILTER_LABEL[f]}
            </FilterPill>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <Surface padding="lg">
          <EmptyState
            variant="search"
            title="No rounds in this view"
            description={isNarrowed ? 'No rounds match the current filters.' : 'No rounds to show.'}
            action={
              isNarrowed ? (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </Surface>
      ) : (
        <Surface padding="none" className="overflow-hidden">
          {groups.map((group, gi) => (
            <div key={group.key} className={gi > 0 ? 'border-t border-border-strong' : undefined}>
              <div className="flex items-baseline justify-between gap-3 border-b border-border-subtle bg-surface-tint px-4 py-2.5">
                <h3 className="font-fw-display text-body-lg font-semibold text-text-primary">
                  {group.label}
                </h3>
                <span className="font-fw-sans text-caption tabular-nums text-text-secondary">
                  {group.rounds.length} round{group.rounds.length === 1 ? '' : 's'}
                </span>
              </div>
              <ul className="divide-y divide-border-subtle">
                {group.rounds.map((round) => (
                  <li key={round.id}>
                    <ARoundRow round={round} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Surface>
      )}
    </section>
  );
}
