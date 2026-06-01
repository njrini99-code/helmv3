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

import { cn } from '@/lib/utils';
import { PLAYER_COLORS, type TeamMember } from '@/components/golf/calendar/CalendarAvatarSidebar';

const MAX_SELECTION = 8;

export interface FairwayCalendarMemberRailProps {
  teamMembers: TeamMember[];
  selectedPlayerIds: string[];
  onSelect: (ids: string[]) => void;
}

function initials(m: TeamMember): string {
  return `${m.first_name?.[0] ?? ''}${m.last_name?.[0] ?? ''}`.toUpperCase() || '—';
}
function fullName(m: TeamMember): string {
  return `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || 'Team member';
}

// Soft, warm-friendly tints for the initials fallback so unselected avatars
// read like real profile avatars (not flat gray) when a member has no photo.
// Deterministic per member id, so a person keeps the same color every render.
const AVATAR_TINTS: ReadonlyArray<{ bg: string; text: string }> = [
  { bg: '#E7F0E7', text: '#3C6B4B' }, // sage
  { bg: '#E6EEF7', text: '#3A5B7C' }, // blue
  { bg: '#F6EEDF', text: '#876733' }, // tan
  { bg: '#F4E7EC', text: '#8A3B5C' }, // rose
  { bg: '#ECE6F3', text: '#5B3B7C' }, // violet
  { bg: '#DFF0EE', text: '#2E6A65' }, // teal
  { bg: '#F7E9DF', text: '#8A4E2D' }, // clay
  { bg: '#E5F1F4', text: '#2E6377' }, // cyan
];
export function tintFor(seed: string): { bg: string; text: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length]!;
}

export function FairwayCalendarMemberRail({
  teamMembers,
  selectedPlayerIds,
  onSelect,
}: FairwayCalendarMemberRailProps) {
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
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
        {/* ALL */}
        <button
          type="button"
          onClick={() => onSelect([])}
          aria-pressed={allSelected}
          className={cn(
            'flex h-9 flex-shrink-0 items-center rounded-full px-3.5 font-fw-sans text-caption font-semibold uppercase tracking-[0.08em] transition-colors',
            allSelected
              ? 'bg-accent-500 text-text-on-accent shadow-flat'
              : 'border border-border-subtle bg-surface-sunken text-text-secondary hover:bg-surface-tint',
          )}
        >
          All
        </button>

        <span aria-hidden className="h-6 w-px flex-shrink-0 bg-border-subtle" />

        {teamMembers.map((m) => {
          const idx = selectedPlayerIds.indexOf(m.id);
          const selected = idx !== -1;
          const color = selected ? PLAYER_COLORS[idx % PLAYER_COLORS.length]! : null;
          const tint = tintFor(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              aria-pressed={selected}
              aria-label={selected ? `${fullName(m)} (viewing schedule)` : `View ${fullName(m)}'s schedule`}
              title={fullName(m)}
              className={cn(
                'relative grid h-9 w-9 flex-shrink-0 place-items-center overflow-visible rounded-full font-fw-sans text-caption font-semibold ring-1 ring-border-subtle transition-transform hover:ring-border-strong',
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
                  className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border-2 border-canvas text-[9px] font-bold text-white"
                  style={{ backgroundColor: color.bg }}
                >
                  {idx + 1}
                </span>
              )}
            </button>
          );
        })}
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
          <button
            type="button"
            onClick={() => onSelect([])}
            className="ml-auto font-fw-sans text-caption font-medium text-accent-700 transition-colors hover:text-accent-800"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

export default FairwayCalendarMemberRail;
