/**
 * CoachHelm reads: the words on a card, assembled from counted facts. No model, no template that pretends.
 *
 * Every number is put through {@link Figures} first, so the payload carries the exact strings the sentences use.
 * Plain words: no "SG", no "GIR", no jargon, no em dashes. Pure.
 */
import type { LeadPattern, Priority } from '../notability';
import type { Certainty } from '../notability';
import { Figures, dayText, daysBetween, oneDecimal, whole } from './format';
import type { MissingRead, PartId, ReadFreshness, ReadPattern } from './types';

export const PART_LABEL: Record<PartId, string> = {
  strokes_gained_off_the_tee: 'Off the tee',
  strokes_gained_approach: 'Approach',
  strokes_gained_around_the_green: 'Around the green',
  strokes_gained_putting: 'Putting',
};

/** What a part's shots are called in a sentence. */
export const PART_SHOTS: Record<PartId, string> = {
  strokes_gained_off_the_tee: 'tee shots',
  strokes_gained_approach: 'approach shots',
  strokes_gained_around_the_green: 'shots around the green',
  strokes_gained_putting: 'putts',
};

export const CERTAINTY_WORD: Record<Certainty, string> = { clear: 'Clear', likely: 'Likely', leaning: 'Leaning' };

/** A card goes quiet about freshness until the newest round is this old. */
export const STALE_AFTER_DAYS = 21;

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The pattern as a counted sentence fragment, or null when it carries no value. */
export function patternText(p: Pick<LeadPattern, 'id' | 'value' | 'count' | 'of' | 'unit'>, f: Figures, prefix: string): ReadPattern | null {
  if (p.value == null) return null;
  const count = f.put(`${prefix}_count`, whole(p.count));
  const of = f.put(`${prefix}_of`, whole(p.of));
  const base = p.id.replace(/_(?:under_50|50_125|125_175|175_plus|0_3|3_5|5_10|10_15|15_25|25_plus|fairway|left|right|other|rough|sand)$/, '');
  let text: string;
  if (p.unit === 'feet') {
    const feet = f.put(`${prefix}_feet`, whole(p.value));
    text = base === 'leave_after_miss' ? `missed putts were left ${feet} feet away on average, over ${of} putts` : `they finished ${feet} feet from the hole on average, over ${of} shots`;
  } else if (base.startsWith('missed_')) {
    text = `${count} of ${of} misses with a side recorded went ${base.slice('missed_'.length)}`;
  } else if (base === 'green_hit') {
    text = `${count} of ${of} found the green`;
  } else if (base === 'from_rough') {
    text = `${count} of ${of} were played from the rough`;
  } else if (base === 'made') {
    text = `${count} of ${of} were holed`;
  } else if (base === 'three_putt') {
    text = `${count} of ${of} holes took three putts or more`;
  } else if (base === 'share_of_tee_shots') {
    text = `${count} of ${of} tee shots`;
  } else if (base === 'with_driver') {
    text = `${count} of ${of} were hit with the driver`;
  } else if (base === 'on_green') {
    text = `${count} of ${of} finished on the green`;
  } else if (base === 'inside_6_feet') {
    text = `${count} of ${of} finished inside ${f.put(`${prefix}_inside_feet`, '6')} feet`;
  } else {
    text = `${count} of ${of}`;
  }
  return { id: p.id, text, value: p.value, unit: p.unit, count: p.count, of: p.of };
}

export interface PriorityWords {
  headline: string;
  where_text: string;
  pattern: ReadPattern | null;
  how_we_found: [string, string, string];
  what_would_change: string;
  team_text: string | null;
}

/** Rounds needed for a range of half-width `half` around `mean` (over `n` rounds) to stop reaching zero, if the mean held. */
export function roundsToSettle(n: number, mean: number, half: number): number | null {
  if (!(Math.abs(mean) > 0) || !(half > 0) || n < 2) return null;
  return Math.max(0, Math.ceil(n * (half / Math.abs(mean)) ** 2) - n);
}

