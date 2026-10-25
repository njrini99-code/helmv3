import { describe, expect, it } from 'vitest';
import {
  buildPollPayload,
  decodeChoice,
  encodeChoice,
  isPollClosed,
  parsePollPayload,
  pollFallbackText,
  pollShare,
  pollVoterIds,
  pollWaiting,
  tallyPoll,
  type Poll,
} from '@/lib/golf/message-polls';
import * as M from '@/lib/golf/message-polls';

const NOW = Date.parse('2026-10-24T12:00:00Z');

const draft = (over: Partial<Parameters<typeof buildPollPayload>[0]> = {}) => ({
  question: 'Which van?',
  options: ['Van A', 'Van B', ''],
  multi: false,
  closesAt: null,
  ...over,
});

const poll = (over: Partial<Poll> = {}): Poll => ({
  question: 'Which days work?',
  options: [
    { id: 'o1', label: 'Tue' },
    { id: 'o2', label: 'Wed' },
    { id: 'o3', label: 'Thu' },
  ],
  multi: false,
  closesAt: null,
  closedAt: null,
  ...over,
});

describe('buildPollPayload', () => {
  it('drops the spare empty row and numbers the options', () => {
    const built = buildPollPayload(draft(), NOW);
    expect(built).toEqual({
      ok: true,
      payload: {
        v: 1,
        question: 'Which van?',
        options: [
          { id: 'o1', label: 'Van A' },
          { id: 'o2', label: 'Van B' },
        ],
        multi: false,
        closes_at: null,
        closed_at: null,
      },
    });
  });

  it('collapses spaces in the question and labels', () => {
    const built = buildPollPayload(draft({ question: '  Which   van? ', options: [' Van  A', 'Van B'] }), NOW);
    expect(built.ok && built.payload.question).toBe('Which van?');
    expect(built.ok && built.payload.options[0]?.label).toBe('Van A');
  });

  it('names what is wrong', () => {
    expect(buildPollPayload(draft({ question: '   ' }), NOW)).toEqual({ ok: false, problem: 'question' });
    expect(buildPollPayload(draft({ question: 'x'.repeat(141) }), NOW)).toEqual({ ok: false, problem: 'question' });
    expect(buildPollPayload(draft({ options: ['Only one'] }), NOW)).toEqual({ ok: false, problem: 'options' });
    expect(buildPollPayload(draft({ options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }), NOW)).toEqual({ ok: false, problem: 'options' });
    expect(buildPollPayload(draft({ options: ['a', 'x'.repeat(61)] }), NOW)).toEqual({ ok: false, problem: 'options' });
    expect(buildPollPayload(draft({ options: ['Van A', 'van  a'] }), NOW)).toEqual({ ok: false, problem: 'duplicate' });
    expect(buildPollPayload(draft({ closesAt: '2026-10-24T11:59:00Z' }), NOW)).toEqual({ ok: false, problem: 'closes' });
    expect(buildPollPayload(draft({ closesAt: 'tomorrow' }), NOW)).toEqual({ ok: false, problem: 'closes' });
  });

  it('keeps a future end time as ISO', () => {
    const built = buildPollPayload(draft({ closesAt: '2026-10-25T12:00:00Z', multi: true }), NOW);
    expect(built.ok && built.payload.closes_at).toBe('2026-10-25T12:00:00.000Z');
    expect(built.ok && built.payload.multi).toBe(true);
  });
});

describe('parsePollPayload', () => {
  it('reads back what buildPollPayload wrote', () => {
    const built = buildPollPayload(draft({ closesAt: '2026-10-25T12:00:00Z' }), NOW);
    if (!built.ok) throw new Error('draft should build');
    expect(parsePollPayload(built.payload)).toEqual({
      question: 'Which van?',
      options: [
        { id: 'o1', label: 'Van A' },
        { id: 'o2', label: 'Van B' },
      ],
      multi: false,
      closesAt: '2026-10-25T12:00:00.000Z',
      closedAt: null,
    });
  });

  it('refuses anything it cannot draw honestly', () => {
    const good = { v: 1, question: 'Q', options: [{ id: 'o1', label: 'A' }, { id: 'o2', label: 'B' }] };
    expect(parsePollPayload(null)).toBeNull();
    expect(parsePollPayload('poll')).toBeNull();
    expect(parsePollPayload({ ...good, v: 2 })).toBeNull();
    expect(parsePollPayload({ ...good, question: '' })).toBeNull();
    expect(parsePollPayload({ ...good, options: [{ id: 'o1', label: 'A' }] })).toBeNull();
    expect(parsePollPayload({ ...good, options: [{ id: 'o1', label: 'A' }, { id: 'o1', label: 'B' }] })).toBeNull();
    expect(parsePollPayload({ ...good, options: [{ id: 'o1', label: 'A' }, { id: 'x9', label: 'B' }] })).toBeNull();
    expect(parsePollPayload({ ...good, options: [{ id: 'o1', label: 'A' }, null] })).toBeNull();
    expect(parsePollPayload(good)).not.toBeNull();
  });

  it('treats a bad date as no date', () => {
    const parsed = parsePollPayload({ v: 1, question: 'Q', options: [{ id: 'o1', label: 'A' }, { id: 'o2', label: 'B' }], closes_at: 'soon' });
    expect(parsed?.closesAt).toBeNull();
  });
});

