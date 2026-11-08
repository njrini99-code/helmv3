import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { CoachChatContext } from '../context';
import { extractCites, parseWritten, verifyCite, type Cite } from '../cites';
import { collectEnvelopeDates, collectEnvelopeNumbers, type Measurement, type ToolEnvelope } from '../provenance';
import { summariseData } from '../summarise-data';
import { computeTurnVerdict } from '../verdict';

// Per-figure citations: the model names, for each figure, the read, the measurement and whose it is; the server checks that.

const NOW = '2026-11-08T04:36:59.000Z';
const OWEN = '8091da4b-dbc9-47f3-80f1-be37c96b2c91';
const ETHAN = '8e382583-2ce6-4d15-8568-5088cf02dbd1';
const AUDIT = 'b6b87c4d-0673-4166-9f8c-44e60936a034';
const roster = [{ id: OWEN, name: 'Owen Carter' }, { id: ETHAN, name: 'Ethan Park' }, { id: AUDIT, name: 'Audit Testplayer' }];

const env = (over: Partial<ToolEnvelope> & Record<string, unknown>): ToolEnvelope => ({ summary: 'x', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: NOW, ...over }) as ToolEnvelope;

function m(metric_id: string, value: number | null, entity: Measurement['entity'], over: Record<string, unknown> = {}): Measurement {
  return { metric_id, metric_label: metric_id, unit: 'strokes', value, entity, window_start: '2026-06-09', window_end: '2026-09-26', sample_size: 8, sample_unit: 'rounds', as_of: NOW, coverage: 'complete', coverage_note: null, source: 'rounds', method: 'm', denominator: null, benchmark: null, direction: 'higher_better', ...over } as Measurement;
}
const owenEntity = { kind: 'player' as const, id: OWEN, label: 'Owen Carter' };
const ethanEntity = { kind: 'player' as const, id: ETHAN, label: 'Ethan Park' };

// The Owen Carter approach comparison (staging, 1438b916): what the three reads held.
const comparisons = (level: number | null, teamValue: number, tour: number, placeOf: number | null, pct: number | null) => [
  { kind: 'level', label: 'Division I average', value: level, place_of: level === null ? null : 71, place_percent: pct, missing_reason: level === null ? 'no college figure' : null, note: null },
  { kind: 'team', label: 'Team average', value: teamValue, place_of: placeOf, place_percent: 17, missing_reason: null, note: null },
  { kind: 'tour', label: 'PGA Tour', value: tour, place_of: null, place_percent: null, missing_reason: null, note: null },
];
const metrics = env({
  summary: '2 metrics for Owen Carter, over the newest ten rounds.',
  measurements: [
    m('sg_approach', -4.16, owenEntity, { comparisons: comparisons(null, -2.33, 0, 7, 0) }),
    m('gir_pct', 61.11, owenEntity, { unit: 'percent', sample_size: 144, sample_unit: 'holes', denominator: 144, benchmark: { value: 60, source: 'Division I average 2024', version: '2024', omitted_for_cohort: false }, comparisons: comparisons(60, 66.25, 66, 7, 36) }),
  ],
});
const ranking = env({ summary: 'Strokes gained approach across Demo University Golf, over each player’s newest ten rounds.', measurements: [m('sg_approach', -4.4, ethanEntity), m('sg_approach', -4.16, owenEntity), m('sg_approach', -2.97, { kind: 'player', id: 'p-x', label: 'Someone' })] });
const refs = new Map<string, ToolEnvelope>([['e3', metrics], ['e4', ranking]]);

const cite = (v: string, ref: string, key: string, subject: string, w?: [string, string]): Cite => ({ v, ref, key, subject, ...(w ? { w } : {}) });

