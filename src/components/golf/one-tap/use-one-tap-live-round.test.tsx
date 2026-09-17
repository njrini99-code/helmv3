import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import { MemoryCourseAssetCache, manifestUrl } from '@/lib/golf/one-tap/course-assets';
import { PEEK_N_PEAK_ONE_TAP_V1, type PeekNPeakOneTapPolicy } from '@/lib/golf/one-tap/peek-n-peak-policy';
import { useOneTapLiveRound } from './use-one-tap-live-round';

// SYNTHETIC POLICY: the pilot fixture stands in for an approved Upper package.
const policy: PeekNPeakOneTapPolicy = { ...PEEK_N_PEAK_ONE_TAP_V1, siteId: pilotPackage.siteId, approvedGeometryHashes: new Set([pilotPackage.contentHash]) };
const PKG_URL = `/course-geometry/${policy.courseId}/${pilotPackage.contentHash}/package.json`;
const bodies: Record<string, string> = { [manifestUrl(policy.courseId)]: JSON.stringify({ geometryVersion: pilotPackage.contentHash, packageUrl: PKG_URL }), [PKG_URL]: JSON.stringify(pilotPackage) };
const online = { value: true };
const fetchMock = vi.fn(async (url: string) => { if (!online.value) throw new TypeError('Failed to fetch'); return new Response(bodies[url] ?? '', { status: bodies[url] ? 200 : 404 }); });
const base = { roundId: 'r1', courseName: "Peek'n Peak Resort - Upper Course", featureFlagEnabled: true, policy };

describe('useOneTapLiveRound', () => {
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockClear(); online.value = true; });
  function arm() {
    vi.stubGlobal('fetch', fetchMock);
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
    expect(withSignal.result.current).toMatchObject({ roundId: 'r1', courseId: policy.courseId, geometryVersion: pilotPackage.contentHash, readiness: 'ready' });
    expect(withSignal.result.current?.location?.kind).toBe('device');
    expect((await cache.keys()).sort()).toEqual([manifestUrl(policy.courseId), PKG_URL].sort());
    online.value = false;
    const noSignal = renderHook(() => useOneTapLiveRound({ ...base, roundId: 'r2', cache }));
    await waitFor(() => expect(noSignal.result.current).not.toBeNull());
    expect(noSignal.result.current).toMatchObject({ roundId: 'r2', readiness: 'ready' });
    // No signal and nothing cached: standard tracking, no live round.
    const cold = renderHook(() => useOneTapLiveRound({ ...base, roundId: 'r3', cache: new MemoryCourseAssetCache() }));
    await new Promise(r => setTimeout(r, 20));
    expect(cold.result.current).toBeNull();
  });
});
