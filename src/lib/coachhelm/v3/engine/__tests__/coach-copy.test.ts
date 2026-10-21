/**
 * The coach's voice on every v3 read (`evidence.coach_copy`, design call D1).
 * One table over fixtures for every generator that writes a read: the coach
 * copy is there, non-empty, in the third person, names no club, and states
 * exactly the numbers of the player's copy (the Clubhouse reader drops a part
 * whose numbers differ).
 */
import { describe, it, expect } from 'vitest';
import {
  COACH_VOICE,
  CLUB_WORDS,
  PLAYER_VOICE,
  SECOND_PERSON,
  coachCopyIssues,
  inBothVoices,
  numbersIn,
  sameNumbers,
} from '../coach-voice';
import { COMPOSERS, FIXTURES } from './coach-copy-fixtures';

const THIRD_PERSON = /\bthe player\b|\bthe player's\b|\bthey\b|\btheir\b|\bthem\b/i;

describe('coach copy on every v3 generator', () => {
  it('has fixtures for every generator that writes a read', () => {
    const covered = new Set(FIXTURES.map((f) => f.g));
    for (const g of Object.keys(COMPOSERS)) expect(covered.has(g), g).toBe(true);
    for (const f of FIXTURES) expect(COMPOSERS[f.g], f.g).toBeDefined();
  });

  const rows = FIXTURES.map((f, i) => ({ name: `${f.g} #${i}`, ...f }));

  it.each(rows)('$name: same numbers, third person, no clubs', ({ g, agg }) => {
    const c = COMPOSERS[g]!(agg);
    expect(c.coach).toBeDefined();
    const coach = c.coach!;
    expect(coach.title.trim()).not.toBe('');
    expect(coach.content.trim()).not.toBe('');
    // Exactly the player's numbers, title with title and content with content.
    expect(numbersIn(coach.title).sort()).toEqual(numbersIn(c.title).sort());
    expect(numbersIn(coach.content).sort()).toEqual(numbersIn(c.content).sort());
    expect(coach.title).not.toMatch(SECOND_PERSON);
    expect(coach.content).not.toMatch(SECOND_PERSON);
    expect(coach.title).not.toMatch(CLUB_WORDS);
    expect(coach.content).not.toMatch(CLUB_WORDS);
    expect(coach.content).toMatch(THIRD_PERSON);
    // The write-side gate BaseGenerator runs stores it.
    expect(coachCopyIssues(c, coach)).toEqual([]);
  });
});

describe('coach-voice helpers', () => {
  it('renders one template in both voices; the player voice is the template as written', () => {
    const copy = inBothVoices((v) => ({
      title: `Putts from 4-6 ft`,
      content: `${v.Youre} making 58% from 4-6 ft; ${v.your} level putts make 81%. ${v.pick('Rehearse', 'Have the player rehearse')} the ladder.`,
    }));
    expect(copy.title).toBe('Putts from 4-6 ft');
    expect(copy.content).toBe("You're making 58% from 4-6 ft; your level putts make 81%. Rehearse the ladder.");
    expect(copy.coach).toEqual({
      title: 'Putts from 4-6 ft',
      content: "They're making 58% from 4-6 ft; their level putts make 81%. Have the player rehearse the ladder.",
    });
    expect(PLAYER_VOICE.player).toBe('you');
    expect(COACH_VOICE.players).toBe("the player's");
  });

  it('reads numbers the way the Clubhouse reader does (sign left out, thousands comma kept)', () => {
    expect(numbersIn('lost −0.4 over 1,435 approaches')).toEqual(['0.4', '1435']);
    expect(sameNumbers('a 23-point gap, 58% vs 81%', '58% vs 81%, a 23-point gap')).toBe(true);
    expect(sameNumbers('58% vs 81%', '58% vs 80%')).toBe(false);
    expect(sameNumbers('58%', '58% and 58%')).toBe(false);
  });

  it('flags a coach copy that is empty, off on numbers, in the second person, or names a club', () => {
    const player = { title: 'Greens from 50-125 yd', content: 'You hit 55% of 20 greens.' };
    expect(coachCopyIssues(player, { title: 'Greens from 50-125 yd', content: 'The player hit 55% of 20 greens.' })).toEqual([]);
    expect(coachCopyIssues(player, { title: '', content: 'The player hit 55% of 20 greens.' })).toEqual(['title: empty']);
    expect(coachCopyIssues(player, { title: 'Greens from 50-125 yd', content: 'The player hit 56% of 20 greens.' })).toEqual([
      "content: numbers differ from the player's copy",
    ]);
    expect(coachCopyIssues(player, { title: 'Greens from 50-125 yd', content: "You're hitting 55% of 20 greens." })).toEqual([
      'content: second person',
    ]);
    expect(coachCopyIssues(player, { title: 'Greens from 50-125 yd', content: 'The player hit 55% of 20 greens with a wedge.' })).toEqual([
      'content: club word',
    ]);
  });
});
