'use client';

import { useMemo } from 'react';
import { ACTIVE_FOCUS_DUPLICATE_ERROR } from '@/lib/coachhelm/focus-areas/duplicate-guard';
import type { ChViewLoad } from '../data/coachhelm-views-shape';
import { CoachPlayerFailed, CoachPlayerNotOnTeam } from '../screens/coachhelm/views/CoachPlayerStates';
import { DeepDive } from '../screens/coachhelm/views/DeepDive';
import { Profile } from '../screens/coachhelm/views/Profile';
import { DiveSkeleton, ProfileSkeleton, StandingSkeleton } from '../screens/coachhelm/views/Skeletons';
import { Standing } from '../screens/coachhelm/views/Standing';
import type { ChCoachHelmWrites } from '../screens/coachhelm/writes';
import { PREVIEW_COACH_DIVE, PREVIEW_COACH_PROFILE, PREVIEW_COACH_STANDING, PREVIEW_COACH_VOICE } from './fixtures-coachhelm-coach-player';

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 400));
const OFF = { status: 'off', reason: 'We are pausing AI insights until after the spring qualifier' } as const;

/**
 * A coach's views of one player for the dev preview (spec A; Jonah Okafor): `?view=deep-dive|standing|profile`, and `?state=` for
 * the page's answer: `notonteam` (CH-13311), `scopefailed` (CH-13209), each view's `failed`, `off` (CH-13313) and `loading`, and on
 * the Deep dive `failwrites` and `duplicate` for its action row, with `&insight=` for the read it opens on. Nothing reaches the server.
 */
export function PreviewCoachHelmCoachPlayer({ view, state, insight }: { view?: string; state?: string; insight?: string }) {
  const writes = useMemo<ChCoachHelmWrites>(() => {
    const failed = { success: false, error: 'Preview: this save is set to fail.' };
    const all = state === 'failwrites';
    return {
      assign: () => wait(all ? failed : state === 'duplicate' ? { success: false, error: ACTIVE_FOCUS_DUPLICATE_ERROR } : { success: true }),
      dismiss: () => wait(all ? failed : { success: true }),
      undo: () => wait(all ? failed : { success: true }),
    };
  }, [state]);
  if (state === 'notonteam') return <CoachPlayerNotOnTeam />;
  if (state === 'scopefailed') return <CoachPlayerFailed />;
  const voice = PREVIEW_COACH_VOICE;
  const coach = { first: 'Jonah' };
  const failed: ChViewLoad<never> = { status: 'failed' };
  if (view === 'profile') {
    if (state === 'loading') return <ProfileSkeleton coach={coach} />;
    return <Profile load={state === 'failed' ? failed : state === 'off' ? OFF : { status: 'ready', data: PREVIEW_COACH_PROFILE }} voice={voice} />;
  }
  if (view === 'standing') {
    if (state === 'loading') return <StandingSkeleton coach={coach} />;
    return <Standing load={state === 'failed' ? failed : state === 'off' ? OFF : { status: 'ready', data: PREVIEW_COACH_STANDING }} voice={voice} />;
  }
  if (state === 'loading') return <DiveSkeleton coach={coach} />;
  return <DeepDive load={state === 'failed' ? failed : state === 'off' ? OFF : { status: 'ready', data: PREVIEW_COACH_DIVE }} voice={voice} writes={writes} initialId={insight ?? null} />;
}
