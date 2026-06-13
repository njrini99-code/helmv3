'use client';

/**
 * TeamSwitcher — the program-head team toggle, rendered at the TOP of the
 * coach dashboard (Fairway top bar's action cluster; a top strip in the
 * legacy shell). Shown ONLY when the signed-in coach is a multi-team head
 * coach (`canSwitch` — see getCoachTeamSwitchContext).
 *
 * Two presentations:
 *   1. PILL TOGGLE — when the coach staffs exactly 2 teams with distinct
 *      genders (the classic men's/women's program). A rounded-full segmented
 *      pill: the active segment is filled with the TEAM ACCENT (men's = helm
 *      green, women's = violet) so the colour itself signals which team you're
 *      viewing; inactive is transparent warm-500. 44px tap targets.
 *   2. DROPDOWN — fallback for >2 teams or missing/duplicate genders. A
 *      Radix DropdownMenu listing each team.
 *
 * Selecting a team flips the UI OPTIMISTICALLY (the pill + the shell's accent
 * wash/underline change instantly via `onOptimisticSwitch`), then calls the
 * `setActiveTeam` server action (validated + head-coach-gated) and
 * `router.refresh()` so RSC pages re-render with the new team. On failure the
 * optimistic state reverts.
 *
 * Accessibility: pill = `radiogroup` of `aria-checked` buttons; dropdown is
 * fully keyboard-navigable via Radix primitives. Colour is enhancement only —
 * the visible "Men's"/"Women's" text + `aria-checked` carry the state.
 */

import { useEffect, useState, useTransition } from 'react';
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
import { normalizeTeamGender, teamGenderLabel, teamAccentVar, type TeamGender } from '@/lib/golf/team-theme';

export interface TeamSwitcherProps {
  /** All teams the coach is staffed on (fetched server-side in layout). */
  teams: CoachTeamOption[];
  /** Currently active team id (already validated server-side). */
  activeTeamId: string;
  /**
   * Program-head gate resolved server-side (getCoachTeamSwitchContext).
   * The switcher renders nothing unless this is true.
   */
  canSwitch: boolean;
  /**
   * Called the instant a team is picked, with the picked team's gender (or
   * null), so the shell can flip its accent wash/underline optimistically —
   * before the server round-trip. Called again with the prior gender if the
   * switch fails (revert).
   */
  onOptimisticSwitch?: (gender: TeamGender | null) => void;
}

/** Display label for any team (dropdown rows). */
function teamLabel(team: CoachTeamOption): string {
  const g = normalizeTeamGender(team.gender);
  return g ? `${teamGenderLabel(g)} — ${team.name}` : team.name;
}