describe('pollFallbackText', () => {
  it('numbers the options for readers that only see content', () => {
    expect(pollFallbackText({ question: 'Which van?', options: [{ id: 'o1', label: 'Van A' }, { id: 'o2', label: 'Van B' }] })).toBe(
      'Poll: Which van?\n1. Van A\n2. Van B\nVote in GolfHelm.',
    );
  });
});

describe('encodeChoice and decodeChoice', () => {
  it('keeps option order and refuses two picks on a one-answer poll', () => {
    expect(encodeChoice(poll(), ['o2'])).toBe('o2');
    expect(encodeChoice(poll(), ['o2', 'o1'])).toBeNull();
    expect(encodeChoice(poll({ multi: true }), ['o3', 'o1'])).toBe('o1,o3');
    expect(encodeChoice(poll(), ['o9'])).toBeNull();
    expect(encodeChoice(poll(), [])).toBeNull();
  });

  it('ignores unknown ids and trims a one-answer poll to one', () => {
    expect(decodeChoice(poll({ multi: true }), 'o3,o9,o1')).toEqual(['o1', 'o3']);
    expect(decodeChoice(poll(), 'o2,o3')).toEqual(['o2']);
    expect(decodeChoice(poll(), 'nope')).toEqual([]);
  });
});

describe('tallyPoll', () => {
  const rows = [
    { message_id: 'm1', user_id: 'me', choice: 'o1,o2' },
    { message_id: 'm1', user_id: 'ana', choice: 'o2' },
    { message_id: 'm1', user_id: 'ben', choice: 'o2,o3' },
    { message_id: 'm1', user_id: 'ben', choice: 'o1' },
    { message_id: 'm2', user_id: 'cal', choice: 'o1' },
    { message_id: 'm1', user_id: 'dee', choice: 'o9' },
  ];

  it('counts each person once and only for this poll', () => {
    const t = tallyPoll(poll({ multi: true }), rows, 'm1', 'me');
    expect(t.counts).toEqual({ o1: 1, o2: 3, o3: 1 });
    expect(t.voters).toEqual({ o1: ['me'], o2: ['me', 'ana', 'ben'], o3: ['ben'] });
    expect(t.voterCount).toBe(3);
    expect(t.mine).toEqual(['o1', 'o2']);
    expect(t.leaders).toEqual(['o2']);
  });

  it('shares bars by voters, not votes', () => {
    const t = tallyPoll(poll({ multi: true }), rows, 'm1', 'me');
    expect(pollShare(t, 'o2')).toBe(1);
    expect(pollShare(t, 'o1')).toBeCloseTo(1 / 3);
  });

  it('has no leader and no share before anyone votes', () => {
    const t = tallyPoll(poll(), [], 'm1', 'me');
    expect(t.leaders).toEqual([]);
    expect(t.voterCount).toBe(0);
    expect(pollShare(t, 'o1')).toBe(0);
  });

  it('lets ties share the lead', () => {
    const t = tallyPoll(poll(), [
      { message_id: 'm1', user_id: 'a', choice: 'o1' },
      { message_id: 'm1', user_id: 'b', choice: 'o3' },
    ], 'm1', 'me');
    expect(t.leaders).toEqual(['o1', 'o3']);
  });

  it('lists who has and has not voted', () => {
    const t = tallyPoll(poll({ multi: true }), rows, 'm1', 'me');
    expect(pollVoterIds(t).sort()).toEqual(['ana', 'ben', 'me']);
    expect(pollWaiting(t, ['me', 'ana', 'ben', 'cal', 'dee'])).toEqual(['cal', 'dee']);
  });
});

describe('isPollClosed', () => {
  it('closes early, at its end time, or never', () => {
    expect(isPollClosed(poll(), NOW)).toBe(false);
    expect(isPollClosed(poll({ closedAt: '2026-10-24T11:00:00Z' }), NOW)).toBe(true);
    expect(isPollClosed(poll({ closesAt: '2026-10-24T12:00:00Z' }), NOW)).toBe(true);
    expect(isPollClosed(poll({ closesAt: '2026-10-24T12:00:01Z' }), NOW)).toBe(false);
  });
});

