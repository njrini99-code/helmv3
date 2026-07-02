'use client';

import { useRouter } from 'next/navigation';
import { FilterPill } from '@/components/fairway';

export interface ErrorsFilterChip {
  key: string;
  label: string;
  href: string;
  selected: boolean;
}

/**
 * The Errors tab's toggleable filter row (sport/severity/source/window),
 * built on the Fairway FilterPill primitive instead of hand-rolled <Link>
 * chips — same deep-linkable hrefs (server-computed in page.tsx via
 * chipHref/clearParamHref) and the same selected state, just the shared
 * chip visuals + a11y (aria-pressed) everywhere else in the console uses.
 */
export function ErrorsFilterChips({ chips }: { chips: readonly ErrorsFilterChip[] }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter errors">
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
