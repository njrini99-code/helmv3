/**
 * CoachHelm reads, stage 4: memory and refresh (COACHHELM_2_TO_10.md section 5).
 *
 * decideNext(previous, fresh) is the one place a new read meets the last saved one:
 *
 * - Numbers refresh every night; the WORDS (which part, how sure, one level down, the pattern) change only at a
 *   checkpoint: three new rounds, or twenty new shots of that kind, since the words last changed. Between checkpoints
 *   the card keeps its words and figures and takes the fresh numbers, rounds and parts.
 * - At a checkpoint: the same read stays quiet; a stronger or weaker one says in one line what changed
 *   ("Was likely, now clear: 4 more rounds."). Leaning, likely, clear in both directions.
 * - A card retires when another part clearly takes over, or when its loss is not told from zero at two checkpoints
 *   running. An improvement says "was X, now Y" first, then moves to history as cleared. Nothing is silently dropped:
 *   every retirement is in history with its reason. A cleared card that returns says it is back.
 * - A coach marked it "not useful" or "wrong": it stays down, with the reason kept, unless the evidence changes
 *   materially (another part, a step up in how sure, or half a stroke a round either way).
 * - A new season starts the read again from that season, and the last season goes to history.
 *
 * Pure: no clock, no database. The caller passes the previous saved payload.
 */
import { Figures, oneDecimal, whole } from './format';
import type { Certainty } from '../notability';
import type { PriorityCard, ReadPayload } from './types';

/** Words change only after this many new rounds ... */
export const CHECKPOINT_ROUNDS = 3;
/** ... or this many new shots of the card’s kind. */
export const CHECKPOINT_SHOTS = 20;
/** A loss not told from zero at this many checkpoints running retires the card. */
export const RETIRE_AFTER_WEAK_CHECKPOINTS = 2;
/** What counts as the evidence changing materially after a coach said "not useful" or "wrong". */
export const MATERIAL_CHANGE_STROKES = 0.5;

export type CoachVerdict = 'not_useful' | 'wrong';

export interface CoachFeedback {
  card_key: string;
  verdict: CoachVerdict;
  reason: string;
  at: string;
  /** What the card said when the coach answered. */
  lost_per_round: number;
  certainty: Certainty;
  area: string;
}

export interface HistoryEntry {
  card_key: string;
  /** "cleared" (improved), "retired" (another part took over, or the season ended). */
  state: 'cleared' | 'retired';
  from: string | null;
  to: string;
  why: string;
  headline: string;
}

export interface ReadMemory {
  /** The card the words belong to. */
  card_key: string | null;
  first_said: string;
  /** Strokes a round lost when the card was first said: the "was" of an improvement. */
  first_lost: number | null;
  words_since: string;
  /** Rounds and shots when the words last changed: the next checkpoint counts from here. */
  checkpoint: { rounds: number; shots: number };
  at_checkpoint: boolean;
  /** One line when something changed at this checkpoint; null when it is the same read. */
  change_line: string | null;
  /** "Approach: was 1.1 a round lost, now 0.2 over the last 8 rounds." Shown first, the night it clears. */
  improvement: string | null;
  /** A cleared card that has come back. */
  back: boolean;
  /** Checkpoints running at which the loss was not told from zero. */
  weak_checkpoints: number;
  /** The coach said "not useful" or "wrong" and nothing material changed: the card is not shown. */
  suppressed: { verdict: CoachVerdict; reason: string } | null;
  history: HistoryEntry[];
  figures: Record<string, string>;
}

const RANK: Record<Certainty, number> = { leaning: 0, likely: 1, clear: 2 };
const WORD: Record<Certainty, string> = { leaning: 'leaning', likely: 'likely', clear: 'clear' };

const notToldFromZero = (c: PriorityCard) => c.numbers.lost_low <= 0;

