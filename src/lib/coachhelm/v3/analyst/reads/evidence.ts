/**
 * CoachHelm reads: the rounds behind a card, with course, score, date and the holes and shots that carry it.
 *
 * The analyst keeps ids only (`priority.where.evidence`). This module goes back to the same rows the fact sheet was
 * built from (`TeamRows`) and, for each evidence round, re-runs the same per-shot strokes gained (`shotSgForRound`,
 * the port of the database function) and the same band rule (`bandOf`), so the shots named are exactly the shots that
 * were counted. Counted facts only. Pure.
 */
import { shotSgForRound } from '@/lib/coachhelm/v3/generators/insight-angles/shot-sg';
import { sgBaselineScale } from '@/lib/golf/sg-benchmarks';
import { AREA_OF, bandOf, isPenalty, leaveFeet, onGreen, rawShot, yardsOf, type AreaId } from '../breakdown';
import type { TeamRows } from '../fact-sheet';
import type { PriorityWhere } from '../notability';
import type { HoleRow, RoundRow, ShotRow } from '../sources';
import type { FactSheet } from '../types';
import { dayText, oneDecimal, scoreText, whole } from './format';
import { PART_SHOTS } from './words';
import type { EvidenceRound, EvidenceShot, PartId } from './types';

/** The shots shown under one evidence round: the costliest, enough to open, few enough to read. */
export const EVIDENCE_SHOTS = 5;

const low = (s: string | null) => (s ?? '').toLowerCase();
const r2 = (n: number) => Math.round(n * 100) / 100;

/** One shot in plain words, from its own columns. */
export function shotText(area: AreaId, s: ShotRow): string {
  const hole = s.hole_number != null ? `Hole ${s.hole_number}: ` : '';
  const yards = yardsOf(s);
  const feet = leaveFeet(s);
  const side = low(s.miss_direction).replace(/_/g, ' ').trim();
  if (isPenalty(s)) return `${hole}penalty stroke`;
  switch (area) {
    case 'strokes_gained_putting': {
      const start = s.distance_to_hole_before == null ? null : low(s.distance_unit_before) === 'yards' ? s.distance_to_hole_before * 3 : s.distance_to_hole_before;
      const made = s.putt_made === true || low(s.result) === 'holed' || low(s.result) === 'made';
      return `${hole}${start != null ? `${whole(start)} foot putt` : 'putt'}, ${made ? 'holed' : `missed${side ? ` ${side}` : ''}${feet != null ? `, left ${whole(feet)} feet` : ''}`}`;
    }
    case 'strokes_gained_off_the_tee':
      return `${hole}tee shot${s.club_type ? ` with the ${low(s.club_type).replace(/_/g, ' ')}` : ''}, ${low(s.result) === 'fairway' || low(s.lie_after) === 'fairway' ? 'in the fairway' : `missed${side ? ` ${side}` : ''}${s.lie_after ? ` into the ${low(s.lie_after).replace(/_/g, ' ')}` : ''}`}`;
    default:
      return `${hole}${yards != null ? `from ${whole(yards)} yards` : 'shot'}${s.lie_before ? ` in the ${low(s.lie_before).replace(/_/g, ' ')}` : ''}, ${onGreen(s) ? 'on the green' : `missed${side ? ` ${side}` : ''}`}${feet != null ? `, ${whole(feet)} feet from the hole` : ''}`;
  }
}

/** The shots of one round inside the card's scope (the named band, or the whole part), with their strokes gained. */
export function shotsInScope(area: AreaId, band: string | null, shots: readonly ShotRow[], holes: readonly HoleRow[], scale: number): Array<{ shot: ShotRow; sg: number }> {
  const par = new Map(holes.flatMap((h) => (typeof h.par === 'number' ? [[h.id, h.par] as const] : [])));
  const byId = new Map(shots.map((s) => [s.id, s]));
  const out: Array<{ shot: ShotRow; sg: number }> = [];
  for (const v of shotSgForRound(shots.map(rawShot), par, scale)) {
    if (AREA_OF[v.category] !== area) continue;
    const shot = byId.get(v.shotId)!;
    const b = bandOf(area, shot, shot.hole_id ? (par.get(shot.hole_id) ?? null) : null);
    if (!b || (band != null && b !== band)) continue;
    out.push({ shot, sg: v.sg });
  }
  return out;
}

/**
 * The evidence rounds of a priority, enriched. `where.evidence` already holds the rounds (worst first); `band` is the
 * named band, or null when the loss is spread across the part.
 */
export function evidenceRounds(sheet: FactSheet, area: PartId, where: PriorityWhere, rows: Pick<TeamRows, 'rounds' | 'shots' | 'holes'>): EvidenceRound[] {
  const band = where.finding === 'band' && where.band?.named ? where.band.band : null;
  const scale = sgBaselineScale(sheet.strokes_gained_baseline);
  const roundById = new Map<string, RoundRow>(rows.rounds.filter((r) => r.player_id === sheet.player_id).map((r) => [r.id, r]));
  const noun = band ? (where.band?.label ?? PART_SHOTS[area]) : PART_SHOTS[area];
  return where.evidence.map((e): EvidenceRound => {
    const round = roundById.get(e.round_id);
    const scoped = shotsInScope(area, band, rows.shots.filter((s) => s.round_id === e.round_id), rows.holes.filter((h) => h.round_id === e.round_id), scale);
    const carry: EvidenceShot[] = [...scoped]
      .sort((a, b) => a.sg - b.sg || (a.shot.hole_number ?? 0) - (b.shot.hole_number ?? 0) || a.shot.id.localeCompare(b.shot.id))
      .slice(0, EVIDENCE_SHOTS)
      .map(({ shot, sg }) => ({ shot_id: shot.id, hole_number: shot.hole_number, text: shotText(area, shot), strokes_gained: r2(sg) }));
    const holes = [...new Set(scoped.flatMap((x) => (x.shot.hole_number != null ? [x.shot.hole_number] : [])))].sort((a, b) => a - b);
    const lost = -e.strokes_gained;
    return {
      round_id: e.round_id,
      date: e.date,
      date_text: dayText(e.date),
      course: round?.course_name ?? null,
      total_score: round?.total_score ?? null,
      score_to_par: round?.score_to_par ?? null,
      score_text: scoreText(round?.total_score ?? null, round?.score_to_par ?? null),
      shots: e.shots,
      strokes_gained: e.strokes_gained,
      line: `${whole(e.shots)} ${e.shots === 1 ? noun.replace(/shots\b/, 'shot').replace(/putts\b/, 'putt') : noun}, ${oneDecimal(Math.abs(lost))} strokes ${lost >= 0 ? 'lost' : 'gained'}`,
      holes,
      carry,
    };
  });
}
