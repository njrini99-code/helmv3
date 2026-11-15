/**
 * The words a worked-out figure goes by on its card: a field of the rows in a coach's terms ("three-putts", never `three_putts`), and what the
 * figure covers ("all 5 rounds", "3 tournament rounds") from the op's filters. The labels the model reads are not these.
 */

interface FieldWords {
  /** What it is, lower case: "putts". */
  noun: string;
  /** A per-round count reads "Putts per round" as a mean. */
  perRound?: boolean;
  /** The mean's own name, where it has one ("Scoring average"). */
  mean?: string;
}

const FIELD_WORDS: Record<string, FieldWords> = {
  total_putts: { noun: 'putts', perRound: true },
  putts: { noun: 'putts', perRound: true },
  three_putts: { noun: 'three-putts', perRound: true },
  one_putts: { noun: 'one-putts', perRound: true },
  total_score: { noun: 'score', mean: 'Scoring average' },
  score_to_par: { noun: 'score to par', mean: 'Average score to par' },
  total_gir: { noun: 'greens in regulation', perRound: true },
  total_fairways_hit: { noun: 'fairways hit', perRound: true },
  total_penalties: { noun: 'penalty strokes', perRound: true },
  penalty_strokes: { noun: 'penalty strokes', perRound: true },
  holes_played: { noun: 'holes played' },
  strokes_gained_total: { noun: 'strokes gained' },
  strokes_gained_tee: { noun: 'strokes gained off the tee' },
  strokes_gained_approach: { noun: 'strokes gained approach' },
  strokes_gained_around_green: { noun: 'strokes gained around the green' },
  strokes_gained_putting: { noun: 'strokes gained putting' },
  birdies: { noun: 'birdies', perRound: true },
  pars: { noun: 'pars', perRound: true },
  bogeys: { noun: 'bogeys', perRound: true },
};

/** A field in a coach's words; a field with no entry has its underscores taken out. */
export function fieldNoun(field: string): string {
  return FIELD_WORDS[field]?.noun ?? field.replace(/^(?:total|avg|average)_/, '').replace(/_/g, ' ');
}

const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Putts per round", "Scoring average", "Three-putts, total", "Highest score": what a total, mean, lowest or highest of a field is called. */
export function opWords(op: 'sum' | 'mean' | 'min' | 'max', field: string): string {
  const w = FIELD_WORDS[field];
  const noun = fieldNoun(field);
  if (op === 'mean') return w?.mean ?? (w?.perRound ? `${upper(noun)} per round` : `Average ${noun}`);
  if (op === 'sum') return `${upper(noun)}, total`;
  return `${op === 'min' ? 'Lowest' : 'Highest'} ${noun}`;
}

export interface WhereLite {
  field: string;
  op: string;
  value?: unknown;
}

const WORD: Record<string, Record<string, string>> = {
  round_type: { tournament: 'tournament', qualifier: 'qualifier', practice: 'practice' },
  status: { completed: 'completed', in_progress: 'in-progress' },
};

/** What a figure covers: "all 5 rounds", or "3 tournament rounds" when the filters name a round type or status, else "3 matching rounds". */
export function coverWords(where: readonly WhereLite[], n: number, noun: string): string {
  const unit = n === 1 ? noun.replace(/s$/, '') : noun;
  if (where.length === 0) return n === 1 ? `1 ${unit}` : `all ${n} ${unit}`;
  const adjectives: string[] = [];
  let described = 0;
  for (const w of where) {
    const words = WORD[w.field];
    const values = w.op === 'eq' ? [w.value] : w.op === 'in' && Array.isArray(w.value) ? w.value : null;
    if (words && values && values.every((v) => typeof v === 'string' && words[v])) {
      adjectives.push(values.map((v) => words[v as string]).join(' or '));
      described++;
    } else if (w.field === 'player_id' || w.field === 'player') described++;
  }
  return `${n} ${adjectives.length > 0 && described === where.length ? adjectives.join(' ') : adjectives.length > 0 ? `${adjectives.join(' ')} matching` : 'matching'} ${unit}`;
}
