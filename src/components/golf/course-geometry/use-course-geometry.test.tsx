// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import { MemoryCourseAssetCache, manifestUrl } from '@/lib/golf/one-tap/course-assets';
import type { DurableRoundCourseBinding, RoundBindingProposal, RoundBindingTransport } from '@/lib/golf/one-tap/round-course-binding';
import type { CourseGeometryPolicy } from '@/lib/golf/course-geometry/course-policy';
import { PEEK_N_PEAK_UPPER_POLICY } from '@/lib/golf/course-geometry/course-registry';
import { trackingGeometryFromLiveRound, useCourseGeometry } from './use-course-geometry';

// SYNTHETIC POLICY: the pilot fixture stands in for the approved Upper package.
const policy: CourseGeometryPolicy = { ...PEEK_N_PEAK_UPPER_POLICY, livePilot: { layoutId: 'peek-n-peak-upper', geometryHashes: new Set([pilotPackage.contentHash]) }, holeBindings: { [pilotPackage.contentHash]: Object.fromEntries(pilotPackage.holes.map(h => [h.ordinal, h.key])) }, siteIds: new Set([pilotPackage.siteId]), approvedGeometryHashes: new Set([pilotPackage.contentHash]) };
const BASE = `/course-geometry/${policy.layoutId}/${pilotPackage.contentHash}`;
const PKG_URL = `${BASE}/package.json`;
const keys = pilotPackage.holes.map(h => h.key);
const terrainUrl = (key: string) => `${BASE}/terrain/${key}.json`;
const terrainBody = readFileSync(join(process.cwd(), 'src/test/fixtures/course-geometry/cacapon-07-terrain.json'), 'utf8');
const manifest = { geometryVersion: pilotPackage.contentHash, packageUrl: PKG_URL, terrainByHole: Object.fromEntries(keys.map(key => [key, terrainUrl(key)])) };
const bodies: Record<string, string> = { [manifestUrl(policy.layoutId)]: JSON.stringify(manifest), [PKG_URL]: JSON.stringify(pilotPackage) };
const requested: string[] = [];
const online = { value: true };
const fetchImpl = vi.fn(async (url: string) => {
  requested.push(url);
  if (!online.value) throw new TypeError('Failed to fetch');
  const body = url.startsWith(`${BASE}/terrain/`) ? terrainBody : bodies[url];
  return new Response(body ?? '', { status: body ? 200 : 404 });
});
const upper = { courseName: "Peek'n Peak Resort - Upper Course", policy, fetchImpl };
const eighteen = Array.from({ length: 18 }, (_, i) => i + 1);

