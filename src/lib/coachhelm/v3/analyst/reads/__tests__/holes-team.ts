/**
 * A team whose rounds are logged hole by hole (tee, approach, around the green, putts, penalties), for the catalogue
 * reads. Player "wild" makes doubles with tee penalties into water far more often than the others.
 */
import type { TeamRows } from '../../fact-sheet';
import { NOW, PAR_LAYOUT, PGA_STANDARDS, TEAM_ID, daysAgo, seeded } from '../../__tests__/fixtures';
import type { HoleRow, RoundRow, ShotRow } from '../../sources';

const YARDS = [400, 380, 170, 520, 410, 360, 150, 430, 540, 390, 420, 180, 510, 370, 400, 160, 440, 530];

export function holesTeam(opts: { players?: number; rounds?: number; seed?: number } = {}): TeamRows {
  const rng = seeded(opts.seed ?? 5);
  const players = Array.from({ length: opts.players ?? 8 }, (_, i) => (i === 0 ? 'wild' : `steady-${i}`));
  const rounds: RoundRow[] = [];
  const holes: HoleRow[] = [];
  const shots: ShotRow[] = [];
  let n = 0;
  const shot = (roundId: string, hole: HoleRow, s: Partial<ShotRow>): void => {
    n += 1;
    shots.push({ id: `${roundId}-s${String(n).padStart(6, '0')}`, round_id: roundId, hole_id: hole.id, hole_number: hole.hole_number, shot_number: n, shot_type: null, club_type: null, is_penalty: false, miss_direction: null, lie_before: null, distance_to_hole_before: null, distance_unit_before: null, distance_to_hole_after: null, distance_unit_after: null, result: null, lie_after: null, putt_made: null, putt_distance_feet: null, ...s });
  };
  for (const p of players) {
    const wild = p === 'wild';
    for (let r = 0; r < (opts.rounds ?? 10); r++) {
      const id = `${p}-r${r}`;
      let total = 0;
      const myHoles: HoleRow[] = [];
      for (let h = 0; h < 18; h++) {
        const par = PAR_LAYOUT[h]!;
        const hole: HoleRow = { id: `${id}-h${h + 1}`, round_id: id, hole_number: h + 1, par, score: 0 };
        let strokes = 0;
        let remaining = YARDS[h]!;
        let lie = 'tee';
        if (par > 3) {
          const water = rng() < (wild ? 0.4 : 0.03);
          const fairway = !water && rng() < 0.55;
          const side = rng() < 0.5 ? 'left' : 'right';
          const leave = Math.max(60, remaining - 250 - Math.round(rng() * 30));
          shot(id, hole, { shot_type: 'tee', club_type: 'driver', lie_before: 'tee', distance_to_hole_before: remaining, distance_unit_before: 'yards', distance_to_hole_after: water ? remaining : leave, distance_unit_after: 'yards', result: water ? 'water' : fairway ? 'fairway' : 'rough', lie_after: water ? 'water' : fairway ? 'fairway' : 'rough', miss_direction: fairway ? null : side });
          strokes += 1;
          if (water) {
            shot(id, hole, { shot_type: 'penalty', is_penalty: true, lie_before: 'tee', distance_to_hole_before: remaining, distance_unit_before: 'yards', lie_after: 'water', result: 'water' });
            strokes += 1;
            shot(id, hole, { shot_type: 'tee', club_type: 'driver', lie_before: 'tee', distance_to_hole_before: remaining, distance_unit_before: 'yards', distance_to_hole_after: leave, distance_unit_after: 'yards', result: 'fairway', lie_after: 'fairway' });
            strokes += 1;
          }
          remaining = leave;
          lie = fairway || water ? 'fairway' : 'rough';
        }
        if (par === 5) {
          const lay = Math.round(80 + rng() * 40);
          shot(id, hole, { shot_type: 'approach', lie_before: lie, distance_to_hole_before: remaining, distance_unit_before: 'yards', distance_to_hole_after: lay, distance_unit_after: 'yards', result: 'fairway', lie_after: 'fairway' });
          strokes += 1;
          remaining = lay;
          lie = 'fairway';
        }
        const green = rng() < 0.55;
        const toGreenFeet = Math.round(15 + rng() * 30);
        shot(id, hole, { shot_type: 'approach', lie_before: par === 3 ? 'tee' : lie, distance_to_hole_before: remaining, distance_unit_before: 'yards', distance_to_hole_after: green ? toGreenFeet : 20, distance_unit_after: green ? 'feet' : 'yards', result: green ? 'green' : 'rough', lie_after: green ? 'green' : 'rough', miss_direction: green ? null : 'short' });
        strokes += 1;
        let feet = toGreenFeet;
        if (!green) {
          feet = Math.round(4 + rng() * 14);
          shot(id, hole, { shot_type: 'around_green', lie_before: 'rough', distance_to_hole_before: 20, distance_unit_before: 'yards', distance_to_hole_after: feet, distance_unit_after: 'feet', result: 'green', lie_after: 'green' });
          strokes += 1;
        }
        let putts = 0;
        while (putts < 4) {
          const made = rng() < (feet <= 4 ? 0.9 : feet <= 10 ? 0.45 : feet <= 25 ? 0.15 : 0.05);
          const after = made ? 0 : Math.max(1, Math.round(feet * 0.15 + rng() * 2));
          shot(id, hole, { shot_type: 'putting', lie_before: 'green', distance_to_hole_before: feet, distance_unit_before: 'feet', distance_to_hole_after: after, distance_unit_after: 'feet', result: made ? 'hole' : 'green', lie_after: made ? 'hole' : 'green', putt_made: made, putt_distance_feet: feet });
          putts += 1;
          strokes += 1;
          if (made) break;
          feet = after;
        }
        hole.score = strokes;
        total += strokes;
        myHoles.push(hole);
      }
      holes.push(...myHoles);
      rounds.push({ id, player_id: p, round_date: daysAgo(2 + r * 4), round_type: 'tournament', course_name: 'River Bend', total_score: total, score_to_par: total - 72, front_nine: myHoles.slice(0, 9).reduce((a, h) => a + (h.score ?? 0), 0), back_nine: myHoles.slice(9).reduce((a, h) => a + (h.score ?? 0), 0), holes_played: 18, total_putts: null, strokes_gained_total: -4, strokes_gained_tee: wild ? -2 : -0.5, strokes_gained_approach: -1 - rng(), strokes_gained_around_green: -0.5 + rng() * 0.2, strokes_gained_putting: -0.5 + rng() * 0.4 });
    }
  }
  return { team: { id: TEAM_ID, gender: 'mens', timezone: 'America/New_York' }, playerIds: players, rounds, roundCache: [], holes, shots, tourStandards: PGA_STANDARDS, now: NOW };
}
