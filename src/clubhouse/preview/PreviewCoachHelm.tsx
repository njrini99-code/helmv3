'use client';

import { useMemo } from 'react';
import { ACTIVE_FOCUS_DUPLICATE_ERROR } from '@/lib/coachhelm/focus-areas/duplicate-guard';
import type { ChCoachHelmData } from '../data/coachhelm-shape';
import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import type { ChCoachHelmWrites } from '../screens/coachhelm/writes';
import { previewCoursePlanReads } from './fixtures-course-plan';

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 400));

/**
 * The coach's CoachHelm with fake writes for the dev preview. `?state=failwrites`
 * fails every write, `failundo` fails only Undo, `duplicate` answers that the
 * player already has an active focus on the metric. `courseplan`, `courseplannone` and
 * `courseplanfailed` turn on the course plan (Slice 7c, coachhelm_course_plan_v1) with
 * fixture reads (fixtures-course-plan.ts). Nothing reaches the server.
 */
export function PreviewCoachHelm({ data, state }: { data: ChCoachHelmData; state?: string }) {
  const writes = useMemo<ChCoachHelmWrites>(() => {
    const failed = { success: false, error: 'Preview: this save is set to fail.' };
    const all = state === 'failwrites';
    return {
      assign: () => wait(all ? failed : state === 'duplicate' ? { success: false, error: ACTIVE_FOCUS_DUPLICATE_ERROR } : { success: true }),
      dismiss: () => wait(all ? failed : { success: true }),
      undo: () => wait(all || state === 'failundo' ? failed : { success: true }),
    };
  }, [state]);
  const plan = state?.startsWith('courseplan') ?? false;
  const reads = useMemo(() => previewCoursePlanReads(state), [state]);
  return <CoachBoard data={plan ? { ...data, coursePlan: true } : data} writes={writes} coursePlanReads={reads} />;
}
