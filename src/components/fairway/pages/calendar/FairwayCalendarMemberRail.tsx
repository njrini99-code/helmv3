'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayCalendarMemberRail — coach availability filter
 * ----------------------------------------------------------------------------
 * The Fairway-native re-skin of the legacy CalendarAvatarSidebar. A horizontal
 * avatar rail (coach-only) that multi-selects up to 8 team members (color-coded)
 * to overlay their schedules on the calendar — "ALL" shows the team calendar,
 * picking players switches to the color-coded availability overlay so the coach
 * can see a player's schedule / find common free time.
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

  const allSelected = selectedPlayerIds.length === 0;

  const toggle = (id: string) => {
    if (selectedPlayerIds.includes(id)) {
      onSelect(selectedPlayerIds.filter((x) => x !== id));
    } else if (selectedPlayerIds.length < MAX_SELECTION) {
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
        {/* ALL — visible pill stays h-9 (36px); the Button itself floors at the
            44px touch target and centers the pill inside, so only the invisible
            hit area grows. */}
        <Button
          type="button"
          variant="ghost"
          onClick={() => onSelect([])}
          aria-pressed={allSelected}
          haptic="none"
          className="group flex min-h-[44px] flex-shrink-0 items-center justify-center rounded-full p-0 hover:bg-transparent active:bg-transparent"
        >
          <span
            className={cn(
              'flex h-9 items-center rounded-full px-3.5 font-fw-sans text-caption font-semibold uppercase tracking-[0.08em] transition-colors',
              allSelected
                ? 'bg-accent-750 text-text-on-accent shadow-flat'
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
          const color = selected ? PLAYER_COLORS[idx % PLAYER_COLORS.length]! : null;
          const tint = tintFor(m.id);
          return (
            <Button
              key={m.id}
              type="button"
              variant="ghost"
              haptic="none"
              onClick={() => toggle(m.id)}
              aria-pressed={selected}
              aria-label={selected ? `${fullName(m)} (viewing schedule)` : `View ${fullName(m)}'s schedule`}
              title={fullName(m)}
              className="group relative flex h-11 min-h-[44px] w-11 min-w-[44px] flex-shrink-0 items-center justify-center overflow-visible rounded-full p-0 transition-transform hover:bg-transparent active:bg-transparent"
            >
              {/* Visible avatar chip — fixed 36x36 (h-9 w-9), unchanged from
                  before the fix. The Button around it is the 44x44 touch
                  target; only the invisible padding grows. */}
              <span
                className={cn(
                  'relative grid h-9 w-9 place-items-center overflow-visible rounded-full font-fw-sans text-caption font-semibold ring-1 ring-border-subtle transition-transform group-hover:ring-border-strong',
                  selected && 'scale-[1.06] text-white ring-0',
                )}
                style={
                  selected && color
                    ? { backgroundColor: color.bg, color: '#fff', boxShadow: `0 0 0 2px ${color.border}` }
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
                {selected && color && (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border-2 border-canvas text-microbadge font-bold text-white"
                    style={{ backgroundColor: color.bg }}
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
      {!allSelected && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em] text-text-tertiary">
            Viewing
          </span>
          {selectedPlayerIds.map((id, idx) => {
            const m = teamMembers.find((x) => x.id === id);
            if (!m) return null;
            const color = PLAYER_COLORS[idx % PLAYER_COLORS.length]!;
            return (
              <span key={id} className="flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color.bg }} />
                <span className="font-fw-sans text-caption text-text-secondary">{m.first_name}</span>
              </span>
            );
          })}
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
      )}
    </div>
  );
}
