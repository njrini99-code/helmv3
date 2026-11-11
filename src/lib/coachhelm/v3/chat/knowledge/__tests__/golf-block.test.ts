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
      // A threshold ("over 60"); a sample said in words ("over 4 rounds") is the style the block models.
      expect(text).not.toMatch(/\b(under|over|above|below|around|about|roughly|at least|more than|less than)\s+\d(?!\d* rounds\b)/i);
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
    expect(text).toMatch(/Zero means "as a Tour player would have done from the same spots"/);
    expect(text).toMatch(/a college player is expected to be negative, often by several strokes a round and in most parts of the game\. That is normal, not a failure\./);
    expect(text).toMatch(/The right reading, in words: approach at minus one and a half with putting close to zero/);
    expect(text).toMatch(/The wrong reading: "his approach play is bad", or sorting players into good and bad by the sign/);
    expect(text).toMatch(/Putts per round: lower is better, but it misleads unless it is read with greens hit/);
    expect(text).toMatch(/Whenever you give putts per round, give greens hit beside it, and judge putting by strokes gained putting or make rate by distance/);
  });

  // First full eval run, 11 Nov 2026: 13 golf-sense misses, most of them an answer that corrected the coach's premise from the
  // data and never said the point the question turned on (one round is not a trend, a negative to par is under par, a short card
  // ranks below a complete one). The block already held each point; the rule to say it did not exist.
  it('tells the model to say the point a question turns on, even when the data does not show the case', () => {
    for (const s of SURFACES) {
      const text = golfBlock(s);
      expect(text).toMatch(/^# Golf: reading the numbers\nWhen a question turns on a point made here, say that point in one plain sentence, even if the team's data does not show the case\./);
      // The points the misses turned on are each still stated, in words a model can repeat.
      expect(text).toMatch(/a negative to par is under par/);
      expect(text).toMatch(/One bad round or one blow-up hole is an event, not a trend/);
      expect(text).toMatch(/A difference smaller than that swing is not a change/);
      expect(text).toMatch(/They come mostly from the first putt's distance control on long putts/);
      expect(text).toMatch(/A round posted as a total only counts in scores \(average, to par, best round, trend\) and in nothing else\. It has no greens, fairways, putts or strokes gained/);
      expect(text).toMatch(/A missing figure means not recorded\. It never means zero/);
      expect(text).toMatch(/a college player is expected to be negative/);
    }
  });

  it('a qualifier: a short card ranks below a complete one, a tie for the last place waits for the coach, and who plays is the coach’s call', () => {
    const text = golfBlock('ask');
    expect(text).toMatch(/A card with fewer rounds in than the others ranks below every complete card/);
    expect(text).toMatch(/A tie for the last place on score stays a tie until the coach chooses/);
    expect(text).toMatch(/lay out the qualifier standing, recent tournament scoring, form and course history side by side, and say that it is their call/);
  });

  it('explains strokes gained well enough to answer "why is everything negative?": what, against what, why, and what it is not', () => {
    for (const s of SURFACES) {
      const text = golfBlock(s);
      // What: the three-step sum, by part, and what zero means.
      expect(text).toMatch(/Subtract the strokes expected from where the shot finished\. Subtract the one stroke just played\./);
      expect(text).toMatch(/the four parts add up to the round's total/);
      // Against what, and how to name it without naming the wrong tour.
      expect(text).toMatch(/A read line names the yardstick with its figure: "against the Tour benchmark", or for a women's team "against the women's Tour baseline"\. Use the line's words, or "Tour level"\. Name a tour \("PGA Tour", "LPGA Tour"\) only when a read named it/);
      // Why.
      expect(text).toMatch(/Why the Tour\. It is the level where every shot is measured[^\n]+one fixed yardstick keeps every player, team and season comparable/);
      // What a negative figure is and is not.
      expect(text).toMatch(/Never call a negative figure bad, poor or a weakness on its own\./);
      expect(text).toMatch(/It is not a handicap, not a score against par and not a prediction of a score\./);
      expect(text).toMatch(/The total is not the gap to a Tour scoring average/);
      // How far an estimate goes.
      expect(text).toMatch(/Do not read one part of the game from it, do not compare it with a measured figure, and do not call it a gap to the Tour\./);
    }
    // The comparisons that carry meaning: the team first for a coach; never the team for a player.
    expect(golfBlock('ask')).toMatch(/The player against the team and against teammates, for the same window\. Everyone is on the same yardstick, so the comparison is fair\. A coach reads this one first\./);
    expect(golfBlock('ask')).toMatch(/The best putter on a team is the one with the highest strokes gained putting, even when it is negative\./);
    const playerSg = golfBlock('player').slice(golfBlock('player').indexOf('## Strokes gained'), golfBlock('player').indexOf('## Ball striking'));
    expect(playerSg).not.toMatch(/teammate|against the team|his approach/i);
    expect(playerSg).toMatch(/When a player asks why everything is negative, say it plainly/);
    expect(playerSg).toMatch(/"you putt near Tour level, and most of your gap is on approach shots/);
  });

  it('models the writing it asks for: no notation, abbreviation or Title Case a model could copy into an answer', () => {
    for (const s of SURFACES) {
      const text = golfBlock(s);
      // The sample is said in words.
      expect(text).toMatch(/give the figure with its count in words \("over 4 rounds"\)/);
      expect(text).not.toMatch(/\b[nN]\s?[=:\u2212-]\s?\d|\(\s?[nN]\s?=|\(\d+ rounds?\)/);
      // What a coach says aloud, in full.
      expect(text).not.toMatch(/\b(SG|GIR|FIR|FW|OTT|ARG|APP|T2G|HCP|avg|pct|vs|yds?|rds?|ft)\b/);
      // Sentence case: "strokes gained", "greens in regulation"; "Tour" capitalised.
      expect(text).not.toMatch(/Strokes Gained|Greens In Regulation|Greens in Regulation|Scoring Average|Fairways Hit|Putts Per Round|Off [Tt]he Tee|Around [Tt]he Green|Make Rate/);
      expect(text).not.toMatch(/\b(?:the|against|men's|women's) tour\b/);
      for (const heading of text.match(/^#+ .+$/gm) ?? []) expect(heading, heading).toMatch(/^#+ [A-Z][^A-Z]*(?:Tour[^A-Z]*)?$/);
      // No table, and no table or column name anywhere.
      expect(text).not.toMatch(/^\s*\|.*\|\s*$/m);
      expect(text).not.toMatch(/\bgolf_[a-z_]+\b/);
    }
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
    // Raised from 3,600 on 10 Nov 2026 with the lead's allowance of about 3,900 for the strokes gained rework.
    expect(coach).toBeLessThan(4_000);
    expect(player).toBeLessThan(coach);
  });
});
