import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { buildTeamReads } from '../build';
import { CHECKPOINT_ROUNDS, decideNext, type CoachFeedback } from '../memory';
import type { PriorityCard, ReadPayload } from '../types';
import { readsTeam } from './team';

const base = buildTeamReads(readsTeam().rows()).payloads.find((p) => p.priority && p.priority.certainty !== 'leaning')!;
const card = base.priority!;
const at = (p: ReadPayload, over: { rounds?: number; as_of?: string; card?: Partial<PriorityCard>; numbers?: Partial<PriorityCard['numbers']> }): ReadPayload => ({
  ...p,
  as_of: over.as_of ?? p.as_of,
  n_rounds: over.rounds ?? p.n_rounds,
  priority: { ...card, ...over.card, numbers: { ...card.numbers, ...over.numbers } },
});

describe('stage 4: words change only at a checkpoint', () => {
  const first = decideNext(null, base);
  it('the first read is remembered with its checkpoint', () => {
    expect(first.memory).toMatchObject({ card_key: card.key, at_checkpoint: true, change_line: null, history: [] });
    expect(first.memory!.checkpoint.rounds).toBe(base.n_rounds);
  });

  it('between checkpoints the words and figures hold while the numbers refresh', () => {
    const night = at(base, { rounds: base.n_rounds + 1, card: { certainty: 'leaning', certainty_word: 'Leaning', headline: 'Something else.' }, numbers: { lost_per_round: 0.1 } });
    const next = decideNext(first, night);
    expect(next.memory!.at_checkpoint).toBe(false);
    expect(next.priority!.headline).toBe(card.headline);
    expect(next.priority!.certainty).toBe(card.certainty);
    expect(next.priority!.numbers.lost_per_round).toBe(0.1);
    expect(next.figures.lost_per_round).toBe(base.figures.lost_per_round);
  });

  it('at a checkpoint a change in how sure is said once, and the same read stays quiet', () => {
    const other = card.certainty === 'clear' ? 'likely' : 'clear';
    const later = at(base, { rounds: base.n_rounds + CHECKPOINT_ROUNDS, card: { certainty: other, certainty_word: other } });
    const next = decideNext(first, later);
    expect(next.memory!.change_line).toBe(`Was ${card.certainty}, now ${other}: ${CHECKPOINT_ROUNDS} more rounds, same pattern.`);
    const again = decideNext(next, at(later, { rounds: later.n_rounds + CHECKPOINT_ROUNDS, card: { certainty: other, certainty_word: other } }));
    expect(again.memory!.change_line).toBeNull();
  });

  it('a loss not told from zero at two checkpoints running clears, saying was and now first, into history', () => {
    const weak = (n: number, lost: number) => at(base, { rounds: base.n_rounds + n * CHECKPOINT_ROUNDS, numbers: { lost_per_round: lost, lost_low: -0.3 } });
    const one = decideNext(first, weak(1, 0.4));
    expect(one.memory!.improvement).toBeNull();
    const two = decideNext(one, weak(2, 0.2));
    expect(two.memory!.improvement).toBe(`${card.area_label}: was ${base.figures.lost_per_round} a round lost, now 0.2 over the last ${card.numbers.rounds} rounds.`);
    expect(two.memory!.history).toEqual([expect.objectContaining({ card_key: card.key, state: 'cleared', why: expect.stringMatching(/not told from zero/) })]);
    // It comes back: the card says so.
    const back = decideNext(two, at(base, { rounds: base.n_rounds + 3 * CHECKPOINT_ROUNDS }));
    expect(back.memory!.back).toBe(true);
    expect(back.memory!.change_line).toMatch(/^This is back/);
  });

  it('another part clearly taking over retires the card with its reason', () => {
    const putting = { ...card, key: 'priority:strokes_gained_putting', area: 'strokes_gained_putting' as const, area_label: 'Putting', certainty: 'clear' as const, certainty_word: 'Clear' };
    const next = decideNext(first, { ...base, n_rounds: base.n_rounds + CHECKPOINT_ROUNDS, priority: putting });
    expect(next.memory!.history[0]).toMatchObject({ card_key: card.key, state: 'retired', why: 'another part clearly takes over: putting' });
    expect(next.memory!.change_line).toMatch(/^Putting now costs the most/);
  });

  it('a new season starts the read again and puts the old one in history', () => {
    const next = decideNext(first, { ...base, season_start: '2027-08-01' });
    expect(next.memory!.change_line).toMatch(/new season/);
    expect(next.memory!.history[0]!.why).toMatch(/season ended/);
  });
});

describe('stage 4: a coach’s "not useful" or "wrong"', () => {
  const fb: CoachFeedback = { card_key: card.key, verdict: 'not_useful', reason: 'we knew', at: '2026-11-01', lost_per_round: card.numbers.lost_per_round, certainty: card.certainty, area: card.area };
  it('keeps the card down, with the reason, while nothing material changes', () => {
    expect(decideNext(null, base, { feedback: fb }).memory!.suppressed).toEqual({ verdict: 'not_useful', reason: 'we knew' });
  });
  it('lifts when the loss moves half a stroke, or another card replaces it', () => {
    expect(decideNext(null, at(base, { numbers: { lost_per_round: card.numbers.lost_per_round + 0.6 } }), { feedback: fb }).memory!.suppressed).toBeNull();
    expect(decideNext(null, base, { feedback: { ...fb, card_key: 'other' } }).memory!.suppressed).toBeNull();
  });
});