/**
 * The words of a priority card. `audience: 'player'` speaks to the player ("you") and never says anything about the
 * team; the coach's team sentence comes back separately (`team_text`) so it can be stored in a coach-only block.
 */
export function priorityWords(p: Priority, ctx: { from: string | null; to: string | null; shots: number }, f: Figures, audience: 'coach' | 'player' = 'coach'): PriorityWords {
  const area = p.measure_id as PartId;
  const label = PART_LABEL[area];
  const shotsWord = PART_SHOTS[area];
  const lost = f.put('lost_per_round', oneDecimal(p.strokes_per_round.value));
  const low = f.put('lost_low', oneDecimal(p.strokes_per_round.low));
  const high = f.put('lost_high', oneDecimal(p.strokes_per_round.high));
  const rounds = f.put('rounds', whole(p.rounds));
  const gaining = p.strokes_per_round.value <= 0;
  const headline = gaining
    ? `${label} is the lowest part of the game, and it is not a loss: ${f.put('gain_per_round', oneDecimal(-p.strokes_per_round.value))} strokes a round gained.`
    : `${label} costs the most: ${lost} strokes a round.`;

  const sure: Record<Certainty, string> = {
    clear: 'that is clear: a real loss, and worse than the other three parts round by round',
    likely: 'that is likely: a real loss, but not yet clearly worse than the other three parts',
    leaning: 'that is only leaning: the rounds cannot yet tell it from zero or from the other parts',
  };
  const who = audience === 'player' ? 'your' : 'the';
  const s1 = gaining
    ? `We compared ${who} four parts of the game round by round: ${lower(label)} is the lowest, between ${low} and ${high} strokes a round against the Tour baseline, and ${sure[p.certainty]}.`
    : `We compared ${who} four parts of the game round by round: ${lower(label)} costs ${lost} strokes a round against the Tour baseline, between ${low} and ${high}, and ${sure[p.certainty]}.`;

  const w = p.where;
  const pattern = w.lead_pattern ? patternText(w.lead_pattern, f, 'pattern') : null;
  let where_text: string;
  if (w.finding === 'band' && w.band) {
    const bandLost = f.put('band_lost_per_round', oneDecimal(w.band.strokes_per_round.value));
    const bandLabel = f.put('band_label', w.band.label);
    where_text = `Inside ${lower(label)} the strokes go on ${bandLabel}, ${bandLost} a round${pattern ? `, and ${pattern.text}` : ''}.`;
  } else if (w.finding === 'spread_evenly') {
    where_text = `Inside ${lower(label)} the loss is spread across the part, not one ${area === 'strokes_gained_off_the_tee' ? 'kind of tee shot' : area === 'strokes_gained_around_the_green' ? 'lie' : 'distance'}${pattern ? `; ${pattern.text}` : ''}.`;
  } else {
    where_text = `We could not split ${lower(label)} further: ${f.put('where_why', w.why)}.`;
  }

  const shots = f.put('shots', whole(ctx.shots));
  const span = ctx.from && ctx.to ? `, ${f.put('from_date', dayText(ctx.from))} to ${f.put('to_date', dayText(ctx.to))}` : '';
  const evidence = w.evidence.length ? `; the ${f.put('evidence_rounds', whole(w.evidence.length))} rounds where it cost the most are listed below` : '';
  const s3 = `This reads ${rounds} rounds with every shot logged this season${span}${ctx.shots > 0 ? `, and ${shots} ${shotsWord}` : ''}${evidence}.`;

  // What would change it, from the same ranges.
  const vs = p.against_own_other_areas;
  const vsHalf = (vs.high - vs.low) / 2;
  const ownHalf = (p.strokes_per_round.high - p.strokes_per_round.low) / 2;
  let change: string;
  if (gaining) {
    change = `This would change as soon as another part fell below ${lower(label)}.`;
  } else if (p.certainty === 'clear') {
    const gap = f.put('gap_to_other_parts', oneDecimal(-vs.value));
    change = `This steps down if ${lower(label)} stops costing more than the other parts: today it costs ${gap} more a round than the other three parts on average.`;
  } else if (p.certainty === 'likely') {
    const more = roundsToSettle(p.rounds, vs.value, vsHalf);
    const gap = f.put('gap_to_other_parts', oneDecimal(Math.abs(vs.value)));
    change = vs.value < 0 && more != null
      ? `If the next ${f.put('rounds_to_settle', whole(Math.max(1, more)))} rounds keep the same gap to the other parts, ${gap} a round, this becomes clear; if the gap closes, it steps down.`
      : `The other parts are level with ${lower(label)} so far (${gap} a round apart); this steps down if another part loses more.`;
  } else {
    const more = roundsToSettle(p.rounds, p.strokes_per_round.value, ownHalf);
    change = more != null
      ? `If ${lower(label)} keeps losing ${lost} a round, about ${f.put('rounds_to_settle', whole(Math.max(1, more)))} more rounds would show whether it is a real loss.`
      : `More rounds with every shot logged would show whether ${lower(label)} is a real loss.`;
  }

  // Against the team (coach only).
  let team_text: string | null = null;
  if (audience === 'coach') {
    const lead = w.lead_pattern;
    if (lead && lead.differs_from_team && lead.team?.median != null && pattern) {
      const med = f.put('team_pattern_median', lead.unit === 'feet' ? whole(lead.team.median) : whole(lead.team.median));
      const mine = f.put('pattern_value', whole(lead.value ?? 0));
      const unit = lead.unit === 'feet' ? ' feet' : '%';
      team_text = `The teammates' middle figure for that share is ${med}${unit}; this player's ${mine}${unit} is ${lead.direction === 'above' ? 'above' : 'below'} it, clear of the team.`;
    } else if (p.team_shape) {
      const t = p.team_shape;
      const teamLabel = PART_LABEL[t.team_worst_area as PartId] ?? t.team_worst_area;
      const diff = f.put('team_difference', oneDecimal(Math.abs(t.player_vs_team.difference)));
      const mates = f.put('teammates', whole(t.player_vs_team.teammates));
      const cmp = t.player_vs_team.verdict === 'same' ? `level with the team's middle in ${lower(label)}` : `${diff} strokes a round ${t.player_vs_team.verdict} than the team's middle in ${lower(label)}`;
      team_text = `${t.same_as_team ? `${teamLabel} costs the team the most too` : `For the team, ${lower(teamLabel)} costs the most`}; across ${mates} teammates this player is ${cmp}.`;
    }
  }

  return { headline, where_text, pattern, how_we_found: [s1, where_text, s3], what_would_change: change, team_text };
}

