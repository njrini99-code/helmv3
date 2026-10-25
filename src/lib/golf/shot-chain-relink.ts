/**
 * Keep a hole's shot ledger chained after an edit or a delete.
 *
 * Live entry chains by construction: each shot starts where the one before it
 * ended (a water / unplayable penalty row copies that spot; an OB / lost-ball
 * row replays from where the offending shot was hit). Editing or deleting a
 * shot afterwards used to keep only part of that: the old cascade moved the
 * next shot's start DISTANCE but never its lie, walked straight into penalty
 * rows, and changing a shot's own start never moved the previous shot's end.
 * Every such edit left a gap that per-shot strokes gained reads as a stroke
 * gained or lost from nowhere (see shot-ledger-continuity.ts).
 *
 * These helpers rewrite the neighbouring rows to what live entry would have
 * written had the corrected values been entered at the time:
 * - forward: the next real shot starts where the edited shot now ends, through
 *   a drop penalty (which mirrors that spot) and, after a stroke-and-distance
 *   penalty, from the edited shot's start;
 * - backward: when the edit moved a shot's start, the previous real shot now
 *   ends there. A penalty row stops the walk back: it restarts the chain by
 *   rule, so only the row itself is moved.
 *
 * The edited shot is the player's latest word, so it is never changed here.
 */
import type { ShotRecord } from '@/lib/types/golf';
import { liesChain } from '@/lib/golf/shot-ledger-continuity';
import { calculateShotDistanceWithDirection, deriveLieAfter, lieFromShotResult } from '@/lib/utils/shot-helpers';
import { AROUND_GREEN_THRESHOLD_YARDS } from '@/lib/utils/golf-stats-calculator-shots';

export interface RelinkResult {
  history: ShotRecord[];
  /** Indexes (into `history`) of rows other than the edited one that changed. */
  changed: number[];
}

interface Spot {
  lie: ShotRecord['lieBefore'];
  distance: number;
  unit: ShotRecord['distanceUnitBefore'];
}

const STROKE_AND_DISTANCE: ReadonlySet<NonNullable<ShotRecord['penaltyType']>> = new Set(['ob', 'lost']);

function isPenaltyRow(shot: ShotRecord): boolean {
  return shot.isPenalty || shot.shotType === 'penalty' || shot.result === 'penalty';
}

function isStrokeAndDistance(shot: ShotRecord): boolean {
  return isPenaltyRow(shot) && shot.penaltyType !== undefined && STROKE_AND_DISTANCE.has(shot.penaltyType);
}

function startOf(shot: ShotRecord): Spot {
  return { lie: shot.lieBefore, distance: shot.distanceToHoleBefore, unit: shot.distanceUnitBefore };
}

function endOf(shot: ShotRecord): Spot {
  return { lie: lieFromShotResult(shot), distance: shot.distanceToHoleAfter, unit: shot.distanceUnitAfter };
}

function sameSpot(a: Spot, b: Spot): boolean {
  return a.lie === b.lie && a.distance === b.distance && a.unit === b.unit;
}

function toYards(distance: number, unit: ShotRecord['distanceUnitBefore']): number {
  return unit === 'feet' ? distance / 3 : distance;
}

function withShotDistance(shot: ShotRecord): ShotRecord {
  if (isPenaltyRow(shot)) return shot;
  const yards = calculateShotDistanceWithDirection(
    toYards(shot.distanceToHoleBefore, shot.distanceUnitBefore),
    toYards(shot.distanceToHoleAfter, shot.distanceUnitAfter),
    shot.missDirection,
  );
  return { ...shot, shotDistance: Math.round(yards) };
}

/** A penalty row sits at one spot: where the ball is played from next. */
function placePenalty(row: ShotRecord, spot: Spot): ShotRecord {
  return {
    ...row,
    lieBefore: spot.lie,
    distanceToHoleBefore: spot.distance,
    distanceUnitBefore: spot.unit,
    distanceToHoleAfter: spot.distance,
    distanceUnitAfter: spot.unit,
  };
}

