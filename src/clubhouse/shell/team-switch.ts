'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useState, useTransition } from 'react';
import { setActiveTeam } from '@/app/golf/actions/team-switcher';
import type { GolfUserData } from '@/contexts/golf-user-context';
import { normalizeTeamGender, teamGenderLabel } from '@/lib/golf/team-theme';
import { useAction, type ActionCopy, type ActionResult } from '../lib/use-action';

export interface ChTeamChoice {
  id: string;
  label: string;
}

/** The teams a coach can switch among, and the one the shell is showing now. */
export interface ChTeamSwitch {
  choices: ChTeamChoice[];
  activeId: string;
}

/**
 * The switcher exists only for a head coach staffed on more than one team: `canSwitchTeams` is the same gate
 * `setActiveTeam` enforces, so an assistant on two teams is never offered a switch the server would refuse.
 * A name two teams share is told apart by its gender.
 */
export function teamSwitchFor(user: GolfUserData): ChTeamSwitch | null {
  const teams = user.coachTeams ?? [];
  if (user.role !== 'coach' || !user.canSwitchTeams || teams.length < 2 || !user.teamId) return null;
  return {
    activeId: user.teamId,
    choices: teams.map((t) => {
      const gender = normalizeTeamGender(t.gender);
      const shared = teams.filter((o) => o.name === t.name).length > 1;
      return { id: t.id, label: shared && gender ? `${teamGenderLabel(gender)} · ${t.name}` : t.name };
    }),
  };
}

/** Why the server refused, in the coach's words. None of these is fixed by trying again. */
const REFUSED: Record<string, string> = {
  unauthenticated: 'Your session ended. Sign in again.',
  'switching-not-permitted': 'Only a head coach staffed on more than one team can switch.',
  unauthorized: "You aren't staffed on that team.",
};

/**
 * Switching teams: the same server action Fairway uses (it writes the active-team cookie after checking the coach is
 * staffed on that team), then `router.refresh()` so every screen reads for the new team. The new team shows at once
 * and goes back if the switch fails. The failure is a toast (CH-1003); a success says nothing more than the new team.
 * The follow-up (the refresh, `onSwitched`) is inside the action, so the toast's Retry finishes the job as well.
 *
 * Between the tap and the new team's payload, the old team's page fades out and takes no taps (`data-ch-switching`
 * on `.ch-root`, shell.css): its figures never sit under the new team's name (PAGE_PERFORMANCE.md rule 8). The
 * refresh runs in a transition, so the mark lifts in the same commit that draws the new team's page.
 */
export function useTeamSwitch({ choices, activeId }: ChTeamSwitch, onSwitched?: () => void) {
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  // The refresh brought the server's own answer: it replaces the one shown meanwhile.
  useEffect(() => setPicked(null), [activeId]);
  const shownId = picked ?? activeId;
  const nameOf = (id: string) => choices.find((c) => c.id === id)?.label ?? 'that team';

  const action = useAction(
    'shell.switchTeam',
    async (teamId: string) => {
      setPicked(teamId);
      try {
        const res = await setActiveTeam(teamId);
        if (!res.success) {
          setPicked(null);
          return { success: false, error: REFUSED[res.reason] };
        }
        startRefresh(() => router.refresh());
        onSwitched?.();
        return { success: true };
      } catch (err) {
        setPicked(null);
        throw err;
      }
    },
    (teamId: string): ActionCopy => ({
      done: '',
      failed: `Couldn't switch to ${nameOf(teamId)}`,
      hint: `You're still on ${nameOf(activeId)}. Try again.`,
      code: 'CH-1003',
    }),
    (result: ActionResult, copy: ActionCopy): ActionCopy =>
      result.success ? { ...copy, quiet: true } : result.error ? { ...copy, hint: result.error, retry: false } : copy,
  );

  const switching = action.pending || refreshing;
  // A layout effect, so the mark lifts inside the commit the page crossfade snapshots: the new page is never captured
  // faded.
  useLayoutEffect(() => {
    if (!switching) return;
    const root = document.querySelector<HTMLElement>('.ch-root');
    const content = document.getElementById('ch-content');
    root?.setAttribute('data-ch-switching', '');
    content?.setAttribute('aria-busy', 'true');
    return () => {
      root?.removeAttribute('data-ch-switching');
      content?.removeAttribute('aria-busy');
    };
  }, [switching]);

  const pick = useCallback(
    (teamId: string) => {
      // A second tap while one switch is in flight is dropped by the action itself.
      if (teamId !== shownId) void action.run(teamId);
    },
    [action, shownId],
  );

  return { shownId, pending: switching, pick };
}