/** "Needs 5 rounds with every shot logged this season; has 3." from the notability's `priority_missing`. */
export function missingText(why: string | null, f: Figures): MissingRead {
  const m = why?.match(/needs (\d+) rounds with shots logged; (\d+) so far/);
  if (m) {
    const needs = Number(m[1]);
    const has = Number(m[2]);
    return { text: `Needs ${f.put('needs_rounds', whole(needs))} rounds with every shot logged this season; has ${f.put('has_rounds', whole(has))}.`, needs, has };
  }
  if (why && /no spread/.test(why)) return { text: 'The rounds logged so far do not vary enough to compare the parts of the game yet.', needs: null, has: null };
  return { text: 'Not enough rounds with every shot logged this season to say where the strokes go.', needs: null, has: null };
}

/** "Through 13 Oct, 12 rounds", and "No new rounds since 13 Oct." after three weeks. */
export function freshnessText(through: string | null, rounds: number, asOf: string, f: Figures): ReadFreshness {
  if (!through) return { through_text: 'No rounds this season yet', stale_text: null };
  const day = f.put('through_date', dayText(through));
  const n = f.put('season_rounds', whole(rounds));
  return {
    through_text: `Through ${day}, ${n} ${rounds === 1 ? 'round' : 'rounds'}`,
    stale_text: daysBetween(through, asOf) >= STALE_AFTER_DAYS ? `No new rounds since ${day}.` : null,
  };
}
