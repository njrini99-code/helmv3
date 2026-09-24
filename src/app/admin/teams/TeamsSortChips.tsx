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
    // One horizontally-scrolling row on a phone (its own scroller — never the
    // page's), wrapping from `sm` up. `py-1` keeps the focus ring inside the
    // scroller's clip box. Pills reach 44px on touch, matching Fairway
    // Button's own coarse-pointer bump.
    <nav
      className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
      aria-label="Sort teams"
    >
      {chips.map((chip) => (
        <FilterPillLink
          key={chip.key}
          href={chip.href}
          size="sm"
          showCheck={false}
          selected={chip.selected}
          className="shrink-0 [@media(pointer:coarse)]:min-h-11"
        >
          {chip.label}
        </FilterPillLink>
      ))}
    </nav>
  );
}
