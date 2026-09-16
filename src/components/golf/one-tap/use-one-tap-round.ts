'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CourseGeometryPackage, LocalFeature, PointM } from '@/lib/golf/course-geometry/types';
import { MemoryAnchorRepository, StorageAnchorRepository, type AnchorRepository, type StorageLike } from '@/lib/golf/one-tap/anchor-repository';
import { courseIdForSite } from '@/lib/golf/one-tap/peek-n-peak-policy';
import { localOriginFor, wgs84ToEnu } from '@/lib/golf/one-tap/geodesy';
import { largestOuterRing, ringCentroid } from '@/lib/golf/one-tap/hole-distances';
import { holeStatus, markTerminal, observeNextTee, type HoleStatus, type NextTeeState } from '@/lib/golf/one-tap/hole-lifecycle';
import { buildSurfacePartition } from '@/lib/golf/one-tap/lie-classifier';
import type { LocationSource } from '@/lib/golf/one-tap/location-source';
import type { ShotAnchor, TerminalMethod } from '@/lib/golf/one-tap/shot-anchor';

/** The round around the hole (One-Tap master plan "Hole completion"): which
 * hole is open, strokes per hole from the anchors on record, explicit hole
 * advance after a cup mark, and the next-tee fallback — when the last mark
 * was on the green and the phone dwells on the next tee, the hole closes
 * with NEXT_TEE_INFERRED (never an invented final distance). The hole index
 * and every anchor persist on the device per round. */
export const ROUND_STORAGE_PREFIX = 'golfhelm-one-tap-round:';
export interface UseOneTapRoundOptions {
  roundId: string;
  pkg: CourseGeometryPackage;
  /** Hole keys in playing order. */
  holeKeys: readonly string[];
  location: LocationSource | null;
  /** Omitted → localStorage; null → memory only. */
  storage?: StorageLike | null;
}
export interface OneTapScorecardRow { holeKey: string; ordinal: number; par: number; strokes: number; status: HoleStatus; terminalMethod: TerminalMethod | null }
export interface OneTapRoundView {
  repo: AnchorRepository;
  holeIndex: number;
  holeKey: string;
  holeCount: number;
  ordinal: number;
  strokes: number;
  status: HoleStatus;
  terminalMethod: TerminalMethod | null;
  scorecard: OneTapScorecardRow[];
  hasNextHole: boolean;
  nextHole(): void;
  previousHole(): void;
  /** Clears the terminal mark on the current hole (a mistaken hole-out). */
  reopenHole(): void;
  /** The hole the last advance closed by inference, until dismissed. */
  inferredFrom: { holeKey: string; ordinal: number } | null;
  dismissInferred(): void;
  /** Reopens the hole the inference closed and returns to it. */
  takeBackInferred(): void;
}

function defaultStorage(): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
function readHoleIndex(storage: StorageLike | null, roundId: string, holeCount: number): number {
  try {
    const raw = storage?.getItem(ROUND_STORAGE_PREFIX + roundId);
    const parsed = raw ? (JSON.parse(raw) as { holeIndex?: unknown }) : null;
    const index = typeof parsed?.holeIndex === 'number' ? parsed.holeIndex : 0;
    return Number.isInteger(index) && index >= 0 && index < holeCount ? index : 0;
  } catch { return 0; }
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

export function useOneTapRound({ roundId, pkg, holeKeys, location, storage: storageOption }: UseOneTapRoundOptions): OneTapRoundView {
  const storage = storageOption === undefined ? defaultStorage() : storageOption;
  const repo = useMemo<AnchorRepository>(() => storage ? new StorageAnchorRepository(storage, [roundId], { courseId: courseIdForSite(pkg.siteId), siteId: pkg.siteId }) : new MemoryAnchorRepository(), [storage, roundId, pkg.siteId]);
  const [holeIndex, setHoleIndex] = useState(() => readHoleIndex(storage, roundId, holeKeys.length));
  useEffect(() => { try { storage?.setItem(ROUND_STORAGE_PREFIX + roundId, JSON.stringify({ holeIndex })); } catch { /* private mode */ } }, [storage, roundId, holeIndex]);
  const [version, setVersion] = useState(0);
  useEffect(() => repo.subscribe(() => setVersion(v => v + 1)), [repo]);
  // `version` is the repository change counter that invalidates this read.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const anchors = useMemo(() => repo.list(roundId), [repo, roundId, version]);
  const holeKey = holeKeys[Math.min(holeIndex, holeKeys.length - 1)] ?? holeKeys[0] ?? '';
  const scorecard = useMemo<OneTapScorecardRow[]>(() => holeKeys.map((key, index) => {
    const hole = pkg.holes.find(h => h.key === key), s = holeStatus(liveOnHole(anchors, key));
    return { holeKey: key, ordinal: hole?.ordinal ?? index + 1, par: hole?.par ?? 4, strokes: s.strokes, status: s.status, terminalMethod: s.terminalMethod };
  }), [holeKeys, pkg, anchors]);
  const current = useMemo<OneTapScorecardRow>(() => scorecard[holeIndex] ?? scorecard[0] ?? { holeKey, ordinal: 1, par: 4, strokes: 0, status: 'OPEN', terminalMethod: null }, [scorecard, holeIndex, holeKey]);
  const [inferredFrom, setInferredFrom] = useState<OneTapRoundView['inferredFrom']>(null);

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
      setInferredFrom({ holeKey, ordinal: current.ordinal });
      setHoleIndex(index => Math.min(index + 1, holeKeys.length - 1));
    });
  }, [location, nextKey, nextTees, greenCentre, repo, roundId, holeKey, origin, current.ordinal, holeKeys.length]);

  const nextHole = useCallback(() => { setInferredFrom(null); setHoleIndex(index => Math.min(index + 1, holeKeys.length - 1)); }, [holeKeys.length]);
  const previousHole = useCallback(() => { setInferredFrom(null); setHoleIndex(index => Math.max(0, index - 1)); }, []);
  const reopenHole = useCallback(() => {
    for (const a of liveOnHole(repo.list(roundId), holeKey)) if (a.terminal) repo.upsert({ ...a, terminal: false, terminalMethod: null, syncState: 'QUEUED' });
  }, [repo, roundId, holeKey]);
  const dismissInferred = useCallback(() => setInferredFrom(null), []);
  const takeBackInferred = useCallback(() => {
    if (!inferredFrom) return;
    for (const a of liveOnHole(repo.list(roundId), inferredFrom.holeKey)) if (a.terminal && a.terminalMethod === 'NEXT_TEE_INFERRED') repo.upsert({ ...a, terminal: false, terminalMethod: null, syncState: 'QUEUED' });
    const back = holeKeys.indexOf(inferredFrom.holeKey);
    setInferredFrom(null);
    setHoleIndex(back >= 0 ? back : index => Math.max(0, index - 1));
  }, [inferredFrom, repo, roundId, holeKeys]);

  return useMemo<OneTapRoundView>(() => ({
    repo, holeIndex, holeKey, holeCount: holeKeys.length, ordinal: current.ordinal, strokes: current.strokes, status: current.status, terminalMethod: current.terminalMethod,
    scorecard, hasNextHole: holeIndex < holeKeys.length - 1, nextHole, previousHole, reopenHole, inferredFrom, dismissInferred, takeBackInferred,
  }), [repo, holeIndex, holeKey, holeKeys.length, current, scorecard, nextHole, previousHole, reopenHole, inferredFrom, dismissInferred, takeBackInferred]);
}
