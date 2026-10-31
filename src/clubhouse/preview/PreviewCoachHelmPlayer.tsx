'use client';

import { useMemo } from 'react';
import type { ChPlayerHelm } from '../data/coachhelm-shape';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import type { ChPlayerWrites } from '../screens/coachhelm/writes';
import { previewMyCoursePlanReads } from './fixtures-course-plan';

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 400));

/**
 * The player's CoachHelm with fake writes for the dev preview. `?state=failproposal` fails Accept and Decline, so the toast,
 * its Retry and the button that stays can be seen. `courseplan`, `courseplannone` and `courseplanfailed` turn on the player's
 * own course plan (chs-21, coachhelm_course_plan_v1) with fixture reads (fixtures-course-plan.ts). Nothing reaches the server.
 */
export function PreviewCoachHelmPlayer({ data, state }: { data: ChPlayerHelm; state?: string }) {
  const writes = useMemo<ChPlayerWrites>(() => {
    const failed = { success: false, error: 'Preview: this save is set to fail.' };
    return { accept: () => wait(state === 'failproposal' ? failed : { success: true }), decline: () => wait(state === 'failproposal' ? failed : { success: true }) };
  }, [state]);
  const plan = state?.startsWith('courseplan') ?? false;
  const reads = useMemo(() => previewMyCoursePlanReads(state), [state]);
  return <PlayerBoard data={plan ? { ...data, coursePlan: true } : data} writes={writes} coursePlanReads={reads} />;
}
