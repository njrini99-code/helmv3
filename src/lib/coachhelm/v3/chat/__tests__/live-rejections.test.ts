import { describe, expect, it } from 'vitest';
import { claimsFromCites } from '../cite-claims';
import { thinSampleStated, unbackedCausalSentences, validateCitedChatClaims } from '../claims-packet';
import { auditCountClaims } from '../count-claims';
import { extractCites, verifyCite } from '../cites';
import type { Measurement, ToolEnvelope } from '../provenance';

// Staging 2026-11-08, ask-perf's run of 12 questions on the merged block: 4 of 12 coach turns rejected, and on the turns it read, the check was
// too strict, not the answer wrong. One fixture per reason.
const NOW = '2026-11-08T06:00:00.000Z';
const m = (metric_id: string, value: number, id: string, label: string, over: Record<string, unknown> = {}): Measurement =>
  ({ metric_id, metric_label: metric_id, unit: 'score', value, entity: { kind: 'player', id, label }, window_start: '2026-08-01', window_end: '2026-10-21', sample_size: 2, sample_unit: 'rounds', as_of: NOW, coverage: 'complete', coverage_note: null, source: 'rounds', method: 'm', denominator: null, benchmark: null, direction: 'lower_better', ...over }) as Measurement;

describe('causes: a sentence about the data is not a cause of anyone’s play', () => {
  const none: Measurement[] = [];
  it.each([
    'The strokes gained figures rest on 8 rounds, because the two newest qualifier rounds were posted as totals only.',
    'The gain from the two qualifier rounds can’t be tied to a cause, because they carry no shot data.',
    'The two measures disagree because strokes gained putting accounts for how far each putt was.',
    'His greens-in-regulation rate hides this because it is close to average.',
    'Against his level, only greens in regulation can be compared, because strokes gained has no college figure.',
    'All three averages are thin reads, because each rests on only 2 counted rounds.',
    'It holds only 11 rounds from one player, because no other player has strokes gained recorded since August.',
  ])('passes: %s', (sentence) => {
    expect(unbackedCausalSentences(sentence, none)).toEqual([]);
  });
  it.each([
    'He loses strokes because his tempo gets quicker under pressure.',
    'His putting is worse because he lacks confidence on short putts.',
    'He plays worse because his swing has changed and he is tired.',
  ])('and an unmeasured cause of play is still refused: %s', (sentence) => {
    expect(unbackedCausalSentences(sentence, none)).toHaveLength(1);
  });
});

describe('a thin sample is held to the prose only for a figure the prose writes', () => {
  const mason = m('season_scoring_to_par', 0, 'p-mason', 'Mason Rivers');
  const owen = m('season_scoring_to_par', 0.5, 'p-owen', 'Owen Carter');
  const read = { summary: 'x', measurements: [mason, owen], series: [], coverage: 'complete', coverage_note: null, as_of: NOW } as ToolEnvelope;
  const evidence = new Map([['e1', read]]);
  const cites = extractCites('<<<CITES>>>[["0","e1","season_scoring_to_par","p-mason"],["0.5","e1","season_scoring_to_par","p-owen"]]<<<END_CITES>>>').cites;
  const text = '1. Mason Rivers: 72 over his 2 counted rounds, even par.\n2. Owen Carter: 72.5 over his 2 counted rounds, 0.5 over par.';
  it('"even par" (a cited 0) is not a figure to qualify, and "0.5 over par" sits in a sentence that states its 2 rounds', () => {
    const v = validateCitedChatClaims(text, read.measurements, claimsFromCites(cites, evidence));
    expect(v.claims?.rejected).toEqual([]);
  });
  it('a figure written with no sample at all is still refused', () => {
    const v = validateCitedChatClaims('Owen Carter is 0.5 over par.', read.measurements, claimsFromCites(cites, evidence));
    expect(v.claims?.rejected.map((r) => r.reason)).toEqual(['unsupported_small_number']);
  });
});

describe('counts of the roster’s players are the roster’s', () => {
  it('"six of the seven players", "the other six players", "the other six may have goals" pass; a whole group that no read states, a count above the roster, and a row tally do not', () => {
    const stated = new Set([8, 7, 2]);
    expect(auditCountClaims('Six of the seven players have only 2 rounds each. The other six may have goals.', stated, [], 8)).toEqual([]);
    expect(auditCountClaims('The other six players may have goals.', stated, [], 8)).toEqual([]);
    expect(auditCountClaims('He ranks 6th of six players with a figure.', stated, [], 8).map((c) => c.text)).toEqual(['six']);
    expect(auditCountClaims('He ranks 7th of seven players with a figure.', stated, [], 8)).toEqual([]);
    expect(auditCountClaims('Only 9 of those rounds have strokes gained.', new Set([8]), [], 8).map((c) => c.text)).toEqual(['9']);
    expect(auditCountClaims('Four Pebble Beach practice rounds have none.', new Set([26, 14, 3]), [], 8).map((c) => c.text)).toEqual(['Four']);
  });
});

