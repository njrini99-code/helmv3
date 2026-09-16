'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CourseGeometryPackage, LocalFeature, PointM } from '@/lib/golf/course-geometry/types';
import { MemoryAnchorRepository, StorageAnchorRepository, type AnchorRepository, type StorageLike } from '@/lib/golf/one-tap/anchor-repository';
import { courseIdForSite } from '@/lib/golf/one-tap/peek-n-peak-policy';
import { localOriginFor, wgs84ToEnu } from '@/lib/golf/one-tap/geodesy';
import { largestOuterRing, ringCentroid } from '@/lib/golf/one-tap/hole-distances';
import { assessHoleIntegrity, type HoleIntegrityReport } from '@/lib/golf/one-tap/hole-integrity';
import { HOLE_COMPLETION_FADE_MS, holeStatus, markTerminal, observeNextTee, type HoleStatus, type NextTeeState } from '@/lib/golf/one-tap/hole-lifecycle';
import { buildSurfacePartition } from '@/lib/golf/one-tap/lie-classifier';
import type { LocationSource } from '@/lib/golf/one-tap/location-source';
import { MemoryPenaltyRepository, PENALTY_COPY, StoragePenaltyRepository, createPenaltyEvent, holeScore, livePenalties, penaltyStrokes as sumPenaltyStrokes, tombstonePenalty, unresolvedPenalties, type PenaltyEvent, type PenaltyKind, type PenaltyRepository, type PenaltyStrokes } from '@/lib/golf/one-tap/penalty-event';
import { newAnchorId, type ShotAnchor, type TerminalMethod } from '@/lib/golf/one-tap/shot-anchor';

/** The round around the hole (One-Tap master plan "Hole completion", §19,
 * §80): which hole is open, shots per hole from the anchors on record, the
 * integrity verdict per hole, explicit hole advance after a cup mark, and the
 * next-tee fallback — when the last mark was on the green and the phone
 * dwells on the next tee, the hole closes with NEXT_TEE_INFERRED (never an
 * invented cup, so it reports MISSING_CUP). A completion card follows every
 * close: a clean hole fades after two seconds, a flagged hole stays with
 * Review. Exceptions (§58, §79) never branch the record: a penalty is a
 * separate score event resolved by the next ordinary mark, a skipped hole
 * is round state, and Change hole only moves the golfer. The hole index,
 * skips, every anchor and every penalty persist on the device per round. */
