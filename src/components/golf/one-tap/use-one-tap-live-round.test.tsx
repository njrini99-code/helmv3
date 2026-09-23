import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import { MemoryCourseAssetCache, manifestUrl, roundLeaseUrl } from '@/lib/golf/one-tap/course-assets';
import type { CourseGeometryPolicy } from '@/lib/golf/course-geometry/course-policy';
import { PEEK_N_PEAK_UPPER_POLICY } from '@/lib/golf/course-geometry/course-registry';
import { useOneTapLiveRound, useOneTapLiveRoundState } from './use-one-tap-live-round';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Synthetic future physical admission. The real fixture remains a display-only
// source candidate and is covered by the policy rejection test below.
const physicalPackage = { ...pilotPackage, status: 'reviewed_draft' as const };
const policy: CourseGeometryPolicy = { ...PEEK_N_PEAK_UPPER_POLICY, acceptedCapabilityTier: 'C3', holeBindings: { [physicalPackage.contentHash]: Object.fromEntries(physicalPackage.holes.map(h => [h.ordinal, h.key])) }, siteIds: new Set([physicalPackage.siteId]), approvedGeometryHashes: new Set([physicalPackage.contentHash]) };
const PKG_URL = `/course-geometry/${policy.layoutId}/${physicalPackage.contentHash}/package.json`;
const bodies: Record<string, string> = { [manifestUrl(policy.layoutId)]: JSON.stringify({ geometryVersion: physicalPackage.contentHash, packageUrl: PKG_URL }), [PKG_URL]: JSON.stringify(physicalPackage) };
const online = { value: true };
const fetchMock = vi.fn(async (url: string) => { if (!online.value) throw new TypeError('Failed to fetch'); return new Response(bodies[url] ?? '', { status: bodies[url] ? 200 : 404 }); });
const base = { roundId: 'r1', courseName: "Peek'n Peak Resort - Upper Course", featureFlagEnabled: true, policy };

