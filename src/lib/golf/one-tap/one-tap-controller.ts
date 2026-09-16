import type { TerrainMesh } from '../course-geometry/terrain';
import type { PointM } from '../course-geometry/types';
import type { AnchorRepository, SyncQueue } from './anchor-repository';
import { MOTION, type CameraObservation } from './camera-director';
import { wgs84ToEnu, type LocalOrigin } from './geodesy';
import { markTerminal } from './hole-lifecycle';
import { classifyLie, greenComplexProbability, type SurfacePartition } from './lie-classifier';
import { ESTIMATOR_CONFIG, LocationBuffer, anchorConfidence, finalizeEstimate, provisionalLocation, type EstimatorConfig, type LocationSample } from './location-estimator';
import { deriveShots, finalAnchor, liveAnchors, newAnchorId, provisionalAnchor, tombstoneAnchor, undoable, type AnchorCourseBinding, type DerivedShot, type ShotAnchor } from './shot-anchor';
import type { CalibrationTraceSink } from './calibration-trace';
import { sampleTerrain } from './terrain-sampler';
import { largestOuterRing, ringCentroid } from './hole-distances';

/** One-tap controller (master plan "One-tap controller"). MARK BALL means
 * "the ball is here now": the tap writes a provisional anchor locally at
 * once, the estimator refines for 750 ms, the final anchor replaces it, the
 * adjacent shots re-derive and the sync queue takes the id. No network, no
 * snapping, no fabricated position: an empty window is GPS_UNAVAILABLE. */
