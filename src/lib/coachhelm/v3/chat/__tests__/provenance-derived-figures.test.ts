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
