import { createHash, webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import { PEEK_N_PEAK_UPPER_POLICY } from '../../course-geometry/course-registry';
import { loadCoursePackage, manifestUrl, MemoryCourseAssetCache, type EssentialCourseManifest } from '../course-assets';
import { bindingMatchesScoring, proposeRoundBinding, type DurableRoundCourseBinding, type RoundBindingProposal } from '../round-course-binding';
import { roundBindingTransport, type RoundBindingRpcClient } from '../round-binding-transport';

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
beforeAll(() => { vi.stubGlobal('crypto', webcrypto); });
const ROUND = 'aaaaaaaa-1111-4111-8111-111111111111';
const WHITE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const COURSE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const policy = { ...PEEK_N_PEAK_UPPER_POLICY, siteIds: new Set([pilotPackage.siteId]), approvedGeometryHashes: new Set([pilotPackage.contentHash]),
  pilotAcceptsSourceCandidate: false, approvedPackageByteHashes: { [pilotPackage.contentHash]: createHash('sha256').update(JSON.stringify(pilotPackage)).digest('hex') }, dbCourseIds: new Set([COURSE_ID]), holeBindings: { [pilotPackage.contentHash]: { 1: pilotPackage.holes[0]!.key } } };
const manifest: EssentialCourseManifest = { courseId: policy.layoutId, geometryVersion: pilotPackage.contentHash,
  packageUrl: `/course-geometry/${policy.layoutId}/package-${pilotPackage.contentHash}.json` };
const setup = { dbCourseId: COURSE_ID, selectedTeeId: WHITE, holes: [{ number: 1, par: 4, yardage: 410 }] };
const scoring = { ...setup, scorecardProfileId: null, scorecardRevision: null, courseRating: null, courseSlope: null, holes: setup.holes.map(h => ({ ...h, teeId: WHITE, scorecardProfileId: null, physicalHoleId: null, geometryHoleKey: pilotPackage.holes[0]!.key, teeFeatureId: null })) };
function store() { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } }; }
function rpcServer() {
  let binding: DurableRoundCourseBinding | null = null;
  let online = true;
  const rpc = vi.fn<RoundBindingRpcClient['rpc']>(async (_name, args) => {
    if (!online) throw new TypeError('offline');
    if (!binding && args.p_proposal) binding = { ...structuredClone(args.p_proposal), scoringSnapshot: structuredClone(scoring), scorecardSnapshotHash: 'd'.repeat(64) };
    return { data: binding ? { status: 'found', binding } : { status: 'missing' }, error: null };
  });
  return { transport: roundBindingTransport({ rpc }), rpc, setOnline: (v: boolean) => { online = v; }, getBinding: () => binding,
    forceBinding: (value: DurableRoundCourseBinding) => { binding = value; } };
}
function assetServer() {
  const fetchImpl = vi.fn(async (url: string) => ({ ok: true, text: async () => JSON.stringify(url === manifest.packageUrl ? pilotPackage : manifest) }));
  return fetchImpl;
}

