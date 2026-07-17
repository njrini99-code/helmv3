'use client';

import { useRouter } from 'next/navigation';
import { FilterPill } from '@/components/fairway';

export interface AuthFilterChip {
  key: string;
  label: string;
  href: string;
  selected: boolean;
}

/**
 * The Auth tab's toggleable filter row (sport/event-type) — same pattern as
 * ErrorsFilterChips (src/app/admin/errors/ErrorsFilterChips.tsx): hrefs are
 * server-computed in page.tsx off the current URLSearchParams so every OTHER
 * active filter survives a chip click, then rendered on the shared Fairway
 * FilterPill primitive for consistent visuals + a11y (aria-pressed).
 */
export function AuthFilterChips({ chips, ariaLabel }: { chips: readonly AuthFilterChip[]; ariaLabel: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
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