describe('follow-up rules (P-2 0.3)', () => {
  const p = { v: 1 as const, question: 'Which van?', options: [{ id: 'o1', label: 'Van A' }, { id: 'o2', label: 'Van B' }], multi: false, closes_at: null, closed_at: null };
  it('caps the end at thirty days', () => {
    const now = Date.parse('2026-10-24T15:00:00Z');
    expect(M.buildPollPayload({ question: 'Q?', options: ['A', 'B'], multi: false, closesAt: new Date(now + 31 * 86_400_000).toISOString() }, now)).toEqual({ ok: false, problem: 'closes_far' });
    expect(M.buildPollPayload({ question: 'Q?', options: ['A', 'B'], multi: false, closesAt: new Date(now + 29 * 86_400_000).toISOString() }, now).ok).toBe(true);
  });
  it('tells a poll copy from a typed message that starts "Poll: "', () => {
    expect(M.isPollFallbackText(M.pollFallbackText(p))).toBe(true);
    expect(M.isPollFallbackText('Poll: who is driving?\nI can take four')).toBe(false);
    expect(M.isPollFallbackText('Poll: Q\n1. A\nVote in GolfHelm.')).toBe(false);
  });
  it('reads a poll hit as one line, and drops a hit only in the footer', () => {
    const many = M.pollFallbackText({ question: 'Dinner?', options: ['Tacos', 'Pizza', 'Sushi', 'Thai', 'BBQ'].map((label, i) => ({ id: `o${i + 1}`, label })) });
    expect(M.pollSearchSnippet(many)).toBe('Poll: Dinner? · Tacos, Pizza, Sushi and 2 more');
    expect(M.pollHitOnlyInFooter(many, 'golfhelm')).toBe(true);
    expect(M.pollHitOnlyInFooter(many, 'pizza')).toBe(false);
  });
  it('states and the eligible count', () => {
    const poll = M.parsePollPayload(p)!;
    expect(M.pollState(poll, Date.now())).toBe('open');
    expect(M.pollState({ ...poll, closesAt: '2020-01-01T00:00:00Z' }, Date.now())).toBe('ended');
    expect(M.pollState({ ...poll, closedAt: '2020-01-01T00:00:00Z', closesAt: '2020-01-01T00:00:00Z' }, Date.now())).toBe('closed');
    const tally = M.tallyPoll(poll, [{ message_id: 'm', user_id: 'gone', choice: 'o1' }], 'm', 'me');
    expect(M.pollEligibleCount(tally, ['me', 'ana'])).toBe(3);
  });
  it('re-checks the end in chunks of at most six hours (D13)', () => {
    const now = Date.parse('2026-10-01T12:00:00Z');
    expect(M.nextPollCheckDelay(null, now)).toBeNull();
    expect(M.nextPollCheckDelay('2026-10-01T11:00:00Z', now)).toBeNull();
    expect(M.nextPollCheckDelay('2026-10-01T12:10:00Z', now)).toBe(10 * 60 * 1000 + 50);
    expect(M.nextPollCheckDelay('2026-10-30T12:00:00Z', now)).toBe(M.POLL_TIMER_CHUNK_MS);
    expect(M.POLL_TIMER_CHUNK_MS).toBe(6 * 60 * 60 * 1000);
  });
});

describe('the custom end, on the team clock (P-2 4.4.1)', () => {
  it('reads a wall time in the team zone, not the device one', () => {
    expect(M.zonedWallTimeToInstant('2026-10-30', '21:00', 'America/New_York')).toEqual({ at: '2026-10-31T01:00:00.000Z', shifted: false });
    expect(M.zonedWallTimeToInstant('2026-10-30', '21:00', 'America/Los_Angeles')!.at).toBe('2026-10-31T04:00:00.000Z');
    expect(M.zonedWallTimeToInstant('2026-13-01', '21:00', 'America/New_York')).toBeNull();
  });

  it('moves a spring-forward gap forward and takes the first of a repeated fall-back time', () => {
    // 2027-03-14 2:30 AM does not exist in New York: 3:30 AM EDT.
    expect(M.zonedWallTimeToInstant('2027-03-14', '02:30', 'America/New_York')).toEqual({ at: '2027-03-14T07:30:00.000Z', shifted: true });
    // 2026-11-01 1:30 AM happens twice: the first is EDT (05:30Z).
    expect(M.zonedWallTimeToInstant('2026-11-01', '01:30', 'America/New_York')).toEqual({ at: '2026-11-01T05:30:00.000Z', shifted: false });
  });

  it('defaults to tonight at 9 before 8 PM on the team clock, else tomorrow', () => {
    expect(M.defaultCustomEnd(Date.parse('2026-10-30T22:00:00Z'), 'America/New_York')).toEqual({ date: '2026-10-30', time: '21:00' });
    expect(M.defaultCustomEnd(Date.parse('2026-10-31T00:30:00Z'), 'America/New_York')).toEqual({ date: '2026-10-31', time: '21:00' });
  });

  it('quick start fills four polls, Pick a time with placeholders and a day', () => {
    expect(M.POLL_SUGGESTIONS.map((s) => s.chip)).toEqual(['Which van?', 'Can you make it?', 'Which days work?', 'Pick a time']);
    expect(M.POLL_SUGGESTIONS[3]).toMatchObject({ options: ['', ''], placeholders: ['First time', 'Second time'], ends: '1d' });
  });
});
