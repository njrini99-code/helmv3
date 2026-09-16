import { localFeature } from '../course-geometry/schema';
import { inFeature } from '../course-geometry/spatial';
import type { CourseGeometryPackage, LocalFeature, PointM } from '../course-geometry/types';
import { MemoryAnchorRepository, StorageAnchorRepository, type AnchorRepository, type StorageLike } from './anchor-repository';
import { enuToWgs84, localOriginFor, type LocalOrigin } from './geodesy';
import { largestOuterRing, ringCentroid } from './hole-distances';
import { observeNextTee, posteriorGreenProbability, NEXT_TEE_RULE, type NextTeeState } from './hole-lifecycle';
import { buildSurfacePartition, distanceToBoundary, exactPointInPartition, type LieClass, type SurfacePartition } from './lie-classifier';
import { LocationBuffer, type LocationSample } from './location-estimator';
import { OneTapController, type OneTapOutcome } from './one-tap-controller';
import type { ShotAnchor } from './shot-anchor';

/** Master plan task 17 — the deterministic all-hole trace matrix. Every hole
 * is walked tee → route → rough edge → bunker edge (where the hole has one)
 * → green → next tee under each noise variant, through the real controller,
 * estimator, classifier and next-tee inference, with a seeded generator so a
 * run replays exactly. The hard gates: no false automatic hole advance, no
 * anchor reassigned across holes, no local anchor lost through a reload. */
export type TraceSpotKind = 'tee' | 'route' | 'rough_edge' | 'bunker_edge' | 'green';
export interface TraceSpot { kind: TraceSpotKind; position: PointM; expectedLie: LieClass | null }
export interface HoleTrace { holeKey: string; holeId: number; ordinal: number; nextHoleKey: string | null; spots: TraceSpot[]; greenCentre: PointM; nextTeeCentre: PointM | null; partition: SurfacePartition }

function surfacesOf(partition: SurfacePartition, lie: LieClass) { return partition.surfaces.filter(s => s.lieClass === lie); }
function areaOf(ring: readonly PointM[]): number { let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1]; return Math.abs(a) / 2; }
function largestSurface(partition: SurfacePartition, lie: LieClass) {
  return surfacesOf(partition, lie).map(s => ({ s, area: (() => { const r = largestOuterRing(s.feature); return r ? areaOf(r) : 0; })() })).sort((a, b) => b.area - a.area)[0]?.s ?? null;
}
/** The deepest interior point of a surface that the exact partition also
 * reads as that surface (a centroid can fall outside a crescent bunker). */
