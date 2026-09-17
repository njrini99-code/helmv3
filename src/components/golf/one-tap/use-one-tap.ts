'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProductionCameraState, TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { CourseGeometryPackage } from '@/lib/golf/course-geometry/types';
import type { SceneMarkers } from '@/lib/golf/course-geometry/scene-markers';
import { MemoryAnchorRepository, StorageAnchorRepository, SyncQueue, type AnchorRepository, type StorageLike, type SyncTransport } from '@/lib/golf/one-tap/anchor-repository';
import type { PenaltyRepository } from '@/lib/golf/one-tap/penalty-event';
import type { CalibrationTraceSink } from '@/lib/golf/one-tap/calibration-trace';
import { initialCameraState, nextHole, observeAnchor, observeGesture, productionStateFor, recenter, tickCamera, type CameraDirectorState, type CameraMode } from '@/lib/golf/one-tap/camera-director';
import { localOriginFor, wgs84ToEnuInFrame } from '@/lib/golf/one-tap/geodesy';
import { courseIdForSite } from '@/lib/golf/one-tap/peek-n-peak-policy';
import { largestOuterRing, ringCentroid, greenDistances, greenReadout, type GreenDistances, type GreenReadout } from '@/lib/golf/one-tap/hole-distances';
import { competitionPolicy, permittedAdvice, NO_ADVICE, type CompetitionPolicy, type PlayMode, type ReadoutAdvice } from '@/lib/golf/one-tap/competition-policy';
import { sampleTerrain } from '@/lib/golf/one-tap/terrain-sampler';
import type { PointM } from '@/lib/golf/course-geometry/types';
import { FINISH_HOLE_RULE, posteriorGreenProbability } from '@/lib/golf/one-tap/hole-lifecycle';
import { buildSurfacePartition, exactPointInPartition, LIE_LABELS, type LieClass, type LieDisplay } from '@/lib/golf/one-tap/lie-classifier';
import { presentLie, type LiePresentationContext, type LieRule } from '@/lib/golf/one-tap/presentation-lie';
import { LocationBuffer, type Covariance2, type LocationSample } from '@/lib/golf/one-tap/location-estimator';
import type { LocationSource, LocationStatus } from '@/lib/golf/one-tap/location-source';
import { OneTapController, type OneTapSnapshot } from '@/lib/golf/one-tap/one-tap-controller';
import { QUALITY_CONFIG, gradeLocationQuality, isApproximateFix, type LocationQuality } from '@/lib/golf/one-tap/location-quality';
import { acceptPlayerFix, playerFixFromSample, tickPlayerPresentation, type PlayerPresentation } from '@/lib/golf/one-tap/player-presentation';
import { markersFromAnchors } from '@/lib/golf/one-tap/scene-markers';
import { liveAnchors, UNDO_WINDOW_MS, type ShotAnchor } from '@/lib/golf/one-tap/shot-anchor';

/** The One-Tap screen model (master plan "Player-facing design"): wires the
 * location source, estimator buffer, on-device anchor store, sync queue,
 * controller and camera director into one view the screen renders. Nothing
 * here invents a position: distances come from a real fix or a real mark,
 * the lie is the controller's posterior, and the camera only ever maps onto
 * the production states the renderer already frames. */