describe('extracting the block', () => {
  const block = '<<<CITES>>>[{"v":"-4.16","ref":"e3","key":"sg_approach","subject":"p1"},{"v":9,"ref":"e3","key":"gir_pct","subject":"team"}]<<<END_CITES>>>';
  it('takes it out of the text and parses it, whatever sits around it', () => {
    const x = extractCites(`Owen is below the team.\n${block}`);
    expect(x.text).toBe('Owen is below the team.');
    expect(x.cites).toEqual([cite('-4.16', 'e3', 'sg_approach', 'p1'), cite('9', 'e3', 'gir_pct', 'team')]);
    expect(extractCites(`a ${block} b ${block} c`).cites).toHaveLength(4);
  });
  it('a broken block is no cites, never an error, and never left in the text', () => {
    for (const bad of ['<<<CITES>>>not json<<<END_CITES>>>', '<<<CITES>>>{"v":1}<<<END_CITES>>>', '<<<CITES>>>[{"v":1}]<<<END_CITES>>>']) {
      const x = extractCites(`Answer.${bad}`);
      expect(x.text).toBe('Answer.');
      expect(x.cites).toEqual([]);
      expect(x.invalid).toBeGreaterThan(0);
    }
    const open = extractCites('Answer.<<<CITES>>>[{"v":"-4.1');
    expect(open).toMatchObject({ text: 'Answer.', cites: [], blocks: 1 });
    expect(extractCites('Answer. <<<END_CITES>>>').text).toBe('Answer.');
  });
  it('a text with no block is untouched', () => {
    expect(extractCites('Plain answer.\n')).toMatchObject({ text: 'Plain answer.\n', cites: [], blocks: 0 });
  });
});

describe('numbers as written', () => {
  it.each([['-4.16', -4.16], ['−4.16', -4.16], ['61.11%', 61.11], ['+0.5', 0.5], ['1,200', 1200], ['23', 23]])('%s', (raw, n) => expect(parseWritten(raw)).toBe(n));
  it('is not a number', () => expect(parseWritten('about 4')).toBeNull());
});

describe('verifying one cite', () => {
  it('verified: the read holds the key for the subject, and a value of it matches', () => {
    expect(verifyCite(cite('-4.16', 'e3', 'sg_approach', OWEN), refs).status).toBe('verified');
    // As a magnitude ("lost 4.16"), at the precision it was written to, and with the window it covers.
    expect(verifyCite(cite('4.16', 'e3', 'sg_approach', OWEN), refs).status).toBe('verified');
    expect(verifyCite(cite('-4.2', 'e3', 'sg_approach', OWEN), refs).status).toBe('verified');
    expect(verifyCite(cite('-4.16', 'e3', 'sg_approach', OWEN, ['2026-06-09', '2026-09-26']), refs).status).toBe('verified');
  });
  it('the numbers beside a figure belong to its measurement: team average, level, Tour, places and the holes behind it', () => {
    for (const [v, key] of [['-2.33', 'sg_approach'], ['66.25', 'gir_pct'], ['60', 'gir_pct'], ['66', 'gir_pct'], ['36', 'gir_pct'], ['144', 'gir_pct']] as const) {
      expect(verifyCite(cite(v, 'e3', key, OWEN), refs).status, `${v} ${key}`).toBe('verified');
    }
  });
  it('mismatch: the read holds the key for the subject and says something else', () => {
    expect(verifyCite(cite('-4.16', 'e4', 'sg_approach', ETHAN), refs).status).toBe('mismatch');
    expect(verifyCite(cite('-3.5', 'e3', 'sg_approach', OWEN), refs).status).toBe('mismatch');
    expect(verifyCite(cite('-4.16', 'e3', 'sg_approach', OWEN, ['2026-01-01', '2026-09-26']), refs)).toMatchObject({ status: 'mismatch', reason: expect.stringMatching(/window/) });
  });
  it('unresolved: nothing is learned from a ref, key or subject the read does not hold, or from a value that is not a number', () => {
    expect(verifyCite(cite('-4.16', 'e9', 'sg_approach', OWEN), refs).status).toBe('unresolved');
    expect(verifyCite(cite('-4.16', 'e3', 'sg_total', OWEN), refs).status).toBe('unresolved');
    expect(verifyCite(cite('-4.16', 'e3', 'sg_approach', AUDIT), refs).status).toBe('unresolved');
    expect(verifyCite(cite('about 4', 'e3', 'sg_approach', OWEN), refs).status).toBe('unresolved');
  });
  it('a figure in a read’s detail is found by its field name and its player', () => {
    const detail = env({ detail: { player: { player_id: OWEN, name: 'Owen Carter' }, rounds: [{ date: '2026-09-26', putts: 33 }] } });
    expect(verifyCite(cite('33', 'e1', 'putts', OWEN), new Map([['e1', detail]])).status).toBe('verified');
    expect(verifyCite(cite('34', 'e1', 'putts', OWEN), new Map([['e1', detail]])).status).toBe('mismatch');
  });
});

