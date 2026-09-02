'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayCalendarMemberRail — coach availability filter
 * ----------------------------------------------------------------------------
 * The Fairway-native re-skin of the legacy CalendarAvatarSidebar. A horizontal
 * avatar rail (coach-only) that multi-selects team members to overlay their
 * schedules on the calendar — "ALL" selects every roster member (their
 * combined availability overlay), picking specific players narrows it to just
 * them, so the coach can see one player's schedule / find common free time.
 * Deselecting everything (clicking ALL again, or Clear) drops back to the
 * plain team calendar.
 *
 * Manual selection stays capped at 8 (one per color tint, see MAX_SELECTION
 * below) so each selected player reads as a distinct color. "ALL" bypasses
 * that cap — past 8 simultaneous selections there is no unambiguous color
 * left to assign, so those members render identified by initials + a
 * per-person tint (the same fallback FairwayMonthGrid already uses for
 * class-owner chips) instead of a numbered palette color.
 *
 * Reuses the EXACT legacy PLAYER_COLORS palette so colors match across the app.
 * Selection state is parent-owned; this is presentation only.
 * ========================================================================== */

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PLAYER_COLORS, type TeamMember } from '@/components/golf/calendar/CalendarAvatarSidebar';

const MAX_SELECTION = 8;

export interface FairwayCalendarMemberRailProps {
  teamMembers: TeamMember[];
  selectedPlayerIds: string[];
  onSelect: (ids: string[]) => void;
}

// First LETTER of a name field, skipping any parenthetical suffix (e.g. a
// "(Captain)"/"(C)" role tag some rosters store inline) and any other
// leading non-letter character — a raw `name?.[0]` picks up the suffix's
// opening "(" verbatim, rendering a garbled chip like "C(" instead of two
// clean initials (finding #85).
function firstLetter(name: string | null | undefined): string {
  if (!name) return '';
  const withoutParens = name.replace(/\(.*?\)/g, '');
  const match = withoutParens.match(/\p{L}/u);
  return match ? match[0] : '';
}