export interface UseOneTapOptions {
  roundId: string;
  pkg: CourseGeometryPackage;
  holeKey: string;
  terrain: TerrainMesh | null;
  /** Null: no platform location; the controller reports GPS_UNAVAILABLE on the tap. */
  location: LocationSource | null;
  /** Anchor persistence. Omitted → localStorage; null → memory only. */
  storage?: StorageLike | null;
  /** A round-level repository (shared across holes) replaces the per-hook one. */
  repo?: AnchorRepository;
  /** The round's penalty events flush through the same outbox (task 13). */
  penaltyRepo?: PenaltyRepository | null;
  transport?: SyntheticTransport | SyncTransport | null;
  /** §71 debug/calibration only: raw windows go here and nowhere else. */
  trace?: CalibrationTraceSink | null;
  reducedMotion?: boolean;
  /** Task 16: competition hides elevation and every kind of advice; distance and direction stay. */
  playMode?: PlayMode;
  now?: () => number;
}
type SyntheticTransport = SyncTransport;
export interface OneTapStatusToast { kind: 'saved' | 'saved_low' | 'saved_outside' | 'no_fix'; undoable: boolean }
export interface OneTapLie {
  primary: LieClass;
  /** Presentation copy (§45–48): "Green", "Likely green", "Green / fringe", "Near tee edge", "Near water". */
  label: string;
  /** Second class named beside the first on a boundary posterior. */
  secondaryLabel: string | null;
  display: LieDisplay;
  rule: LieRule;
  /** §47: the mark needs the penalty/drop workflow before it is a lie. */
  needsPenaltyWorkflow: boolean;
  pMax: number;
  greenProbability: number;
}
export interface OneTapView {
  snapshot: OneTapSnapshot;
  markers: SceneMarkers;
  /** Front / centre / back from the freshest real position. */
  distances: GreenDistances | null;
  distancesBasis: 'live_fix' | 'last_mark' | null;
  /** §15–16: what the readout prints — F/C/B on the approach, ON GREEN + centre on the green. */
  readout: GreenReadout | null;
  /** Task 16: the policy in force and what it lets the readout add beyond distance and direction. */
  policy: CompetitionPolicy;
  advice: ReadoutAdvice;
  hasGreen: boolean;
  /** Lie of the last finalized mark on this hole. */
  lie: OneTapLie | null;
  lastMark: ShotAnchor | null;
  cameraMode: CameraMode;
  /** Production camera state the stage should frame (manual mode keeps the last automatic one). */
  cameraState: ProductionCameraState;
  locationKind: 'device' | 'synthetic' | 'none';
  latestFix: LocationSample | null;
  /** §37 presentation position of the live device (YOU); never evidence. */
  player: PlayerPresentation | null;
  /** §8.2/§11.3: `good` is silent; the rest earn the single location chip. */
  locationQuality: LocationQuality;
  /** §70: healthy sync is invisible; only an outage or a stuck queue speaks. */
  syncIssue: 'offline' | 'error' | null;
  /** §13: the transient "✓ Saved … Undo" status after a tap; null when nothing to say. */
  statusToast: OneTapStatusToast | null;
  /** §14: the last mark sits in the green complex, so "Finish hole" is offered. */
  finishSuggested: boolean;
  canHoleOut: boolean;
  /** §79 overflow: a finalized mark on this hole can be deleted at any age. */
  canDeleteLastMark: boolean;
  paused: boolean;
  markBall(): void;
  undo(): void;
  holeOut(): void;
  deleteLastMark(): void;
  pause(): void;
  resume(): void;
  onGesture(): void;
  recenterCamera(): void;
}

const EMPTY_SNAPSHOT: OneTapSnapshot = Object.freeze({ state: 'HOLE_READY', outcome: null, lastAnchor: null, anchors: [], shots: [], undoableId: null, syncPending: 0, syncErrors: 0, paused: false, manualCamera: false, pendingTapMs: null });
/** The fresh-mark key must outlive the 520 ms shot reveal (task 12,
 * `MARKER_MOTION.revealMs`) and a preset overlay rebuild, or a rebuilt
 * controller never sees `reveal` and the stroke is lost. */
export const RIPPLE_MS = 900;
const CAMERA_TICK_MS = 1000;
/** §37: YOU eases at animation cadence; the tick is a no-op once settled. */
const PLAYER_TICK_MS = 100;

