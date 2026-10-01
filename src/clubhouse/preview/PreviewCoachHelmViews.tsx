'use client';

import type { ChViewLoad } from '../data/coachhelm-views-shape';
import { Profile } from '../screens/coachhelm/views/Profile';
import { ProfileSkeleton } from '../screens/coachhelm/views/Skeletons';
import { PREVIEW_PROFILE, PREVIEW_PROFILE_EDGE, PREVIEW_PROFILE_EMPTY, PREVIEW_PROFILE_PARTIAL, profileLoad } from './fixtures-coachhelm-views';

const OFF = { status: 'off', reason: 'We are pausing AI insights until after the spring qualifier' } as const;

/**
 * The player's CoachHelm drills for the dev preview: `?view=profile|standing|deep-dive`, and `?state=` for the read's answer
 * (`partial`, `empty`, `edge`, `failed`, `off`, `loading`; each view lists its own in the preview's docblock).
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
  return null;
}
