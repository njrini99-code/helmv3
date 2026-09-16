'use client';

import { useEffect, useState } from 'react';
import { loadApprovedCoursePackage, resolveOneTapLiveRound, type OneTapLiveRound } from '@/lib/golf/one-tap/live-round-placement';
import { deviceLocationSource, queryLocationPermission } from '@/lib/golf/one-tap/location-source';
import { PEEK_N_PEAK_ONE_TAP_V1, productCourseIdForRound, type PeekNPeakOneTapPolicy } from '@/lib/golf/one-tap/peek-n-peak-policy';

/** The round client's side of the §77 gate. Nothing runs for a round that is
 * not Peek'n Peak Upper with the release flag on; for one that is, the
 * approved package is loaded (none is approved yet, so this resolves to null
 * without a request), the device location is checked, and the live round is
 * handed to the tracker. A denied location keeps the round on standard
 * tracking rather than asking again. */
export interface UseOneTapLiveRoundOptions {
  roundId: string | null;
  dbCourseId?: string | null;
  courseName?: string | null;
  featureFlagEnabled: boolean;
  policy?: PeekNPeakOneTapPolicy;
}
export function useOneTapLiveRound({ roundId, dbCourseId, courseName, featureFlagEnabled, policy = PEEK_N_PEAK_ONE_TAP_V1 }: UseOneTapLiveRoundOptions): OneTapLiveRound | null {
  const productCourseId = productCourseIdForRound({ dbCourseId, courseName }, policy);
  const [live, setLive] = useState<OneTapLiveRound | null>(null);
  useEffect(() => {
    if (!roundId || !featureFlagEnabled || productCourseId !== policy.courseId) { setLive(null); return; }
    let cancelled = false;
    void (async () => {
      const assets = await loadApprovedCoursePackage(productCourseId, policy);
      if (cancelled || !assets) { if (!cancelled) setLive(null); return; }
      const permission = await queryLocationPermission();
      const location = permission === 'denied' ? null : deviceLocationSource();
      const { live: resolved } = resolveOneTapLiveRound({ roundId, roundCourseId: productCourseId, featureFlagEnabled, pkg: assets.pkg, terrainByHole: assets.terrainByHole, contextLayer: assets.contextLayer, location, policy });
      if (!cancelled) setLive(resolved);
    })();
    return () => { cancelled = true; };
  }, [roundId, featureFlagEnabled, productCourseId, policy]);
  return live;
}
