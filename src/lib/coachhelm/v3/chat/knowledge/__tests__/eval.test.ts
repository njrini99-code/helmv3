import { describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../../context';
import type { PlayerChatContext } from '../../engine/tool';
import { toolsFor } from '../../registry';
import { FLAGGED_READERS } from '../data-map.source';
import { EVAL_PATTERN_NAMES, golfSenseQuestions } from '../eval';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => false }));

const coach: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 't1', team_name: 'Rini University', timezone: 'America/New_York', roster: [] };
const player: PlayerChatContext = { ...coach, player_id: 'p1' };
const questions = golfSenseQuestions();
const AREAS = ['strokes_gained', 'scoring', 'ball_striking', 'short_game', 'putting', 'mistakes', 'relations', 'college', 'courses', 'windows', 'action', 'caution', 'limits', 'data'];

describe('the golf-sense eval set', () => {
  it('has 40 to 60 questions with unique ids, for a coach and for a player', () => {
    expect(questions.length).toBeGreaterThanOrEqual(40);
    expect(questions.length).toBeLessThanOrEqual(60);
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
  });
});