function defaultStorage(): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
function haptic(kind: 'light' | 'warning') {
  try { if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(kind === 'light' ? 10 : [30, 40, 30]); } catch { /* unsupported */ }
}
function lastFinal(anchors: readonly ShotAnchor[]): ShotAnchor | null {
  const live = liveAnchors(anchors);
  for (let i = live.length - 1; i >= 0; i--) if (!live[i]!.provisional) return live[i]!;
  return null;
}
/** The lie a golfer reads for a mark: the stored posterior through the
 * presentation rules, with the hole context (shots so far, feature review). */
export function describeLie(anchor: ShotAnchor, context: LiePresentationContext): OneTapLie {
  const presentation = presentLie(anchor.liePosterior, anchor.primaryLie, context);
  return { primary: presentation.primary, label: presentation.label, secondaryLabel: presentation.secondary ? LIE_LABELS[presentation.secondary] : null,
    display: presentation.display, rule: presentation.rule, needsPenaltyWorkflow: presentation.needsPenaltyWorkflow, pMax: presentation.pMax, greenProbability: posteriorGreenProbability(anchor) };
}
function sameCamera(a: CameraDirectorState, b: CameraDirectorState): boolean {
  return a.mode === b.mode && a.sinceMs === b.sinceMs && a.lastGestureMs === b.lastGestureMs && a.anchored === b.anchored;
}