export type OneTapState = 'HOLE_READY' | 'CAPTURE_PENDING' | 'ANCHOR_SAVED' | 'LOW_CONFIDENCE' | 'OUTSIDE_MODELED_AREA' | 'GPS_UNAVAILABLE' | 'SYNC_QUEUED' | 'MANUAL_CAMERA' | 'ROUND_PAUSED';
export type OneTapOutcome = 'saved' | 'low_confidence' | 'outside_modeled_area' | 'gps_unavailable';
export interface OneTapSnapshot {
  state: OneTapState;
  outcome: OneTapOutcome | null;
  lastAnchor: ShotAnchor | null;
  anchors: ShotAnchor[];
  shots: DerivedShot[];
  undoableId: string | null;
  syncPending: number;
  /** Anchors whose retries are exhausted (§70 "Sync issue"); still retried on the next flush. */
  syncErrors: number;
  paused: boolean;
  manualCamera: boolean;
  pendingTapMs: number | null;
}
export interface OneTapHole { holeKey: string; holeId: number; partition: SurfacePartition; terrain: TerrainMesh | null; terrainVersion: string | null }
export interface OneTapDeps {
  roundId: string;
  /** §73: the course this round's anchors belong to. */
  course: AnchorCourseBinding;
  origin: LocalOrigin;
  /** §71 debug/calibration only: receives the raw window of every final
   * anchor. Production passes nothing and no raw sample persists. */
  trace?: CalibrationTraceSink | null;
  buffer: LocationBuffer;
  repo: AnchorRepository;
  sync?: SyncQueue | null;
  hole: OneTapHole;
  geometryVersion: string;
  config?: EstimatorConfig;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => () => void;
  haptic?: (kind: 'light' | 'warning') => void;
}
export class OneTapController {
  private state: OneTapState = 'HOLE_READY';
  private outcome: OneTapOutcome | null = null;
  private paused = false;
  private manualCamera = false;
  private pendingTapMs: number | null = null;
  private listeners = new Set<(snapshot: OneTapSnapshot) => void>();
  private cancelHold: (() => void) | null = null;
  private hole: OneTapHole;
  private readonly now: () => number;
  private readonly schedule: (fn: () => void, ms: number) => () => void;
  private readonly config: EstimatorConfig;
  private unsubscribeRepo: () => void;
  constructor(private readonly deps: OneTapDeps) {
    this.hole = deps.hole;
    this.now = deps.now ?? (() => Date.now());
    this.schedule = deps.schedule ?? ((fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); });
    this.config = deps.config ?? ESTIMATOR_CONFIG;
    this.unsubscribeRepo = deps.repo.subscribe(() => this.emit());
  }
  dispose() { this.cancelHold?.(); this.unsubscribeRepo(); this.listeners.clear(); }
  subscribe(listener: (snapshot: OneTapSnapshot) => void): () => void { this.listeners.add(listener); listener(this.snapshot()); return () => { this.listeners.delete(listener); }; }
  private emit() { const s = this.snapshot(); for (const l of this.listeners) l(s); }
  private holeAnchors(): ShotAnchor[] { return this.deps.repo.list(this.deps.roundId).filter(a => a.holeKey === this.hole.holeKey); }
  snapshot(): OneTapSnapshot {
    const anchors = this.holeAnchors(), live = liveAnchors(anchors), last = live.at(-1) ?? null, now = this.now();
    return { state: this.paused ? 'ROUND_PAUSED' : this.manualCamera && this.state === 'HOLE_READY' ? 'MANUAL_CAMERA' : this.state, outcome: this.outcome, lastAnchor: last, anchors, shots: deriveShots(anchors),
      undoableId: last && !last.provisional && undoable(last, now) ? last.id : null, syncPending: anchors.filter(a => a.syncState === 'QUEUED' || a.syncState === 'ERROR').length, syncErrors: anchors.filter(a => a.syncState === 'ERROR').length,
      paused: this.paused, manualCamera: this.manualCamera, pendingTapMs: this.pendingTapMs };
  }
  greenCentre(): PointM | null {
    const green = this.hole.partition.surfaces.find(s => s.lieClass === 'green');
    const ring = green ? largestOuterRing(green.feature) : null;
    return ring ? ringCentroid(ring) : null;
  }
  cameraObservation(): CameraObservation | null {
    const last = liveAnchors(this.holeAnchors()).at(-1);
    if (!last || last.provisional) return null;
    const centre = this.greenCentre();
    return { distanceToGreenM: centre ? Math.hypot(centre[0] - last.positionENU[0], centre[1] - last.positionENU[1]) : null,
      greenComplexProbability: greenComplexProbability({ classes: last.liePosterior, primaryLie: last.primaryLie, primaryFeatureId: null, pMax: 0, method: 'exact', sampleCount: 0, edgeSigmaM: 0, queryRadiusM: 0, basis: 'canonical_partition' }),
      terminal: last.terminal };
  }
  pushSample(sample: LocationSample) {
    this.deps.buffer.push(sample);
    if (this.state === 'GPS_UNAVAILABLE' && sample.horizontalAccuracyM > 0) { this.state = 'HOLE_READY'; this.emit(); }
  }
  setHole(hole: OneTapHole) { this.hole = hole; this.outcome = null; this.state = 'HOLE_READY'; this.emit(); }
  pause() { this.paused = true; this.emit(); }
  resume() { this.paused = false; this.emit(); }
  setManualCamera(on: boolean) { this.manualCamera = on; this.emit(); }
  private setState(state: OneTapState, outcome: OneTapOutcome | null = this.outcome) { this.state = state; this.outcome = outcome; this.emit(); }
  private nextSequence(): number { return this.holeAnchors().reduce((max, a) => Math.max(max, a.sequence + 1), 0); }
  /** The tap. Resolves with the final anchor (null when no location existed). */
  async markBall(tapMs = this.now()): Promise<ShotAnchor | null> {
    if (this.paused || this.state === 'CAPTURE_PENDING') return null;
    this.cancelHold?.(); this.cancelHold = null;
    this.deps.haptic?.('light');
    this.pendingTapMs = tapMs;
    this.setState('CAPTURE_PENDING', null);
    const id = newAnchorId(tapMs), sequence = this.nextSequence();
    const identity = { id, roundId: this.deps.roundId, courseId: this.deps.course.courseId, siteId: this.deps.course.siteId, holeKey: this.hole.holeKey, holeId: this.hole.holeId, sequence, tapMs };
    const provisional = provisionalLocation(this.deps.buffer, tapMs, this.config);
    let base = provisionalAnchor(identity, provisional, provisional ? wgs84ToEnu([provisional.longitude, provisional.latitude, null], this.deps.origin) : null, this.deps.geometryVersion, this.hole.terrainVersion);
    if (provisional) this.deps.repo.upsert(base);
    const wait = Math.max(0, tapMs + this.config.refinementMs - this.now());
    await new Promise<void>(resolve => { this.schedule(resolve, wait); });
    let estimate = finalizeEstimate(this.deps.buffer, tapMs, this.deps.origin, this.config);
    // §36 moving capture: keep refining a little longer; if the fixes never
    // settle the mark still saves, one confidence grade lower. Never "stand still".
    if (estimate?.captureMotion === 'moving' && this.config.movingRefinementMs > this.config.refinementMs) {
      const extra = Math.max(0, tapMs + this.config.movingRefinementMs - this.now());
      await new Promise<void>(resolve => { this.schedule(resolve, extra); });
      estimate = finalizeEstimate(this.deps.buffer, tapMs, this.deps.origin, { ...this.config, refinementMs: this.config.movingRefinementMs }) ?? estimate;
    }
    this.pendingTapMs = null;
    if (!estimate) {
      if (provisional) this.deps.repo.upsert({ ...base, deletedAt: new Date(this.now()).toISOString() });
      this.deps.haptic?.('warning');
      this.setState('GPS_UNAVAILABLE', 'gps_unavailable');
      return null;
    }
    const terrain = this.hole.terrain ? sampleTerrain(this.hole.terrain, estimate.positionENU) : null;
    const posterior = classifyLie(this.hole.partition, estimate.positionENU, estimate.covarianceENU2D);
    const confidence = anchorConfidence(estimate.sigmaM, posterior.pMax, this.config, estimate.captureMotion);
    base = this.deps.repo.get(id) ?? base;
    const anchor = finalAnchor(base, estimate, terrain, posterior, confidence, this.now());
    this.deps.repo.upsert(anchor);
    this.deps.trace?.record({ anchorId: anchor.id, roundId: anchor.roundId, tapMs, samples: estimate.windowSamples });
    this.deps.sync?.enqueue(anchor.id);
    const outcome: OneTapOutcome = posterior.primaryLie === 'UNKNOWN' ? 'outside_modeled_area' : confidence === 'LOW' ? 'low_confidence' : 'saved';
    this.setState(outcome === 'outside_modeled_area' ? 'OUTSIDE_MODELED_AREA' : outcome === 'low_confidence' ? 'LOW_CONFIDENCE' : 'ANCHOR_SAVED', outcome);
    this.cancelHold = this.schedule(() => { this.cancelHold = null; if (this.state !== 'CAPTURE_PENDING') this.setState('HOLE_READY'); }, MOTION.savedHoldMs);
    void this.deps.sync?.flush();
    return this.deps.repo.get(anchor.id) ?? anchor;
  }
  /** Transient error recovery: tombstones the latest anchor inside the window. */
  undo(): ShotAnchor | null {
    const now = this.now(), last = liveAnchors(this.holeAnchors()).at(-1);
    if (!last || last.provisional || !undoable(last, now)) return null;
    for (const a of tombstoneAnchor(this.holeAnchors(), last.id, now)) if (a.id === last.id) { this.deps.repo.upsert(a); this.deps.sync?.enqueue(a.id); }
    this.outcome = null;
    this.setState('HOLE_READY');
    return this.deps.repo.get(last.id);
  }
  /** Overflow "Delete last mark" (§79): tombstones the latest finalized mark on
   * the hole at any age — the golfer's own correction, no branching. */
  deleteLast(): ShotAnchor | null {
    const now = this.now(), last = liveAnchors(this.holeAnchors()).at(-1);
    if (!last || last.provisional || this.state === 'CAPTURE_PENDING') return null;
    for (const a of tombstoneAnchor(this.holeAnchors(), last.id, now)) if (a.id === last.id) { this.deps.repo.upsert(a); this.deps.sync?.enqueue(a.id); }
    this.outcome = null;
    this.setState('HOLE_READY');
    return this.deps.repo.get(last.id);
  }
  /** CUP_MARK: the final MARK BALL was at the cup. Never a green-centre substitute. */
  holeOut(anchorId?: string): ShotAnchor | null {
    const live = liveAnchors(this.holeAnchors()), target = anchorId ? live.find(a => a.id === anchorId) : live.at(-1);
    if (!target || target.provisional) return null;
    for (const a of markTerminal(this.holeAnchors(), target.id, 'CUP_MARK')) { const current = this.deps.repo.get(a.id); if (current && (current.terminal !== a.terminal || current.terminalMethod !== a.terminalMethod)) { this.deps.repo.upsert(a); this.deps.sync?.enqueue(a.id); } }
    return this.deps.repo.get(target.id);
  }
}
