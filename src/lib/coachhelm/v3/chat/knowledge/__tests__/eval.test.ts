import { describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../../context';
import type { PlayerChatContext } from '../../engine/tool';
import { toolsFor } from '../../registry';
import { FLAGGED_READERS } from '../data-map.source';
import { EVAL_GLOBAL_FORBID, EVAL_PATTERN_NAMES, golfSenseQuestions, sentenceCount } from '../eval';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => false }));

const coach: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 't1', team_name: 'Rini University', timezone: 'America/New_York', roster: [] };
const player: PlayerChatContext = { ...coach, player_id: 'p1' };
const questions = golfSenseQuestions();
const AREAS = ['strokes_gained', 'scoring', 'ball_striking', 'short_game', 'putting', 'mistakes', 'relations', 'college', 'courses', 'windows', 'action', 'caution', 'limits', 'data', 'writing'];

describe('the golf-sense eval set', () => {
  // Sixty from the first pass, nine on what a Tour-based strokes gained figure means, five on the writing alone (the owner's follow-ups, 10 Nov 2026).
  it('has 60 to 80 questions with unique ids, for a coach and for a player', () => {
    expect(questions.length).toBeGreaterThanOrEqual(60);
    expect(questions.length).toBeLessThanOrEqual(80);
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
    expect(questions.filter((q) => q.viewer === 'player').length).toBeGreaterThanOrEqual(5);
  });

  it('covers every area of the golf block and the data map', () => {
    const covered = new Set(questions.map((q) => q.area));
    for (const area of AREAS) expect([...covered], area).toContain(area);
    expect([...covered].filter((a) => !AREAS.includes(a))).toEqual([]);
  });

  it('says for every question what a correct answer must contain, and why the question is there', () => {
    for (const q of questions) {
      expect(q.facts.length, q.id).toBeGreaterThan(0);
      expect(q.note.length, q.id).toBeGreaterThan(15);
      expect(q.ask.endsWith('?') || q.ask.endsWith('.'), q.id).toBe(true);
    }
    // The cautions the brief names each have questions that forbid the failure.
    const forbids = (name: string) => questions.filter((q) => q.forbid.some((f) => f.pattern === name)).length;
    expect(forbids('tour_figure_from_memory')).toBeGreaterThanOrEqual(8);
    expect(forbids('swing_diagnosis')).toBeGreaterThanOrEqual(6);
    expect(forbids('label')).toBeGreaterThanOrEqual(8);
    expect(forbids('promise')).toBeGreaterThanOrEqual(5);
    expect(forbids('teammate_named')).toBeGreaterThanOrEqual(4);
    for (const name of EVAL_PATTERN_NAMES) expect(forbids(name), name).toBeGreaterThan(0);
  });

  it('names only reads the viewer is offered', () => {
    const coachReads = new Set([...toolsFor('ask', coach), ...toolsFor('quick_chat', coach)].map((t) => t.name).concat(Object.keys(FLAGGED_READERS)));
    const playerReads = new Set(toolsFor('player', player).map((t) => t.name));
    for (const q of questions) for (const r of q.readers) expect((q.viewer === 'player' ? playerReads : coachReads).has(r), `${q.id}: ${r}`).toBe(true);
    // A player's question never expects a team-wide read.
    for (const q of questions.filter((q) => q.viewer === 'player')) expect(q.readers).not.toEqual(expect.arrayContaining(['get_team_stats']));
  });

  it('its guards catch the failures they are named for and pass a careful answer', () => {
    const re = (name: string) => golfSenseQuestions({ teammate: 'Owen Carter' }).flatMap((q) => q.forbid).find((f) => f.pattern === name)!.re;
    expect(re('tour_figure_from_memory').test('The Tour average is about 65% of greens.')).toBe(true);
    expect(re('tour_figure_from_memory').test('A D1 player typically hits 62% of greens; college players average 30 putts.')).toBe(true);
    expect(re('swing_diagnosis').test('He is probably coming over the top with an open clubface.')).toBe(true);
    expect(re('label').test('Honestly he chokes under pressure.')).toBe(true);
    expect(re('promise').test('Fixing this will save him two strokes a round.')).toBe(true);
    expect(re('weather_guess').test('That round was high because of the wind.')).toBe(true);
    expect(re('picks_the_lineup').test('You should take Eli and leave Marcus at home.')).toBe(true);
    expect(re('names_internals').test('I ran get_player_stats on golf_rounds.')).toBe(true);
    expect(re('teammate_named').test('You are longer than Owen Carter.')).toBe(true);
    expect(re('negative_sg_called_bad').test('A negative number means bad putting.')).toBe(true);
    const careful =
      'Eli is losing the most in approach over his last 10 rounds (10 rounds), about a stroke more than the team in the same window. Zero is Tour level, so a negative figure is normal for a college player. Approach shots from long range are finishing farther from the hole than the team\'s. It is early to call it a pattern; the same figure after a few more rounds will tell. The choice of who travels is yours.';
    for (const name of EVAL_PATTERN_NAMES) if (name !== 'teammate_named') expect(re(name).test(careful), name).toBe(false);
    // The owner's follow-up: the sign is never a verdict, an estimate is never a gap to the Tour, and no tour is named unprompted.
    expect(re('sign_as_verdict').test('His approach number is negative, which means poor iron play.')).toBe(true);
    expect(re('estimate_as_tour_gap').test('From the scorecard estimate he is about two behind the Tour in approach.')).toBe(true);
    expect(re('names_pga_unprompted').test('Your numbers are against the PGA Tour.')).toBe(true);
    const explained =
      'Nothing is wrong with the numbers. Strokes gained here is measured against the Tour benchmark, and Tour players are the best in the world, so a college player is expected to be negative in most parts of the game. Read where each player gives up the most, and how they stand against the team in the same window.';
    for (const name of ['sign_as_verdict', 'estimate_as_tour_gap', 'names_pga_unprompted', 'negative_sg_called_bad', 'tour_figure_from_memory', 'label']) expect(re(name).test(explained), name).toBe(false);
    // The understanding has its own questions, for a coach and for a player.
    const ids = questions.map((q) => q.id);
    for (const id of ['sg-why-all-negative', 'sg-is-minus-two-bad', 'sg-best-putter-all-negative', 'sg-why-tour', 'sg-womens-benchmark', 'sg-what-it-is-not', 'sg-estimate-limits', 'sg-player-what-my-number-means', 'sg-player-everything-negative']) expect(ids).toContain(id);
  });

  describe('the writing rules, held against every answer', () => {
    const guard = (name: string) => questions[0]!.forbid.find((f) => f.pattern === name)!.re;
    const fails = (answer: string) => EVAL_GLOBAL_FORBID.filter((name) => guard(name).test(answer));

    it('are on every question', () => {
      expect([...EVAL_GLOBAL_FORBID].sort()).toEqual(['abbreviation', 'heading_or_table', 'names_internals', 'sample_notation', 'wrong_case']);
      for (const q of questions) for (const name of EVAL_GLOBAL_FORBID) expect(q.forbid.filter((f) => f.pattern === name).length, `${q.id}: ${name}`).toBe(1);
    });

    it('fail the notation the owner saw: n=4, N-4, a bracketed n', () => {
      for (const bad of ['His scoring average is 74.2 (n=4).', 'Scoring average 74.2, N-4.', 'He is at 74.2 (n 4) lately.', 'Putting: 1.8 per hole, n = 12', 'Greens 61% (10 rds).']) expect(fails(bad), bad).toContain('sample_notation');
    });

    it('fail a heading, an ALL CAPS or Title Case line, a bold label line and a table', () => {
      for (const bad of ['## Putting\nHe putts well.', 'PUTTING SUMMARY\nHe putts well.', 'Putting Summary For Eli\nHe putts well.', '**Putting**\nHe putts well.', '| Stat | Value |\n| Putts | 31 |']) expect(fails(bad), bad).toContain('heading_or_table');
    });

    it('fail an abbreviation a coach would not say aloud, wrong capitals and a tool or table name', () => {
      for (const bad of ['His SG putting is up.', 'GIR is down over his last 10 rounds.', 'His scoring avg is lower.', 'Eli vs the team on greens.', 'He is hitting it 280 yds.']) expect(fails(bad), bad).toContain('abbreviation');
      for (const bad of ['His Strokes Gained putting is up.', 'Greens In Regulation is down.', 'He is behind the tour on greens.', 'His Scoring Average dropped.', 'He gains Off the Tee.']) expect(fails(bad), bad).toContain('wrong_case');
      for (const bad of ['I read get_player_stats for him.', 'From golf_rounds, he has ten rounds.']) expect(fails(bad), bad).toContain('names_internals');
    });

    it('pass two or three plain sentences with the sample in words', () => {
      const good =
        'Eli is putting a little better than the team: his strokes gained putting over his last 10 rounds is ahead of the team average for the same rounds. Most of it comes from short range, where he has holed 38 of 41 from inside 5 feet. His three-putts are the place to look, and that is first-putt speed from long range.';
      expect(fails(good)).toEqual([]);
      expect(sentenceCount(good)).toBe(3);
      const writing = questions.filter((q) => q.area === 'writing');
      expect(writing.length).toBeGreaterThanOrEqual(4);
      for (const q of writing) expect(q.style?.max_sentences, q.id).toBeGreaterThan(0);
      const putting = writing.find((q) => q.id === 'write-how-is-he-putting')!;
      for (const f of putting.facts) expect(f.re.test(good), f.label).toBe(true);
      expect(sentenceCount(good)).toBeLessThanOrEqual(putting.style!.max_sentences);
      // The same content as a report fails on length and on form.
      const report = '## Putting\n- SG Putting: +0.3 (n=10)\n- 3-Putts: 1.2\n- Make Rate 3-5 ft: 93%\n\nSummary: Good.\nNext Steps: Lag Drills.';
      expect(fails(report)).toEqual(expect.arrayContaining(['sample_notation', 'heading_or_table', 'abbreviation']));
      expect(sentenceCount(report)).toBeGreaterThan(putting.style!.max_sentences);
    });

    it('do not trip on the words the golf block itself uses to explain the game', () => {
      // A careful answer may use these: "Tour", "Division I", "a tour" in general, a player's name at the start of a line.
      for (const fine of ['Zero is Tour level, so a negative figure is normal for a college player.', 'There is no published figure for Division II.', 'Owen Carter leads the team in strokes gained putting over the last 10 rounds.', 'I cannot name a tour here; the figures are against the Tour benchmark.']) expect(fails(fine), fine).toEqual([]);
    });
  });
});
