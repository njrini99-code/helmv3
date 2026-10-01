'use client';

import type { ChViewLoad } from '../data/coachhelm-views-shape';
import { Profile } from '../screens/coachhelm/views/Profile';
import { ProfileSkeleton, StandingSkeleton } from '../screens/coachhelm/views/Skeletons';
import { Standing } from '../screens/coachhelm/views/Standing';
import {
  PREVIEW_PROFILE,
  PREVIEW_PROFILE_EDGE,
  PREVIEW_PROFILE_EMPTY,
  PREVIEW_PROFILE_PARTIAL,
  PREVIEW_STANDING,
  PREVIEW_STANDING_EARLY,
  PREVIEW_STANDING_EMPTY,
  PREVIEW_STANDING_NOBASELINE,
  PREVIEW_STANDING_WOMENS,
  profileLoad,
  standingLoad,
} from './fixtures-coachhelm-views';

const OFF = { status: 'off', reason: 'We are pausing AI insights until after the spring qualifier' } as const;

/**
 * The player's CoachHelm drills for the dev preview: `?view=profile|standing|deep-dive`, and `?state=` for the read's answer
 * (each view lists its own in the preview route's docblock: the profile's are `partial`, `empty`, `edge`; Standing's `early`, `empty`, `womens`, `nobaseline`; every view's `failed`, `off`, `loading`).
 */
export function PreviewCoachHelmViews({ view, state }: { view?: string; state?: string }) {
  const failed: ChViewLoad<never> = { status: 'failed' };
  if (view === 'profile' || view == null) {
    if (state === 'loading') return <ProfileSkeleton />;
    if (state === 'failed') return <Profile load={failed} />;
    if (state === 'off') return <Profile load={OFF} />;
    const data = { partial: PREVIEW_PROFILE_PARTIAL, empty: PREVIEW_PROFILE_EMPTY, edge: PREVIEW_PROFILE_EDGE }[state ?? ''] ?? PREVIEW_PROFILE;
    return <Profile load={profileLoad(data)} />;
  }
  if (view === 'standing') {
    if (state === 'loading') return <StandingSkeleton />;
    if (state === 'failed') return <Standing load={failed} />;
    if (state === 'off') return <Standing load={OFF} />;
    const data = { early: PREVIEW_STANDING_EARLY, empty: PREVIEW_STANDING_EMPTY, womens: PREVIEW_STANDING_WOMENS, nobaseline: PREVIEW_STANDING_NOBASELINE }[state ?? ''] ?? PREVIEW_STANDING;
    return <Standing load={standingLoad(data)} />;
  }
  return null;
}
