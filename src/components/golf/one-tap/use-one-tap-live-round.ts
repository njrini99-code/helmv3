'use client';

import type { RoundScoringSetup } from '@/lib/golf/one-tap/live-round-placement';
import { browserRoundBindingTransport } from '@/lib/golf/one-tap/round-binding-transport';
import type { RoundBindingTransport } from '@/lib/golf/one-tap/round-course-binding';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { RoundTypeLike } from '@/lib/golf/one-tap/competition-policy';
import { browserRoundLeaseStore, cacheStorageCourseAssetCache, loadCoursePackage, loadHoleTerrain, manifestUrl, pruneCourseAssets, type CourseAssetCache } from '@/lib/golf/one-tap/course-assets';
import { resolveOneTapLiveRound, type OneTapLiveRound } from '@/lib/golf/one-tap/live-round-placement';
import { deviceLocationSource, queryLocationPermission } from '@/lib/golf/one-tap/location-source';
import type { CourseGeometryIneligibility as OneTapIneligibility, CourseGeometryPolicy } from '@/lib/golf/course-geometry/course-policy';
import { resolveCourseGeometryPolicy } from '@/lib/golf/course-geometry/course-registry';
import { supabaseSyncTransport, type OneTapSyncClient } from '@/lib/golf/one-tap/supabase-sync-transport';
import type { SyncTransport } from '@/lib/golf/one-tap/anchor-repository';
import { createClient } from '@/lib/supabase/client';

/** The round client's side of the §77 gate. Nothing runs for a round that is
 * not Peek'n Peak Upper with the release flag on; for one that is, the
 * approved package is loaded (cache-first, so a round that has loaded once
 * plays with no signal), the device location is checked, and the live round
 * is handed to the tracker as soon as the current hole's terrain is in — the
 * other holes stream in behind it and fill the device cache (task 15) on the
 * way. A denied location keeps the round on standard tracking rather than
 * asking again. `status` says where the gate stands, so the standard tracker
 * can tell the player why Live is not up instead of staying silent. */
export interface UseOneTapLiveRoundOptions {
  roundSetup?: RoundScoringSetup;
  bindingTransport?: RoundBindingTransport | null;
  roundId: string | null;
  dbCourseId?: string | null;
  courseName?: string | null;
  /** The single course this caller means (Peek's historical call shape):
   * ignored once `flagsByLayout` resolves an entry for the round's layout. */
  featureFlagEnabled: boolean;
  /** The player's own switch for this round (`live-opt-in.ts`): `false` keeps
   * an eligible round on standard tracking with the row offering "Turn on";
   * omitted (the lab, tests) means no switch governs the round. */
  optIn?: boolean;
  /** Server-evaluated `peek_n_peak_one_tap_sync_v1`: off (the default) plays
   * device-only, never posting to outbox tables that may not exist yet.
   * Ignored once `flagsByLayout` resolves an entry for the round's layout. */
  syncEnabled?: boolean;
  /** D3: every distinct geometry/sync flag pair in the registry, evaluated
   * server-side once per request (`layoutId -> {geometry, sync}`), so a
   * round page needs no per-course branching as the registry grows past
   * Peek. A layout with no entry gets `false` for both — never `undefined`
   * treated as "on". Takes priority over `featureFlagEnabled`/`syncEnabled`
   * for a round whose layout it names; those two stay the fallback for a
   * caller (tests, the lab) that has not migrated to the map yet. */
  flagsByLayout?: Readonly<Record<string, { geometry: boolean; sync: boolean }>>;
  /** The hole the player is on; its terrain loads first. */
  holeNumber?: number;
  /** One policy to test against instead of the registry (tests, the lab). */
  policy?: CourseGeometryPolicy;
  /** Test seam; production uses the Cache API where the WebView has it. */
  cache?: CourseAssetCache | null;
  /** Test seam; production builds the Supabase outbox transport (task 13). */
  transport?: SyncTransport | null;
  /** Task 16: tournament and qualifier rounds lock Competition Mode on. */
  roundType?: RoundTypeLike;
}
export type OneTapLiveStatus =
  /** Not a round on a registered layout, or the round is not saved yet: nothing to report. */
  | { phase: 'inactive' }
  | { phase: 'loading'; step: 'course' | 'terrain'; loaded: number; total: number }
  | { phase: 'live'; loaded: number; total: number }
  | { phase: 'off'; reason: OneTapIneligibility | 'opt_in_off' | 'course_unavailable' | 'error'; detail?: string };
