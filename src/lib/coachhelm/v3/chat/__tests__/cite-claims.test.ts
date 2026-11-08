import { describe, expect, it } from 'vitest';
import { extractCites, verifyCite } from '../cites';
import { claimsFromCites } from '../cite-claims';
import { validateCitedChatClaims } from '../claims-packet';
import type { Measurement, ToolEnvelope } from '../provenance';

// One block, not two: the typed claim list is derived from the per-figure citations (the model used to write <<<CLAIMS>>> as well, about a
// thousand output tokens a turn for the same facts).
const NOW = '2026-11-08T04:36:59.000Z';
const OWEN = '8091da4b-dbc9-47f3-80f1-be37c96b2c91';
const ETHAN = '8e382583-2ce6-4d15-8568-5088cf02dbd1';
const env = (over: Partial<ToolEnvelope> & Record<string, unknown>): ToolEnvelope => ({ summary: 'x', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: NOW, ...over }) as ToolEnvelope;
const m = (metric_id: string, value: number, id: string, label: string, over: Record<string, unknown> = {}): Measurement =>
  ({ metric_id, metric_label: metric_id, unit: 'strokes', value, entity: { kind: 'player', id, label }, window_start: '2026-06-09', window_end: '2026-09-26', sample_size: 8, sample_unit: 'rounds', as_of: NOW, coverage: 'complete', coverage_note: null, source: 'rounds', method: 'm', denominator: null, benchmark: null, direction: 'higher_better', ...over }) as Measurement;

const read = env({
  measurements: [
    m('sg_approach', -4.16, OWEN, 'Owen Carter', { comparisons: [{ kind: 'team', label: 'Team average', value: -2.33, place_of: 7, place_percent: null, place: 6, note: null, missing_reason: null }] }),
    m('gir_pct', 61.11, OWEN, 'Owen Carter', { unit: 'percent', sample_size: 144, sample_unit: 'holes', denominator: 144 }),
    m('sg_approach', -4.4, ETHAN, 'Ethan Park'),
  ],
});
const evidence = new Map<string, ToolEnvelope>([['e3', read]]);

describe('the compact cite block', () => {
  it('reads one array per figure, with the subject as an 8-character id prefix, and still reads the object form', () => {
    const x = extractCites('Owen is behind.\n<<<CITES>>>[["-4.16","e3","sg_approach","8091da4b"],["-2.33","e3","sg_approach","team"],["lost 4","e3","k","8091da4b","c"],{"v":"61.11","ref":"e3","key":"gir_pct","subject":"8091da4b"}]<<<END_CITES>>>');
    expect(x.text).toBe('Owen is behind.');
    expect(x.cites).toEqual([
      { v: '-4.16', ref: 'e3', key: 'sg_approach', subject: '8091da4b' },
      { v: '-2.33', ref: 'e3', key: 'sg_approach', subject: 'team' },
      { v: 'lost 4', ref: 'e3', key: 'k', subject: '8091da4b', c: 1 },
      { v: '61.11', ref: 'e3', key: 'gir_pct', subject: '8091da4b' },
    ]);
  });
  it('a prefix subject verifies like the whole id; another player’s prefix is a misattribution', () => {
    const [a, b] = extractCites('<<<CITES>>>[["-4.16","e3","sg_approach","8091da4b"],["-4.16","e3","sg_approach","8e382583"]]<<<END_CITES>>>').cites;
    expect(verifyCite(a!, evidence).status).toBe('verified');
    expect(verifyCite(b!, evidence).status).toBe('mismatch');
  });
  it('a prefix shorter than 6 characters names nobody', () => {
    const [a] = extractCites('<<<CITES>>>[["-4.16","e3","sg_approach","8091"]]<<<END_CITES>>>').cites;
    expect(verifyCite(a!, evidence).status).toBe('unresolved');
  });
});

describe('claims derived from cites', () => {
  const cites = extractCites('<<<CITES>>>[["-4.16","e3","sg_approach","8091da4b"],["61.11","e3","gir_pct","8091da4b"],["-2.33","e3","sg_approach","team"],["4.16","e3","sg_approach","8091da4b"],["-4.40","e3","sg_approach","8e382583"]]<<<END_CITES>>>').cites;
  it('are a measurement’s own values with its window, unit and denominator copied from it; a figure beside one (the team average) is not a claim', () => {
    const claims = claimsFromCites(cites, evidence);
    expect(claims.map((c) => [c.metric_id, c.value, c.player_id.slice(0, 8), c.window_start, c.window_end, c.unit, c.denominator, c.claim_type])).toEqual([
      ['sg_approach', -4.16, '8091da4b', '2026-06-09', '2026-09-26', 'strokes', null, 'fact'],
      ['gir_pct', 61.11, '8091da4b', '2026-06-09', '2026-09-26', 'percent', 144, 'fact'],
      ['sg_approach', -4.4, '8e382583', '2026-06-09', '2026-09-26', 'strokes', null, 'fact'],
    ]);
  });
  it('and pass the typed gate the claims block passed', () => {
    const claims = claimsFromCites(cites, evidence);
    const v = validateCitedChatClaims("Owen's strokes gained on approach is -4.16 and his greens in regulation 61.11% over 144 holes. Ethan Park is at -4.40.", read.measurements, claims);
    expect(v.claims).toMatchObject({ malformed: false });
    expect(v.claims?.rejected).toEqual([]);
    expect(v.claims?.accepted.length).toBe(3);
  });
  it('an empty list is not malformed; a turn with no player measurement does not engage the gate', () => {
    expect(validateCitedChatClaims('Owen is behind.', read.measurements, []).claims).toMatchObject({ malformed: false, accepted: [] });
    expect(validateCitedChatClaims('Hello.', [], []).claims).toBeNull();
  });
  it('a thin-sample figure left out of the cites is still refused, as when it was left out of the claims block', () => {
    const thin = [m('sg_putting', -1.2, OWEN, 'Owen Carter', { sample_size: 2 })];
    const v = validateCitedChatClaims('Owen is at -1.2 on putting.', thin, []);
    expect(v.claims?.rejected.map((r) => r.reason)).toEqual(['unsupported_small_number']);
    const c = claimsFromCites(extractCites('<<<CITES>>>[["-1.2","e3","sg_putting","8091da4b"]]<<<END_CITES>>>').cites, new Map([['e3', env({ measurements: thin })]]));
    expect(validateCitedChatClaims('Owen is at -1.2 on putting over his 2 rounds.', thin, c).claims?.rejected).toEqual([]);
  });
  it('a cause is a claim of its own kind', () => {
    const c = claimsFromCites(extractCites('<<<CITES>>>[["-4.16","e3","sg_approach","8091da4b","c"]]<<<END_CITES>>>').cites, evidence);
    expect(c[0]?.claim_type).toBe('causal');
  });
});

describe('a model that still writes the old block', () => {
  it('leaves nothing of it in the answer', () => {
    const v = validateCitedChatClaims('Owen is behind.\n<<<CLAIMS>>>[]<<<END_CLAIMS>>>', read.measurements, []);
    expect(v.strippedText).toBe('Owen is behind.');
  });
});