/**
 * Start a real shot at `spot`, keeping a recovery lie the player chose ('other'
 * after rough). The shot type follows the new start the way live entry types a
 * shot (getShotTypeFromState):
 * - a putt whose start is now off the green becomes around the green inside
 *   50 yd or an approach from farther, hit with a non-driver, without its
 *   putt-only fields;
 * - any other shot whose start is now on the green becomes a putt with the
 *   putter, without its approach-only fields, so the hole's putt count follows.
 */
function startShotAt(shot: ShotRecord, spot: Spot, previousLieAfter: string | null): ShotRecord {
  const keepLie = previousLieAfter !== null && liesChain(previousLieAfter, shot.lieBefore);
  let moved: ShotRecord = {
    ...shot,
    lieBefore: keepLie ? shot.lieBefore : spot.lie,
    distanceToHoleBefore: spot.distance,
    distanceUnitBefore: spot.unit,
  };
  if (moved.shotType === 'putting' && moved.lieBefore !== 'green') {
    const {
      puttDistanceFeet: _feet,
      puttMissTags: _tags,
      puttBreak: _break,
      puttSlope: _slope,
      ...rest
    } = moved;
    const yards = spot.unit === 'feet' ? spot.distance / 3 : spot.distance;
    moved = {
      ...rest,
      shotType: yards < AROUND_GREEN_THRESHOLD_YARDS ? 'around_green' : 'approach',
      clubType: 'non_driver',
    };
  } else if (moved.shotType !== 'putting' && moved.lieBefore === 'green') {
    const {
      approachMissDirection: _direction,
      approachMissLieType: _missLie,
      distanceFromGreenYards: _fromGreen,
      missDirection: _miss,
      ...rest
    } = moved;
    moved = { ...rest, shotType: 'putting', clubType: 'putter' };
  }
  if (moved.shotType === 'putting') {
    const feet = spot.unit === 'yards' ? spot.distance * 3 : spot.distance;
    moved.puttDistanceFeet = Math.min(500, Math.max(0, feet));
  }
  return withShotDistance(moved);
}

const RESULT_FOR_LIE: Record<ShotRecord['lieBefore'], ShotRecord['result'] | null> = {
  tee: null,
  fairway: 'fairway',
  rough: 'rough',
  sand: 'sand',
  green: 'green',
  other: 'other',
};

const MISS_LIE_FOR_LIE: Partial<Record<ShotRecord['lieBefore'], NonNullable<ShotRecord['approachMissLieType']>>> = {
  fairway: 'fairway',
  rough: 'rough',
  sand: 'bunker',
  // Live entry files an approach that finished in 'other' under the rough miss (editResultUpdates).
  other: 'rough',
};

/** End a real shot at `spot`. The result follows only when the stored lie would not chain. */
function endShotAt(shot: ShotRecord, spot: Spot): ShotRecord {
  let moved: ShotRecord = { ...shot, distanceToHoleAfter: spot.distance, distanceUnitAfter: spot.unit };
  const lieAfter = deriveLieAfter(moved);
  const result = RESULT_FOR_LIE[spot.lie];
  if ((lieAfter === null || !liesChain(lieAfter, spot.lie)) && result !== null) {
    moved = { ...moved, result };
    if (moved.approachMissLieType !== undefined) {
      moved.approachMissLieType = MISS_LIE_FOR_LIE[spot.lie];
    }
  }
  return withShotDistance(moved);
}

/** A stroke whose recorded end is its own start: the errant stroke of an OB / lost pair. */
function endsWhereItBegan(shot: ShotRecord): boolean {
  return shot.distanceToHoleAfter === shot.distanceToHoleBefore && shot.distanceUnitAfter === shot.distanceUnitBefore;
}