export interface OneTapLiveRoundState { live: OneTapLiveRound | null; status: OneTapLiveStatus }

export function useOneTapLiveRoundState({ roundSetup, bindingTransport, roundId, dbCourseId, courseName, featureFlagEnabled, optIn, syncEnabled = false, flagsByLayout, holeNumber, policy: onlyPolicy, cache, roundType, transport }: UseOneTapLiveRoundOptions): OneTapLiveRoundState {
  const [connectionRevision, setConnectionRevision] = useState(0);
  useEffect(() => { const online = () => setConnectionRevision(n => n + 1); window.addEventListener('online', online); return () => window.removeEventListener('online', online); }, []);
  const roundSetupRef = useRef(roundSetup);
  roundSetupRef.current = roundSetup;
  const policy = useMemo(() => resolveCourseGeometryPolicy({ dbCourseId, courseName }, onlyPolicy ? [onlyPolicy] : undefined), [dbCourseId, courseName, onlyPolicy]);
  const productCourseId = policy?.layoutId ?? null;
  // Primitives only, never the record itself, so a caller that rebuilds
  // `flagsByLayout` per render (a fresh object, same values) cannot spin the
  // effect below — its dependency array holds these two booleans, not the map.
  const layoutFlags = productCourseId ? flagsByLayout?.[productCourseId] : undefined;
  // Once a `flagsByLayout` map is supplied, IT decides for every layout it
  // covers — a layout missing from it is `false`, never a silent fallback to
  // `featureFlagEnabled`/`syncEnabled` (those two only apply when no map was
  // passed at all, the pre-D3 call shape).
  const resolvedFeatureFlagEnabled = flagsByLayout ? (layoutFlags?.geometry ?? false) : featureFlagEnabled;
  const resolvedSyncEnabled = flagsByLayout ? (layoutFlags?.sync ?? false) : syncEnabled;
  const [state, setRawState] = useState<OneTapLiveRoundState>({ live: null, status: { phase: 'inactive' } });
  // Idempotent: an unchanged state keeps its identity, so a caller that
  // re-creates an option object per render cannot spin the effect.
  const setState = (next: OneTapLiveRoundState) => setRawState(prev => prev.live === next.live && sameStatus(prev.status, next.status) ? prev : next);
  // The hole only orders the terrain queue; a hole change must not restart the load.
  const holeRef = useRef(holeNumber);
  holeRef.current = holeNumber;
  useEffect(() => {
    if (!policy || !productCourseId || !roundId) { setState({ live: null, status: { phase: 'inactive' } }); return; }
    if (!resolvedFeatureFlagEnabled) { setState({ live: null, status: { phase: 'off', reason: 'feature_flag_off' } }); return; }
    // The flag makes the round eligible; the player's tap starts it. Nothing
    // downloads for a round that has not been switched on.
    if (optIn === false) { setState({ live: null, status: { phase: 'off', reason: 'opt_in_off' } }); return; }
    let cancelled = false;
    const off = (reason: Extract<OneTapLiveStatus, { phase: 'off' }>['reason'], detail?: string) => { if (!cancelled) setState({ live: null, status: { phase: 'off', reason, detail } }); };
    setState({ live: null, status: { phase: 'loading', step: 'course', loaded: 0, total: 0 } });
    void (async () => {
      try {
        const assetCache = cache === undefined ? cacheStorageCourseAssetCache() : cache;
        const loaded = await loadCoursePackage({ roundSetup: roundSetupRef.current, bindingTransport: bindingTransport === undefined ? browserRoundBindingTransport(roundId) : bindingTransport, roundId, leaseStore: browserRoundLeaseStore(), courseId: productCourseId, policy, cache: assetCache, baseUrl: policy.assetBaseUrl });
        if (cancelled) return;
        if (!loaded) { off('course_unavailable'); return; }
        const { manifest, pkg, contextLayer } = loaded;
        const permission = await queryLocationPermission();
        const location = permission === 'denied' ? null : deviceLocationSource();
        // The outbox mirrors the device record (task 13); it exists only for a
        // resolved live round with the sync flag on, so no round posts to
        // outbox tables an environment does not have (the migration is applied
        // by db:apply, never by a deploy). Off, marks stay on the device and
        // the scorecard is written through the standard ledger (§77).
        const outbox = transport !== undefined ? transport : resolvedSyncEnabled ? browserSyncTransport() : null;
        const terrainByHole: Record<string, TerrainMesh> = {};
        const { live: resolved, eligibility } = resolveOneTapLiveRound({ roundHoleKeys: loaded.roundBinding?.holeBindings, roundSetup: roundSetupRef.current, roundId, roundCourseId: productCourseId, featureFlagEnabled: resolvedFeatureFlagEnabled, pkg, terrainByHole, contextLayer, location, policy, readiness: 'partial', roundType, transport: outbox });
        if (cancelled) return;
        if (!resolved) { off(eligibility.eligible ? 'error' : eligibility.reason); return; }
        // Current hole first, then the holes ahead, then the ones behind.
        const entries = Object.entries(manifest.terrainByHole ?? {});
        const current = Math.max(0, entries.findIndex(([key]) => key === resolved.roundHoleKeys?.[holeRef.current ?? -1]));
        const queue = [...entries.slice(current), ...entries.slice(0, current)];
        const total = queue.length;
        let loadedCount = 0, missing = 0, started = false;
        // Every publish keeps the same pkg/holeKeys/location/storage/transport
        // references: only the terrain map and readiness move, so the live
        // hole's round state is never re-initialised by a terrain arriving.
        const publish = (readiness: 'ready' | 'partial') => {
          if (cancelled) return;
          const live: OneTapLiveRound = { ...resolved, terrainByHole: { ...terrainByHole }, readiness };
          setState({ live, status: { phase: 'live', loaded: loadedCount, total } });
        };
        if (total === 0) { started = true; publish('ready'); }
        else setState({ live: null, status: { phase: 'loading', step: 'terrain', loaded: 0, total } });
        for (const [holeKey, url] of queue) {
          const terrain = await loadHoleTerrain(url, pkg, { cache: assetCache });
          if (cancelled) return;
          if (terrain) terrainByHole[holeKey] = terrain.mesh; else missing++;
          loadedCount++;
          if (!started) started = true;
          publish(loadedCount === total && missing === 0 ? 'ready' : 'partial');
        }
        await pruneCourseAssets(assetCache, productCourseId, [manifestUrl(productCourseId, policy.assetBaseUrl), manifest.packageUrl, ...Object.values(manifest.terrainByHole ?? {}), ...(manifest.contextLayerUrl ? [manifest.contextLayerUrl] : [])], policy.assetBaseUrl);
      } catch (error) {
        off('error', error instanceof Error ? error.message : String(error));
      }
    })();
    return () => { cancelled = true; };
  }, [connectionRevision, bindingTransport, roundId, resolvedFeatureFlagEnabled, optIn, resolvedSyncEnabled, productCourseId, policy, cache, roundType, transport]);
  return state;
}
function sameStatus(a: OneTapLiveStatus, b: OneTapLiveStatus): boolean {
  if (a.phase !== b.phase) return false;
  switch (a.phase) {
    case 'inactive': return true;
    case 'loading': return b.phase === 'loading' && a.step === b.step && a.loaded === b.loaded && a.total === b.total;
    case 'live': return b.phase === 'live' && a.loaded === b.loaded && a.total === b.total;
    case 'off': return b.phase === 'off' && a.reason === b.reason && a.detail === b.detail;
  }
}
export function useOneTapLiveRound(options: UseOneTapLiveRoundOptions): OneTapLiveRound | null {
  return useOneTapLiveRoundState(options).live;
}
/** The browser Supabase client as the structural outbox client; null where
 * the environment has none (tests, a misconfigured build) so the round still
 * plays device-only and the HUD reports the queue honestly. */
function browserSyncTransport(): SyncTransport | null {
  try { return supabaseSyncTransport(createClient() as unknown as OneTapSyncClient); } catch { return null; }
}
