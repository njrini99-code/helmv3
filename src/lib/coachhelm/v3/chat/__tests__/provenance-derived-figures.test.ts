import { describe, expect, it } from 'vitest';
import { auditNumericClaims, coachRequestedSpans, collectEnvelopeDates, collectEnvelopeNumbers } from '../provenance';
import type { Measurement, ToolEnvelope } from '../provenance';

// Figures an honest answer states that no tool returns as such, found by replaying the staging turns the numeric audit
// withheld (golf_coachhelm_chat_messages, status 'failed', 2026-11-07) against the evidence stored with them. Each case
// below is one of those shapes; each also has the near miss that must still be caught.

const TZ = 'America/New_York';
const NOW = '2026-11-08T02:15:22.213Z';
const team = { kind: 'team' as const, id: 't1', label: 'Demo University Golf' };
const player = (id: string, label: string) => ({ kind: 'player' as const, id, label });

function m(metric_id: string, value: number, over: Partial<Measurement> = {}): Measurement {
  return {
    metric_id,
    metric_label: metric_id,
    unit: 'strokes',
    value,
    entity: team,
    window_start: '2026-06-17',
    window_end: '2026-10-21',
    sample_size: 12,
    sample_unit: 'rounds',
    as_of: NOW,
    coverage: 'complete',
    coverage_note: null,
    source: 'rounds',
    method: 'test',
    denominator: null,
    benchmark: null,
    direction: 'higher_better',
    ...over,
  };
}

const envelope = (over: Partial<ToolEnvelope>): ToolEnvelope => ({ summary: 'x', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: NOW, ...over });

const audit = (text: string, envelopes: ToolEnvelope[], options: Parameters<typeof auditNumericClaims>[6] = {}) =>
  auditNumericClaims(
    text,
    envelopes.flatMap((e) => e.measurements),
    envelopes.flatMap((e) => e.series),
    envelopes.flatMap((e) => collectEnvelopeNumbers(e)),
    envelopes.flatMap((e) => collectEnvelopeDates(e, TZ)),
    TZ,
    options,
  ).map((c) => c.text);

describe('the mean of ranked players is a figure the evidence supports', () => {
  // The model averaged seven ranked approach values (one repeated) and wrote "team average roughly -2.43".
  const ranking = envelope({
    measurements: [-1.54, -1.54, -2.03, -2.44, -2.68, -2.97, -3.83].map((v, i) => m('sg_approach', v, { entity: player(`p${i}`, `Player ${i}`) })),
  });
  it('accepts the mean of the listed values', () => {
    expect(audit('Team average approach is roughly -2.43 strokes per round.', [ranking])).toEqual([]);
    expect(audit('The team averages -2.43 strokes gained approach.', [ranking])).toEqual([]);
  });
  it('still rejects a figure that is not their mean', () => {
    expect(audit('Team average approach is -2.9 strokes per round.', [ranking])).toEqual(['-2.9']);
  });
  it('does not let one metric’s mean stand for another', () => {
    const putting = envelope({ measurements: [m('sg_putting', 1.1), m('sg_putting', 1.3)] });
    expect(audit('Team approach averages 1.2 strokes gained approach.', [putting])).toEqual(['1.2']);
  });
});

describe('the count behind a rate is the rate times its denominator', () => {
  const gir = envelope({
    measurements: [m('gir_pct', 88.9, { unit: 'percent', entity: player('p1', 'Dylan Olinger'), sample_size: 54, sample_unit: 'holes', denominator: 54 })],
  });
  it('accepts 48 of 54 for 88.9%', () => {
    expect(audit('Dylan Olinger hit 88.9% of greens (48/54 holes).', [gir], { players: [{ id: 'p1', name: 'Dylan Olinger' }] })).toEqual([]);
  });
  it('rejects a count the rate does not give', () => {
    expect(audit('Dylan Olinger hit 88.9% of greens (41/54 holes).', [gir], { players: [{ id: 'p1', name: 'Dylan Olinger' }] })).toEqual(['41']);
  });
});