describe('the turn’s verdict with citations', () => {
  const answer = [
    'Owen’s approach play is well behind the team and the Tour. His strokes gained on approach is -4.16 per round over his last ten rounds.',
    '',
    '- **Level:** There is no Division I figure for strokes gained, so I can’t place him against his level.',
    '- **Team:** The team average is -2.33 per round, and Owen is below it. Only Ethan Park is lower, at -4.40. Audit Testplayer has no approach strokes gained in this window.',
    '- **Tour:** The Tour baseline is 0, so he is behind it by the full -4.16.',
    '',
    'His greens in regulation are less alarming. He hit 61.11% over 144 holes in the same window. The Division I average is 60%, so he is slightly above his level there. The team average is 66.25% and the Tour figure is 66%, so he is below both.',
  ].join('\n');
  const evidenceEnvelopes = [metrics, ranking];
  const verdict = (text: string, cites?: readonly Cite[], over: Record<string, unknown> = {}) =>
    computeTurnVerdict({
      streamComplete: true,
      text,
      measurements: evidenceEnvelopes.flatMap((e) => e.measurements),
      series: [],
      detailNumbers: evidenceEnvelopes.flatMap((e) => collectEnvelopeNumbers(e)),
      detailDates: evidenceEnvelopes.flatMap((e) => collectEnvelopeDates(e, 'America/New_York')),
      timezone: 'America/New_York',
      players: roster,
      ...(cites ? { cites: { cites, evidence: refs } } : {}),
      ...over,
    });
  const owenCites = [
    cite('-4.16', 'e3', 'sg_approach', OWEN),
    cite('-2.33', 'e3', 'sg_approach', OWEN),
    cite('-4.40', 'e4', 'sg_approach', ETHAN),
    cite('61.11', 'e3', 'gir_pct', OWEN),
    cite('144', 'e3', 'gir_pct', OWEN),
    cite('60', 'e3', 'gir_pct', OWEN),
    cite('66.25', 'e3', 'gir_pct', OWEN),
    cite('66', 'e3', 'gir_pct', OWEN),
  ];

  it('the Owen Carter turn (1438b916), cited as the model would: accepted, every figure carried by a cite', () => {
    const v = verdict(answer, owenCites);
    expect(v.outcome).toBe('accepted');
    expect(v.citations).toMatchObject({ cites: 8, verified: 8, mismatched: 0, unresolved: 0, cited: 8, fallback_passed: 0 });
  });
  it('without cites, as every stored turn is, it audits exactly as before and carries no citation record', () => {
    expect(verdict(answer)).toEqual({ outcome: 'accepted' });
    expect(verdict('The team average is 66.25%.')).toEqual({ outcome: 'accepted' });
    expect(verdict('The team average is 71.4%.')).toMatchObject({ outcome: 'rejected', unsupported: [{ text: '71.4' }] });
    expect(verdict('The team average is 71.4%.')).not.toHaveProperty('citations');
  });
  it('citing Owen’s -4.16 to Ethan is rejected, even though the words read fine', () => {
    const wrong = owenCites.map((c) => (c.v === '-4.16' ? cite('-4.16', 'e4', 'sg_approach', ETHAN) : c));
    const v = verdict(answer, wrong);
    expect(v).toMatchObject({ outcome: 'rejected', reason: 'ungrounded_claims', unsupported: [{ text: '-4.16', misattributed: true }], citations: { mismatched: 1 } });
  });
  it('a figure cited to a read that says something else is rejected even when the heuristics would have passed it', () => {
    const v = verdict('The team average is 66.25% over this window.', [cite('66.25', 'e3', 'gir_pct', OWEN, ['2026-01-01', '2026-09-26'])]);
    expect(v).toMatchObject({ outcome: 'rejected', unsupported: [{ text: '66.25' }] });
  });
  it('an unresolved cite changes nothing: the figure is audited by the text, and the fallback is counted', () => {
    const v = verdict('Owen hit 61.11% of greens.', [cite('61.11', 'e8', 'gir_pct', OWEN)]);
    expect(v.outcome).toBe('accepted');
    expect(v.citations).toMatchObject({ cites: 1, unresolved: 1, verified: 0, cited: 0, fallback_passed: 1, figures: 1 });
    // And a figure no read holds is still caught.
    expect(verdict('Owen hit 71.4% of greens.', [cite('71.4', 'e8', 'gir_pct', OWEN)]).outcome).toBe('rejected');
  });
  it('a cite does not excuse a different figure in the text', () => {
    expect(verdict('Owen is at -4.16 and the Tour at -9.99.', [cite('-4.16', 'e3', 'sg_approach', OWEN)])).toMatchObject({ outcome: 'rejected', unsupported: [{ text: '-9.99' }] });
  });
});