export function interiorPoint(partition: SurfacePartition, lie: LieClass, surface = largestSurface(partition, lie)): PointM | null {
  if (!surface) return null;
  const ring = largestOuterRing(surface.feature);
  if (!ring) return null;
  const reads = (p: PointM) => exactPointInPartition(partition, p).lieClass === lie;
  const centre = ringCentroid(ring);
  const [minX, minY, maxX, maxY] = surface.bounds;
  const step = Math.max(1, Math.min(maxX - minX, maxY - minY) / 24);
  let best: { p: PointM; d: number } | null = reads(centre) ? { p: centre, d: distanceToBoundary(centre, surface.feature) } : null;
  for (let y = minY; y <= maxY; y += step) for (let x = minX; x <= maxX; x += step) {
    const p: PointM = [x, y];
    if (!reads(p)) continue;
    const d = distanceToBoundary(p, surface.feature);
    if (!best || d > best.d) best = { p, d };
  }
  return best?.p ?? null;
}
/** A point just inside a surface, `edgeM` from its boundary, reading as that surface. */
export function edgePoint(partition: SurfacePartition, lie: LieClass, edgeM: [number, number]): PointM | null {
  const surface = largestSurface(partition, lie);
  if (!surface) return null;
  const [minX, minY, maxX, maxY] = surface.bounds;
  const step = Math.max(.5, Math.min(maxX - minX, maxY - minY) / 40);
  for (let y = minY; y <= maxY; y += step) for (let x = minX; x <= maxX; x += step) {
    const p: PointM = [x, y];
    if (exactPointInPartition(partition, p).lieClass !== lie) continue;
    const d = distanceToBoundary(p, surface.feature);
    if (d >= edgeM[0] && d <= edgeM[1]) return p;
  }
  return null;
}
/** Just outside the fairway, in the primary rough band. */
export function roughEdgePoint(partition: SurfacePartition): PointM | null {
  const fairway = largestSurface(partition, 'fairway');
  if (!fairway) return null;
  const inside = interiorPoint(partition, 'fairway', fairway);
  if (!inside) return null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]] as const) {
    const unit = Math.hypot(dx, dy);
    for (let r = .5; r <= 160; r += .5) {
      const p: PointM = [inside[0] + dx / unit * r, inside[1] + dy / unit * r];
      const exact = exactPointInPartition(partition, p);
      if (exact.lieClass === 'fairway') continue;
      // Just past the fairway edge: keep walking through the primary rough band until 2–5 m out.
      if (exact.lieClass !== 'primary_rough') break;
      const d = distanceToBoundary(p, fairway.feature);
      if (d >= 2 && d <= 5) return p;
      if (d > 5) break;
    }
  }
  return null;
}
function routeLine(pkg: CourseGeometryPackage, holeKey: string): PointM[] | null {
  const hole = pkg.holes.find(h => h.key === holeKey);
  const feature = hole?.routeFeatureId ? pkg.features.find(f => f.id === hole.routeFeatureId) : null;
  const line = feature ? localFeature(feature, pkg).parts[0]?.[0] : null;
  return line && line.length >= 2 ? line.map(p => [p[0], p[1]] as PointM) : null;
}
function along(line: readonly PointM[], fraction: number): PointM {
  const lengths: number[] = []; let total = 0;
  for (let i = 1; i < line.length; i++) { const d = Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]); lengths.push(d); total += d; }
  let remaining = total * Math.max(0, Math.min(1, fraction));
  for (let i = 1; i < line.length; i++) {
    const d = lengths[i - 1]!;
    if (remaining <= d || i === line.length - 1) { const t = d > 0 ? Math.min(1, remaining / d) : 0; return [line[i - 1]![0] + (line[i]![0] - line[i - 1]![0]) * t, line[i - 1]![1] + (line[i]![1] - line[i - 1]![1]) * t]; }
    remaining -= d;
  }
  return line[line.length - 1]!;
}
export function teesOf(pkg: CourseGeometryPackage, holeKey: string): LocalFeature[] { return surfacesOf(buildSurfacePartition(pkg, holeKey), 'tee').map(s => s.feature); }
/** Every hole's spots, in playing order. Rough and bunker edges are
 * included where the hole has that surface; a hole without a fairway (13,
 * 15 on Peek Upper) has no rough edge because the rough band derives from it. */
export function holeTraces(pkg: CourseGeometryPackage): HoleTrace[] {
  const holes = [...pkg.holes].sort((a, b) => a.ordinal - b.ordinal);
  return holes.map((hole, index) => {
    const partition = buildSurfacePartition(pkg, hole.key);
    const route = routeLine(pkg, hole.key);
    const tees = surfacesOf(partition, 'tee');
    // The tee the route starts from, else the largest.
    const start = route?.[0];
    const tee = (start && tees.map(s => ({ s, d: Math.hypot(ringCentroid(largestOuterRing(s.feature)!)[0] - start[0], ringCentroid(largestOuterRing(s.feature)!)[1] - start[1]) })).sort((a, b) => a.d - b.d)[0]?.s) ?? largestSurface(partition, 'tee');
    const teePoint = tee ? interiorPoint(partition, 'tee', tee) : null;
    const green = interiorPoint(partition, 'green');
    const greenRing = largestOuterRing(largestSurface(partition, 'green')!.feature)!;
    const spots: TraceSpot[] = [];
    if (teePoint) spots.push({ kind: 'tee', position: teePoint, expectedLie: 'tee' });
    if (route) for (const f of [.35, .65]) { const p = along(route, f); spots.push({ kind: 'route', position: p, expectedLie: null }); }
    const rough = roughEdgePoint(partition);
    if (rough) spots.push({ kind: 'rough_edge', position: rough, expectedLie: 'primary_rough' });
    const bunker = edgePoint(partition, 'bunker', [1, 3]);
    if (bunker) spots.push({ kind: 'bunker_edge', position: bunker, expectedLie: 'bunker' });
    if (green) spots.push({ kind: 'green', position: green, expectedLie: 'green' });
    const next = holes[index + 1] ?? null;
    const nextTee = next ? interiorPoint(buildSurfacePartition(pkg, next.key), 'tee') : null;
    return { holeKey: hole.key, holeId: hole.ordinal, ordinal: hole.ordinal, nextHoleKey: next?.key ?? null, spots, greenCentre: ringCentroid(greenRing), nextTeeCentre: nextTee, partition };
  });
}

/** Noise variants from the plan. `scatterM` is the true per-axis scatter; the
 * reported accuracy is what the phone would say. */
