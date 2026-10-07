// REDESIGN-SCRATCH (docs/redesign/rounds): the pieces all three directions share.
//
//   PreviewTabs      the review-only G / H / I links at the very top of the page
//   RoundsHeader     the real ViewHeader with the one primary action ("New round")
//   TypeFilterPills  the type filter with counts, which the brief says must survive
//   UnfinishedLine   the in-progress rounds, collapsed to one line
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { Button } from '@/components/fairway/controls/button';
import { FilterPill, FilterPillLink } from '@/components/fairway/controls/filter-pill';
import { Surface } from '@/components/fairway/surfaces/surface';
import { ViewHeader } from '@/components/fairway/view-header/view-header';
import { cn } from '@/lib/utils';

import { NOT_COUNTED, ROUNDS, TYPE_FILTERS, UNFINISHED_FAKE, type TypeFilterKey } from './model';

export type Direction = 'G' | 'H' | 'I';

const DIRECTIONS: ReadonlyArray<{ key: Direction; label: string }> = [
  { key: 'G', label: 'G · Your usual' },
  { key: 'H', label: 'H · The ledger' },
  { key: 'I', label: 'I · Course book' },
];

/** Review chrome, not part of the design: jump between the three directions. */
export function PreviewTabs({ current }: { current: Direction }) {
  return (
    <nav aria-label="Redesign direction" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {DIRECTIONS.map((d) => (
          <FilterPillLink
            key={d.key}
            size="sm"
            showCheck={false}
            selected={d.key === current}
            href={`/fairway-preview/redesign-rounds?d=${d.key}`}
          >
            {d.label}
          </FilterPillLink>
        ))}
      </div>
      <p className="m-0 font-fw-sans text-caption text-text-secondary">
        Preview on a labeled fixture: the test player&rsquo;s {ROUNDS.length} real rounds. Scratch, deleted at ship.
      </p>
    </nav>
  );
}

/** One masthead, one primary action. No eyebrow, no description: the artifact is the point. */
export function RoundsHeader() {
  return (
    <ViewHeader
      size="compact"
      disableAnimation
      title="Your rounds"
      meta={
        <span className="tabular-nums">
          {ROUNDS.length} rounds · {NOT_COUNTED.length} not counted
        </span>
      }
      primaryAction={
        <Button asChild variant="primary" size="md">
          <Link href="/golf/dashboard/rounds/new">New round</Link>
        </Button>
      }
    />
  );
}

export function TypeFilterPills({
  value,
  onChange,
  className,
}: {
  value: TypeFilterKey;
  onChange: (next: TypeFilterKey) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label="Filter rounds by type" className={cn('flex flex-wrap items-center gap-2', className)}>
      {TYPE_FILTERS.map((f) => (
        <FilterPill
          key={f.key}
          size="sm"
          showCheck={false}
          selected={value === f.key}
          count={f.count}
          onClick={() => onChange(f.key)}
        >
          {f.label}
        </FilterPill>
      ))}
    </div>
  );
}

/**
 * Unfinished rounds, folded to one line so they stop being the first thing on the page.
 * The figures are the brief's illustrative copy (see UNFINISHED_FAKE in ./model): the fixture
 * holds no in-progress rounds.
 */
export function UnfinishedLine({ className }: { className?: string }) {
  return (
    <Surface padding="none" className={cn('flex items-center justify-between gap-3 py-1.5 pl-4 pr-2', className)}>
      <p className="m-0 font-fw-sans text-body-sm text-text-secondary tabular-nums">
        <span className="font-medium text-text-primary">{UNFINISHED_FAKE.count} unfinished</span>
        {' · '}newest {UNFINISHED_FAKE.newestDaysAgo}d ago
      </p>
      <Button variant="ghost" size="sm" rightIcon={<ChevronRight className="h-4 w-4" aria-hidden="true" />}>
        Review
      </Button>
    </Surface>
  );
}