export const ROUND_STORAGE_PREFIX = 'golfhelm-one-tap-round:';
export interface UseOneTapRoundOptions {
  roundId: string;
  pkg: CourseGeometryPackage;
  /** Hole keys in playing order. */
  holeKeys: readonly string[];
  location: LocationSource | null;
  /** Omitted → localStorage; null → memory only. */
  storage?: StorageLike | null;
  /** The host owns the hole index (the round ledger's current hole): every
   * advance goes through `onHoleIndexChange` instead of local state. */
  controlled?: { holeIndex: number; onHoleIndexChange(index: number): void } | null;
}
export interface OneTapScorecardRow {
  holeKey: string; ordinal: number; par: number;
  /** Shots between marks (the live UI says shots, never strokes). */
  strokes: number;
  status: HoleStatus; terminalMethod: TerminalMethod | null; integrity: HoleIntegrityReport;
  /** §58: penalty strokes on record and the score they make with the shots. */
  penaltyStrokes: number;
  score: number;
  unresolvedPenalties: number;
  /** §79 Skip hole: no marks after the skip, so no score and no integrity flags. */
  skipped: boolean;
}
/** The post-hole completion card (§19), derived live from the record. */
export interface OneTapHoleCompletion {
  holeKey: string;
  ordinal: number;
  shots: number;
  terminalMethod: TerminalMethod | null;
  /** Closed by the next-tee fallback rather than a cup mark. */
  inferred: boolean;
  /** Opened from the overflow (Review hole) rather than by a close: stays until dismissed. */
  review: boolean;
  penaltyStrokes: number;
  report: HoleIntegrityReport;
  clean: boolean;
}
export interface OneTapRoundView {
  repo: AnchorRepository;
  holeIndex: number;
  holeKey: string;
  holeCount: number;
  ordinal: number;
  strokes: number;
  status: HoleStatus;
  terminalMethod: TerminalMethod | null;
  /** §80 verdict for the open hole. */
  integrity: HoleIntegrityReport;
  scorecard: OneTapScorecardRow[];
  hasNextHole: boolean;
  nextHole(): void;
  previousHole(): void;
  /** Clears the terminal mark on the current hole (a mistaken hole-out). */
  reopenHole(): void;
  /** Live anchors on the open hole (the evidence the ledger adapter reads). */
  anchors: ShotAnchor[];
  /** §58 penalties on the open hole. */
  penalties: PenaltyEvent[];
  penaltyStrokes: number;
  score: number;
  unresolvedPenalties: number;
  skipped: boolean;
  addPenalty(kind: PenaltyKind, strokes?: PenaltyStrokes): void;
  removeLastPenalty(): void;
  /** §79 overflow: leave this hole without a score and move on. */
  skipHole(): void;
  goToHole(index: number): void;
  /** §79 overflow: the integrity review of the open hole, on demand. */
  openReview(): void;
  /** The completion card for the hole that just closed, until it fades or is reviewed. */
  completion: OneTapHoleCompletion | null;
  dismissCompletion(): void;
  /** Review → back to the hole: reopens the completed hole and returns to it. */
  returnToCompleted(): void;
  /** The hole the last advance closed by inference, until dismissed. */
  inferredFrom: { holeKey: string; ordinal: number } | null;
  dismissInferred(): void;
  /** Reopens the hole the inference closed and returns to it. */
  takeBackInferred(): void;
}

function defaultStorage(): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
interface RoundState { holeIndex: number; skipped: Record<string, string> }
function readRoundState(storage: StorageLike | null, roundId: string, holeCount: number): RoundState {
  try {
    const raw = storage?.getItem(ROUND_STORAGE_PREFIX + roundId);
    const parsed = raw ? (JSON.parse(raw) as { holeIndex?: unknown; skipped?: unknown }) : null;
    const index = typeof parsed?.holeIndex === 'number' ? parsed.holeIndex : 0;
    const skipped: Record<string, string> = {};
    if (parsed?.skipped && typeof parsed.skipped === 'object') for (const [key, at] of Object.entries(parsed.skipped as Record<string, unknown>)) if (typeof at === 'string' && Number.isFinite(Date.parse(at))) skipped[key] = at;
    return { holeIndex: Number.isInteger(index) && index >= 0 && index < holeCount ? index : 0, skipped };
  } catch { return { holeIndex: 0, skipped: {} }; }
}
function greenCentreOf(pkg: CourseGeometryPackage, holeKey: string): PointM | null {
  const green = buildSurfacePartition(pkg, holeKey).surfaces.find(s => s.lieClass === 'green');
  const ring = green ? largestOuterRing(green.feature) : null;
  return ring ? ringCentroid(ring) : null;
}
function teesOf(pkg: CourseGeometryPackage, holeKey: string): LocalFeature[] {
  return buildSurfacePartition(pkg, holeKey).surfaces.filter(s => s.lieClass === 'tee').map(s => s.feature);
}
function liveOnHole(anchors: readonly ShotAnchor[], holeKey: string): ShotAnchor[] { return anchors.filter(a => a.holeKey === holeKey && !a.deletedAt); }
interface PendingCompletion { holeKey: string; ordinal: number; inferred: boolean; review?: boolean }

