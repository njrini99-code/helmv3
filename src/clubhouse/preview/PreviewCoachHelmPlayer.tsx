'use client';

import { useMemo } from 'react';
import type { ChPlayerHelm } from '../data/coachhelm-shape';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import type { ChPlayerWrites } from '../screens/coachhelm/writes';

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 400));

/**
 * The player's CoachHelm with fake writes for the dev preview. `?state=failproposal` fails Accept and Decline, so the toast,
 * its Retry and the button that stays can be seen. Nothing reaches the server.
 */
export function PreviewCoachHelmPlayer({ data, state }: { data: ChPlayerHelm; state?: string }) {
  const writes = useMemo<ChPlayerWrites>(() => {
    const failed = { success: false, error: 'Preview: this save is set to fail.' };
    return { accept: () => wait(state === 'failproposal' ? failed : { success: true }), decline: () => wait(state === 'failproposal' ? failed : { success: true }) };
  }, [state]);
  return <PlayerBoard data={data} writes={writes} />;
}