export function TeamSwitcher({ teams, activeTeamId, canSwitch, onOptimisticSwitch }: TeamSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  // Optimistic active id: flip the pill the instant it's clicked, then clear
  // back to the server value once `activeTeamId` re-renders after refresh.
  const [optimisticId, setOptimisticId] = useState<string | null>(null);
  useEffect(() => {
    setOptimisticId(null);
  }, [activeTeamId]);
  const effectiveActiveId = optimisticId ?? activeTeamId;

  // Only multi-team HEAD coaches get the toggle (layout gates rendering too,
  // but guard here so a stray mount can never show it).
  if (!canSwitch || teams.length <= 1) return null;

  const genderOf = (id: string): TeamGender | null =>
    normalizeTeamGender(teams.find((t) => t.id === id)?.gender);

  const handleSelect = (teamId: string) => {
    if (teamId === effectiveActiveId || isPending) return;
    setOpen(false);

    // Optimistic flip (pill segment + shell accent) — instant feedback.
    const priorId = effectiveActiveId;
    setOptimisticId(teamId);
    onOptimisticSwitch?.(genderOf(teamId));

    startTransition(async () => {
      const result = await setActiveTeam(teamId);
      if (result.success) {
        router.refresh();
      } else {
        // Revert the optimistic flip on failure.
        setOptimisticId(null);
        onOptimisticSwitch?.(genderOf(priorId));
      }
    });
  };

  // ── Pill mode: exactly 2 teams with distinct genders (men's vs women's) ──
  const genders = teams.map((t) => normalizeTeamGender(t.gender));
  const pillMode =
    teams.length === 2 &&
    genders[0] !== null &&
    genders[1] !== null &&
    genders[0] !== genders[1];

  if (pillMode) {
    // Men's segment first, matching the "Men's | Women's" label order.
    const ordered = [...teams].sort((a) =>
      normalizeTeamGender(a.gender) === 'mens' ? -1 : 1,
    );
    return (
      <div
        role="radiogroup"
        aria-label="Switch team view"
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full p-0.5',
          'border border-warm-200 bg-cream-50',
        )}
      >
        {ordered.map((team) => {
          const gender = normalizeTeamGender(team.gender)!;
          const isActive = team.id === effectiveActiveId;
          return (
            // eslint-disable-next-line helm/no-raw-button -- pill segments need role="radio" semantics a <Button> doesn't expose
            <button
              key={team.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={`${teamGenderLabel(gender)} team — ${team.name}`}
              disabled={isPending}
              onClick={() => handleSelect(team.id)}
              className={cn(
                'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-4',
                'font-fw-sans text-body-sm font-medium whitespace-nowrap select-none',
                'transition-colors [transition-duration:var(--fw-dur-base)] [transition-timing-function:var(--fw-ease-glide)]',
                'motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
                'disabled:cursor-default',
                isActive
                  ? 'text-white shadow-soft'
                  : 'bg-transparent text-warm-500 hover:text-warm-700',
              )}
              style={
                isActive
                  ? ({
                      backgroundColor: teamAccentVar(gender),
                      // accent-tinted focus ring to match the active team
                      ['--tw-ring-color' as string]: teamAccentVar(gender),
                    } as React.CSSProperties)
                  : undefined
              }
            >
              {/* Active-team dot — a second, non-colour cue alongside the label.
                  Uses the on-accent token (cream on the filled pill). */}
              <span
                aria-hidden
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-opacity [transition-duration:var(--fw-dur-base)]',
                  isActive ? 'opacity-100' : 'opacity-0',
                )}
                style={isActive ? { backgroundColor: 'var(--fw-color-text-on-accent)' } : undefined}
              />
              {teamGenderLabel(gender)}
            </button>
          );
        })}
      </div>
    );
  }

  // ── Dropdown fallback: >2 teams or missing/duplicate genders ──
  const activeTeam = teams.find((t) => t.id === effectiveActiveId) ?? teams[0]!;
  const activeAccent = teamAccentVar(normalizeTeamGender(activeTeam.gender));

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
            'flex h-auto min-h-[44px] items-center gap-2 rounded-full border border-warm-200 bg-cream-50 px-4 py-1.5 text-left',
            'font-fw-sans text-body-sm font-medium tracking-[-0.005em] text-warm-700',
            'transition-colors [transition-duration:var(--fw-dur-base)] [transition-timing-function:var(--fw-ease-glide)]',
            'motion-reduce:transition-none',
            'hover:bg-warm-100 hover:text-warm-900',
            'disabled:opacity-60',
          )}
        >
          <span
            aria-hidden
            className="h-2 w-2 flex-shrink-0 rounded-full transition-colors [transition-duration:var(--fw-dur-base)]"
            style={{ backgroundColor: activeAccent ?? 'var(--fw-color-accent-500)' }}
          />
          <IconUsers size={14} aria-hidden className="flex-shrink-0 text-primary-600" />
          <span className="min-w-0 max-w-[200px] flex-1 truncate">{teamLabel(activeTeam)}</span>
          <IconChevronDown
            size={12}
            aria-hidden
            className={cn(
              'flex-shrink-0 text-warm-400 transition-transform duration-150',
              open && 'rotate-180',
            )}
          />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={4}
        className={cn(
          'z-[var(--fw-z-nav)] min-w-[220px] overflow-hidden rounded-xl py-1.5',
          'bg-cream-50 border border-warm-200 shadow-lg',
        )}
      >
        <div role="listbox" aria-label="Select active team" className="flex flex-col gap-0.5 px-1.5">
          {teams.map((team) => {
            const isActive = team.id === effectiveActiveId;
            const g = normalizeTeamGender(team.gender);
            return (
              <DropdownMenuPrimitive.Item
                key={team.id}
                role="option"
                aria-checked={isActive}
                aria-selected={isActive}
                onSelect={() => handleSelect(team.id)}
                className={cn(
                  'flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2',
                  'font-fw-sans text-body-sm font-medium outline-none',
                  'transition-colors duration-100',
                  'focus:outline-none',
                  isActive
                    ? 'bg-primary-50 text-warm-900'
                    : 'text-warm-700 hover:bg-warm-50 hover:text-warm-900 focus:bg-warm-50 focus:text-warm-900',
                )}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: teamAccentVar(g) ?? 'var(--fw-color-warm-300)' }}
                />
                <span className="min-w-0 flex-1">
                  {g && (
                    <span className="block text-caption font-normal text-warm-500">
                      {teamGenderLabel(g)}
                    </span>
                  )}
                  <span className="block truncate">{team.name}</span>
                </span>
                {isActive && (
                  <IconCheck size={14} aria-hidden className="flex-shrink-0 text-primary-600" />
                )}
              </DropdownMenuPrimitive.Item>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