describe('durable round world binding at the asset/RPC persistence boundary', () => {
  it('pins saved White values even when the package reference card differs; resumes the same version on another device', async () => {
    const server = rpcServer(), fetchImpl = assetServer();
    const first = await loadCoursePackage({ courseId: policy.layoutId, policy, roundId: ROUND, roundSetup: setup,
      cache: new MemoryCourseAssetCache(), leaseStore: store(), bindingTransport: server.transport, fetchImpl });
    expect(first?.roundBinding?.scoringSnapshot).toEqual(scoring);
    expect(setup.holes[0]!.yardage).toBe(410);
    const secondFetch = assetServer();
    const second = await loadCoursePackage({ courseId: policy.layoutId, policy, roundId: ROUND, roundSetup: setup,
      cache: new MemoryCourseAssetCache(), leaseStore: store(), bindingTransport: server.transport, fetchImpl: secondFetch });
    expect(second?.roundBinding).toEqual(first?.roundBinding);
    expect(secondFetch).not.toHaveBeenCalledWith(manifestUrl(policy.layoutId));
    expect(server.rpc.mock.calls.filter(([, args]) => args.p_proposal !== null)).toHaveLength(1);
    expect(server.rpc.mock.calls[1]![1].p_proposal).not.toHaveProperty('scoringSnapshot');
  });

  it('keeps a confirmed world through offline resume and reconnect without rewriting marks or scorecard', async () => {
    const server = rpcServer(), cache = new MemoryCourseAssetCache(), leaseStore = store();
    const options = { courseId: policy.layoutId, policy, roundId: ROUND, roundSetup: setup, cache, leaseStore, bindingTransport: server.transport, fetchImpl: assetServer() };
    const first = await loadCoursePackage(options);
    const rawMark = JSON.stringify({ geometryVersion: pilotPackage.contentHash, position: [11, 12, 13], uncertainty: 3 });
    leaseStore.setItem('original-anchor', rawMark);
    server.setOnline(false);
    const offline = await loadCoursePackage({ ...options, fetchImpl: async () => { throw new TypeError('offline'); } });
    expect(offline?.roundBinding).toEqual(first?.roundBinding);
    server.setOnline(true);
    expect((await loadCoursePackage(options))?.roundBinding).toEqual(first?.roundBinding);
    expect(leaseStore.getItem('original-anchor')).toBe(rawMark);
    expect(setup).toEqual({ dbCourseId: COURSE_ID, selectedTeeId: WHITE, holes: [{ number: 1, par: 4, yardage: 410 }] });
  });

  it('does not choose a new world on an offline first load or silently accept a changed scoring snapshot', async () => {
    const server = rpcServer(); server.setOnline(false);
    const fetchImpl = assetServer();
    const options = { courseId: policy.layoutId, policy, roundId: ROUND, roundSetup: setup, cache: new MemoryCourseAssetCache(), leaseStore: store(), bindingTransport: server.transport, fetchImpl };
    expect(await loadCoursePackage(options)).toBeNull(); expect(fetchImpl).not.toHaveBeenCalled();
    server.setOnline(true);
    const result = await loadCoursePackage(options);
    expect(result).not.toBeNull();
    expect(bindingMatchesScoring(result!.roundBinding!, { ...setup, selectedTeeId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' })).toBe(false);
    expect(await loadCoursePackage({ ...options, roundSetup: { ...setup, holes: [{ number: 1, par: 5, yardage: 520 }] } })).toBeNull();
  });

  it('refuses changed package bytes retaining the approved contentHash before claiming a round', async () => {
    const server = rpcServer(), cache = new MemoryCourseAssetCache();
    const changed = { ...pilotPackage, originWgs84: [-1, 1] };
    await cache.put(manifest.packageUrl, JSON.stringify(changed));
    const options = { courseId: policy.layoutId, policy, roundId: ROUND, roundSetup: setup,
      cache, leaseStore: store(), bindingTransport: server.transport, fetchImpl: assetServer() };
    expect(await loadCoursePackage(options)).toBeNull();
    expect(await cache.get(manifest.packageUrl)).toBeNull();
    expect(server.getBinding()).toBeNull();
    expect(await loadCoursePackage({ ...options, policy: { ...policy, approvedPackageByteHashes: {} } })).toBeNull();
    expect(server.getBinding()).toBeNull();
    expect(await loadCoursePackage(options)).not.toBeNull();
  });

  it('requires the complete saved hole sequence and any explicitly selected profile revision', async () => {
    const proposal = await proposeRoundBinding(ROUND, manifest, pilotPackage, policy);
    const second = { ...scoring.holes[0]!, number: 2, par: 5, yardage: 510 };
    const binding = { ...proposal, scoringSnapshot: { ...scoring, holes: [second, scoring.holes[0]!] }, scorecardSnapshotHash: 'd'.repeat(64) };
    const same = { ...setup, holes: [{ number: 2, par: 5, yardage: 510 }, ...setup.holes] };
    expect(bindingMatchesScoring(binding, same)).toBe(true);
    expect(bindingMatchesScoring(binding, { ...same, holes: [...same.holes].reverse() })).toBe(false);
    expect(bindingMatchesScoring(binding, setup)).toBe(false); // No implicit partial-round contract.
    expect(bindingMatchesScoring(binding, { ...same, scorecardProfileId: 'white-2026' })).toBe(false);
    expect(bindingMatchesScoring(binding, { ...same, scorecardRevision: 'a'.repeat(64) })).toBe(false);
    expect(bindingMatchesScoring(binding)).toBe(true); // Read-only viewer supplies no scoring setup and cannot replace it.
  });

  it('refuses the losing concurrent proposal and preserves the winning immutable record', async () => {
    const server = rpcServer();
    const proposal = await proposeRoundBinding(ROUND, manifest, pilotPackage, policy);
    const winner = { ...proposal, frameVersion: 'f'.repeat(64) };
    const claim = server.transport.claim;
    server.transport.claim = async (candidate: RoundBindingProposal) => { await claim(winner); return claim(candidate); };
    expect(await loadCoursePackage({ courseId: policy.layoutId, policy, roundId: ROUND, roundSetup: setup,
      cache: new MemoryCourseAssetCache(), leaseStore: store(), bindingTransport: server.transport, fetchImpl: assetServer() })).toBeNull();
    expect(server.getBinding()?.frameVersion).toBe(winner.frameVersion);
  });

  it('refuses revoked hashes, changed crosswalks, malformed server responses, and legacy unresolved records', async () => {
    const server = rpcServer(), leaseStore = store();
    const options = { courseId: policy.layoutId, policy, roundId: ROUND, cache: new MemoryCourseAssetCache(), leaseStore, bindingTransport: server.transport, fetchImpl: assetServer() };
    expect(await loadCoursePackage(options)).not.toBeNull();
    expect(await loadCoursePackage({ ...options, policy: { ...policy, approvedGeometryHashes: new Set<string>() } })).toBeNull();
    expect(await loadCoursePackage({ ...options, policy: { ...policy, holeBindings: {} } })).toBeNull();
    const invalid = roundBindingTransport({ rpc: async () => ({ data: { status: 'found', binding: { roundId: 'foreign' } }, error: null }) });
    expect((await invalid.read(ROUND)).status).toBe('unavailable');
    const denied = roundBindingTransport({ rpc: async () => ({ data: null, error: { message: 'Round unavailable', code: '42501' } }) });
    expect(await loadCoursePackage({ ...options, bindingTransport: denied })).toBeNull();
    const legacy = roundBindingTransport({ rpc: async () => ({ data: { status: 'conflict' }, error: null }) });
    expect(await loadCoursePackage({ ...options, bindingTransport: legacy })).toBeNull();
  });
});
