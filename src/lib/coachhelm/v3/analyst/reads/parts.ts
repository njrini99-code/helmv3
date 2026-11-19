/**
 * CoachHelm reads, stage 2: the four parts of the game side by side, each its own counted read.
 *
 * For each part: strokes a round over the season, measured rounds only, against the player’s own earlier rounds (last 10
 * against the 10 before), against the team’s middle (coach only), and one level down (the band named, or spread across
 * the part). The numbers are the fact sheet’s; nothing new is measured. Pure.
 */
import { STROKES_GAINED_AREA_IDS } from '../measures';
import { readWhere } from '../notability';
import type { FactSheet } from '../types';
import { Figures, oneDecimal, whole } from './format';
import { PART_LABEL } from './words';
import type { CoachOnly, PartId } from './types';

export interface PartRead {
  part: PartId;
  label: string;
  /** "This season it loses 1.4 strokes a round over 10 rounds; the last 10 rounds lose 1.2, the 10 before lose 1.8." */
  text: string;
  /** One level down, when a band is named or the loss is spread. */
  where_text: string | null;
  /** Strokes gained per round over the season (negative is a loss) and its range; null under the floor. */
  season: { value: number; low: number | null; high: number | null; rounds: number } | null;
  last10: number | null;
  previous10: number | null;
  /** Against the team’s middle. Coach-only. */
  team: CoachOnly<{ text: string; median: number; teammates: number }> | null;
  figures: Record<string, string>;
}

const say = (sg: number, f: Figures, name: string): string => (sg < 0 ? `loses ${f.put(name, oneDecimal(-sg))}` : `gains ${f.put(name, oneDecimal(sg))}`);

export function partReads(sheet: FactSheet): PartRead[] {
  return STROKES_GAINED_AREA_IDS.map((id): PartRead => {
    const part = id as PartId;
    const f = new Figures();
    const m = sheet.measures.find((x) => x.id === id)!;
    const s = m.season;
    const season = s.value == null ? null : { value: s.value, low: s.range95?.low ?? null, high: s.range95?.high ?? null, rounds: s.sample.rounds };
    const last10 = m.current.value;
    const previous10 = m.previous?.value ?? null;
    let text: string;
    if (!season) {
      text = `Not enough rounds with every shot logged yet: ${f.put('withheld', s.withheld ?? 'needs more rounds')}.`;
    } else {
      text = `This season it ${say(season.value, f, 'season')} strokes a round over ${f.put('rounds', whole(season.rounds))} rounds`;
      if (last10 != null && previous10 != null) text += `; the last 10 rounds ${say(last10, f, 'last10')}, the 10 before ${say(previous10, f, 'previous10')}`;
      text += '.';
    }
    const where = readWhere(sheet.breakdowns.find((b) => b.area_measure_id === id), id);
    const where_text = where.finding === 'band' && where.band?.named ? `Inside it, most goes on ${f.put('band', where.band.label)}.` : where.finding === 'spread_evenly' ? 'Inside it, the loss is spread across the part.' : null;
    const t = m.team_season;
    const team: PartRead['team'] =
      season && t && t.median != null && t.n > 0
        ? { audience: 'coach_only', value: { text: `The team’s middle is a ${t.median < 0 ? 'loss' : 'gain'} of ${f.put('team_median', oneDecimal(Math.abs(t.median)))} a round, across ${f.put('teammates', whole(t.n))} teammates.`, median: t.median, teammates: t.n } }
        : null;
    return { part, label: PART_LABEL[part], text, where_text, season, last10, previous10, team, figures: f.all };
  });
}