describe('a date the read itself carries', () => {
  it('the day it was read ("as of July 23, 2026")', () => {
    const read = envelope({ as_of: '2026-07-23T14:00:00.000Z', measurements: [m('scoring_average', 73.2, { unit: 'score', as_of: '2026-07-23T14:00:00.000Z', window_start: '2026-05-28', window_end: '2026-07-10' })] });
    expect(audit('Coverage is complete as of July 23, 2026.', [read])).toEqual([]);
    expect(audit('Coverage is complete as of July 24, 2026.', [read])).toEqual(['July 24, 2026']);
  });

  it('the last day of the window it read ("through Sunday, November 15")', () => {
    const read = envelope({ summary: 'Nothing scheduled in the next 8 days.', coverage: 'empty', detail: { events: [], window: { from: '2026-11-07', to: '2026-11-15', days: 8 } } });
    expect(audit('Nothing is on the calendar for the next eight days, through Sunday, November 15.', [read])).toEqual([]);
    expect(audit('Nothing is on the calendar through Sunday, November 22.', [read])).toEqual(['November 22']);
  });

  it('a date plus a length of time is not a date range', () => {
    // "July 10 — 15 days old" was read as July 10 to 15 and July 15 was demanded as evidence.
    const read = envelope({ detail: { rounds: [{ date: '2026-07-10', value: 1 }] } });
    expect(audit('His most recent recorded round is July 10 — 15 days old, so the read is stale.', [read])).toEqual(['15']);
    expect(audit('His most recent recorded round is July 10 — 15 days old, so the read is stale.', [envelope({ detail: { rounds: [{ date: '2026-07-10', n: 15 }] } })])).toEqual([]);
    // A real range still names both ends.
    expect(audit('He played July 10 — 15.', [read])).toEqual(['July 15']);
  });
});

describe('a span of time the coach asked about', () => {
  it('reads the spans from the coach’s words', () => {
    expect(coachRequestedSpans('How is Cole Bennett putting over the last 30 days?')).toEqual([30]);
    expect(coachRequestedSpans('compare the past 6 weeks with the 3-month view')).toEqual([6, 3]);
    expect(coachRequestedSpans('is he above 30?')).toEqual([]);
  });

  const read = envelope({ measurements: [m('sg_putting', -3.91, { entity: player('p1', 'Cole Bennett') })] });
  it('lets the answer repeat it as a span', () => {
    expect(audit('This reflects his last 15 recorded rounds, not the full last 30 calendar days.', [read], { requestedSpans: [30] })).toEqual(['15']);
    expect(audit('This is not the full last 30 days.', [read], { requestedSpans: [30] })).toEqual([]);
  });
  it('does not let it stand as a figure, or for a span nobody asked about', () => {
    expect(audit('His make rate is 30% on the last 30 days.', [read], { requestedSpans: [30] })).toEqual(['30']);
    expect(audit('This is not the full last 30 days.', [read])).toEqual(['30']);
    expect(audit('This is not the full last 45 days.', [read], { requestedSpans: [30] })).toEqual(['45']);
  });
});

describe('the average of a field a read listed round by round', () => {
  // "a strokes-gained total of +3.01 per round" over rounds of 4.21, 4.30 and 0.52.
  const rounds = envelope({
    detail: {
      player: { name: 'Hunter', player_id: 'h1' },
      rounds: [
        { date: '2026-09-08', sg_total: 0.52 },
        { date: '2026-09-08', sg_total: 4.3 },
        { date: '2026-09-06', sg_total: 4.21 },
      ],
    },
  });
  it('accepts it', () => {
    expect(audit('Hunter averaged +3.01 strokes gained a round across those three rounds.', [rounds], { players: [{ id: 'h1', name: 'Hunter' }] })).toEqual([]);
  });
  it('rejects an average the rounds do not give', () => {
    expect(audit('Hunter averaged +3.4 strokes gained a round across those three rounds.', [rounds], { players: [{ id: 'h1', name: 'Hunter' }] })).toEqual(['3.4']);
  });
});

describe('figures in brackets belong to the names just ahead of them', () => {
  const rounds = envelope({
    measurements: [
      m('penalties_per_round', 0.84, { unit: 'count', entity: player('a', 'Braeden Gillen'), sample_size: 28 }),
      m('penalties_per_round', 1.51, { unit: 'count', entity: player('b', 'Luke Wise'), sample_size: 27 }),
      m('penalties_per_round', 2, { unit: 'count', entity: player('c', 'Kalani Centeno'), sample_size: 11 }),
    ],
  });
  const players = [
    { id: 'a', name: 'Braeden Gillen' },
    { id: 'b', name: 'Luke Wise' },
    { id: 'c', name: 'Kalani Centeno' },
  ];
  it('binds the list to every name in it', () => {
    expect(audit('Their sample is smaller than Braeden Gillen’s or Luke Wise’s (28 and 27 rounds).', [rounds], { players })).toEqual([]);
  });
  it('still rejects a figure that belongs to neither', () => {
    expect(audit('Their sample is smaller than Braeden Gillen’s or Luke Wise’s (29 and 27 rounds).', [rounds], { players })).toEqual(['29']);
  });
});