export function useOneTap(options: UseOneTapOptions): OneTapView {
  const { roundId, pkg, holeKey, terrain, location, transport = null, reducedMotion = false, playMode = 'practice', penaltyRepo = null } = options;
  const nowRef = useRef(options.now ?? Date.now);
  nowRef.current = options.now ?? Date.now;
  const now = useCallback(() => nowRef.current(), []);
  const origin = useMemo(() => localOriginFor(pkg), [pkg]);
  const partition = useMemo(() => buildSurfacePartition(pkg, holeKey), [pkg, holeKey]);
  const holeId = pkg.holes.find(h => h.key === holeKey)?.ordinal ?? 1;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const course = useMemo(() => ({ courseId: courseIdForSite(pkg.siteId), siteId: pkg.siteId }), [pkg.siteId]);
  const ownRepo = useMemo<AnchorRepository>(() => options.repo ? options.repo : storage ? new StorageAnchorRepository(storage, [roundId], course) : new MemoryAnchorRepository(), [options.repo, storage, roundId, course]);
  const repo = options.repo ?? ownRepo;
  const sync = useMemo(() => new SyncQueue(repo, transport, roundId, penaltyRepo ?? null), [repo, transport, roundId, penaltyRepo]);
  const [buffer] = useState(() => new LocationBuffer());

  // The controller is created in an effect (not a memo) so Strict Mode's
  // mount/unmount/mount never leaves a disposed instance in use.
  const [controller, setController] = useState<OneTapController | null>(null);
  const holeRef = useRef({ holeKey, holeId, partition, terrain });
  holeRef.current = { holeKey, holeId, partition, terrain };
  useEffect(() => {
    const h = holeRef.current;
    const created = new OneTapController({ roundId, course, origin, buffer, repo, sync, geometryVersion: pkg.contentHash, now, haptic, trace: options.trace ?? null,
      hole: { holeKey: h.holeKey, holeId: h.holeId, partition: h.partition, terrain: h.terrain, terrainVersion: h.terrain?.contentHash ?? null } });
    setController(created);
    return () => { created.dispose(); setController(current => current === created ? null : current); };
  }, [roundId, course, origin, buffer, repo, sync, pkg.contentHash, now, options.trace]);

  const [camera, setCamera] = useState<CameraDirectorState>(() => initialCameraState(now()));
  useEffect(() => {
    if (!controller) return;
    controller.setHole({ holeKey, holeId, partition, terrain, terrainVersion: terrain?.contentHash ?? null });
    setCamera(nextHole(now()));
  }, [controller, holeKey, holeId, partition, terrain, now]);

  const [snapshot, setSnapshot] = useState<OneTapSnapshot>(EMPTY_SNAPSHOT);
  useEffect(() => {
    if (!controller) { setSnapshot(EMPTY_SNAPSHOT); return; }
    return controller.subscribe(setSnapshot);
  }, [controller]);

  const [latestFix, setLatestFix] = useState<LocationSample | null>(null);
  // §5/§37: YOU is the live device, eased for presentation; it is never
  // evidence. The estimator buffer gets the raw sample, the marker gets the fix.
  const [player, setPlayer] = useState<PlayerPresentation | null>(null);
  const [playerStale, setPlayerStale] = useState(false);
  useEffect(() => {
    if (!controller || !location) { setPlayer(null); setLatestFix(null); return; }
    return location.subscribe(sample => {
      controller.pushSample(sample); setLatestFix(sample);
      const fix = playerFixFromSample(sample, origin);
      if (fix) { setPlayer(previous => acceptPlayerFix(previous, fix)); setPlayerStale(false); }
    });
  }, [controller, location, origin]);
  // §70/§8.2: the shell reports connectivity and the device source its status;
  // neither is shown while healthy.
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  const [locationStatus, setLocationStatus] = useState<LocationStatus | null>(null);
  useEffect(() => {
    if (!location || !('subscribeStatus' in location)) { setLocationStatus(null); return; }
    const source = location as LocationSource & { status(): LocationStatus; subscribeStatus(l: (s: LocationStatus) => void): () => void };
    setLocationStatus(source.status());
    return source.subscribeStatus(setLocationStatus);
  }, [location]);
  useEffect(() => {
    if (!player) return;
    const handle = setInterval(() => {
      const at = now();
      setPlayer(current => current ? tickPlayerPresentation(current, at) : current);
      setPlayerStale(at - player.fixMs > QUALITY_CONFIG.staleAfterMs);
    }, PLAYER_TICK_MS);
    return () => clearInterval(handle);
  }, [player, now]);

  const lastMark = useMemo(() => lastFinal(snapshot.anchors), [snapshot.anchors]);
  const lastMarkId = lastMark?.id ?? null;

  // Undo is a 5 s window computed at emit time; re-read the snapshot when it
  // closes so the Undo control never outlives it.
  useEffect(() => {
    if (!controller || !lastMark) return;
    const closesAt = (lastMark.finalizedTimestamp ? Date.parse(lastMark.finalizedTimestamp) : now()) + UNDO_WINDOW_MS + 50;
    const handle = setTimeout(() => setSnapshot(controller.snapshot()), Math.max(0, closesAt - now()));
    return () => clearTimeout(handle);
  }, [controller, lastMark, now]);

  // A fresh mark ripples once (never under Reduced Motion); marks restored
  // from storage at mount do not.
  const [rippleKey, setRippleKey] = useState<string | null>(null);
  const seenMark = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!controller) return;
    if (seenMark.current === undefined) { seenMark.current = lastMarkId; return; }
    if (!lastMarkId || lastMarkId === seenMark.current) return;
    seenMark.current = lastMarkId;
    if (reducedMotion) return;
    setRippleKey(lastMarkId);
    const handle = setTimeout(() => setRippleKey(current => current === lastMarkId ? null : current), RIPPLE_MS);
    return () => clearTimeout(handle);
  }, [controller, lastMarkId, reducedMotion]);

  // Camera director: a finalized mark moves the state machine; a gesture takes
  // manual control; the tick resumes automatic framing after the idle window.
  const observedMark = useRef<string | null>(null);
  useEffect(() => {
    if (!controller || !lastMarkId || observedMark.current === lastMarkId) return;
    observedMark.current = lastMarkId;
    const observation = controller.cameraObservation();
    if (observation) setCamera(state => observeAnchor(state, observation, now()));
  }, [controller, lastMarkId, now]);
  useEffect(() => {
    if (!controller) return;
    const handle = setInterval(() => setCamera(state => { const next = tickCamera(state, controller.cameraObservation(), now()); return sameCamera(state, next) ? state : next; }), CAMERA_TICK_MS);
    return () => clearInterval(handle);
  }, [controller, now]);
  useEffect(() => { controller?.setManualCamera(camera.mode === 'MANUAL'); }, [controller, camera.mode]);
  const lastAutomatic = useRef<ProductionCameraState>('tee');
  const cameraState: ProductionCameraState = camera.mode === 'MANUAL' ? lastAutomatic.current : productionStateFor(camera.mode).state;
  useEffect(() => { if (camera.mode !== 'MANUAL') lastAutomatic.current = productionStateFor(camera.mode).state; }, [camera.mode]);

  const green = useMemo(() => partition.surfaces.find(s => s.lieClass === 'green') ?? null, [partition]);
  // A reduced-precision fix is a region, not a position: nothing reads from it.
  const usableFix = useMemo(() => latestFix && !isApproximateFix(latestFix) ? latestFix : null, [latestFix]);
  const distances = useMemo<{ value: GreenDistances | null; basis: OneTapView['distancesBasis']; onGreen: boolean }>(() => {
    if (!green) return { value: null, basis: null, onGreen: false };
    // A fix outside the local frame (not at the course yet) or too coarse to
    // be a position (reduced precision, ±3 km) reads like no fix: the last
    // mark speaks, or nothing does — never a thrown render or a ±3000 yd number.
    const enu = usableFix ? wgs84ToEnuInFrame([usableFix.longitude, usableFix.latitude, usableFix.altitudeM], origin) : null;
    if (usableFix && enu) {
      const variance = usableFix.horizontalAccuracyM ** 2, cov: Covariance2 = [[variance, 0], [0, variance]];
      // §15: green mode follows where the golfer stands (the canonical green outline), never a guess.
      return { value: greenDistances([enu[0], enu[1]], green.feature, cov, green.edgeSigmaM), basis: 'live_fix', onGreen: exactPointInPartition(partition, [enu[0], enu[1]]).lieClass === 'green' };
    }
    if (lastMark) return { value: greenDistances([lastMark.positionENU[0], lastMark.positionENU[1]], green.feature, lastMark.covarianceENU2D, green.edgeSigmaM), basis: 'last_mark', onGreen: lastMark.primaryLie === 'green' };
    return { value: null, basis: null, onGreen: false };
  }, [green, usableFix, lastMark, origin, partition]);
  const readout = useMemo(() => distances.value ? greenReadout(distances.value, distances.onGreen) : null, [distances]);
  const policy = useMemo(() => competitionPolicy(playMode), [playMode]);
  const advice = useMemo<ReadoutAdvice>(() => {
    // Elevation to the green centre from the terrain the renderer already has
    // (practice only — the policy nulls it in competition). No plays-like,
    // club or line: no calibrated model exists, and the policy governs them too.
    if (!terrain || !green) return permittedAdvice(NO_ADVICE, policy);
    const ring = largestOuterRing(green.feature), centre = ring ? ringCentroid(ring) : null;
    const fixEnu = usableFix ? wgs84ToEnuInFrame([usableFix.longitude, usableFix.latitude, usableFix.altitudeM], origin) : null;
    const here: PointM | null = fixEnu ? [fixEnu[0], fixEnu[1]] : lastMark ? [lastMark.positionENU[0], lastMark.positionENU[1]] : null;
    if (!centre || !here) return permittedAdvice(NO_ADVICE, policy);
    const from = sampleTerrain(terrain, here), to = sampleTerrain(terrain, centre);
    return permittedAdvice({ ...NO_ADVICE, elevationDeltaM: from && to ? to.elevationM - from.elevationM : null }, policy);
  }, [terrain, green, usableFix, lastMark, origin, policy]);
  const lie = useMemo(() => {
    if (!lastMark) return null;
    const primaryFeatureId = lastMark.liePosterior.find(e => e.lieClass === lastMark.primaryLie)?.featureId ?? null;
    const primaryReviewed = primaryFeatureId ? partition.surfaces.find(s => s.feature.id === primaryFeatureId)?.feature.reviewed ?? null : null;
    return describeLie(lastMark, { completedShots: snapshot.shots.length, primaryReviewed });
  }, [lastMark, partition, snapshot.shots.length]);
  const markers = useMemo(() => markersFromAnchors(snapshot.anchors, rippleKey, player ? { positionENU: player.positionENU, accuracyM: player.accuracyM, stale: playerStale } : null),
    [snapshot.anchors, rippleKey, player, playerStale]);

  const locationQuality = useMemo<LocationQuality>(() => {
    if (!location) return 'none';
    const graded = gradeLocationQuality(latestFix, playerStale ? Number.POSITIVE_INFINITY : latestFix?.timestampMs ?? 0, locationStatus);
    // A ±3 km fix cannot say the phone is away from the course; only a real
    // fix outside the frame does (2026-09-17: standing on the 9th green,
    // Precise Location off, the chip read "Not at the course yet").
    if (graded === 'approximate') return graded;
    if (latestFix && !wgs84ToEnuInFrame([latestFix.longitude, latestFix.latitude, null], origin)) return 'off_course';
    return graded;
  }, [location, latestFix, playerStale, locationStatus, origin]);
  const syncIssue = snapshot.syncErrors > 0 ? 'error' : !online && snapshot.syncPending > 0 ? 'offline' : null;
  const statusToast = useMemo<OneTapStatusToast | null>(() => {
    if (snapshot.undoableId && snapshot.outcome && snapshot.outcome !== 'gps_unavailable') {
      return { kind: snapshot.outcome === 'low_confidence' ? 'saved_low' : snapshot.outcome === 'outside_modeled_area' ? 'saved_outside' : 'saved', undoable: true };
    }
    if (snapshot.state === 'GPS_UNAVAILABLE') return { kind: 'no_fix', undoable: false };
    return null;
  }, [snapshot.undoableId, snapshot.outcome, snapshot.state]);
  const finishSuggested = !!lastMark && !lastMark.terminal && (lie?.greenProbability ?? 0) >= FINISH_HOLE_RULE.greenComplexProbability;

  const markBall = useCallback(() => { void controller?.markBall(); }, [controller]);
  const undo = useCallback(() => { controller?.undo(); }, [controller]);
  const holeOut = useCallback(() => { controller?.holeOut(); }, [controller]);
  const deleteLastMark = useCallback(() => { controller?.deleteLast(); }, [controller]);
  const pause = useCallback(() => { controller?.pause(); }, [controller]);
  const resume = useCallback(() => { controller?.resume(); }, [controller]);
  const onGesture = useCallback(() => { setCamera(state => observeGesture(state, now())); }, [now]);
  const recenterCamera = useCallback(() => { setCamera(state => recenter(state, controller?.cameraObservation() ?? null, now())); }, [controller, now]);

  return useMemo<OneTapView>(() => ({
    snapshot, markers, distances: distances.value, distancesBasis: distances.basis, readout, policy, advice, hasGreen: !!green, lie, lastMark,
    cameraMode: camera.mode, cameraState, locationKind: location?.kind ?? 'none', latestFix, player, locationQuality, syncIssue, statusToast, finishSuggested,
    canHoleOut: !!lastMark && !lastMark.terminal, canDeleteLastMark: !!lastMark && snapshot.state !== 'CAPTURE_PENDING', paused: snapshot.paused,
    markBall, undo, holeOut, deleteLastMark, pause, resume, onGesture, recenterCamera,
  }), [snapshot, markers, distances, readout, policy, advice, green, lie, lastMark, camera.mode, cameraState, location, latestFix, player, locationQuality, syncIssue, statusToast, finishSuggested, markBall, undo, holeOut, deleteLastMark, pause, resume, onGesture, recenterCamera]);
}
