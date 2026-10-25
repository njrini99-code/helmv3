'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTeamClassDay } from '../../lib/use-class-day';
import { useClassAwareness } from '../../shell/context';
import { useClassText } from '../../ui/ClassStatusLine';
import type { ChRosterPlayer } from '../../data/roster';
import { classLinesSignature, NO_CLASS_LINES, rosterClassLines, type RosterClassLines } from './class-line';

/**
 * Roster's class lines for a team, from the shared class-day cache. With the flag off or no team id nothing is fetched
 * and the map is empty.
 *
 * `press` goes on the list's container. While a pointer is down inside it the lines are held where they were, so a
 * row never changes under a finger between touch and release (a swap there would move the thing the person is about to
 * open); the held lines catch up the moment the pointer lifts. A minute tick that changes no text changes nothing.
 */
export function useRosterClassLines(teamId: string | null | undefined, players: readonly Pick<ChRosterPlayer, 'id' | 'status'>[]) {
  const enabled = useClassAwareness();
  const { day, now } = useTeamClassDay(teamId ?? null, { enabled });
  const text = useClassText(day ? { teamTimeZone: day.teamTimeZone, classTimeZone: day.classTimeZone } : null);
  const live = useMemo(() => (enabled ? rosterClassLines(day, now, text, players) : NO_CLASS_LINES), [enabled, day, now, text, players]);
  const sig = classLinesSignature(live);

  const [pressed, setPressed] = useState(false);
  const [shown, setShown] = useState<{ sig: string; lines: RosterClassLines }>({ sig, lines: live });
  if (!pressed && shown.sig !== sig) setShown({ sig, lines: live });

  useEffect(() => {
    if (!pressed) return;
    const up = () => setPressed(false);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [pressed]);

  return { lines: shown.lines, press: { onPointerDownCapture: () => setPressed(true) } };
}