export type NoiseVariant = 'acc3' | 'acc6' | 'acc10' | 'gps_jump' | 'cart_transition' | 'adjacent_bleed' | 'poor_sky';
export const NOISE_VARIANTS: readonly NoiseVariant[] = ['acc3', 'acc6', 'acc10', 'gps_jump', 'cart_transition', 'adjacent_bleed', 'poor_sky'];
export interface NoiseProfile { accuracyM: number; scatterM: number; jumpM: number; cartSpeeds: readonly number[] | null; bleed: boolean }
export function noiseProfile(variant: NoiseVariant): NoiseProfile {
  switch (variant) {
    case 'acc3': return { accuracyM: 3, scatterM: 1.5, jumpM: 0, cartSpeeds: null, bleed: false };
    case 'acc6': return { accuracyM: 6, scatterM: 3, jumpM: 0, cartSpeeds: null, bleed: false };
    case 'acc10': return { accuracyM: 10, scatterM: 5, jumpM: 0, cartSpeeds: null, bleed: false };
    case 'gps_jump': return { accuracyM: 4, scatterM: 2, jumpM: 45, cartSpeeds: null, bleed: false };
    // Reported speed decays through the tap (index 6 of 13): the cart is still rolling as the player marks.
    case 'cart_transition': return { accuracyM: 4, scatterM: 2, jumpM: 0, cartSpeeds: [6, 6, 5, 5, 4, 4, 3, 2, 1, 0, 0, 0, 0], bleed: false };
    case 'adjacent_bleed': return { accuracyM: 5, scatterM: 2.5, jumpM: 0, cartSpeeds: null, bleed: true };
    case 'poor_sky': return { accuracyM: 15, scatterM: 7, jumpM: 0, cartSpeeds: null, bleed: false };
  }
}
/** mulberry32: a seeded generator so the matrix replays identically. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gaussian(random: () => number): number { const u = Math.max(random(), 1e-12), v = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function sampleAt(origin: LocalOrigin, [e, n]: PointM, tMs: number, accuracyM: number, speedMps: number | null): LocationSample {
  const [longitude, latitude] = enuToWgs84([e, n, 0], origin);
  return { timestampMs: tMs, longitude, latitude, altitudeM: null, horizontalAccuracyM: accuracyM, verticalAccuracyM: null, speedMps, headingDegrees: null, source: 'synthetic' };
}
/** The fixes around one tap: 1.5 s before to 1.5 s after at 250 ms, scattered
 * by the profile; a GPS jump displaces one pre-tap fix; a cart transition
 * reports decaying speed across the window. */
export function tapWindow(origin: LocalOrigin, truth: PointM, tapMs: number, profile: NoiseProfile, random: () => number): LocationSample[] {
  const samples: LocationSample[] = [];
  let i = 0;
  for (let t = tapMs - 1500; t <= tapMs + 1500; t += 250, i++) {
    let e = truth[0] + gaussian(random) * profile.scatterM, n = truth[1] + gaussian(random) * profile.scatterM;
    if (profile.jumpM > 0 && t === tapMs - 750) { e += profile.jumpM; n += profile.jumpM * .3; }
    const accuracy = profile.accuracyM * (.85 + random() * .3);
    samples.push(sampleAt(origin, [e, n], t, accuracy, profile.cartSpeeds ? profile.cartSpeeds[Math.min(i, profile.cartSpeeds.length - 1)]! : null));
  }
  return samples;
}

/** A virtual clock the controller schedules against, so the matrix runs in
 * milliseconds of wall time and identically everywhere. */
export class VirtualClock {
  private queue: { due: number; fn: () => void; cancelled: boolean }[] = [];
  constructor(public nowMs: number) {}
  now = () => this.nowMs;
  schedule = (fn: () => void, ms: number) => { const item = { due: this.nowMs + ms, fn, cancelled: false }; this.queue.push(item); return () => { item.cancelled = true; }; };
  /** Runs everything due up to `t`, in order, then settles at `t`. */
  advanceTo(t: number) {
    for (;;) {
      const next = this.queue.filter(i => !i.cancelled && i.due <= t).sort((a, b) => a.due - b.due)[0];
      if (!next) break;
      this.queue = this.queue.filter(i => i !== next);
      this.nowMs = Math.max(this.nowMs, next.due);
      next.fn();
    }
    this.nowMs = Math.max(this.nowMs, t);
  }
}
const flush = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });

export interface MarkResult { holeKey: string; kind: TraceSpotKind; expectedLie: LieClass | null; anchor: ShotAnchor | null; outcome: OneTapOutcome | null; lie: LieClass | null; confidence: string | null; sigmaM: number | null; finalizeMs: number | null }
export interface HoleRun { holeKey: string; ordinal: number; marks: MarkResult[]; inferredAdvance: boolean; falseAdvance: boolean; greenProbability: number | null; dwellMs: number | null }
export interface MatrixRun { variant: NoiseVariant; seed: number; holes: HoleRun[]; anchorsByHole: Record<string, number>; reloadedByHole: Record<string, number>; lostAnchors: number; crossHole: number; falseAdvances: number; gpsUnavailable: number }

/** Runs the whole round for one variant through one controller and one
 * device store, hole after hole — the way a round is actually played — and
 * reloads the store at the end to prove nothing was lost. */
export async function runTraceMatrix(pkg: CourseGeometryPackage, variant: NoiseVariant, options: { seed?: number; storage?: StorageLike; traces?: HoleTrace[]; roundId?: string } = {}): Promise<MatrixRun> {
  const seed = options.seed ?? 17, random = seededRandom(seed), profile = noiseProfile(variant);
  const origin = localOriginFor(pkg), traces = options.traces ?? holeTraces(pkg), roundId = options.roundId ?? `trace:${variant}`;
  const course = { courseId: 'peek-n-peak-upper', siteId: pkg.siteId };
  const repo: AnchorRepository = options.storage ? new StorageAnchorRepository(options.storage, [roundId], course) : new MemoryAnchorRepository();
  const clock = new VirtualClock(1_700_000_000_000);
  const buffer = new LocationBuffer();
  const first = traces[0]!;
  const controller = new OneTapController({ roundId, course, origin, buffer, repo, sync: null, geometryVersion: pkg.contentHash, now: clock.now, schedule: clock.schedule,
    hole: { holeKey: first.holeKey, holeId: first.holeId, partition: first.partition, terrain: null, terrainVersion: null } });
  const holes: HoleRun[] = [];
  const feed = (sample: LocationSample) => { controller.pushSample(sample); };
  for (const trace of traces) {
    controller.setHole({ holeKey: trace.holeKey, holeId: trace.holeId, partition: trace.partition, terrain: null, terrainVersion: null });
    const nextTees = trace.nextHoleKey ? teesOf(pkg, trace.nextHoleKey) : [];
    let dwell: NextTeeState = { insideSinceMs: null }, inferredAdvance = false, falseAdvance = false, dwellMs: number | null = null;
    const marks: MarkResult[] = [];
    let lastAnchor: ShotAnchor | null = null;
    // A false advance is one before the green mark, or one the rule's own
    // dwell clock cannot justify. Walking onto the tee counts toward the dwell.
    const observe = (position: PointM, phase: 'pre_green' | 'walk' | 'dwell') => {
      if (!nextTees.length) return;
      const result = observeNextTee(dwell, lastAnchor, nextTees, trace.greenCentre, { position, nowMs: clock.nowMs });
      dwell = result.state;
      if (result.inferred && !inferredAdvance) {
        const insideFor = result.state.insideSinceMs != null ? clock.nowMs - result.state.insideSinceMs : 0;
        inferredAdvance = true; dwellMs = insideFor;
        if (phase === 'pre_green' || insideFor < NEXT_TEE_RULE.dwellMs) falseAdvance = true;
      }
    };
    // Walk between spots at 1.4 m/s, one fix per second, observing the next-tee rule on every fix.
    const walk = async (from: PointM, to: PointM, phase: 'pre_green' | 'walk', via?: PointM) => {
      const path = via ? [from, via, to] : [from, to];
      for (let leg = 1; leg < path.length; leg++) {
        const a = path[leg - 1]!, b = path[leg]!, length = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.max(1, Math.ceil(length / 1.4));
        for (let s = 1; s <= steps; s++) {
          const t = s / steps, truth: PointM = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          clock.advanceTo(clock.nowMs + 1000);
          feed(sampleAt(origin, [truth[0] + gaussian(random) * profile.scatterM, truth[1] + gaussian(random) * profile.scatterM], clock.nowMs, profile.accuracyM, 1.4));
          observe(truth, phase);
        }
      }
    };
    let position = trace.spots[0]!.position;
    for (const [index, spot] of trace.spots.entries()) {
      if (index > 0) {
        // Adjacent-hole bleed: the walk to the green wanders through the next hole's tee for a few seconds — never long enough, never after a green mark.
        const bleedVia = profile.bleed && spot.kind === 'green' && trace.nextTeeCentre ? trace.nextTeeCentre : undefined;
        await walk(position, spot.position, 'pre_green', bleedVia);
        position = spot.position;
      }
      clock.advanceTo(clock.nowMs + 2000);
      const tapMs = clock.nowMs;
      const window = tapWindow(origin, spot.position, tapMs, profile, random);
      for (const s of window) if (s.timestampMs <= tapMs) feed(s);
      const pending = controller.markBall(tapMs);
      for (const s of window) if (s.timestampMs > tapMs) { clock.advanceTo(s.timestampMs); feed(s); await flush(); }
      clock.advanceTo(tapMs + 2000); await flush();
      clock.advanceTo(tapMs + 3000); await flush();
      const anchor = await pending;
      const snapshot = controller.snapshot();
      lastAnchor = anchor;
      marks.push({ holeKey: trace.holeKey, kind: spot.kind, expectedLie: spot.expectedLie, anchor, outcome: snapshot.outcome, lie: anchor?.primaryLie ?? null, confidence: anchor?.confidence ?? null, sigmaM: anchor?.sigmaM ?? null,
        finalizeMs: anchor?.finalizedTimestamp ? Date.parse(anchor.finalizedTimestamp) - tapMs : null });
      clock.advanceTo(clock.nowMs + 1500); await flush();
    }
    // To the next tee, then dwell there: the only place an automatic advance may happen.
    if (trace.nextTeeCentre) {
      await walk(position, trace.nextTeeCentre, 'walk');
      for (let s = 1; s <= 14; s++) {
        clock.advanceTo(clock.nowMs + 1000);
        const truth = trace.nextTeeCentre;
        feed(sampleAt(origin, [truth[0] + gaussian(random) * profile.scatterM, truth[1] + gaussian(random) * profile.scatterM], clock.nowMs, profile.accuracyM, 0));
        observe(truth, 'dwell');
      }
    }
    holes.push({ holeKey: trace.holeKey, ordinal: trace.ordinal, marks, inferredAdvance, falseAdvance, greenProbability: lastAnchor ? posteriorGreenProbability(lastAnchor) : null, dwellMs });
  }
  controller.dispose();
  const live = repo.list(roundId).filter(a => !a.deletedAt);
  const anchorsByHole: Record<string, number> = {}, reloadedByHole: Record<string, number> = {};
  for (const a of live) anchorsByHole[a.holeKey] = (anchorsByHole[a.holeKey] ?? 0) + 1;
  const reloaded = options.storage ? new StorageAnchorRepository(options.storage, [roundId], course).list(roundId).filter(a => !a.deletedAt) : live;
  for (const a of reloaded) reloadedByHole[a.holeKey] = (reloadedByHole[a.holeKey] ?? 0) + 1;
  const expectedIds = new Set(holes.flatMap(h => h.marks.map(m => m.anchor?.id).filter((id): id is string => !!id)));
  const lostAnchors = [...expectedIds].filter(id => !reloaded.some(a => a.id === id)).length;
  const crossHole = holes.reduce((n, h) => n + h.marks.filter(m => m.anchor && m.anchor.holeKey !== h.holeKey).length, 0)
    + reloaded.filter(a => { const h = holes.find(x => x.marks.some(m => m.anchor?.id === a.id)); return h && h.holeKey !== a.holeKey; }).length;
  return { variant, seed, holes, anchorsByHole, reloadedByHole, lostAnchors, crossHole, falseAdvances: holes.filter(h => h.falseAdvance).length, gpsUnavailable: holes.reduce((n, h) => n + h.marks.filter(m => m.outcome === 'gps_unavailable').length, 0) };
}
/** True when the point sits inside any of the features (used by the tests to sanity-check spots). */
export function insideAny(point: PointM, features: readonly LocalFeature[]): boolean { return features.some(f => inFeature(point, f)); }
/** Classification report for a run: how often the argmax lie matched the
 * spot's expected lie, and how often the truth was at least present in the
 * posterior. Not a gate — source-candidate geometry with unreviewed edges
 * (edge σ 2.5 m) and narrow tees cannot promise an exact read at 3 m. */
export function lieReport(run: MatrixRun): { spots: number; exact: number; present: number; byKind: Record<string, { spots: number; exact: number }> } {
  let spots = 0, exact = 0, present = 0;
  const byKind: Record<string, { spots: number; exact: number }> = {};
  for (const hole of run.holes) for (const mark of hole.marks) {
    if (!mark.expectedLie || !mark.anchor) continue;
    spots++;
    const kind = byKind[mark.kind] ?? (byKind[mark.kind] = { spots: 0, exact: 0 });
    kind.spots++;
    if (mark.lie === mark.expectedLie) { exact++; kind.exact++; }
    if (mark.anchor.liePosterior.some(e => e.lieClass === mark.expectedLie && e.p >= .2)) present++;
  }
  return { spots, exact, present, byKind };
}
