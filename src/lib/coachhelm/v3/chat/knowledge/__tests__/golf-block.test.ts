import { describe, expect, it } from 'vitest';
import { APP_DEFINITIONS, golfBlock } from '../golf';
import { knowledgeBlocks } from '../index';
import { REFERENCE_TOPICS } from '../reference-topics';

const SURFACES = ['ask', 'quick_chat', 'practice_helper', 'player'] as const;
const tokens = (text: string) => Math.round(text.length / 4);

describe('the golf block of the cached prompt', () => {
  it('is the same bytes on every call, and the same for every coach surface (one cache entry)', () => {
    for (const s of SURFACES) expect(golfBlock(s)).toBe(golfBlock(s));
    expect(golfBlock('ask')).toBe(golfBlock('quick_chat'));
    expect(golfBlock('ask')).toBe(golfBlock('practice_helper'));
    expect(golfBlock('player')).not.toBe(golfBlock('ask'));
    expect(knowledgeBlocks('ask')).toEqual(knowledgeBlocks('ask'));
  });

  it('holds nothing that changes: no year, no date but the season start, no clock time', () => {
    for (const s of SURFACES) {
      const text = golfBlock(s);
      expect(text).not.toMatch(/\b(19|20)\d\d\b/);
      expect(text).not.toMatch(/\b\d{1,2}:\d\d\b/);
      expect(text.replace(/1 August/g, '')).not.toMatch(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/);
    }
  });

  /**
   * The guard against a number from memory. The block may use a handful of small whole numbers that are definitions, not
   * figures (a par, a round's holes, the windows' names, the season's first day, three rounds for strokes gained). Anything
   * that looks like a statistic fails: a decimal, a percentage, a signed number, a number with a unit, or any other integer.
   */
  it('states no figure: no decimal, percentage, signed number, measured quantity or number outside the definitions', () => {
    // 1 to 5 also number the steps of "From a number to something to do".
    const DEFINITIONS = new Set(['1', '2', '3', '4', '5', '9', '10', '18', '20']);
    for (const s of SURFACES) {
      const text = golfBlock(s);
      expect(text).not.toMatch(/\d[.,]\d/);
      expect(text).not.toMatch(/\d\s*(%|percent|per cent)/i);
      // A sign in front of a number (not the hyphen of "last-10" or "18-hole").
      expect(text).not.toMatch(/(?<![A-Za-z0-9])[+\u2212-]\s?\d/);
      expect(text).not.toMatch(/\d\s*(ft|feet|foot|yards?|yds?|mph|strokes?|putts?|shots?|birdies|points?)\b/i);
      expect(text).not.toMatch(/\b(under|over|above|below|around|about|roughly|at least|more than|less than)\s+\d/i);
      const numbers = text.match(/\d+/g) ?? [];
      expect(numbers.filter((n) => !DEFINITIONS.has(n))).toEqual([]);
    }
  });

  it('never names a Tour or level figure, a named player, team or course', () => {
    for (const s of SURFACES) {
      const text = golfBlock(s);
      expect(text).not.toMatch(/Tour average is|Tour averages \d|averages? about|typically (score|shoot|hit|make)s?/i);
      expect(text).not.toMatch(/Rini|Eli |Brandt|University|Augusta|Pebble/);
    }
  });

  it('teaches the two directions that are easy to get backwards, in words', () => {
    const text = golfBlock('ask');
    expect(text).toMatch(/lower is better, and a negative to par is under par/);
    expect(text).toMatch(/zero means Tour level, and a negative figure is normal for a college player/);
    expect(text).toMatch(/Example in words: a total of minus two/);
    expect(text).toMatch(/Putts per round: lower is better, but it misleads/);
  });

  it('says what it must not do', () => {
    for (const s of SURFACES) {
      const text = golfBlock(s);
      expect(text).toMatch(/Do not explain a result by the swing or the body/);
      expect(text).toMatch(/Do not give medical advice/);
      expect(text).toMatch(/Do not promise a result/);
      expect(text).toMatch(/Do not state a Tour average, a level average or a "good" figure from memory/);
    }
    expect(golfBlock('player')).toMatch(/never compare them with a named teammate/);
  });

  it('a player is told nothing about picking a lineup or reading the team', () => {
    const text = golfBlock('player');
    expect(text).not.toMatch(/When the coach asks who should play/);
    expect(text).not.toMatch(/lay out the qualifier standing/);
    expect(text).not.toMatch(/dropped score|fourth counting score/);
    expect(text).toMatch(/Who plays is the coach's decision/);
  });

  it('names every reference topic the model can look up, and only topics that exist', () => {
    for (const s of SURFACES) for (const t of REFERENCE_TOPICS.filter((t) => t.id !== 'sources')) expect(golfBlock(s)).toContain(`${t.id} (`);
  });

  it('still contains every app definition sentence the definitions test checks against the code', () => {
    for (const [key, sentence] of Object.entries(APP_DEFINITIONS)) expect(golfBlock('ask'), key).toContain(sentence);
  });

  it('is about the size planned (characters / 4)', () => {
    const coach = tokens(golfBlock('ask'));
    const player = tokens(golfBlock('player'));
    console.info(`golf block: coach ${coach} tokens, player ${player} tokens (characters / 4)`);
    expect(coach).toBeGreaterThan(2_400);
    expect(coach).toBeLessThan(3_600);
    expect(player).toBeLessThan(coach);
  });
});