describe('useOneTapLiveRound', () => {
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockClear(); online.value = true; });
  function arm() {
    vi.stubGlobal('fetch', fetchMock);
    const bindings = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => bindings.get(key) ?? null,
      setItem: (key: string, value: string) => { bindings.set(key, value); },
      removeItem: (key: string) => { bindings.delete(key); },
    });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: () => 1, clearWatch() {} } });
  }

  it('stays null — and fetches nothing — for another course, the flag off, or a policy with no approved hash', async () => {
    arm();
    const cache = new MemoryCourseAssetCache();
    const other = renderHook(() => useOneTapLiveRound({ ...base, courseName: 'Elsewhere GC', cache }));
    const off = renderHook(() => useOneTapLiveRound({ ...base, featureFlagEnabled: false, cache }));
    const shipped = renderHook(() => useOneTapLiveRound({ ...base, policy: { ...policy, approvedGeometryHashes: new Set() }, cache }));
    await new Promise(r => setTimeout(r, 20));
    expect(other.result.current).toBeNull();
    expect(off.result.current).toBeNull();
    expect(shipped.result.current).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preflights the course into the cache with signal, then resolves the same live round with none', async () => {
    arm();
    const cache = new MemoryCourseAssetCache();
    const withSignal = renderHook(() => useOneTapLiveRound({ ...base, cache }));
    await waitFor(() => expect(withSignal.result.current).not.toBeNull());
    expect(withSignal.result.current).toMatchObject({ roundId: 'r1', courseId: policy.layoutId, geometryVersion: physicalPackage.contentHash, readiness: 'ready' });
    expect(withSignal.result.current?.location?.kind).toBe('device');
    // Sync off (the default until the outbox migration is applied): the round
    // plays device-only, no transport posts to tables that may not exist.
    expect(withSignal.result.current?.transport ?? null).toBeNull();
    const outbox = { upsertAnchors: async () => ({ acceptedIds: [] }), upsertPenalties: async () => ({ acceptedIds: [] }) };
    const withOutbox = renderHook(() => useOneTapLiveRound({ ...base, roundId: 'r1-sync', cache, transport: outbox }));
    await waitFor(() => expect(withOutbox.result.current).not.toBeNull());
    expect(withOutbox.result.current?.transport).toBe(outbox);
    expect((await cache.keys()).sort()).toEqual([manifestUrl(policy.layoutId), PKG_URL, roundLeaseUrl(policy.layoutId, 'r1'), roundLeaseUrl(policy.layoutId, 'r1-sync')].sort());
    online.value = false;
    const noSignal = renderHook(() => useOneTapLiveRound({ ...base, roundId: 'r2', cache }));
    await waitFor(() => expect(noSignal.result.current).not.toBeNull());
    expect(noSignal.result.current).toMatchObject({ roundId: 'r2', readiness: 'ready' });
    // No signal and nothing cached: standard tracking, no live round.
    const cold = renderHook(() => useOneTapLiveRound({ ...base, roundId: 'r3', cache: new MemoryCourseAssetCache() }));
    await new Promise(r => setTimeout(r, 20));
    expect(cold.result.current).toBeNull();
  });

  it('reports why Live is not up: inactive off-course or unsaved, the flag, the course files, a denied location', async () => {
    arm();
    const cache = new MemoryCourseAssetCache();
    expect(renderHook(() => useOneTapLiveRoundState({ ...base, courseName: 'Elsewhere GC', cache })).result.current.status).toEqual({ phase: 'inactive' });
    expect(renderHook(() => useOneTapLiveRoundState({ ...base, roundId: null, cache })).result.current.status).toEqual({ phase: 'inactive' });
    const off = renderHook(() => useOneTapLiveRoundState({ ...base, featureFlagEnabled: false, cache }));
    await waitFor(() => expect(off.result.current.status).toEqual({ phase: 'off', reason: 'feature_flag_off' }));
    // The player's switch (owner ask, 2026-09-17): an eligible round the phone
    // has not turned on stays on standard tracking and downloads nothing;
    // the flag off still wins over a switch left on.
    fetchMock.mockClear();
    const notOn = renderHook(() => useOneTapLiveRoundState({ ...base, optIn: false, cache }));
    await waitFor(() => expect(notOn.result.current.status).toEqual({ phase: 'off', reason: 'opt_in_off' }));
    expect(fetchMock).not.toHaveBeenCalled();
    const killed = renderHook(() => useOneTapLiveRoundState({ ...base, featureFlagEnabled: false, optIn: true, cache }));
    await waitFor(() => expect(killed.result.current.status).toEqual({ phase: 'off', reason: 'feature_flag_off' }));
    online.value = false;
    const empty = new MemoryCourseAssetCache();
    const noFiles = renderHook(() => useOneTapLiveRoundState({ ...base, cache: empty }));
    await waitFor(() => expect(noFiles.result.current.status).toEqual({ phase: 'off', reason: 'course_unavailable' }));
    online.value = true;
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'denied' }) } });
    const denied = renderHook(() => useOneTapLiveRoundState({ ...base, roundId: 'r4', cache }));
    await waitFor(() => expect(denied.result.current.status).toEqual({ phase: 'off', reason: 'location_unavailable' }));
    expect(denied.result.current.live).toBeNull();
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined });
  });

  it('goes live after the current hole\'s terrain and streams the rest without re-creating the round', async () => {
    arm();
    // Two mapped holes: the round is on the second, so its terrain loads first.
    const terrainBody = readFileSync(join(process.cwd(), 'src/test/fixtures/course-geometry/cacapon-07-terrain.json'), 'utf8');
    const T1 = `/course-geometry/${policy.layoutId}/${physicalPackage.contentHash}/terrain/h1.json`, T7 = `/course-geometry/${policy.layoutId}/${physicalPackage.contentHash}/terrain/cacapon-07.json`;
    const holeKeys = physicalPackage.holes.map(h => h.key);
    const [k0, k1] = [holeKeys[0] ?? 'h1', holeKeys[1] ?? 'cacapon-07'];
    const gate = { release: null as null | (() => void) };
    const slowFetch = vi.fn(async (url: string) => {
      if (url === T1) await new Promise<void>(resolve => { gate.release = resolve; });
      const body = url === T1 || url === T7 ? terrainBody : bodies[url];
      return new Response(body ?? '', { status: body ? 200 : 404 });
    });
    vi.stubGlobal('fetch', slowFetch);
    bodies[manifestUrl(policy.layoutId)] = JSON.stringify({ geometryVersion: physicalPackage.contentHash, packageUrl: PKG_URL, terrainByHole: { [k0]: T1, [k1]: T7 } });
    const current = physicalPackage.holes[1]?.ordinal ?? physicalPackage.holes[0]?.ordinal ?? 1;
    const cache = new MemoryCourseAssetCache();
    const hook = renderHook(() => useOneTapLiveRoundState({ ...base, roundId: 'r5', cache, holeNumber: current }));
    await waitFor(() => expect(hook.result.current.status.phase).toBe('live'));
    const first = hook.result.current.live!;
    expect(first.readiness).toBe('partial');
    expect(hook.result.current.status).toEqual({ phase: 'live', loaded: 1, total: 2 });
    expect(Object.keys(first.terrainByHole ?? {})).toEqual([k1]);
    gate.release!();
    await waitFor(() => expect(hook.result.current.status).toEqual({ phase: 'live', loaded: 2, total: 2 }));
    const second = hook.result.current.live!;
    expect(second.readiness).toBe('ready');
    expect(Object.keys(second.terrainByHole ?? {})).toHaveLength(2);
    // Same round: identity of everything but the terrain map is preserved.
    expect(second.pkg).toBe(first.pkg); expect(second.holeKeys).toBe(first.holeKeys); expect(second.location).toBe(first.location);
    delete bodies[manifestUrl(policy.layoutId)];
    bodies[manifestUrl(policy.layoutId)] = JSON.stringify({ geometryVersion: physicalPackage.contentHash, packageUrl: PKG_URL });
  });
});
