/**
 * Raw `golf_shots` rows → the Home page's shot shapes.
 *
 * Pure: the loader hands it every tracked shot of the team's countable rounds
 * and the round → player map; it groups by hole so the hole-level reads
 * (penalty after a drive, up-and-down after a chip, 3-putts) come from the
 * shot sequence itself, not a second query.
 *
 * Vocabulary is the round-entry flow's, checked on the demo team (2026-09-28):
 *   miss_direction  tee: left | right
 *                   approach / chip: short | long | left | right | short_left …
 *                   putt: low | high | short | long | short_low | low_short …
 *   putt_break      straight | right_to_left | left_to_right | multiple
 *   putt_slope      level | uphill | downhill | severe
 *   lie_before/after  tee | fairway | rough | sand | green | other
 * Anything outside it is dropped from that one read, never guessed.
 */
import { isPuttMade, puttMakeStartFeet } from '@/lib/golf/putt-make';
import type {
  ApproachFinish,
  ApproachLie,
  ApproachMiss,
  ApproachShot,
  ChipLie,
  ChipShot,
  PuttBreak,
  PuttShot,
  PenaltyType,
  PuttSlope,
  TeeMissLie,
  TeeShot,
  TeeZone,
} from './types';

export interface RawShotRow {
  round_id: string;
  hole_number: number;
  /** 'driver' | 'non_driver' | 'putter'. */
  club_type: string | null;
  /** On a penalty row: water | ob | lost | unplayable. */
  penalty_type: string | null;
  shot_number: number;
  shot_type: string | null;
  lie_before: string | null;
  lie_after: string | null;
  /** Older rows record where the shot finished here and leave lie_after empty. */
  result: string | null;
  miss_direction: string | null;
  is_penalty: boolean | null;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  putt_distance_feet: number | null;
  putt_made: boolean | null;
  putt_break: string | null;
  putt_slope: string | null;
}

export interface NormalizedShots {
  tee: TeeShot[];
  approach: ApproachShot[];
  chips: ChipShot[];
  putts: PuttShot[];
}

/** Approach leaves past this are a mis-keyed row, not a proximity (the leak
 *  map's own ceiling, stats-leak-maps.ts). */
const PROXIMITY_CEILING_FT = 150;

/** Longest tee shot still read as a par 3 when it finds the green. */
const PAR3_MAX_YD = 250;

