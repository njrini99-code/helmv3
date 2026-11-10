import { describe, expect, it } from 'vitest';
import { repairFeedback, type RejectedTurn } from '../repair-feedback';

const rejected = (over: Partial<RejectedTurn>): RejectedTurn => ({ outcome: 'rejected', reason: 'ungrounded_claims', note: 'n', unsupported: [], ...over }) as RejectedTurn;

describe('repairFeedback', () => {
  it('names a figure that is in no read and says what to do', () => {
    const m = repairFeedback(rejected({ unsupported: [{ text: '57.8', value: 57.8 }] }))!;
    expect(m).toContain('"57.8" is not a figure any of your reads returned');
    expect(m).toContain('Write the whole answer again');
  });
  it('tells a moved figure from an invented one', () => {
    const m = repairFeedback(rejected({ unsupported: [{ text: '72.5', value: 72.5, misattributed: true }] }))!;
    expect(m).toContain('for a different player, metric or window');
  });
  it('says a count is a count nobody stated, and a date a date', () => {
    const m = repairFeedback(rejected({ unsupported: [{ text: 'Six', value: 6 }, { text: '5', value: 5 }, { text: 'July 25', value: 0 }] }))!;
    expect(m).toContain('"Six" is a count none of your reads states');
    expect(m).toContain('"5" is a count none of your reads states');
    expect(m).toContain('"July 25" is a date none of your reads returned');
  });
  it('describes the typed gate’s refusals in words, with no field names or ids', () => {
    const m = repairFeedback(rejected({ reason: 'claim_validation_failed', rejectedClaims: [
      { claim: { claim_id: 'c9', metric_id: 'sg_around_green', value: 0.5 }, reason: 'unsupported_small_number' },
      { claim: { claim_id: 'c10', metric_id: 'putts_made_3_5ft_pct', value: 46.5 }, reason: 'unsupported_cause' },
    ] as never }))!;
    expect(m).toContain('strokes gained around green (0.5) rests on too few rounds');
    expect(m).toContain('a reason you gave for a result has no figure behind it');
    expect(m).not.toMatch(/c9|c10|claim_id|sg_|wrong_|unsupported_/);
  });
  it('has nothing to say for a stream that did not finish, or a refusal that names nothing', () => {
    expect(repairFeedback(rejected({ reason: 'stream_incomplete', unsupported: [{ text: '1.5', value: 1.5 }] }))).toBeNull();
    expect(repairFeedback(rejected({}))).toBeNull();
  });
  it('lists the same item once and caps the list', () => {
    const m = repairFeedback(rejected({ unsupported: [{ text: '71%', value: 71 }, { text: '71%', value: 71 }, ...Array.from({ length: 20 }, (_, i) => ({ text: `${i + 100}.5`, value: i + 100.5 }))] }))!;
    expect(m.split('\n').filter((l) => l.startsWith('- ') && !l.startsWith('- and')).length).toBe(8);
    expect(m).toContain('- and 13 more of the same kind');
    expect(m.match(/"71%"/g)).toHaveLength(1);
  });
  it('never says the true figure', () => {
    const m = repairFeedback(rejected({ unsupported: [{ text: '57.8', value: 57.8 }] }))!;
    expect(m).not.toMatch(/should be|is actually|the correct/i);
  });
});