export function useOneTapRound({ roundId, pkg, holeKeys, location, storage: storageOption, controlled = null }: UseOneTapRoundOptions): OneTapRoundView {
  const storage = storageOption === undefined ? defaultStorage() : storageOption;
  const binding = useMemo(() => ({ courseId: courseIdForSite(pkg.siteId), siteId: pkg.siteId }), [pkg.siteId]);
  const repo = useMemo<AnchorRepository>(() => storage ? new StorageAnchorRepository(storage, [roundId], binding) : new MemoryAnchorRepository(), [storage, roundId, binding]);
  const penaltyRepo = useMemo<PenaltyRepository>(() => storage ? new StoragePenaltyRepository(storage, [roundId]) : new MemoryPenaltyRepository(), [storage, roundId]);
  const [initial] = useState(() => readRoundState(storage, roundId, holeKeys.length));
  const [ownIndex, setOwnIndex] = useState(initial.holeIndex);
  const holeIndex = controlled ? Math.max(0, Math.min(holeKeys.length - 1, controlled.holeIndex)) : ownIndex;
  const holeIndexRef = useRef(holeIndex);
  holeIndexRef.current = holeIndex;
  const onHoleIndexChange = controlled?.onHoleIndexChange ?? null;
  const setHoleIndex = useCallback((next: number | ((index: number) => number)) => {
    const value = typeof next === 'function' ? next(holeIndexRef.current) : next;
    if (onHoleIndexChange) { if (value !== holeIndexRef.current) onHoleIndexChange(value); } else setOwnIndex(value);
  }, [onHoleIndexChange]);
  const [skipped, setSkipped] = useState(initial.skipped);
  useEffect(() => { try { storage?.setItem(ROUND_STORAGE_PREFIX + roundId, JSON.stringify({ holeIndex, skipped })); } catch { /* private mode */ } }, [storage, roundId, holeIndex, skipped]);
  const [version, setVersion] = useState(0);
  useEffect(() => repo.subscribe(() => setVersion(v => v + 1)), [repo]);
  useEffect(() => penaltyRepo.subscribe(() => setVersion(v => v + 1)), [penaltyRepo]);
  // `version` is the repository change counter that invalidates these reads.
  /* eslint-disable react-hooks/exhaustive-deps */
  const anchors = useMemo(() => repo.list(roundId), [repo, roundId, version]);
  const penaltyEvents = useMemo(() => penaltyRepo.list(roundId), [penaltyRepo, roundId, version]);
  /* eslint-enable react-hooks/exhaustive-deps */
  const holeKey = holeKeys[Math.min(holeIndex, holeKeys.length - 1)] ?? holeKeys[0] ?? '';
  // A hole behind the golfer that is still open has no cup on record (§80),
  // unless it was skipped; a mark after the skip plays the hole again.
  const scorecard = useMemo<OneTapScorecardRow[]>(() => holeKeys.map((key, index) => {
    const hole = pkg.holes.find(h => h.key === key), live = liveOnHole(anchors, key), s = holeStatus(live);
    const skippedAt = skipped[key], isSkipped = !!skippedAt && !live.some(a => Date.parse(a.tapTimestamp) > Date.parse(skippedAt));
    const penalties = sumPenaltyStrokes(penaltyEvents, key), unresolved = unresolvedPenalties(penaltyEvents, live, key).length;
    return { holeKey: key, ordinal: hole?.ordinal ?? index + 1, par: hole?.par ?? 4, strokes: s.strokes, status: s.status, terminalMethod: s.terminalMethod,
      integrity: assessHoleIntegrity(live, { expectClosed: index < holeIndex && !isSkipped, unresolvedPenalties: unresolved }),
      penaltyStrokes: penalties, score: holeScore(s.strokes, penalties), unresolvedPenalties: unresolved, skipped: isSkipped };
  }), [holeKeys, pkg, anchors, penaltyEvents, holeIndex, skipped]);
  const current = useMemo<OneTapScorecardRow>(() => scorecard[holeIndex] ?? scorecard[0] ?? { holeKey, ordinal: 1, par: 4, strokes: 0, status: 'OPEN', terminalMethod: null, integrity: assessHoleIntegrity([]), penaltyStrokes: 0, score: 0, unresolvedPenalties: 0, skipped: false }, [scorecard, holeIndex, holeKey]);
  const holePenalties = useMemo(() => livePenalties(penaltyEvents, holeKey), [penaltyEvents, holeKey]);
  const holeAnchors = useMemo(() => liveOnHole(anchors, holeKey), [anchors, holeKey]);
  const [pending, setPending] = useState<PendingCompletion | null>(null);

  // Next-tee fallback: needs a finalized mark on this hole with a green
  // posterior, the phone inside a tee of the next hole, at least 60 m from
  // this green, for 10 s. Then the mark closes the hole and the round moves.
  const origin = useMemo(() => localOriginFor(pkg), [pkg]);
  const nextKey = holeKeys[holeIndex + 1] ?? null;
  const nextTees = useMemo(() => nextKey ? teesOf(pkg, nextKey) : [], [pkg, nextKey]);
  const greenCentre = useMemo(() => greenCentreOf(pkg, holeKey), [pkg, holeKey]);
  const dwell = useRef<NextTeeState>({ insideSinceMs: null });
  useEffect(() => {
    dwell.current = { insideSinceMs: null };
    if (!location || !nextKey || !nextTees.length) return;
    return location.subscribe(sample => {
      const live = liveOnHole(repo.list(roundId), holeKey);
      const previous = [...live].reverse().find(a => !a.provisional) ?? null;
      if (!previous || live.some(a => a.terminal)) { dwell.current = { insideSinceMs: null }; return; }
      const enu = wgs84ToEnu([sample.longitude, sample.latitude, null], origin);
      const result = observeNextTee(dwell.current, previous, nextTees, greenCentre, { position: [enu[0], enu[1]], nowMs: sample.timestampMs });
      dwell.current = result.state;
      if (!result.inferred) return;
      dwell.current = { insideSinceMs: null };
      for (const a of markTerminal(live, previous.id, 'NEXT_TEE_INFERRED')) if (a.id === previous.id) repo.upsert({ ...a, syncState: 'QUEUED' });
      setPending({ holeKey, ordinal: current.ordinal, inferred: true });
      setHoleIndex(index => Math.min(index + 1, holeKeys.length - 1));
    });
  }, [location, nextKey, nextTees, greenCentre, repo, roundId, holeKey, origin, current.ordinal, holeKeys.length, setHoleIndex]);

  // An explicit close (CUP_MARK through the controller) on the open hole
  // raises the completion card; reopening lowers it.
  const previousStatus = useRef<{ holeKey: string; status: HoleStatus }>({ holeKey, status: current.status });
  useEffect(() => {
    const before = previousStatus.current;
    previousStatus.current = { holeKey, status: current.status };
    if (before.holeKey !== holeKey) return;
    if (before.status === 'OPEN' && current.status === 'COMPLETE') setPending({ holeKey, ordinal: current.ordinal, inferred: current.terminalMethod === 'NEXT_TEE_INFERRED' });
    else if (before.status === 'COMPLETE' && current.status === 'OPEN') setPending(p => p?.holeKey === holeKey ? null : p);
  }, [holeKey, current.status, current.ordinal, current.terminalMethod]);

  const completion = useMemo<OneTapHoleCompletion | null>(() => {
    if (!pending) return null;
    const row = scorecard.find(r => r.holeKey === pending.holeKey);
    if (!row || (row.status !== 'COMPLETE' && !pending.review)) return null;
    return { holeKey: row.holeKey, ordinal: pending.ordinal, shots: row.strokes, terminalMethod: row.terminalMethod, inferred: pending.inferred, review: !!pending.review,
      penaltyStrokes: row.penaltyStrokes, report: row.integrity, clean: row.integrity.flags.length === 0 };
  }, [pending, scorecard]);
  // §19: a clean hole needs no attention — the card fades on its own. A
  // review the golfer opened stays until they close it.
  const completionKey = completion ? `${completion.holeKey}:${completion.clean}:${completion.review}` : null;
  useEffect(() => {
    if (!completion?.clean || completion.review) return;
    const handle = setTimeout(() => setPending(p => p?.holeKey === completion.holeKey ? null : p), HOLE_COMPLETION_FADE_MS);
    return () => clearTimeout(handle);
    // The key changes only when a different hole closes or its verdict changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completionKey]);

  const nextHole = useCallback(() => { setPending(null); setHoleIndex(index => Math.min(index + 1, holeKeys.length - 1)); }, [holeKeys.length, setHoleIndex]);
  const previousHole = useCallback(() => { setPending(null); setHoleIndex(index => Math.max(0, index - 1)); }, [setHoleIndex]);
  const reopenHole = useCallback(() => {
    for (const a of liveOnHole(repo.list(roundId), holeKey)) if (a.terminal) repo.upsert({ ...a, terminal: false, terminalMethod: null, syncState: 'QUEUED' });
    setPending(null);
  }, [repo, roundId, holeKey]);
  const dismissCompletion = useCallback(() => setPending(null), []);
  const returnToCompleted = useCallback(() => {
    if (!pending) return;
    for (const a of liveOnHole(repo.list(roundId), pending.holeKey)) if (a.terminal) repo.upsert({ ...a, terminal: false, terminalMethod: null, syncState: 'QUEUED' });
    const back = holeKeys.indexOf(pending.holeKey);
    setPending(null);
    if (back >= 0) setHoleIndex(back);
  }, [pending, repo, roundId, holeKeys, setHoleIndex]);
  const inferredFrom = useMemo(() => completion?.inferred ? { holeKey: completion.holeKey, ordinal: completion.ordinal } : null, [completion]);
  const openReview = useCallback(() => setPending({ holeKey, ordinal: current.ordinal, inferred: current.terminalMethod === 'NEXT_TEE_INFERRED', review: true }), [holeKey, current.ordinal, current.terminalMethod]);
  // §58: the penalty follows the last finalized mark; the drop is the next ordinary mark.
  const addPenalty = useCallback((kind: PenaltyKind, strokes: PenaltyStrokes = PENALTY_COPY[kind].strokes) => {
    const last = liveOnHole(repo.list(roundId), holeKey).filter(a => !a.provisional).at(-1) ?? null;
    penaltyRepo.upsert(createPenaltyEvent({ id: newAnchorId(), roundId, courseId: binding.courseId, siteId: binding.siteId, holeKey, holeId: current.ordinal }, kind, strokes, last?.id ?? null, Date.now()));
  }, [repo, penaltyRepo, roundId, holeKey, binding, current.ordinal]);
  const removeLastPenalty = useCallback(() => {
    const last = livePenalties(penaltyRepo.list(roundId), holeKey).at(-1);
    if (last) penaltyRepo.upsert(tombstonePenalty(last, Date.now()));
  }, [penaltyRepo, roundId, holeKey]);
  const goToHole = useCallback((index: number) => { setPending(null); setHoleIndex(Math.max(0, Math.min(holeKeys.length - 1, Math.trunc(index)))); }, [holeKeys.length, setHoleIndex]);
  const skipHole = useCallback(() => {
    setSkipped(prev => ({ ...prev, [holeKey]: new Date().toISOString() }));
    setPending(null);
    setHoleIndex(index => Math.min(index + 1, holeKeys.length - 1));
  }, [holeKey, holeKeys.length, setHoleIndex]);

  return useMemo<OneTapRoundView>(() => ({
    repo, holeIndex, holeKey, holeCount: holeKeys.length, ordinal: current.ordinal, strokes: current.strokes, status: current.status, terminalMethod: current.terminalMethod, integrity: current.integrity,
    scorecard, hasNextHole: holeIndex < holeKeys.length - 1, nextHole, previousHole, reopenHole,
    anchors: holeAnchors, penalties: holePenalties, penaltyStrokes: current.penaltyStrokes, score: current.score, unresolvedPenalties: current.unresolvedPenalties, skipped: current.skipped,
    addPenalty, removeLastPenalty, skipHole, goToHole, openReview,
    completion, dismissCompletion, returnToCompleted, inferredFrom, dismissInferred: dismissCompletion, takeBackInferred: returnToCompleted,
  }), [repo, holeIndex, holeKey, holeKeys.length, current, scorecard, nextHole, previousHole, reopenHole, holeAnchors, holePenalties, addPenalty, removeLastPenalty, skipHole, goToHole, openReview, completion, dismissCompletion, returnToCompleted, inferredFrom]);
}
