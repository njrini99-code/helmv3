'use client';

import { useRouter } from 'next/navigation';
import { FilterPill } from '@/components/fairway';

export interface WorkFilterChip {
  key: string;
  label: string;
  href: string;
  selected: boolean;
  count?: number;
}

/**
 * The Work log tab's area + state filter rows — server computes every chip's
 * href/count from the already-fetched `counts.byArea`/`counts` tags (no new
 * fetch), this component just navigates. Same href-based pattern as
 * ActivityKindFilterChips (src/app/admin/activity/ActivityKindFilterChips.tsx)
 * — "server refetch on every change, never client-side row hiding" per that
 * component's own doc comment.
 */
export function WorkFilterChips({
  areaChips,
  stateChips,
}: {
  areaChips: readonly WorkFilterChip[];
  stateChips: readonly WorkFilterChip[];
}) {
  const router = useRouter();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter PRs by area">
        <span className="text-xs font-medium uppercase tracking-widest text-warm-500">Area</span>
        {areaChips.map((chip) => (
          <FilterPill
            key={chip.key}
            size="sm"
            showCheck={false}
            selected={chip.selected}
            count={chip.count}
            onClick={() => router.push(chip.href)}
          >
            {chip.label}
          </FilterPill>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter PRs by state">
        <span className="text-xs font-medium uppercase tracking-widest text-warm-500">State</span>
        {stateChips.map((chip) => (
          <FilterPill
            key={chip.key}
            size="sm"
            showCheck={false}
            selected={chip.selected}
            count={chip.count}
            onClick={() => router.push(chip.href)}
          >
            {chip.label}
          </FilterPill>
        ))}
      </div>
    </div>
  );
}