describe('the three-putt turn (efd480a1), cited as the model would', () => {
  const COLE = 'p-cole';
  const ctx = { coach_id: 'c', user_id: 'u', team_id: 'team-1', team_name: 'Demo University Golf', timezone: 'America/New_York', roster: [{ id: COLE, name: 'Cole Bennett', first_name: 'Cole', last_name: null, graduation_year: null }] } as CoachChatContext;
  const letters = (n: number) => `${'abcdefghijklmnopqrstuvwxyz'[n % 26]}${'abcdefghijklmnopqrstuvwxyz'[Math.floor(n / 26)]}`;
  const stat = (n: number, three: number, score: number) => ({ player: 'Cole Bennett', round_id: `stat-${letters(n)}`, player_id: COLE, three_putts: three, total_putts: 34, total_score: score });
  const round = (n: number, status: string, score: number | null, date: string) => ({ id: `round-${letters(n)}`, player: 'Cole Bennett', player_id: COLE, status, round_date: date, round_type: 'tournament', course_name: 'Springfield Country Club', total_score: score });
  const stats = env({ summary: '25 rows of round stat lines.', detail: { kind: 'team_data', rows: [stat(1, 3, 74), stat(2, 3, 77), ...Array.from({ length: 23 }, (_, i) => stat(i + 3, 3, 78 + (i % 6)))] } });
  const rounds = env({
    summary: '26 rows of rounds.',
    detail: { kind: 'team_data', rows: [round(1, 'completed', 74, '2026-10-21'), round(2, 'completed', 77, '2026-10-21'), round(3, 'completed', 73, '2026-10-21'), ...Array.from({ length: 20 }, (_, i) => round(i + 4, 'completed', 80 + (i % 5), `2026-09-${String((i % 20) + 1).padStart(2, '0')}`)), ...[0, 1, 2].map((i) => round(i + 30, 'in_progress', null, '2026-10-21'))] },
  });
  const text = 'Two rounds since September 1 had three or more three-putts, both Cole Bennett’s: 74 and 77, on October 21. The other 23 rounds on the list are all from before September 1. The 26 rounds recorded since then include three still marked in progress.';

  it('"the other 23 rounds" is cited to a summarise_data result, and carried by that cite', async () => {
    const out = await summariseData(ctx, { source: { ref: 'e2' }, ops: [{ op: 'count_by', id: 'status', field: 'status' }] }, { evidence: new Map([['e2', rounds]]) });
    const all = new Map<string, ToolEnvelope>([['e1', stats], ['e2', rounds], ['e3', out]]);
    const cites = [cite('23', 'e3', 'summary:status:completed', 'team'), cite('26', 'e2', 'row_count', 'team'), cite('74', 'e1', 'total_score', COLE), cite('77', 'e1', 'total_score', COLE)];
    expect(cites.map((c) => verifyCite(c, all).status)).toEqual(['verified', 'verified', 'verified', 'verified']);
    const v = computeTurnVerdict({
      streamComplete: true,
      text,
      measurements: [...all.values()].flatMap((e) => e.measurements),
      series: [],
      detailNumbers: [...all.values()].flatMap((e) => collectEnvelopeNumbers(e)),
      detailDates: [...all.values(), ].flatMap((e) => collectEnvelopeDates(e, 'America/New_York')).concat(['2026-09-01']),
      timezone: 'America/New_York',
      players: [{ id: COLE, name: 'Cole Bennett' }],
      cites: { cites, evidence: all },
    });
    expect(v.outcome).toBe('accepted');
    expect(v.citations).toMatchObject({ verified: 4, mismatched: 0 });
  });
  it('a count the data does not make is a mismatch against the very read it names', async () => {
    const out = await summariseData(ctx, { source: { ref: 'e2' }, ops: [{ op: 'count_by', id: 'status', field: 'status' }] }, { evidence: new Map([['e2', rounds]]) });
    expect(verifyCite(cite('24', 'e3', 'summary:status:completed', 'team'), new Map([['e3', out]])).status).toBe('mismatch');
  });
});