function finite(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function toYards(value: number | null, unit: string | null): number | null {
  if (!finite(value)) return null;
  return unit === 'feet' ? value / 3 : value;
}

function toFeet(value: number | null, unit: string | null): number | null {
  if (!finite(value)) return null;
  return unit === 'yards' ? value * 3 : value;
}

function tokens(miss: string | null): string[] {
  return (miss ?? '').toLowerCase().split('_').filter(Boolean);
}

/** Where the shot finished: lie_after, else the older `result` column. */
function landed(shot: RawShotRow): string | null {
  return shot.lie_after ?? shot.result;
}

function teeZone(shot: RawShotRow, penaltyFollows: boolean): TeeZone {
  if (shot.is_penalty === true || penaltyFollows) return 'penalty';
  const end = landed(shot);
  if (end === 'fairway' || end === 'green') return 'fairway';
  const t = tokens(shot.miss_direction);
  if (t.includes('left')) return 'left';
  if (t.includes('right')) return 'right';
  return 'miss';
}

/** All eight directions the entry control records, token order ignored
 *  ("right_short" reads as short_right). */
function approachMiss(miss: string | null): ApproachMiss | null {
  const t = tokens(miss);
  const depth = t.includes('short') ? 'short' : t.includes('long') ? 'long' : null;
  const side = t.includes('left') ? 'left' : t.includes('right') ? 'right' : null;
  if (depth && side) return `${depth}_${side}`;
  return depth ?? side;
}

function teeMissLie(shot: RawShotRow): TeeMissLie {
  const end = landed(shot);
  return end === 'sand' ? 'sand' : end === 'rough' ? 'rough' : 'other';
}

const PENALTY_TYPES = new Set<PenaltyType>(['water', 'ob', 'lost', 'unplayable']);
function penaltyType(row: RawShotRow | undefined): PenaltyType | null {
  if (!row) return null;
  const t = (row.penalty_type ?? '').toLowerCase() as PenaltyType;
  return PENALTY_TYPES.has(t) ? t : 'other';
}

const APPROACH_LIES = new Set<ApproachLie>(['tee', 'fairway', 'rough', 'sand']);
function approachLie(lie: string | null): ApproachLie {
  return APPROACH_LIES.has(lie as ApproachLie) ? (lie as ApproachLie) : 'other';
}
function approachFinish(end: string | null): ApproachFinish {
  return end === 'fairway' || end === 'rough' || end === 'sand' ? end : 'other';
}

const BREAK: Record<string, PuttBreak> = { right_to_left: 'rl', straight: 'st', left_to_right: 'lr' };
const SLOPE: Record<string, PuttSlope> = { uphill: 'up', level: 'level', downhill: 'down' };
const CHIP_LIES = new Set<ChipLie>(['fairway', 'rough', 'sand']);

/** `roundIndex` maps a round id to its index in the payload's `rounds`; rows
 *  of any other round are dropped. */
export function normalizeShots(rows: readonly RawShotRow[], roundIndex: ReadonlyMap<string, number>): NormalizedShots {
  const holes = new Map<string, RawShotRow[]>();
  for (const row of rows) {
    if (!roundIndex.has(row.round_id)) continue;
    const key = `${row.round_id}#${row.hole_number}`;
    const list = holes.get(key);
    if (list) list.push(row);
    else holes.set(key, [row]);
  }

  const out: NormalizedShots = { tee: [], approach: [], chips: [], putts: [] };

  for (const shots of holes.values()) {
    shots.sort((a, b) => a.shot_number - b.shot_number);
    const ri = roundIndex.get(shots[0]!.round_id)!;
    let chipSeen = false;
    const putts = shots.filter((s) => s.shot_type === 'putting');

    shots.forEach((shot, i) => {
      const next = shots[i + 1];
      switch (shot.shot_type) {
        case 'tee': {
          // A tee shot that finished on the green from under 250 yd is a par 3
          // keyed as a drive: not a fairway chance, so it leaves the tee read.
          // From further out it is a driven par 4 and reads as a fairway hit.
          const teeFrom = toYards(shot.distance_to_hole_before, shot.distance_unit_before);
          if ((landed(shot) === 'green' || landed(shot) === 'hole') && (teeFrom == null || teeFrom < PAR3_MAX_YD)) break;
          const before = toYards(shot.distance_to_hole_before, shot.distance_unit_before);
          const after = toYards(shot.distance_to_hole_after, shot.distance_unit_after);
          const yards = before != null && after != null && before > after ? Math.round(before - after) : null;
          const zone = teeZone(shot, next?.shot_type === 'penalty');
          out.tee.push({
            ri,
            zone,
            yards,
            club: shot.club_type === 'driver' ? 'driver' : 'other',
            lie: zone === 'fairway' || zone === 'penalty' ? null : teeMissLie(shot),
            penaltyType: zone !== 'penalty' ? null : next?.shot_type === 'penalty' ? penaltyType(next) : shot.penalty_type ? penaltyType(shot) : null,
          });
          break;
        }
        case 'approach': {
          const fromYards = toYards(shot.distance_to_hole_before, shot.distance_unit_before);
          if (fromYards == null) break;
          const end = landed(shot);
          const onGreen = end === 'green' || end === 'hole';
          const leave = toFeet(shot.distance_to_hole_after, shot.distance_unit_after);
          out.approach.push({
            ri,
            fromYards,
            lie: approachLie(shot.lie_before),
            finish: onGreen ? null : approachFinish(end),
            onGreen,
            leaveFeet: leave != null && leave <= PROXIMITY_CEILING_FT ? leave : null,
            miss: onGreen ? null : approachMiss(shot.miss_direction),
          });
          break;
        }
        case 'around_green': {
          // The FIRST chip on the hole: its leave and whether the hole was
          // finished in one more stroke. Later chips are the same up-and-down.
          if (chipSeen) break;
          chipSeen = true;
          const lie = shot.lie_before as ChipLie;
          const fromYards = toYards(shot.distance_to_hole_before, shot.distance_unit_before);
          if (!CHIP_LIES.has(lie) || fromYards == null) break;
          const rest = shots.slice(i + 1);
          const penalised = rest.some((s) => s.shot_type === 'penalty' || s.is_penalty === true);
          out.chips.push({
            ri,
            fromYards,
            lie,
            // A chip-in finished at the hole: a leave of 0, not an unplotted chip.
            leaveFeet:
              landed(shot) === 'hole' || shot.result === 'hole'
                ? 0
                : landed(shot) === 'green'
                  ? toFeet(shot.distance_to_hole_after, shot.distance_unit_after)
                  : null,
            saved: !penalised && rest.length <= 1,
            miss: approachMiss(shot.miss_direction),
          });
          break;
        }
        case 'putting': {
          // The ONE putt make % definition (src/lib/golf/putt-make.ts, owner
          // decision Q-93): start distance = distance_to_hole_before in feet
          // (clamped, never unit-converted), made = result 'hole' OR putt_made.
          // A putt with no start distance is left out, never read as 0 ft.
          const feet = puttMakeStartFeet(shot);
          if (feet == null) break;
          const first = putts[0] === shot;
          const made = isPuttMade(shot);
          const t = made ? [] : tokens(shot.miss_direction);
          const nextPutt = putts[putts.indexOf(shot) + 1];
          const nextFeet = nextPutt ? puttMakeStartFeet(nextPutt) : null;
          out.putts.push({
            ri,
            feet,
            made,
            first,
            threePutt: first && putts.length >= 3,
            brk: BREAK[shot.putt_break ?? ''] ?? null,
            slope: SLOPE[shot.putt_slope ?? ''] ?? null,
            side: t.includes('low') ? 'low' : t.includes('high') ? 'high' : null,
            depth: t.includes('short') ? 'short' : t.includes('long') ? 'long' : null,
            leaveFeet: made ? null : nextFeet,
          });
          break;
        }
        default:
          break;
      }
    });
  }

  return out;
}
