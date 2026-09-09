import { FilterPillLink } from '@/components/fairway';

export interface TeamsSortChip {
  key: string;
  label: string;
  href: string;
  selected: boolean;
}

/**
 * Teams pulse's sort switcher, on the Fairway filter-pill primitive.
 *
 * REAL LINKS, not buttons that push the router. Every chip's href is already
 * computed server-side; rendering it as an `<a>` means the row can be
 * middle-clicked into a new tab, cmd-clicked, copied with "copy link address"
 * and previewed on hover — and the file stops needing a `'use client'`
 * boundary and a router hook to do what an anchor does for free. On an admin
 * console the whole point of a filtered view is that you can hand someone the
 * URL. `aria-current` replaces `aria-pressed`: a link is not a toggle.
 */
export function TeamsSortChips({ chips }: { chips: readonly TeamsSortChip[] }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Sort teams">
      {chips.map((chip) => (
        <FilterPillLink key={chip.key} href={chip.href} size="sm" showCheck={false} selected={chip.selected}>
          {chip.label}
        </FilterPillLink>
      ))}
    </nav>
  );
}
