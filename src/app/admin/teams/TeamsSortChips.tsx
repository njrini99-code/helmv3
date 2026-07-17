'use client';

import { useRouter } from 'next/navigation';
import { FilterPill } from '@/components/fairway';

export interface TeamsSortChip {
  key: string;
  label: string;
  href: string;
  selected: boolean;
}

/**
 * Teams pulse's sort switcher — built on the Fairway FilterPill primitive
 * (same href-based, server-computed navigation as WorkFilterChips /
 * ErrorsFilterChips / AuthFilterChips / UserRoleFilterChips) instead of a
 * hand-rolled <Link> pill row, so it gets the shared chip visuals + a11y
 * (aria-pressed) everywhere else in the console uses.
 */
export function TeamsSortChips({ chips }: { chips: readonly TeamsSortChip[] }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Sort teams">
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
