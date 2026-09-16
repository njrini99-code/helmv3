'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProductionCameraState, TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { CourseGeometryPackage } from '@/lib/golf/course-geometry/types';
import type { SceneMarkers } from '@/lib/golf/course-geometry/scene-markers';
import { MemoryAnchorRepository, StorageAnchorRepository, SyncQueue, type AnchorRepository, type StorageLike, type SyncTransport } from '@/lib/golf/one-tap/anchor-repository';
import type { CalibrationTraceSink } from '@/lib/golf/one-tap/calibration-trace';
import { initialCameraState, nextHole, observeAnchor, observeGesture, productionStateFor, recenter, tickCamera, type CameraDirectorState, type CameraMode } from '@/lib/golf/one-tap/camera-director';
import { localOriginFor, wgs84ToEnu } from '@/lib/golf/one-tap/geodesy';
import { courseIdForSite } from '@/lib/golf/one-tap/peek-n-peak-policy';
import { greenDistances, type GreenDistances } from '@/lib/golf/one-tap/hole-distances';
import { posteriorGreenProbability } from '@/lib/golf/one-tap/hole-lifecycle';
import { buildSurfacePartition, LIE_LABELS, type LieClass, type LieDisplay } from '@/lib/golf/one-tap/lie-classifier';
import { presentLie, type LiePresentationContext, type LieRule } from '@/lib/golf/one-tap/presentation-lie';
import { LocationBuffer, type Covariance2, type LocationSample } from '@/lib/golf/one-tap/location-estimator';
import type { LocationSource } from '@/lib/golf/one-tap/location-source';
import { OneTapController, type OneTapSnapshot } from '@/lib/golf/one-tap/one-tap-controller';
import { QUALITY_CONFIG } from '@/lib/golf/one-tap/location-quality';
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
  transport?: SyntheticTransport | SyncTransport | null;
  /** §71 debug/calibration only: raw windows go here and nowhere else. */
  trace?: CalibrationTraceSink | null;
  reducedMotion?: boolean;
  now?: () => number;
}
type SyntheticTransport = SyncTransport;
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
  canHoleOut: boolean;
  markBall(): void;
  undo(): void;
  holeOut(): void;
  onGesture(): void;
  recenterCamera(): void;
}

const EMPTY_SNAPSHOT: OneTapSnapshot = Object.freeze({ state: 'HOLE_READY', outcome: null, lastAnchor: null, anchors: [], shots: [], undoableId: null, syncPending: 0, paused: false, manualCamera: false, pendingTapMs: null });
export const RIPPLE_MS = 500;
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
  const { roundId, pkg, holeKey, terrain, location, transport = null, reducedMotion = false } = options;
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
  const sync = useMemo(() => new SyncQueue(repo, transport, roundId), [repo, transport, roundId]);
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
  const distances = useMemo<{ value: GreenDistances | null; basis: OneTapView['distancesBasis'] }>(() => {
    if (!green) return { value: null, basis: null };
    if (latestFix) {
      const enu = wgs84ToEnu([latestFix.longitude, latestFix.latitude, latestFix.altitudeM], origin);
      const variance = latestFix.horizontalAccuracyM ** 2, cov: Covariance2 = [[variance, 0], [0, variance]];
      return { value: greenDistances([enu[0], enu[1]], green.feature, cov, green.edgeSigmaM), basis: 'live_fix' };
    }
    if (lastMark) return { value: greenDistances([lastMark.positionENU[0], lastMark.positionENU[1]], green.feature, lastMark.covarianceENU2D, green.edgeSigmaM), basis: 'last_mark' };
    return { value: null, basis: null };
  }, [green, latestFix, lastMark, origin]);
  const lie = useMemo(() => {
    if (!lastMark) return null;
    const primaryFeatureId = lastMark.liePosterior.find(e => e.lieClass === lastMark.primaryLie)?.featureId ?? null;
    const primaryReviewed = primaryFeatureId ? partition.surfaces.find(s => s.feature.id === primaryFeatureId)?.feature.reviewed ?? null : null;
    return describeLie(lastMark, { completedShots: snapshot.shots.length, primaryReviewed });
  }, [lastMark, partition, snapshot.shots.length]);
  const markers = useMemo(() => markersFromAnchors(snapshot.anchors, rippleKey, player ? { positionENU: player.positionENU, accuracyM: player.accuracyM, stale: playerStale } : null),
    [snapshot.anchors, rippleKey, player, playerStale]);

  const markBall = useCallback(() => { void controller?.markBall(); }, [controller]);
  const undo = useCallback(() => { controller?.undo(); }, [controller]);
  const holeOut = useCallback(() => { controller?.holeOut(); }, [controller]);
  const onGesture = useCallback(() => { setCamera(state => observeGesture(state, now())); }, [now]);
  const recenterCamera = useCallback(() => { setCamera(state => recenter(state, controller?.cameraObservation() ?? null, now())); }, [controller, now]);

  return useMemo<OneTapView>(() => ({
    snapshot, markers, distances: distances.value, distancesBasis: distances.basis, hasGreen: !!green, lie, lastMark,
    cameraMode: camera.mode, cameraState, locationKind: location?.kind ?? 'none', latestFix, player,
    canHoleOut: !!lastMark && !lastMark.terminal,
    markBall, undo, holeOut, onGesture, recenterCamera,
  }), [snapshot, markers, distances, green, lie, lastMark, camera.mode, cameraState, location, latestFix, player, markBall, undo, holeOut, onGesture, recenterCamera]);
}
