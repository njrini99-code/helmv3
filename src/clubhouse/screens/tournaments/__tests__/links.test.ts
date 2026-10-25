import { describe, expect, it } from 'vitest';
import {
  dayDiff,
  highConfidence,
  linkConfidence,
  linkRowParts,
  missingLinks,
  missingLinksText,
  shortDay,
  suggestLinks,
  type LinkCandidateRound,
  type LinkEventRound,
} from '../links';

const OAK = 'course-oakmont-north';
const ELM = 'course-elm';

const ev = (n: number, date: string, over: Partial<LinkEventRound> = {}): LinkEventRound => ({
  roundEventId: `oak-r${n}`,
  tournamentId: 'oak',
  tournamentName: 'Oakmont Invitational',
  roundNumber: n,
  date,
  courseId: OAK,
  courseName: 'Oakmont North',
  ...over,
});

// Oakmont: a 36-hole day on Oct 17 (R1, R2), then R3 on Oct 18.
const OAKMONT = [ev(1, '2026-10-17'), ev(2, '2026-10-17'), ev(3, '2026-10-18')];

let seq = 0;
const cand = (over: Partial<LinkCandidateRound> = {}): LinkCandidateRound => {
  seq += 1;
  return { id: `g${seq}`, playerId: 'theo', playerName: 'Theo', date: '2026-10-18', courseId: OAK, courseName: 'Oakmont North', score: 72, roundType: 'tournament', ...over };
};

describe('link confidence levels', () => {
  it('same date and same course is High', () => {
    expect(linkConfidence({ date: '2026-10-18', courseId: OAK }, { date: '2026-10-18', courseId: OAK })).toBe('high');
  });

  it('same date with a different or unknown course is Medium', () => {
    expect(linkConfidence({ date: '2026-10-18', courseId: ELM }, { date: '2026-10-18', courseId: OAK })).toBe('medium');
    expect(linkConfidence({ date: '2026-10-18', courseId: null }, { date: '2026-10-18', courseId: OAK })).toBe('medium');
    expect(linkConfidence({ date: '2026-10-18', courseId: null }, { date: '2026-10-18', courseId: null })).toBe('medium');
  });

  it('a day either side is Low, whatever the course', () => {
    expect(linkConfidence({ date: '2026-10-19', courseId: OAK }, { date: '2026-10-18', courseId: OAK })).toBe('low');
    expect(linkConfidence({ date: '2026-10-17', courseId: ELM }, { date: '2026-10-18', courseId: OAK })).toBe('low');
  });

  it('two days apart, or a date that is not a date, is no suggestion', () => {
    expect(linkConfidence({ date: '2026-10-20', courseId: OAK }, { date: '2026-10-18', courseId: OAK })).toBeNull();
    expect(linkConfidence({ date: 'Oct 18', courseId: OAK }, { date: '2026-10-18', courseId: OAK })).toBeNull();
  });

  it('counts calendar days across a month end and a daylight-saving change', () => {
    expect(dayDiff('2026-10-31', '2026-11-01')).toBe(1);
    expect(dayDiff('2026-11-01', '2026-11-02')).toBe(1); // US clocks change on Nov 1 2026
    expect(dayDiff('2026-03-07', '2026-03-09')).toBe(2);
    expect(dayDiff('2026-13-01', '2026-10-01')).not.toBe(0);
    expect(dayDiff('', '2026-10-01')).toBeNull();
  });
});