describe('a date written day first', () => {
  // Staging, 2026-11-08: "Owen Carter's approach play compared with his level, the team and the Tour" was withheld for `26`, the day in
  // "9 June to 26 September". The rest of the answer (gaps, percentile, place, holes) was grounded.
  const owen = envelope({
    measurements: [m('sg_approach', -4.16, { entity: player('o', 'Owen Carter'), window_start: '2026-06-09', window_end: '2026-09-26', sample_size: 8 })],
  });
  const say = (text: string) => audit(text, [owen], { players: [{ id: 'o', name: 'Owen Carter' }] });

  it('is checked against the window like "June 9" is', () => {
    expect(say('That window holds only 8 recorded rounds (9 June to 26 September), so it is a thin read.')).toEqual([]);
    expect(say('Over the 26th of September round, Owen Carter sat at -4.16.')).toEqual([]);
  });
  it('still flags a day-first date the evidence does not hold', () => {
    expect(say('That window holds only 8 recorded rounds (9 June to 27 November).')).toEqual(['27 November']);
    expect(say('That window holds only 8 recorded rounds (9 June to 26 September 2025).')).toEqual(['26 September 2025']);
  });
  it('does not read "may" or "march" after a number as a month', () => {
    expect(say('Owen Carter has 40 may be a thin read.')).toEqual(['40']);
  });
});

describe('the counts a query_team_data read holds', () => {
  // Staging, 2026-11-08, conversation c4236ea7: "Which rounds since September 1 had three or more three-putts?" Two reads: 25 stat
  // lines with three_putts >= 3, and 26 rounds since September 1 (23 completed, 3 in progress). The answer was exact; "the other 23
  // rounds" was the only figure no tool returned.
  const COLE = 'p-cole';
  const stat = (n: number, three: number, score: number) => ({ player: 'Cole Bennett', round_id: `stat-${'abcdefghijklmnopqrstuvwxyz'[n % 26]}${'abcdefghijklmnopqrstuvwxyz'[Math.floor(n / 26)]}`, player_id: COLE, three_putts: three, total_putts: 34, total_score: score });
  const stats = envelope({
    summary: '25 rows of round stat lines.',
    detail: { kind: 'team_data', rows: [stat(1, 3, 74), stat(2, 3, 77), ...Array.from({ length: 23 }, (_, i) => stat(i + 3, 3, 78 + (i % 6)))] },
  });
  const round = (n: number, status: string, score: number | null, date: string) => ({ id: `round-${'abcdefghijklmnopqrstuvwxyz'[n % 26]}${'abcdefghijklmnopqrstuvwxyz'[Math.floor(n / 26)]}`, player: 'Cole Bennett', player_id: COLE, status, round_date: date, round_type: 'tournament', course_name: 'Springfield Country Club', total_score: score });
  const rounds = envelope({
    summary: '26 rows of rounds.',
    detail: {
      kind: 'team_data',
      rows: [
        round(1, 'completed', 74, '2026-10-21'), round(2, 'completed', 77, '2026-10-21'), round(3, 'completed', 73, '2026-10-21'),
        ...Array.from({ length: 20 }, (_, i) => round(i + 4, 'completed', 80 + (i % 5), `2026-09-${String((i % 28) + 1).padStart(2, '0')}`)),
        ...[0, 1, 2].map((i) => round(i + 30, 'in_progress', null, '2026-10-21')),
      ],
    },
  });
  const said = [
    'Two rounds since September 1 had three or more three-putts. Both were Cole Bennett’s, on the same day.',
    '- Cole Bennett, Oct 21, Springfield Country Club, 74 with three three-putts (tournament round).',
    '- Cole Bennett, Oct 21, Springfield Country Club, 77 with three three-putts (tournament round).',
    'The other 23 rounds on the full list are all from before September 1. The 26 rounds recorded since September 1 include three Cole Bennett practice rounds still marked in progress.',
    'Cole also had a third round at Springfield that day, a 73.',
  ].join('\n');
  const everyone = [{ id: COLE, name: 'Cole Bennett' }];

  it('accepts the answer: its rows, dates, scores and counts', () => {
    expect(audit(said, [stats, rounds], { players: everyone })).toEqual([]);
  });
  it('a count of the rows left when a value is taken out is a count the read holds', () => {
    // 26 rows less 3 in progress, and 25 rows less nothing taken out.
    expect(audit('There were 23 completed rounds.', [rounds])).toEqual([]);
    expect(audit('There are 25 stat lines.', [stats])).toEqual([]);
  });
  it('still rejects a count the rows do not make', () => {
    expect(audit('The other 24 rounds on the full list are from before September 1.', [stats, rounds], { players: everyone })).toEqual(['24']);
    expect(audit('Cole Bennett has 40 rounds on the full list.', [stats, rounds], { players: everyone })).toEqual(['40']);
  });
  it('a player’s own count is theirs, not anyone else’s', () => {
    const two = envelope({ detail: { kind: 'team_data', rows: [...Array.from({ length: 14 }, (_, i) => ({ player: 'Cole Bennett', player_id: COLE, id: `a-${'abcdefghijklmnopqrstuvwxyz'[i]}` })), ...Array.from({ length: 13 }, (_, i) => ({ player: 'Owen Carter', player_id: 'p-owen', id: `b-${'abcdefghijklmnopqrstuvwxyz'[i]}` }))] } });
    const people = [{ id: COLE, name: 'Cole Bennett' }, { id: 'p-owen', name: 'Owen Carter' }];
    expect(audit('Owen Carter has 13 rounds on the list.', [two], { players: people })).toEqual([]);
    expect(audit('Owen Carter has 14 rounds on the list.', [two], { players: people })).toEqual(['14']);
  });
});

