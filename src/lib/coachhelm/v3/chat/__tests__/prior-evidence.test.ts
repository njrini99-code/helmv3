import { describe, expect, it } from 'vitest';
import { auditNumericClaims, ToolEnvelope } from '../provenance';
import { deferredForNamedPlayers, emptyBucket, namedPlayerIds, placePriorEnvelope, type PriorDeferred } from '../prior-evidence';

// Replay e4c7825e (a question asked twice, answered the second time from the first's reads) and d47b26de ("nothing scheduled for the next 60
// days" restated). The route holds player-scoped earlier evidence back until this turn's own reads say which player is in play, and a re-answer
// reads nothing, so every figure in it was withheld.
const roster = [{ id: 'p-alice', name: 'Alice Ames' }, { id: 'p-bob', name: 'Bob Barr' }, { id: 'p-cy', name: 'Cy Cole' }];
const m = (id: string, name: string, value: number) => ({ metric_id: 'sg_putting', metric_label: 'SG putting', unit: 'strokes', value, entity: { kind: 'player', id, label: name }, window_start: '2026-06-01', window_end: '2026-09-26', sample_size: 8, sample_unit: 'rounds', as_of: '2026-11-08T00:00:00.000Z', coverage: 'complete', coverage_note: null, source: 'rounds', method: 'm', denominator: null, benchmark: null, direction: 'higher_better' });
const ranking = ToolEnvelope.parse({ summary: 'Strokes gained putting across the team.', measurements: [m('p-alice', 'Alice Ames', -2.16), m('p-bob', 'Bob Barr', -2.72), m('p-cy', 'Cy Cole', -3.34)], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z' });
const calendar = ToolEnvelope.parse({ summary: 'Nothing scheduled in the next 60 days.', measurements: [], series: [], detail: { events: [] }, coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z' });

function carried(envelopes: ToolEnvelope[]): { shared: ReturnType<typeof emptyBucket>; deferred: PriorDeferred } {
  const shared = emptyBucket();
  const deferred: PriorDeferred = { ...emptyBucket(), playerIds: new Set() };
  for (const e of envelopes) {
    const placed = placePriorEnvelope(e, 'America/New_York');
    for (const k of ['measurements', 'series', 'detailNumbers', 'detailDates'] as const) {
      (shared[k] as unknown[]).push(...placed.shared[k]);
      (deferred[k] as unknown[]).push(...placed.deferred[k]);
    }
    for (const id of placed.playerIds) deferred.playerIds.add(id);
  }
  return { shared, deferred };
}

const audit = (text: string, bucketOf: (c: ReturnType<typeof carried>) => ReturnType<typeof emptyBucket>, envelopes: ToolEnvelope[]) => {
  const c = carried(envelopes);
  const b = bucketOf(c);
  const shared = c.shared;
  return auditNumericClaims(text, [...shared.measurements, ...b.measurements], [], [...shared.detailNumbers, ...b.detailNumbers], [...shared.detailDates, ...b.detailDates], 'America/New_York', { players: roster }).map((x) => x.text);
};
const forAnswer = (text: string) => (c: ReturnType<typeof carried>) => deferredForNamedPlayers(c.deferred, namedPlayerIds(text, roster));

describe('a re-answer from the earlier turn’s reads', () => {
  const text = 'Alice Ames is at -2.16 on putting, Bob Barr at -2.72 and Cy Cole at -3.34.';
  it('is supported for the players the answer names', () => {
    expect(audit(text, forAnswer(text), [ranking])).toEqual([]);
    // Without the fold-in (what the route did) every figure is withheld.
    expect(audit(text, () => emptyBucket(), [ranking])).toEqual(['-2.16', '-2.72', '-3.34']);
  });
  it('never lends Alice’s figure to an answer about Bob', () => {
    const aliceOnly = ToolEnvelope.parse({ ...ranking, measurements: [m('p-alice', 'Alice Ames', -2.16)] });
    const about = 'Bob Barr is at -2.16 on putting.';
    expect(audit(about, forAnswer(about), [aliceOnly])).toEqual(['-2.16']);
    const none = 'The team is at -2.16 on putting.';
    expect(audit(none, forAnswer(none), [aliceOnly])).toEqual(['-2.16']);
  });
  it('and a figure moved to another player who is named is still a misattribution', () => {
    const wrong = 'Alice Ames is at -2.72 on putting. Bob Barr is at -2.16.';
    expect(audit(wrong, forAnswer(wrong), [ranking])).toEqual(['-2.72', '-2.16']);
  });
});

describe('a read with no entity: what its summary states is the conversation’s', () => {
  it('"the next 60 days" restated is supported, and a different span is not', () => {
    expect(audit('Nothing is scheduled for the next 60 days.', () => emptyBucket(), [calendar])).toEqual([]);
    expect(audit('Nothing is scheduled for the next 45 days.', () => emptyBucket(), [calendar])).toEqual(['45']);
  });
});
