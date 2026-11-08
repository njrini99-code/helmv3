import { describe, expect, it } from 'vitest';
import type { LanguageModelUsage } from 'ai';
import { addUsage, isRepairable, repairMessage, type RejectedVerdict } from '../repair-pass';
import type { TurnVerdict } from '../verdict';

const ungrounded = (texts: string[]): RejectedVerdict => ({ outcome: 'rejected', reason: 'ungrounded_claims', note: 'n', unsupported: texts.map((text) => ({ text, value: 1 })) } as RejectedVerdict);

describe('isRepairable', () => {
  it('repairs a refused figure or claim, never an accepted turn or one that did not finish', () => {
    expect(isRepairable(ungrounded(['71%']))).toBe(true);
    expect(isRepairable({ outcome: 'rejected', reason: 'claim_validation_failed', note: 'n', unsupported: [] } as TurnVerdict)).toBe(true);
    expect(isRepairable({ outcome: 'rejected', reason: 'stream_incomplete', note: 'n', unsupported: [] } as TurnVerdict)).toBe(false);
    expect(isRepairable({ outcome: 'accepted' })).toBe(false);
  });
});

describe('repairMessage', () => {
  it('names each refused figure and says what to do', () => {
    const m = repairMessage(ungrounded(['71%', 'Six']))!;
    expect(m).toContain('"71%"');
    expect(m).toContain('"Six"');
    expect(m).toContain('Write the answer again');
  });

  it('lists a claim the typed gate refused, without ids', () => {
    const v = { outcome: 'rejected', reason: 'claim_validation_failed', note: 'n', unsupported: [], rejectedClaims: [{ claim: { claim_id: 'c1', metric_id: 'sg_putting' }, reason: 'wrong_window' }] } as unknown as RejectedVerdict;
    expect(repairMessage(v)).toContain('sg_putting');
    expect(repairMessage(v)).toContain('wrong_window');
  });

  it('has nothing to say when nothing specific was refused', () => {
    expect(repairMessage(ungrounded([]))).toBeNull();
  });

  it('caps the list so the message stays short', () => {
    const m = repairMessage(ungrounded(Array.from({ length: 30 }, (_, i) => `n${i}`)))!;
    expect(m.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(8);
  });
});

describe('addUsage', () => {
  const u = (i: number, o: number, nc: number, cr: number, cw: number): LanguageModelUsage =>
    ({ inputTokens: i, outputTokens: o, inputTokenDetails: { noCacheTokens: nc, cacheReadTokens: cr, cacheWriteTokens: cw }, outputTokenDetails: { textTokens: o, reasoningTokens: 0 } }) as LanguageModelUsage;

  it('adds every field, so the ledger bills both passes', () => {
    const t = addUsage(u(100, 10, 4, 90, 6), u(200, 20, 8, 190, 2));
    expect(t.inputTokens).toBe(300);
    expect(t.outputTokens).toBe(30);
    expect(t.inputTokenDetails).toEqual({ noCacheTokens: 12, cacheReadTokens: 280, cacheWriteTokens: 8 });
  });

  it('keeps a field neither pass reported unreported', () => {
    const t = addUsage({ inputTokens: undefined, outputTokens: undefined } as LanguageModelUsage, { inputTokens: undefined, outputTokens: undefined } as LanguageModelUsage);
    expect(t.inputTokens).toBeUndefined();
  });
});
