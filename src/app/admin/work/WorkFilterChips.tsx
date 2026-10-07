import { FilterPillLink } from '@/components/fairway';

export interface WorkFilterChip {
  key: string;
  label: string;
  href: string;
  selected: boolean;
  count?: number;
}

/**
 * The Work log tab's area + state filter rows. The server computes every
 * chip's href and count from the already-fetched tags — no new fetch.
 *
 * REAL LINKS, not buttons that push the router. Every chip's href is already
 * computed server-side; rendering it as an `<a>` means the row can be
 * middle-clicked into a new tab, cmd-clicked, copied with "copy link address"
 * and previewed on hover — and the file stops needing a `'use client'`
 * boundary and a router hook to do what an anchor does for free. On an admin
 * console the whole point of a filtered view is that you can hand someone the
 * URL. `aria-current` replaces `aria-pressed`: a link is not a toggle.
 */
function ChipRow({
  label,
  chips,
  ariaLabel,
}: {
  label: string;
  chips: readonly WorkFilterChip[];
  ariaLabel: string;
}) {
  return (
    // Below `md` the row is its own horizontal scroller (up to nine area
    // chips): at the 44px touch floor, wrapping them stacked four rows of
    // chips above the timeline. The scroll is contained here, never the page.
    // From `md` the chips wrap as before.
    <nav
      className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] md:flex-wrap md:overflow-visible md:pb-0"
      aria-label={ariaLabel}
    >
      <span className="shrink-0 text-xs font-medium uppercase tracking-widest text-warm-500">{label}</span>
      {chips.map((chip) => (
        <FilterPillLink
          key={chip.key}
          href={chip.href}
          size="sm"
          showCheck={false}
          selected={chip.selected}
          count={chip.count}
          className="shrink-0 whitespace-nowrap [@media(pointer:coarse)]:min-h-11"
        >
          {chip.label}
        </FilterPillLink>
      ))}
    </nav>
  );
}

export function WorkFilterChips({
  areaChips,
  stateChips,
}: {
  areaChips: readonly WorkFilterChip[];
  stateChips: readonly WorkFilterChip[];
}) {
  return (
    <div className="space-y-2">
      <ChipRow label="Area" chips={areaChips} ariaLabel="Filter PRs by area" />
      <ChipRow label="State" chips={stateChips} ariaLabel="Filter PRs by state" />
    </div>
  );
}