/** The previous card’s words over the fresh numbers: between checkpoints a card does not change what it says. */
function holdWords(prev: PriorityCard, fresh: PriorityCard | null): PriorityCard {
  if (!fresh || fresh.area !== prev.area) return prev;
  return { ...fresh, key: prev.key, certainty: prev.certainty, certainty_word: prev.certainty_word, headline: prev.headline, where_text: prev.where_text, where: prev.where, pattern: prev.pattern, how_we_found: prev.how_we_found, player_how_we_found: prev.player_how_we_found, what_would_change: prev.what_would_change, team: prev.team };
}

function fresh_memory(p: ReadPayload, base: Partial<ReadMemory> = {}): ReadMemory {
  return {
    card_key: p.priority?.key ?? null,
    first_said: p.as_of,
    first_lost: p.priority?.numbers.lost_per_round ?? null,
    words_since: p.as_of,
    checkpoint: { rounds: p.n_rounds, shots: p.priority?.numbers.shots ?? 0 },
    at_checkpoint: true,
    change_line: null,
    improvement: null,
    back: false,
    weak_checkpoints: 0,
    suppressed: null,
    history: [],
    figures: {},
    ...base,
  };
}

export interface DecideOptions {
  /** The coach’s latest "not useful" or "wrong" on this player’s card, if any. */
  feedback?: CoachFeedback | null;
}

