'use client';

import { useEffect, useState } from 'react';
import type { RoundTypeLike } from '@/lib/golf/one-tap/competition-policy';
import { cacheStorageCourseAssetCache, loadCourseAssets, preflightCourseAssets, type CourseAssetCache } from '@/lib/golf/one-tap/course-assets';
import { resolveOneTapLiveRound, type OneTapLiveRound } from '@/lib/golf/one-tap/live-round-placement';
import { deviceLocationSource, queryLocationPermission } from '@/lib/golf/one-tap/location-source';
import { PEEK_N_PEAK_ONE_TAP_V1, productCourseIdForRound, type PeekNPeakOneTapPolicy } from '@/lib/golf/one-tap/peek-n-peak-policy';
import { supabaseSyncTransport, type OneTapSyncClient } from '@/lib/golf/one-tap/supabase-sync-transport';
import type { SyncTransport } from '@/lib/golf/one-tap/anchor-repository';
import { createClient } from '@/lib/supabase/client';

/** The round client's side of the §77 gate. Nothing runs for a round that is
 * not Peek'n Peak Upper with the release flag on; for one that is, the course
 * is preflighted into the device cache (task 15: package + every mapped
 * hole's terrain, so the round plays with no signal), the approved package is
 * loaded from it (none is approved yet, so this resolves to null without a
 * request), the device location is checked, and the live round is handed to
 * the tracker. A denied location keeps the round on standard tracking rather
 * than asking again. */
export interface UseOneTapLiveRoundOptions {
  roundId: string | null;
  dbCourseId?: string | null;
  courseName?: string | null;
  featureFlagEnabled: boolean;
  policy?: PeekNPeakOneTapPolicy;
  /** Test seam; production uses the Cache API where the WebView has it. */
  cache?: CourseAssetCache | null;
  /** Test seam; production builds the Supabase outbox transport (task 13). */
  transport?: SyncTransport | null;
  /** Task 16: tournament and qualifier rounds lock Competition Mode on. */
  roundType?: RoundTypeLike;
}
export function useOneTapLiveRound({ roundId, dbCourseId, courseName, featureFlagEnabled, policy = PEEK_N_PEAK_ONE_TAP_V1, cache, roundType, transport }: UseOneTapLiveRoundOptions): OneTapLiveRound | null {
  const productCourseId = productCourseIdForRound({ dbCourseId, courseName }, policy);
  const [live, setLive] = useState<OneTapLiveRound | null>(null);
  useEffect(() => {
    if (!roundId || !featureFlagEnabled || productCourseId !== policy.courseId) { setLive(null); return; }
    let cancelled = false;
    void (async () => {
      const assetCache = cache === undefined ? cacheStorageCourseAssetCache() : cache;
      const preflight = await preflightCourseAssets({ courseId: productCourseId, policy, cache: assetCache });
      const assets = preflight.status === 'ready' || preflight.status === 'partial' ? await loadCourseAssets({ courseId: productCourseId, policy, cache: assetCache }) : null;
      if (cancelled || !assets) { if (!cancelled) setLive(null); return; }
      const permission = await queryLocationPermission();
      const location = permission === 'denied' ? null : deviceLocationSource();
      // The outbox mirrors the device record (task 13); it exists only for a
      // resolved live round, so no production round ever posts to these tables.
      const outbox = transport === undefined ? browserSyncTransport() : transport;
      const { live: resolved } = resolveOneTapLiveRound({ roundId, roundCourseId: productCourseId, featureFlagEnabled, pkg: assets.pkg, terrainByHole: assets.terrainByHole, location, policy, readiness: preflight.status, roundType, transport: outbox });
      if (!cancelled) setLive(resolved);
    })();
    return () => { cancelled = true; };
  }, [roundId, featureFlagEnabled, productCourseId, policy, cache, roundType, transport]);
  return live;
}
/** The browser Supabase client as the structural outbox client; null where
 * the environment has none (tests, a misconfigured build) so the round still
 * plays device-only and the HUD reports the queue honestly. */
function browserSyncTransport(): SyncTransport | null {
  try { return supabaseSyncTransport(createClient() as unknown as OneTapSyncClient); } catch { return null; }
}
