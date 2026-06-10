'use client';

/**
 * TeamSwitcher — shown in the sidebar identity block when a coach staffs
 * more than one team (via golf_team_coach_staff).
 *
 * Design: matches the Fairway warm-black sidebar palette (nav-bg, nav-text,
 * nav-accent, nav-surface). Renders a compact button that opens a Radix
 * DropdownMenu listing each team; selecting one calls the `setActiveTeam`
 * server action then does a `router.refresh()` so RSC pages re-render
 * with the new team.
 *
 * Accessibility: fully keyboard-navigable via Radix primitives; active team
 * is marked with a green checkmark and `aria-checked`.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { setActiveTeam } from '@/app/golf/actions/team-switcher';
import { IconChevronDown, IconCheck, IconUsers } from '@/components/icons';
import type { CoachTeamOption } from '@/lib/golf/resolve-team';

export interface TeamSwitcherProps {
  /** All teams the coach is staffed on (fetched server-side in layout). */
  teams: CoachTeamOption[];
  /** Currently active team id (already validated server-side). */
  activeTeamId: string;
  /**
   * Visual variant:
   *   'sidebar'   — warm-black rail styling (for FairwaySidebar / GolfSidebar).
   *   'surface'   — cream/glass styling (for light surfaces or legacy shell).
   */
  variant?: 'sidebar' | 'surface';
}

/** Short gender label for the team pill. */
function genderLabel(gender: string): string {
  if (gender === 'male') return "Men's";
  if (gender === 'female') return "Women's";
  return gender;
}

export function TeamSwitcher({ teams, activeTeamId, variant = 'sidebar' }: TeamSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  // Should never render with ≤1 team (layout gates it), but guard anyway.
  if (teams.length <= 1) return null;

  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? teams[0]!;

  const handleSelect = (teamId: string) => {
    if (teamId === activeTeamId || isPending) return;
    setOpen(false);
    startTransition(async () => {
      const result = await setActiveTeam(teamId);
      if (result.success) {
        router.refresh();
      }
    });
  };

  const isSidebar = variant === 'sidebar';

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          aria-label="Switch active team"
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            'flex h-auto w-full items-center gap-2 rounded-fw-md px-2 py-1.5 text-left',
            'font-fw-sans text-caption font-medium tracking-[-0.005em]',
            'transition-colors [transition-duration:var(--fw-dur-base)] [transition-timing-function:var(--fw-ease-glide)]',
            'motion-reduce:transition-none',
            'disabled:opacity-60',
            isSidebar
              ? 'text-nav-text-dim hover:bg-nav-surface/60 hover:text-nav-text'
              : 'text-warm-600 hover:bg-warm-100 hover:text-warm-900',
          )}
        >
          <IconUsers
            size={13}
            aria-hidden
            className={cn('flex-shrink-0', isSidebar ? 'text-nav-accent' : 'text-primary-600')}
          />
          <span className="min-w-0 flex-1 truncate">
            {genderLabel(activeTeam.gender)} — {activeTeam.name}
          </span>
          <IconChevronDown
            size={12}
            aria-hidden
            className={cn(
              'flex-shrink-0 transition-transform duration-150',
              open && 'rotate-180',
              isSidebar ? 'text-nav-text-dim' : 'text-warm-400',
            )}
          />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={4}
        // Override default surface-stone → warm cream for sidebar context.
        className={cn(
          'z-[var(--fw-z-nav)] min-w-[200px] overflow-hidden rounded-xl py-1.5',
          isSidebar
            ? 'bg-[#1a1614] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)]'
            : 'bg-cream-50 border border-warm-200 shadow-lg',
        )}
      >
        <div
          role="listbox"
          aria-label="Select active team"
          className="flex flex-col gap-0.5 px-1.5"
        >
          {teams.map((team) => {
            const isActive = team.id === activeTeamId;
            return (
              <DropdownMenuPrimitive.Item
                key={team.id}
                role="option"
                aria-checked={isActive}
                aria-selected={isActive}
                onSelect={() => handleSelect(team.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2',
                  'font-fw-sans text-body-sm font-medium outline-none',
                  'transition-colors duration-100',
                  'focus:outline-none',
                  isSidebar
                    ? isActive
                      ? 'bg-nav-surface text-nav-text'
                      : 'text-nav-text-dim hover:bg-nav-surface/60 hover:text-nav-text focus:bg-nav-surface/60 focus:text-nav-text'
                    : isActive
                      ? 'bg-primary-50 text-warm-900'
                      : 'text-warm-700 hover:bg-warm-50 hover:text-warm-900 focus:bg-warm-50 focus:text-warm-900',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-caption font-normal',
                      isSidebar ? 'text-nav-text-dim' : 'text-warm-500',
                    )}
                  >
                    {genderLabel(team.gender)}
                  </span>
                  <span className="block truncate">{team.name}</span>
                </span>
                {isActive && (
                  <IconCheck
                    size={14}
                    aria-hidden
                    className={cn('flex-shrink-0', isSidebar ? 'text-nav-accent' : 'text-primary-600')}
                  />
                )}
              </DropdownMenuPrimitive.Item>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