describe('a cite is a mismatch only against someone else’s own figure, not a reference shared by everyone', () => {
  const tour = { kind: 'tour', label: 'PGA Tour', value: 0, place_of: null, place_percent: null, place: null, note: null, missing_reason: null };
  const read = { summary: 'x', measurements: [m('sg_putting', -1.92, 'p-ethan', 'Ethan Park', { unit: 'strokes' }), m('sg_putting', -2.06, 'p-owen', 'Owen Carter', { unit: 'strokes', comparisons: [tour] })], series: [], coverage: 'complete', coverage_note: null, as_of: NOW } as ToolEnvelope;
  const evidence = new Map([['e1', read]]);
  it('the Tour baseline of 0 cited to a player is for the text check to judge', () => {
    const [c] = extractCites('<<<CITES>>>[["0","e1","sg_putting","p-ethan"]]<<<END_CITES>>>').cites;
    expect(verifyCite(c!, evidence).status).toBe('unresolved');
  });
  it('but a figure that is another player’s own is a misattribution', () => {
    const [c] = extractCites('<<<CITES>>>[["-2.06","e1","sg_putting","p-ethan"]]<<<END_CITES>>>').cites;
    expect(verifyCite(c!, evidence).status).toBe('mismatch');
  });
});

// Live Q5 (ask-perf rerun at d63cd1d055): "Top 3 by scoring average" listed three figures, each over 2 rounds, and said once that each average
// rests on 2 rounds and is a thin read. The rule wanted the count inside every figure's own sentence.
describe('one statement of the sample for a list of thin figures', () => {
  const list = '1. Ethan Park: 0.5 over par.\n2. Owen Carter: 1.0 over par.\n\nEach of these averages rests on 2 rounds, so treat it as a thin read.';
  it('stands for every figure in the list when its count is the measurement’s own', () => {
    expect(thinSampleStated(list, 0.5, 2, 'rounds')).toBe(true);
    expect(thinSampleStated(list, 1, 2, 'rounds')).toBe(true);
  });
  it('does not stand for a figure whose sample is another count', () => {
    expect(thinSampleStated(list, 0.5, 9, 'rounds')).toBe(false);
  });
  it('a count that is not about the group does not stand for the list', () => {
    expect(thinSampleStated('1. Ethan Park: 0.5 over par.\n\nOwen has 2 rounds on record.', 0.5, 2, 'rounds')).toBe(false);
  });
  it('a figure with no sample anywhere is still refused', () => {
    expect(thinSampleStated('1. Ethan Park: 0.5 over par.\n2. Owen Carter: 1.0 over par.', 0.5, 2, 'rounds')).toBe(false);
  });
  it('a figure with its own count is paired with that count, whatever the group says', () => {
    expect(thinSampleStated('Ethan Park: 0.5 over his 9 rounds. Each of these rests on 2 rounds.', 0.5, 2, 'rounds')).toBe(false);
  });
});

// Counts are cited like figures (team-lead, live Q4/Q10): the keys that name a count of the read itself are verified against that read's own counts.
describe('count cites', () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({ player: `P${i}`, round_type: i < 4 ? 'practice' : 'qualifier', total_score: 70 + i }));
  const read = { summary: '6 rows of rounds.', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z', detail: { kind: 'team_data', rows, row_count: 6 } } as unknown as ToolEnvelope;
  const evidence = new Map<string, ToolEnvelope>([['e1', read]]);
  const status = (v: string, key: string) => verifyCite({ v, ref: 'e1', key, subject: 'team' }, evidence).status;
  it('row_count, list_length and a category count verify against the read', () => {
    expect(status('6', 'row_count')).toBe('verified');
    expect(status('6', 'list_length')).toBe('verified');
    expect(status('4', 'row_count')).toBe('verified');
  });
  it('a count the read does not hold is not verified', () => {
    expect(status('7', 'row_count')).toBe('unresolved');
    expect(status('7', 'list_length')).toBe('unresolved');
  });
});