function initials(m: TeamMember): string {
  const result = `${firstLetter(m.first_name)}${firstLetter(m.last_name)}`.toUpperCase();
  return result || '—';
}
function fullName(m: TeamMember): string {
  return `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || 'Team member';
}

// Soft, warm-friendly tints for the initials fallback so unselected avatars
// read like real profile avatars (not flat gray) when a member has no photo.
// Deterministic per member id, so a person keeps the same color every render.
//
// THEME-AWARE BY INDIRECTION. These were hex literals, and because every
// consumer applies them as an INLINE style (`style={{ backgroundColor:
// tint.bg }}`) no `.dark` rule could reach them — the light pastels carried
// straight into dark mode and turned the calendar filter rail into a strip of
// near-white circles that outshone the agenda beneath it. Returning `var()`
// references instead lets design-tokens.css flip the palette (dark fill +
// light ink, same hue per person) with no change at any call site. Keep them
// as var() references: a literal here silently reintroduces the bug.
const AVATAR_TINT_COUNT = 8;
export function tintFor(seed: string): { bg: string; text: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const i = (h % AVATAR_TINT_COUNT) + 1;
  return { bg: `var(--fw-tint-${i}-bg)`, text: `var(--fw-tint-${i}-ink)` };
}

export function FairwayCalendarMemberRail({
  teamMembers,
  selectedPlayerIds,
  onSelect,
}: FairwayCalendarMemberRailProps) {
  // Scroll affordance (finding #123) — `scrollbar-hide` removes the native
  // scrollbar with NO other visual cue that the pill row continues past the
  // viewport edge, so it reads as a hard, flush cutoff rather than a
  // scrollable list. Track scroll position and fade in a small edge chevron
  // whenever there's more content in that direction.
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScrollAffordance = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  React.useEffect(() => {
    updateScrollAffordance();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollAffordance, { passive: true });
    window.addEventListener('resize', updateScrollAffordance);
    return () => {
      el.removeEventListener('scroll', updateScrollAffordance);
      window.removeEventListener('resize', updateScrollAffordance);
    };
  }, [updateScrollAffordance, teamMembers.length]);

  if (teamMembers.length === 0) return null;

  // Two distinct "nothing picked" concepts: `noneSelected` is the DEFAULT
  // state (team calendar, no overlay) and gates the quiet initials key below.
  // `isAllSelected` is "every roster member is in the overlay" — the state
  // ALL now produces — and drives the pill's own pressed/fill styling. They
  // are different states (empty vs. full), not two names for the same thing.
  const noneSelected = selectedPlayerIds.length === 0;
  const isAllSelected = teamMembers.every((m) => selectedPlayerIds.includes(m.id));

  // At the cap, `toggle` below silently drops a click on any UNSELECTED chip.
  // Five of the nine teams in production carry rosters larger than
  // MAX_SELECTION (Hampden-Sydney 15, Shenandoah 12, Guilford 12, UNCW 10,
  // Lynchburg 10 — measured 2026-08-17), so on most teams the trailing chips
  // become dead controls the moment eight are picked. The cap itself is
  // correct for MANUAL selection — it equals AVATAR_TINT_COUNT, one
  // selectable member per tint, which is what keeps the overlay legible — so
  // the fix there is to SAY so rather than to raise it.
  //
  // ALL is a different path (#1470): it bypasses the cap outright rather than
  // silently refusing it, because past 8 selections the per-index color
  // scheme has already given way to the initials-only fallback below — one
  // more selected member doesn't make that fallback any less legible. Once a
  // selection is already over the cap (only reachable via ALL), individual
  // toggles stay uncapped too, so deselecting one member and picking them
  // back doesn't get silently refused the way #1470 originally described.
  const useInitialsOnlyColoring = selectedPlayerIds.length > MAX_SELECTION;
  const atCap = selectedPlayerIds.length >= MAX_SELECTION && !useInitialsOnlyColoring;

  const toggle = (id: string) => {
    if (selectedPlayerIds.includes(id)) {
      onSelect(selectedPlayerIds.filter((x) => x !== id));
    } else if (selectedPlayerIds.length < MAX_SELECTION || useInitialsOnlyColoring) {
      onSelect([...selectedPlayerIds, id]);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        {canScrollLeft ? (
          <span
            aria-hidden
            data-testid="rail-scroll-left"
            className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-7 items-center justify-start"
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-surface shadow-flat ring-1 ring-border-subtle">
              <ChevronLeft className="h-3 w-3 text-text-tertiary" />
            </span>
          </span>
        ) : null}
        {canScrollRight ? (
          <span
            aria-hidden
            data-testid="rail-scroll-right"
            className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-7 items-center justify-end"
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-surface shadow-flat ring-1 ring-border-subtle">
              <ChevronRight className="h-3 w-3 text-text-tertiary" />
            </span>
          </span>
        ) : null}
        <div
          ref={scrollerRef}
          role="group"
          aria-label="Filter calendar by team member"
          className={cn(
            'flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5',
            // Reserve the chevron's own 28px gutter, and only while that
            // chevron is actually shown — otherwise the overlay paints on top
            // of the last avatar chip (audit L2). scroll-p* keeps
            // scroll-snapping/`scrollIntoView` clear of the gutter too.
            canScrollLeft && 'pl-7 scroll-pl-7',
            canScrollRight && 'pr-7 scroll-pr-7',
          )}
        >
        {/* ALL — selects every roster member (bypassing the manual 8 cap) so
            the overlay shows the whole team's schedule, not less than picking
            a single player (#1470). Pressing it again while everyone is
            already selected clears back to the plain team calendar; the
            "Clear" control in the legend below does the same. Visible pill
            stays h-9 (36px); the Button itself floors at the 44px touch
            target and centers the pill inside, so only the invisible hit
            area grows. */}
        <Button
          type="button"
          variant="ghost"
          onClick={() => onSelect(isAllSelected ? [] : teamMembers.map((m) => m.id))}
          aria-pressed={isAllSelected}
          haptic="none"
          className="group flex min-h-[44px] flex-shrink-0 items-center justify-center rounded-full p-0 hover:bg-transparent active:bg-transparent"
        >
          <span
            className={cn(
              'flex h-9 items-center rounded-full px-3.5 font-fw-sans text-caption font-semibold uppercase tracking-[0.08em] transition-colors',
              isAllSelected
                ? 'bg-accent-650 text-text-on-accent shadow-flat'
                : 'border border-border-subtle bg-surface-sunken text-text-secondary group-hover:bg-surface-tint',
            )}
          >
            All
          </span>
        </Button>

        <span aria-hidden className="h-6 w-px flex-shrink-0 bg-border-subtle" />

        {teamMembers.map((m) => {
          const idx = selectedPlayerIds.indexOf(m.id);
          const selected = idx !== -1;
          // Past the cap (only reachable via ALL), the index-based palette
          // wraps and two different members would render the same color —
          // so `indexColor` is deliberately null there and the chip falls
          // back to the id-hash tint instead (see `useInitialsOnlyColoring`).
          const indexColor = selected && !useInitialsOnlyColoring ? PLAYER_COLORS[idx % PLAYER_COLORS.length]! : null;
          const tint = tintFor(m.id);
          // Unselectable right now, because the cap is full. `aria-disabled`
          // rather than `disabled`: the chip stays focusable and hoverable, so
          // both the tooltip and the screen-reader name can deliver the reason.
          // A real `disabled` would also set `pointer-events-none`, which kills
          // the very tooltip that explains the state.
          const capped = !selected && atCap;
          return (
            <Button
              key={m.id}
              type="button"
              variant="ghost"
              haptic="none"
              onClick={() => toggle(m.id)}
              aria-pressed={selected}
              aria-disabled={capped || undefined}
              aria-label={
                selected
                  ? `${fullName(m)} (viewing schedule)`
                  : capped
                    ? `${fullName(m)} — already viewing the maximum of ${MAX_SELECTION} players`
                    : `View ${fullName(m)}'s schedule`
              }
              title={
                capped
                  ? `${fullName(m)} — already viewing the maximum of ${MAX_SELECTION} players. Clear one to add another.`
                  : fullName(m)
              }
              className={cn(
                'group relative flex h-11 min-h-[44px] w-11 min-w-[44px] flex-shrink-0 items-center justify-center overflow-visible rounded-full p-0 transition-transform hover:bg-transparent active:bg-transparent',
                capped && 'cursor-not-allowed',
              )}
            >
              {/* Visible avatar chip — fixed 36x36 (h-9 w-9), unchanged from
                  before the fix. The Button around it is the 44x44 touch
                  target; only the invisible padding grows. */}
              <span
                className={cn(
                  'relative grid h-9 w-9 place-items-center overflow-visible rounded-full font-fw-sans text-caption font-semibold ring-1 ring-border-subtle transition-transform group-hover:ring-border-strong',
                  indexColor && 'scale-[1.06] text-white ring-0',
                  // Selected past the cap: no palette color to carry the
                  // "selected" cue, so an accent ring does that job instead
                  // (the tint background/text stays the same as unselected —
                  // it's the person's fixed id-hash color either way).
                  selected && !indexColor && 'scale-[1.06] ring-2 ring-accent-650',
                  capped && 'opacity-40 grayscale',
                )}
                style={
                  indexColor
                    ? { backgroundColor: indexColor.bg, color: '#fff', boxShadow: `0 0 0 2px ${indexColor.border}` }
                    : m.avatar_url
                      ? undefined
                      : { backgroundColor: tint.bg, color: tint.text }
                }
              >
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span>{initials(m)}</span>
                )}
                {indexColor && (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border-2 border-canvas text-microbadge font-bold text-white"
                    style={{ backgroundColor: indexColor.bg }}
                  >
                    {idx + 1}
                  </span>
                )}
              </span>
            </Button>
          );
        })}
        </div>
      </div>

      {/* Legend / clear */}
      {!noneSelected ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em] text-text-tertiary">
            Viewing
          </span>
          {selectedPlayerIds.map((id, idx) => {
            const m = teamMembers.find((x) => x.id === id);
            if (!m) return null;
            // Same fallback as the chips above: past the cap the index-based
            // palette wraps and stops being unambiguous, so identify by the
            // person's own id-hash tint instead.
            const dotColor = useInitialsOnlyColoring
              ? tintFor(id).text
              : PLAYER_COLORS[idx % PLAYER_COLORS.length]!.bg;
            return (
              <span key={id} className="flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
                <span className="font-fw-sans text-caption text-text-secondary">{m.first_name}</span>
              </span>
            );
          })}
          {/* The cap, stated where it can be seen without hovering. The dimmed
              chips above carry it in `title`/aria-label, but `title` never
              fires on touch — and the coach who just had a click discarded is
              on the surface where the count matters. */}
          {atCap ? (
            <span className="font-fw-sans text-caption text-text-tertiary">
              Max {MAX_SELECTION} — clear one to swap
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            haptic="none"
            onClick={() => onSelect([])}
            className="ml-auto h-auto min-h-0 w-auto p-0 font-fw-sans text-caption font-medium text-accent-700 transition-colors hover:bg-transparent hover:text-fw-success-ink"
          >
            Clear
          </Button>
        </div>
      ) : (
        // DEFAULT (nothing selected) — the row above is otherwise nine
        // unlabelled two-letter chips: an accessible name + `title` tooltip
        // exist per-chip (finding: "unlabelled initials"), but neither is
        // visible at rest, and `title` never fires on touch (no hover). This
        // quiet key uses the SAME tint each avatar already renders with
        // (tintFor) so identifying a chip doesn't require hovering or
        // selecting it first.
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {teamMembers.map((m) => {
            const tint = tintFor(m.id);
            return (
              <span key={m.id} className="flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tint.text }} />
                <span className="font-fw-sans text-caption text-text-tertiary">{m.first_name}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