function relinkForward(history: ShotRecord[], from: number, changed: Set<number>): void {
  const origin = history[from]!;
  let spot = endOf(origin);
  let lieAfter = deriveLieAfter(origin);
  for (let i = from + 1; i < history.length; i++) {
    const row = history[i]!;
    if (isPenaltyRow(row)) {
      // Stroke and distance replays from where the offending shot was hit.
      const replay = isStrokeAndDistance(row) ? startOf(history[i - 1]!) : spot;
      const placed = placePenalty(row, replay);
      if (!sameSpot(startOf(placed), startOf(row)) || placed.distanceToHoleAfter !== row.distanceToHoleAfter) {
        history[i] = placed;
        changed.add(i);
      }
      spot = replay;
      lieAfter = null;
      continue;
    }
    let started = startShotAt(row, spot, lieAfter);
    const offendsStrokeAndDistance = i + 1 < history.length && isStrokeAndDistance(history[i + 1]!);
    if (offendsStrokeAndDistance && endsWhereItBegan(row)) {
      // An errant stroke stays where it began, wherever that now is.
      started = withShotDistance({
        ...started,
        distanceToHoleAfter: started.distanceToHoleBefore,
        distanceUnitAfter: started.distanceUnitBefore,
      });
    }
    const moved = !sameSpot(startOf(started), startOf(row));
    if (
      moved ||
      started.puttDistanceFeet !== row.puttDistanceFeet ||
      started.shotType !== row.shotType ||
      started.distanceToHoleAfter !== row.distanceToHoleAfter
    ) {
      history[i] = started;
      changed.add(i);
    }
    // The shot that went OB / was lost moved: its penalty row and the replay
    // after it are played from its new start, so keep walking.
    if (!offendsStrokeAndDistance || !moved) return;
    spot = endOf(started);
    lieAfter = deriveLieAfter(started);
  }
}

function relinkBackward(history: ShotRecord[], from: number, changed: Set<number>): void {
  const spot = startOf(history[from]!);
  const prevIndex = from - 1;
  if (prevIndex < 0) return;
  const prev = history[prevIndex]!;
  if (isPenaltyRow(prev)) {
    const placed = placePenalty(prev, spot);
    if (!sameSpot(startOf(placed), startOf(prev)) || placed.distanceToHoleAfter !== prev.distanceToHoleAfter) {
      history[prevIndex] = placed;
      changed.add(prevIndex);
    }
    return;
  }
  const ended = endShotAt(prev, spot);
  if (
    ended.distanceToHoleAfter !== prev.distanceToHoleAfter ||
    ended.distanceUnitAfter !== prev.distanceUnitAfter ||
    ended.result !== prev.result ||
    ended.approachMissLieType !== prev.approachMissLieType
  ) {
    history[prevIndex] = ended;
    changed.add(prevIndex);
  }
}

/**
 * Relink the rows around `history[editedIndex]` after the player edited it.
 * `original` is the shot as it was before the edit, so a start the player did
 * not touch is not pushed back onto the previous shot.
 */
export function relinkAfterEdit(history: readonly ShotRecord[], editedIndex: number, original: ShotRecord): RelinkResult {
  const next = [...history];
  const changed = new Set<number>();
  const edited = next[editedIndex];
  if (!edited) return { history: next, changed: [] };
  if (!sameSpot(startOf(edited), startOf(original))) relinkBackward(next, editedIndex, changed);
  if (edited.result !== 'hole') relinkForward(next, editedIndex, changed);
  return { history: next, changed: [...changed].sort((a, b) => a - b) };
}

/**
 * Relink a hole after the row at `removedIndex` was deleted (`history` no
 * longer contains it): the shot that followed now starts where the shot
 * before it ended. Deleting the first shot leaves the new first shot as it is.
 * Deleting the stroke that went OB / was lost leaves its penalty row and the
 * replay where they are: they sit where that stroke was hit, which is where
 * the shot before it ended, and replaying them from an earlier shot's start
 * is not what removing the stroke means.
 */
export function relinkAfterDelete(history: readonly ShotRecord[], removedIndex: number): RelinkResult {
  const next = [...history];
  const changed = new Set<number>();
  const after = next[removedIndex];
  if (after && isStrokeAndDistance(after)) return { history: next, changed: [] };
  const before = removedIndex - 1;
  if (before >= 0 && before < next.length - 1 && next[before]!.result !== 'hole') {
    relinkForward(next, before, changed);
  }
  return { history: next, changed: [...changed].sort((a, b) => a - b) };
}
