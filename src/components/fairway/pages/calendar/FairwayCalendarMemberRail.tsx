'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayCalendarMemberRail — the coach's people entry
 * ----------------------------------------------------------------------------
 * One compact row that says whose schedule is on screen and opens the three
 * people operations, each named for what it does:
 *
 *   · Team schedule   — the ordinary team calendar (nothing selected).
 *   · Open a schedule — navigate to one person's day (`onOpenPerson`).
 *   · Compare         — deliberately choose people (the searchable picker,
 *                       its own button) or everyone (People menu), and
 *                       overlay their availability.
 *
 * The row is a small avatar preview + a plain status line + Compare + a
 * "People" menu.
 * It no longer renders a portrait carousel: the schedule is the content of
 * the calendar home, not the roster. Selection state is parent-owned.
 *
 * `tintFor` — a person's deterministic identity tint — still lives here
 * because the roster, month grid and agenda row all share it.
 * ========================================================================== */

import * as React from 'react';
import { ChevronDown, Users, UserSearch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarGroup, Button, PopoverPanel } from '@/components/fairway';
import type { TeamMember } from '@/components/golf/calendar/CalendarAvatarSidebar';
import { PLAYER_COLORS } from '@/lib/calendar/player-colors';
import { CalendarPeoplePicker, type PeoplePickerPerson } from './people/CalendarPeoplePicker';

const MAX_SELECTION = 8;

export interface FairwayCalendarMemberRailProps {
  teamMembers: TeamMember[];
  selectedPlayerIds: string[];
  onSelect: (ids: string[]) => void;
  onOpenPerson?: (id: string) => void;
}

function fullName(m: TeamMember): string {
  return `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || 'Team member';
}

// Soft, warm-friendly tints for the initials fallback so unselected avatars
// read like real profile avatars (not flat gray) when a member has no photo.
// Deterministic per member id, so a person keeps the same color every render.
//
// THEME-AWARE BY INDIRECTION: consumers apply these as INLINE styles, which no
// `.dark` rule can reach — returning `var()` references lets design-tokens.css
// flip the palette. Keep them as var() references.
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
  onOpenPerson,
}: FairwayCalendarMemberRailProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const pickerPeople = React.useMemo<PeoplePickerPerson[]>(
    () => teamMembers.map((m) => ({
      id: m.id,
      name: fullName(m),
      avatarUrl: m.avatar_url ?? null,
      role: m.role === 'coach' ? 'Coach' : 'Player',
    })),
    [teamMembers],
  );

  if (teamMembers.length === 0) return null;

  const selectedMembers = selectedPlayerIds
    .map((id) => teamMembers.find((m) => m.id === id))
    .filter((m): m is TeamMember => Boolean(m));
  const comparing = selectedMembers.length > 0;
  const isAllSelected = teamMembers.every((m) => selectedPlayerIds.includes(m.id));
  // Past the 8-color palette the index color stops being unambiguous, so the
  // legend identifies people by their own id-hash tint instead.
  const useInitialsOnlyColoring = selectedPlayerIds.length > MAX_SELECTION;

  const previewMembers = comparing ? selectedMembers : teamMembers;
  const statusTitle = comparing
    ? isAllSelected
      ? 'Comparing everyone'
      : `Comparing ${selectedMembers.length}`
    : 'Team schedule';
  const statusDetail = comparing
    ? selectedMembers.map((m) => m.first_name ?? fullName(m)).join(', ')
    : `${teamMembers.length} ${teamMembers.length === 1 ? 'person' : 'people'}`;

  return (
    <div className="flex flex-col gap-2">
      {/* Phone: status on one line, the actions on the next. md+: one row. */}
      <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
        <div className="flex min-h-10 min-w-0 flex-1 items-center gap-3">
          <AvatarGroup size="sm" max={4} ring="ring-canvas" className="shrink-0">
            {previewMembers.map((m) => (
              <Avatar key={m.id} src={m.avatar_url ?? undefined} name={fullName(m)} size="sm" decorative />
            ))}
          </AvatarGroup>
          <div className="min-w-0 flex-1">
            <p className="truncate font-fw-sans text-body-sm font-semibold text-text-primary">{statusTitle}</p>
            <p className="truncate font-fw-sans text-caption text-text-tertiary">{statusDetail}</p>
          </div>
        </div>
        <div className="-ml-2 flex flex-wrap items-center gap-1 md:ml-auto">
        {comparing ? (
          <Button variant="ghost" size="sm" onClick={() => onSelect([])}>
            Clear
          </Button>
        ) : null}
        <PopoverPanel
          open={menuOpen}
          onOpenChange={setMenuOpen}
          side="bottom"
          align="end"
          width="md"
          ariaLabel="People"
          trigger={
            <Button variant="ghost" size="sm" rightIcon={<ChevronDown className="h-3.5 w-3.5" aria-hidden />}>
              People
            </Button>
          }
        >
          <PopoverPanel.Header>Availability</PopoverPanel.Header>
          {/* Everyone: overlays every roster member (bypassing the palette
              cap); pressing it again returns to the plain team schedule. */}
          <PopoverPanel.Item
            aria-pressed={isAllSelected}
            onClick={() => {
              setMenuOpen(false);
              onSelect(isAllSelected ? [] : teamMembers.map((m) => m.id));
            }}
          >
            <span className="flex items-center gap-2.5">
              <Users className="h-4 w-4 text-text-tertiary" aria-hidden />
              {isAllSelected ? 'Stop comparing everyone' : 'Everyone'}
            </span>
          </PopoverPanel.Item>
          {onOpenPerson ? (
            <>
              <PopoverPanel.Separator />
              <PopoverPanel.Header>Open a schedule</PopoverPanel.Header>
              <div className="max-h-64 overflow-y-auto">
                {teamMembers.map((m) => (
                  <PopoverPanel.Item
                    key={m.id}
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenPerson(m.id);
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Avatar src={m.avatar_url ?? undefined} name={fullName(m)} size="xs" decorative />
                      <span className="min-w-0 truncate">{fullName(m)}</span>
                    </span>
                  </PopoverPanel.Item>
                ))}
              </div>
            </>
          ) : null}
        </PopoverPanel>
        {onOpenPerson ? (
          <CalendarPeoplePicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            mode="compare"
            people={pickerPeople}
            selectedIds={selectedPlayerIds}
            title="Compare schedules"
            doneLabel="Compare selected"
            onApply={(ids) => onSelect(ids)}
            emptyMessage="No players on this team yet."
            trigger={
              <Button variant="ghost" size="sm" leftIcon={<UserSearch className="h-4 w-4" aria-hidden />}>
                Compare
              </Button>
            }
          />
        ) : null}
        </div>
      </div>

      {/* Legend — who is in the comparison, in the colors the overlay uses. */}
      {comparing ? (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="People in this comparison">
          {selectedPlayerIds.map((id, idx) => {
            const m = teamMembers.find((x) => x.id === id);
            if (!m) return null;
            const dotColor = useInitialsOnlyColoring
              ? tintFor(id).text
              : PLAYER_COLORS[idx % PLAYER_COLORS.length]!.bg;
            return (
              <li key={id} className="flex items-center gap-1.5">
                <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full')} style={{ backgroundColor: dotColor }} />
                <span className="font-fw-sans text-caption text-text-secondary">{m.first_name ?? fullName(m)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
