'use client';

import { useRouter } from 'next/navigation';
import { FilterPill } from '@/components/fairway';

export interface ActivityKindChip {
  key: string;
  label: string;
  href: string;
  selected: boolean;
}

/**
 * The Activity tab's kind filter row (All + the 9 activity kinds) — built on
 * the same Fairway FilterPill primitive + server-computed href pattern as
 * ErrorsFilterChips. Single-select: choosing a kind navigates to
 * `?type=<kind>`; re-selecting it (or "All") clears the param. Server
 * refetch on every change — never client-side row hiding.
 */
export function ActivityKindFilterChips({ chips }: { chips: readonly ActivityKindChip[] }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter activity by kind">
      {chips.map((chip) => (
        <FilterPill
          key={chip.key}
          size="sm"
          showCheck={false}
          selected={chip.selected}
          onClick={() => router.push(chip.href)}
        >
          {chip.label}
        </FilterPill>
      ))}
    </div>
  );
}