describe('"he" in a list that names several players', () => {
  // Staging, 2026-11-08, conversation 1438b916: the Owen Carter approach comparison was withheld for `-4.16`, flagged as another
  // player's. "…so he is behind it by the full -4.16" followed a line that named Ethan Park and one that named Audit Testplayer
  // (who has no figure), so "he" was bound to the nearest name. It is Owen, the subject of the whole list.
  const OWEN = 'p-owen';
  const read = envelope({
    measurements: [
      m('sg_approach', -4.16, { entity: player(OWEN, 'Owen Carter'), sample_size: 8 }),
      m('sg_approach', -4.4, { entity: player('p-ethan', 'Ethan Park'), sample_size: 9 }),
      m('sg_approach', -2.33, { entity: team, sample_size: 7 }),
    ],
  });
  const people = [{ id: OWEN, name: 'Owen Carter' }, { id: 'p-ethan', name: 'Ethan Park' }, { id: 'p-audit', name: 'Audit Testplayer' }];
  const say = (tour: string) =>
    audit(
      [
        'Owen’s approach play is well behind the team and the Tour. His strokes gained on approach is -4.16 per round over his last ten rounds.',
        '',
        '- **Level:** There is no Division I figure for strokes gained, so I can’t place him against his level.',
        '- **Team:** The team average is -2.33 per round, and Owen is below it. Only Ethan Park is lower, at -4.40. Audit Testplayer has no approach strokes gained in this window.',
        `- **Tour:** ${tour}`,
      ].join('\n'),
      [read],
      { players: people },
    );

  it('accepts the answer: the pronoun reaches back over the list to its subject', () => {
    expect(say('The Tour baseline is 0, so he is behind it by the full -4.16.')).toEqual([]);
  });
  it('still rejects a figure that belongs to none of the players the list names', () => {
    expect(say('The Tour baseline is 0, so he is behind it by the full -9.99.')).toEqual(['-9.99']);
  });
  it('still rejects a figure that is another player’s when the sentence names its subject', () => {
    expect(say('The Tour baseline is 0, so Audit Testplayer is behind it by the full -4.16.')).toEqual(['-4.16']);
  });
  it('does not reach past three named sentences', () => {
    const far = audit(
      ['Owen Carter has a lot to work on.', 'Ethan Park is lower than the team, at -4.40.', 'Audit Testplayer has none.', 'Ethan Park is the one to watch.', 'He is behind the Tour by -4.16.'].join('\n'),
      [read],
      { players: people },
    );
    expect(far).toEqual(['-4.16']);
  });
});