describe('useCourseGeometry', () => {
  afterEach(() => { fetchImpl.mockClear(); requested.length = 0; online.value = true; });

  it('resolves nothing — and requests nothing — for any other course, a disabled hook, or a policy with no approved hash', async () => {
    const cache = new MemoryCourseAssetCache();
    const other = renderHook(() => useCourseGeometry({ ...upper, courseName: 'Peek n Peak Resort - Lower Course', holeNumbers: eighteen, focusHoleNumber: 1, cache }));
    const named = renderHook(() => useCourseGeometry({ ...upper, courseName: 'Elsewhere GC', dbCourseId: 'course-123', holeNumbers: eighteen, focusHoleNumber: 1, cache }));
    const off = renderHook(() => useCourseGeometry({ ...upper, holeNumbers: eighteen, focusHoleNumber: 1, enabled: false, cache }));
    const shipped = renderHook(() => useCourseGeometry({ ...upper, policy: { ...policy, approvedGeometryHashes: new Set() }, holeNumbers: eighteen, focusHoleNumber: 1, cache }));
    await new Promise(r => setTimeout(r, 20));
    for (const hook of [other, named, off]) expect(hook.result.current).toEqual({ geometry: undefined, status: 'inactive' });
    expect(shipped.result.current).toEqual({ geometry: undefined, status: 'unavailable' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('loads the approved package for an Upper round, maps hole keys by hole number, and keeps only the holes on screen resident', async () => {
    const cache = new MemoryCourseAssetCache();
    // A back nine that also lists a hole the package does not have.
    const backNine = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    const props = { ...upper, cache, holeNumbers: backNine, focusHoleNumber: 10 };
    const hook = renderHook((p: typeof props) => useCourseGeometry(p), { initialProps: props });
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    const geometry = hook.result.current.geometry!;
    expect(geometry.package.contentHash).toBe(pilotPackage.contentHash);
    expect(geometry.holeKeys).toEqual([...keys.slice(9), '']);
    // The hole on screen and the next one, nothing else.
    await waitFor(() => expect(Object.keys(hook.result.current.geometry?.terrainByHole ?? {}).sort()).toEqual([keys[9], keys[10]].sort()));
    expect(requested.filter(url => url.startsWith(`${BASE}/terrain/`))).toEqual([terrainUrl(keys[9]!), terrainUrl(keys[10]!)]);
    // Moving on: 11 stays, 12 arrives, 10 is the most recent; then 13 evicts 10.
    hook.rerender({ ...props, focusHoleNumber: 11 });
    await waitFor(() => expect(Object.keys(hook.result.current.geometry?.terrainByHole ?? {}).sort()).toEqual([keys[9], keys[10], keys[11]].sort()));
    hook.rerender({ ...props, focusHoleNumber: 12 });
    await waitFor(() => expect(Object.keys(hook.result.current.geometry?.terrainByHole ?? {}).sort()).toEqual([keys[10], keys[11], keys[12]].sort()));
    expect(hook.result.current.geometry?.package).toBe(geometry.package);
    // Every asset that was fetched is now in the device cache under its versioned URL.
    expect((await cache.keys()).sort()).toEqual([manifestUrl(policy.layoutId), PKG_URL, ...[9, 10, 11, 12].map(i => terrainUrl(keys[i]!))].sort());
  });

  it('serves a cached course with no signal and loads no terrain while no hole is open', async () => {
    const cache = new MemoryCourseAssetCache();
    const warm = renderHook(() => useCourseGeometry({ ...upper, cache, holeNumbers: eighteen, focusHoleNumber: null }));
    await waitFor(() => expect(warm.result.current.status).toBe('ready'));
    await new Promise(r => setTimeout(r, 20));
    expect(warm.result.current.geometry?.terrainByHole).toEqual({});
    expect(requested.some(url => url.startsWith(`${BASE}/terrain/`))).toBe(false);
    // Review opens one hole: that hole's terrain only, nothing prefetched.
    const review = renderHook(() => useCourseGeometry({ ...upper, cache, holeNumbers: eighteen, focusHoleNumber: 7, prefetchNext: false }));
    await waitFor(() => expect(Object.keys(review.result.current.geometry?.terrainByHole ?? {})).toEqual([keys[6]]));
    await new Promise(r => setTimeout(r, 20));
    expect(requested.filter(url => url.startsWith(`${BASE}/terrain/`))).toEqual([terrainUrl(keys[6]!)]);
    online.value = false;
    const cold = renderHook(() => useCourseGeometry({ ...upper, cache, holeNumbers: eighteen, focusHoleNumber: 7 }));
    await waitFor(() => expect(cold.result.current.status).toBe('ready'));
    expect(cold.result.current.geometry?.holeKeys).toEqual(keys);
    // No signal: the cached hole serves, the un-cached next hole is simply absent.
    await waitFor(() => expect(Object.keys(cold.result.current.geometry?.terrainByHole ?? {})).toEqual([keys[6]]));
    // No signal and no cache: the round keeps its plain layout.
    const empty = renderHook(() => useCourseGeometry({ ...upper, cache: new MemoryCourseAssetCache(), holeNumbers: eighteen, focusHoleNumber: 7 }));
    await waitFor(() => expect(empty.result.current.status).toBe('unavailable'));
    expect(empty.result.current.geometry).toBeUndefined();
  });

  it('keeps the loaded course through a pause (Meridian Live taking over) and requests nothing while paused', async () => {
    const cache = new MemoryCourseAssetCache();
    const props = { ...upper, cache, holeNumbers: eighteen, focusHoleNumber: 7, enabled: true };
    const hook = renderHook((p: typeof props) => useCourseGeometry(p), { initialProps: props });
    await waitFor(() => expect(Object.keys(hook.result.current.geometry?.terrainByHole ?? {}).sort()).toEqual([keys[6], keys[7]].sort()));
    const before = hook.result.current.geometry!;
    const requests = requested.length;
    hook.rerender({ ...props, enabled: false, focusHoleNumber: 8 });
    await new Promise(r => setTimeout(r, 30));
    expect(hook.result.current.geometry).toBe(before);
    expect(hook.result.current.status).toBe('ready');
    expect(requested.length).toBe(requests);
    // Resumed on the hole Live left: the manifest is re-read (network-first, so
    // a newer approved version would win), the package stays as loaded, and
    // only that hole's missing neighbour loads.
    hook.rerender({ ...props, enabled: true, focusHoleNumber: 8 });
    await waitFor(() => expect(Object.keys(hook.result.current.geometry?.terrainByHole ?? {}).sort()).toEqual([keys[6], keys[7], keys[8]].sort()));
    expect(hook.result.current.geometry?.package).toBe(before.package);
    expect(requested.slice(requests).filter(url => url !== manifestUrl(policy.layoutId))).toEqual([terrainUrl(keys[8]!)]);
    // A different course drops everything.
    hook.rerender({ ...props, courseName: 'Elsewhere GC' });
    await waitFor(() => expect(hook.result.current).toEqual({ geometry: undefined, status: 'inactive' }));
  });

  it("uses the existing round’s saved tee and scorecard values before standard tracking accepts a world", async () => {
    const leases = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => leases.get(key) ?? null,
      setItem: (key: string, value: string) => { leases.set(key, value); },
      removeItem: (key: string) => { leases.delete(key); },
    } });
    const roundId = 'aaaaaaaa-1111-4111-8111-111111111111';
    const savedSetup = { dbCourseId: null, selectedTeeId: null, holes: [{ number: 1, par: 4, yardage: 410 }] };
    const bindings: DurableRoundCourseBinding[] = [];
    const transport: RoundBindingTransport = {
      read: async () => bindings[0] ? { status: 'found', binding: bindings[0] } : { status: 'missing' },
      claim: async (proposal: RoundBindingProposal) => {
        const binding: DurableRoundCourseBinding = {
          ...proposal,
          scoringSnapshot: {
            dbCourseId: null, selectedTeeId: null, scorecardProfileId: null, scorecardRevision: null,
            courseRating: null, courseSlope: null,
            holes: [{ ...savedSetup.holes[0]!, teeId: null, scorecardProfileId: null, physicalHoleId: null, geometryHoleKey: keys[0]!, teeFeatureId: null }],
          },
          scorecardSnapshotHash: 'd'.repeat(64),
        };
        bindings.push(binding);
        return { status: 'found', binding };
      },
    };
    const bindingPolicy: CourseGeometryPolicy = {
      ...policy,
      approvedPackageByteHashes: { [pilotPackage.contentHash]: createHash('sha256').update(JSON.stringify(pilotPackage)).digest('hex') },
    };
    const props = { ...upper, policy: bindingPolicy, roundId, roundSetup: savedSetup, bindingTransport: transport,
      cache: new MemoryCourseAssetCache(), holeNumbers: [1], focusHoleNumber: null };
    const hook = renderHook((value: typeof props) => useCourseGeometry(value), { initialProps: props });
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(bindings[0]?.scoringSnapshot.holes[0]?.yardage).toBe(410);
    hook.rerender({ ...props, roundSetup: { ...savedSetup, holes: [{ number: 1, par: 4, yardage: 411 }] } });
    await waitFor(() => expect(hook.result.current.status).toBe('unavailable'));
    expect(bindings[0]?.scoringSnapshot.holes[0]?.yardage).toBe(410);
  });

  it('builds the same geometry from a live round without loading anything', () => {
    const live = { pkg: pilotPackage, roundHoleKeys: policy.holeBindings![pilotPackage.contentHash], terrainByHole: {}, contextLayer: undefined };
    expect(trackingGeometryFromLiveRound(live, [1, 2, 99])).toEqual({ package: pilotPackage, holeKeys: [keys[0], keys[1], ''], terrainByHole: {}, contextLayer: undefined });
  });
});
