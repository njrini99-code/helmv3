'use client';

import type { ChViewLoad } from '../data/coachhelm-views-shape';
import { DeepDive } from '../screens/coachhelm/views/DeepDive';
import { Profile } from '../screens/coachhelm/views/Profile';
import { DiveSkeleton, ProfileSkeleton, StandingSkeleton } from '../screens/coachhelm/views/Skeletons';
import { Standing } from '../screens/coachhelm/views/Standing';
import {
  diveLoad,
  PREVIEW_DIVE,
  PREVIEW_DIVE_EMPTY,
  PREVIEW_DIVE_HOLES,
  PREVIEW_DIVE_MANY,
  PREVIEW_DIVE_NO_ROUNDS,
  PREVIEW_DIVE_PARTS_FAILED,
  PREVIEW_DIVE_TEAM_POOL,
  PREVIEW_DIVE_YOUNG,
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
import { PREVIEW_DIVE_CLEARED, PREVIEW_DIVE_CORRECTIONS, PREVIEW_DIVE_CORRECTIONS_GOOD, PREVIEW_DIVE_ENGINE, PREVIEW_DIVE_MANY_CLEARED, previewCorrectionWrites } from './fixtures-coachhelm-engine';
import { CorrectionWritesProvider } from '../screens/coachhelm/Corrections';

const OFF = { status: 'off', reason: 'We are pausing AI insights until after the spring qualifier' } as const;

/**
 * The player's CoachHelm drills for the dev preview: `?view=profile|standing|deep-dive`, and `?state=` for the read's answer
 * (each view lists its own in the preview route's docblock: the profile's are `partial`, `empty`, `edge`; Standing's `early`, `empty`, `womens`, `nobaseline`; the Deep dive's `engine` (every engine flag on), `corrections` and `corrections-good` (the player's own chips), `cleared`, `manycleared`, `holes` (with `&insight=in-pen`), `young`, `partsfailed`, `teampool`, `empty`, `norounds`, with `&insight=` for the read it opens on; every view's `failed`, `off`, `loading`).
 */
export function PreviewCoachHelmViews({ view, state, insight }: { view?: string; state?: string; insight?: string }) {
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
  if (view === 'deep-dive') {
    if (state === 'loading') return <DiveSkeleton />;
    if (state === 'failed') return <DeepDive load={failed} />;
    if (state === 'off') return <DeepDive load={OFF} />;
    const data = { engine: PREVIEW_DIVE_ENGINE, corrections: PREVIEW_DIVE_CORRECTIONS, 'corrections-good': PREVIEW_DIVE_CORRECTIONS_GOOD, cleared: PREVIEW_DIVE_CLEARED, manycleared: PREVIEW_DIVE_MANY_CLEARED, holes: PREVIEW_DIVE_HOLES, many: PREVIEW_DIVE_MANY, young: PREVIEW_DIVE_YOUNG, partsfailed: PREVIEW_DIVE_PARTS_FAILED, empty: PREVIEW_DIVE_EMPTY, norounds: PREVIEW_DIVE_NO_ROUNDS, teampool: PREVIEW_DIVE_TEAM_POOL }[state ?? ''] ?? PREVIEW_DIVE;
    return (
      <CorrectionWritesProvider value={previewCorrectionWrites(state)}>
        <DeepDive load={diveLoad(data)} initialId={insight ?? null} />
      </CorrectionWritesProvider>
    );
  }
  return null;
}