describe('suggestLinks', () => {
  it('suggests the High match and lists the rest as alternatives', () => {
    const [s] = suggestLinks([cand()], OAKMONT);
    expect(s?.match).toMatchObject({ confidence: 'high', days: 0, eventRound: { roundEventId: 'oak-r3' } });
    expect(s?.alternatives.map((m) => [m.eventRound.roundEventId, m.confidence])).toEqual([
      ['oak-r1', 'low'],
      ['oak-r2', 'low'],
    ]);
    expect(s?.ambiguous).toBe(false);
  });

  it('only tournament rounds are candidates; linked and dismissed rounds are left out', () => {
    const qualifier = cand({ roundType: 'qualifier' });
    const practice = cand({ roundType: 'practice' });
    const untyped = cand({ roundType: null });
    const linked = cand();
    const dismissed = cand();
    const open = cand();
    const out = suggestLinks([qualifier, practice, untyped, linked, dismissed, open], OAKMONT, { linkedRoundIds: [linked.id], dismissedRoundIds: new Set([dismissed.id]) });
    expect(out.map((s) => s.round.id)).toEqual([open.id]);
  });

  it('a round with nothing within a day gets no suggestion', () => {
    const [s] = suggestLinks([cand({ date: '2026-09-01' })], OAKMONT);
    expect(s).toMatchObject({ match: null, alternatives: [], ambiguous: false });
  });

  it('never suggests an event round the player already has a round for', () => {
    const [s] = suggestLinks([cand()], OAKMONT, { taken: [{ playerId: 'theo', roundEventId: 'oak-r3' }] });
    expect(s?.match?.eventRound.roundEventId).toBe('oak-r1');
    expect(s?.match?.confidence).toBe('low');
    const [other] = suggestLinks([cand({ playerId: 'sofia' })], OAKMONT, { taken: [{ playerId: 'theo', roundEventId: 'oak-r3' }] });
    expect(other?.match?.eventRound.roundEventId).toBe('oak-r3');
  });

  it('one round on a 36-hole day fits R1 and R2 equally: ambiguous, never bulk linked', () => {
    const [s] = suggestLinks([cand({ date: '2026-10-17' })], OAKMONT);
    expect(s?.match?.eventRound.roundEventId).toBe('oak-r1');
    expect(s?.ambiguous).toBe(true);
    expect(highConfidence(suggestLinks([cand({ date: '2026-10-17' })], OAKMONT))).toEqual([]);
  });

  it('two rounds on a 36-hole day with start times pair with R1 and R2 in start order', () => {
    const pm = cand({ date: '2026-10-17', score: 75, startedAt: '2026-10-17T13:05:00Z' });
    const am = cand({ date: '2026-10-17', score: 71, startedAt: '2026-10-17T07:40:00Z' });
    const out = suggestLinks([pm, am], OAKMONT);
    expect(out.map((s) => [s.round.score, s.match?.eventRound.roundNumber, s.ambiguous])).toEqual([
      [75, 2, false],
      [71, 1, false],
    ]);
    expect(out[0]?.alternatives.map((m) => m.eventRound.roundEventId)).toEqual(['oak-r1', 'oak-r3']);
    expect(highConfidence(out)).toHaveLength(2);
  });

  it('two rounds on a 36-hole day without start times stay ambiguous', () => {
    const out = suggestLinks([cand({ date: '2026-10-17' }), cand({ date: '2026-10-17' })], OAKMONT);
    expect(out.every((s) => s.ambiguous)).toBe(true);
  });

  it('three rounds on a two-round day cannot be paired and stay ambiguous', () => {
    const at = (t: string) => cand({ date: '2026-10-17', startedAt: `2026-10-17T${t}:00Z` });
    const out = suggestLinks([at('07:00'), at('12:00'), at('16:00')], OAKMONT);
    expect(out.every((s) => s.ambiguous)).toBe(true);
  });

  it('two of a player’s rounds wanting one event round are both ambiguous (a duplicate round)', () => {
    const out = suggestLinks([cand(), cand()], OAKMONT);
    expect(out.map((s) => [s.match?.eventRound.roundEventId, s.ambiguous])).toEqual([
      ['oak-r3', true],
      ['oak-r3', true],
    ]);
  });

  it('a different course on the day is Medium and is not bulk linked', () => {
    const out = suggestLinks([cand({ courseId: ELM })], OAKMONT);
    expect(out[0]?.match?.confidence).toBe('medium');
    expect(highConfidence(out)).toEqual([]);
  });

  it('prefers the nearer date, then the lower round number', () => {
    const events = [ev(1, '2026-10-17', { courseId: ELM }), ev(2, '2026-10-19', { courseId: ELM, roundEventId: 'oak-r2' })];
    const [s] = suggestLinks([cand({ date: '2026-10-18' })], events);
    expect(s?.match?.eventRound.roundEventId).toBe('oak-r1');
    expect(s?.ambiguous).toBe(true);
  });
});

describe('inbox copy', () => {
  it('builds the row as two parts; the screen draws the arrow', () => {
    const [s] = suggestLinks([cand({ playerName: 'Theo', score: 72, date: '2026-10-18' })], OAKMONT);
    expect(s && linkRowParts(s)).toEqual({ round: 'Theo · 72 · Oct 18 · Oakmont North', target: 'Oakmont Invitational R3' });
    const bare = linkRowParts({ round: cand({ playerName: null, score: null, courseName: null, date: '2026-10-05' }), match: null });
    expect(bare).toEqual({ round: 'no score · Oct 5', target: null });
    for (const text of [linkRowParts(s!).round, linkRowParts(s!).target ?? '']) expect(text).not.toMatch(/[←→!]/);
  });

  it('formats a short day without a time zone', () => {
    expect(shortDay('2026-01-01')).toBe('Jan 1');
    expect(shortDay('2026-12-31')).toBe('Dec 31');
    expect(shortDay('not a date')).toBe('not a date');
  });

  it('names lineup players with no round linked for a round', () => {
    expect(missingLinks(['ava', 'sofia', 'theo'], [{ playerId: 'ava' }])).toEqual(['sofia', 'theo']);
    expect(missingLinksText(1, 2)).toBe('1 lineup player has no round linked for R2');
    expect(missingLinksText(2, 2)).toBe('2 lineup players have no round linked for R2');
    expect(missingLinksText(0, 2)).toBeNull();
  });
});
