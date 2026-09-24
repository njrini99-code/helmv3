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
 * ErrorsFilterBar. Single-select: choosing a kind navigates to
 * `?type=<kind>`; re-selecting it (or "All") clears the param. Server
 * refetch on every change — never client-side row hiding.
 */
export function ActivityKindFilterChips({ chips }: { chips: readonly ActivityKindChip[] }) {
  const router = useRouter();
  return (
    // Ten chips wrapped into three or four rows on a phone — a screenful of
    // filter before the feed. Below `sm` they are one row that scrolls inside
    // itself (never the page); `py-1` keeps focus rings inside the clip box.
    // 44px on touch, matching Fairway Button's coarse-pointer bump.
    <div
      className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label="Filter activity by kind"
    >
      {chips.map((chip) => (
        <FilterPill
          key={chip.key}
          size="sm"
          showCheck={false}
          selected={chip.selected}
          className="shrink-0 [@media(pointer:coarse)]:min-h-11"
          onClick={() => router.push(chip.href)}
        >
          {chip.label}
        </FilterPill>
      ))}
    </div>
  );
}