/** The read to save: the fresh one, with the words held between checkpoints and what changed said once. */
export function decideNext(prev: ReadPayload | null, fresh: ReadPayload, opts: DecideOptions = {}): ReadPayload {
  const f = new Figures();
  const pm = prev?.memory;
  if (!prev || !pm) return withFeedback({ ...fresh, memory: fresh_memory(fresh) }, opts);

  if (prev.season_start !== fresh.season_start) {
    const history = [...pm.history, ...(prev.priority ? [{ card_key: prev.priority.key, state: 'retired' as const, from: pm.first_said, to: fresh.as_of, why: 'the season ended; the read starts again from this season’s rounds', headline: prev.priority.headline }] : [])];
    return withFeedback({ ...fresh, memory: fresh_memory(fresh, { history, change_line: 'A new season: this read starts again from this season’s rounds.' }) }, opts);
  }

  const prevCard = prev.priority;
  const freshCard = fresh.priority;
  const roundsSince = fresh.n_rounds - pm.checkpoint.rounds;
  const shotsSince = (freshCard?.numbers.shots ?? 0) - pm.checkpoint.shots;
  const atCheckpoint = roundsSince >= CHECKPOINT_ROUNDS || shotsSince >= CHECKPOINT_SHOTS || !prevCard !== !freshCard;
  const freshness = { through_date: fresh.figures.through_date, season_rounds: fresh.figures.season_rounds };
  const hold = (memory: Partial<ReadMemory>): ReadPayload =>
    withFeedback({ ...fresh, priority: prevCard ? holdWords(prevCard, freshCard) : freshCard, figures: Object.fromEntries(Object.entries({ ...prev.figures, ...freshness }).filter(([, v]) => v !== undefined)) as Record<string, string>, memory: { ...pm, at_checkpoint: false, change_line: null, improvement: null, back: false, figures: {}, ...memory } }, opts);

  if (!atCheckpoint) return hold({});

  // At a checkpoint.
  if (prevCard && freshCard && prevCard.area !== freshCard.area) {
    const oldPart = fresh.parts?.find((x) => x.part === prevCard.area);
    const oldWeak = oldPart?.season?.high != null && oldPart.season.high >= 0;
    const weak = oldWeak ? pm.weak_checkpoints + 1 : 0;
    if (freshCard.certainty === 'clear' || weak >= RETIRE_AFTER_WEAK_CHECKPOINTS) {
      const why = freshCard.certainty === 'clear' ? `another part clearly takes over: ${freshCard.area_label.toLowerCase()}` : `the loss is not told from zero at ${RETIRE_AFTER_WEAK_CHECKPOINTS} checkpoints running`;
      const entry: HistoryEntry = { card_key: prevCard.key, state: freshCard.certainty === 'clear' ? 'retired' : 'cleared', from: pm.first_said, to: fresh.as_of, why, headline: prevCard.headline };
      const back = pm.history.some((h) => h.card_key === freshCard.key && h.state === 'cleared');
      const line = `${freshCard.area_label} now costs the most; ${prevCard.area_label.toLowerCase()} steps down (${why}).`;
      return withFeedback({ ...fresh, memory: fresh_memory(fresh, { history: [...pm.history, entry], change_line: back ? `This is back: ${freshCard.headline}` : line, back }) }, opts);
    }
    return hold({ weak_checkpoints: weak, at_checkpoint: true, checkpoint: { rounds: fresh.n_rounds, shots: pm.checkpoint.shots } });
  }

  if (prevCard && freshCard) {
    const weak = notToldFromZero(freshCard) ? pm.weak_checkpoints + 1 : 0;
    const base: Partial<ReadMemory> = { card_key: freshCard.key, first_said: pm.first_said, first_lost: pm.first_lost, history: pm.history, weak_checkpoints: weak, checkpoint: { rounds: fresh.n_rounds, shots: freshCard.numbers.shots } };
    const cleared = pm.history.some((h) => h.card_key === freshCard.key && h.state === 'cleared' && h.to === pm.words_since);
    if (weak >= RETIRE_AFTER_WEAK_CHECKPOINTS && !cleared) {
      const firstLost = pm.first_lost ?? prevCard.numbers.lost_per_round;
      const improvement = `${freshCard.area_label}: was ${f.put('was_lost', oneDecimal(firstLost))} a round lost, now ${f.put('now_lost', oneDecimal(freshCard.numbers.lost_per_round))} over the last ${f.put('now_rounds', whole(freshCard.numbers.rounds))} rounds.`;
      const entry: HistoryEntry = { card_key: freshCard.key, state: 'cleared', from: pm.first_said, to: fresh.as_of, why: `the loss is not told from zero at ${RETIRE_AFTER_WEAK_CHECKPOINTS} checkpoints running`, headline: prevCard.headline };
      return withFeedback({ ...fresh, memory: { ...fresh_memory(fresh), ...base, words_since: fresh.as_of, history: [...pm.history, entry], improvement, change_line: improvement, figures: f.all } }, opts);
    }
    const back = pm.history.some((h) => h.card_key === freshCard.key && h.state === 'cleared') && weak === 0 && notToldFromZero(prevCard);
    let line: string | null = null;
    if (back) line = `This is back: ${freshCard.headline}`;
    else if (freshCard.certainty !== prevCard.certainty) line = `Was ${WORD[prevCard.certainty]}, now ${WORD[freshCard.certainty]}: ${f.put('rounds_since', whole(roundsSince))} more rounds${freshCard.pattern?.id === prevCard.pattern?.id ? ', same pattern' : ''}.`;
    else if (freshCard.where.band !== prevCard.where.band || freshCard.pattern?.id !== prevCard.pattern?.id) line = `One level down it changed: ${freshCard.where_text}`;
    return withFeedback({ ...fresh, memory: { ...fresh_memory(fresh), ...base, words_since: line ? fresh.as_of : pm.words_since, change_line: line, back, figures: f.all } }, opts);
  }

  return withFeedback({ ...fresh, memory: fresh_memory(fresh, { history: pm.history, first_said: freshCard && pm.card_key === freshCard.key ? pm.first_said : fresh.as_of }) }, opts);
}

/** "Not useful" or "wrong" keeps the card down unless the evidence changed materially. */
function withFeedback(p: ReadPayload, opts: DecideOptions): ReadPayload {
  const fb = opts.feedback;
  const c = p.priority;
  if (!fb || !c || !p.memory || fb.card_key !== c.key) return p.memory ? { ...p, memory: { ...p.memory, suppressed: null } } : p;
  const material = fb.area !== c.area || RANK[c.certainty] > RANK[fb.certainty] || Math.abs(c.numbers.lost_per_round - fb.lost_per_round) >= MATERIAL_CHANGE_STROKES;
  return { ...p, memory: { ...p.memory, suppressed: material ? null : { verdict: fb.verdict, reason: fb.reason } } };
}
