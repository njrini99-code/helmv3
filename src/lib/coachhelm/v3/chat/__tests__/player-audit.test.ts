import { describe, expect, it } from 'vitest';
import { MODEL_FOR_TASK } from '@/lib/coachhelm/v3/llm/types';
import { auditPlayerAnswer, auditPlayerAnswerCited, playerLedgerRow } from '../player-audit';
import type { ToolEnvelope } from '../provenance';

const envelope = (over: Partial<ToolEnvelope>): ToolEnvelope => ({ summary: 'read', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-05T12:00:00Z', ...over });
const ask = (text: string) => ({ role: 'user', parts: [{ type: 'text', text }] });
const base = { messages: [] as unknown[], timezone: 'America/New_York', roster: [{ id: 'p1', name: 'Owen Carter' }], now: new Date('2026-11-05T17:00:00Z') };
const rounds = envelope({ detail: { rounds: [{ date: '2026-09-25', total_score: 74 }, { date: '2026-09-26', total_score: 71 }] } });

describe('player Ask: the same dates and day pairs as coach Ask', () => {
  it('a pair of evidence days passes', () => {
    expect(auditPlayerAnswer({ ...base, text: 'You played on September 25 and 26.', envelopes: [rounds] })).toEqual([]);
  });

  it('a date the read does not hold is flagged, and so is a paired day', () => {
    expect(auditPlayerAnswer({ ...base, text: 'You played on September 27.', envelopes: [rounds] }).map((c) => c.text)).toEqual(['September 27']);
    expect(auditPlayerAnswer({ ...base, text: 'You played on September 25 and 29.', envelopes: [rounds] }).map((c) => c.text)).toEqual(['29']);
  });

  it("a date worked out from the player's own words passes, and only that one", () => {
    const messages = [ask('What do I have next Tuesday?')];
    expect(auditPlayerAnswer({ ...base, messages, text: 'Tuesday, November 10 is open.', envelopes: [] })).toEqual([]);
    expect(auditPlayerAnswer({ ...base, messages, text: 'Wednesday, November 11 is open.', envelopes: [] }).map((c) => c.text)).toEqual(['November 11']);
    expect(auditPlayerAnswer({ ...base, messages: [{ role: 'assistant', parts: [{ type: 'text', text: 'next Tuesday' }] }], text: 'November 10 is open.', envelopes: [] }).map((c) => c.text)).toEqual(['November 10']);
  });

  it('reads detail figures and the summary, as coach Ask does', () => {
    expect(auditPlayerAnswer({ ...base, text: 'Your 74 stands out.', envelopes: [rounds] })).toEqual([]);
    expect(auditPlayerAnswer({ ...base, text: 'Your 88 stands out.', envelopes: [rounds] }).map((c) => c.text)).toEqual(['88']);
  });
});

describe('the player ledger row', () => {
  const row = (unsupported: Array<{ text: string; value: number }>) => playerLedgerRow({ playerId: 'player-uuid-0123456789', promptTokens: 10, completionTokens: 20, costUsd: 0.01, unsupported });

  it('uses the columns golf_coachhelm_llm_calls has', () => {
    expect(row([])).toEqual({ task: 'coach_chat', player_id: 'player-uuid-0123456789', coach_id: null, model_id: MODEL_FOR_TASK.coach_chat, prompt_hash: 'player-uuid-0123', prompt_tokens: 10, completion_tokens: 20, cost_usd: 0.01, citations: null, verified: true, fallback_to_template: false });
  });

  it('records what the audit found, number literals only', () => {
    expect(row([{ text: '88', value: 88 }])).toMatchObject({ verified: false, citations: { reason: 'verification_failed', verdict_reason: 'ungrounded_claims', unmatched_tokens: ['88'] } });
  });
});

describe('player Ask: per-figure citations', () => {
  const me = envelope({
    measurements: [
      { metric_id: 'sg_putting', entity: { kind: 'player', id: 'p1', label: 'You' }, value: -1.21, unit: 'strokes', window_start: '2026-09-01', window_end: '2026-10-31', sample_size: 10, denominator: null, benchmark: { value: -0.4, label: 'Team' } },
    ] as unknown as ToolEnvelope['measurements'],
  });
  const refs = new Map([['e1', me]]);
  const cite = (v: string, key = 'sg_putting', subject = 'p1') => ({ v, ref: 'e1', key, subject });
  const audit = (text: string, cites?: Array<ReturnType<typeof cite>>) => auditPlayerAnswerCited({ ...base, text, envelopes: [me], ...(cites ? { cites: { cites, evidence: refs } } : {}) });

  it('a verified cite stands on its own and is counted', () => {
    const r = audit('Your putting is losing 1.21 strokes a round.', [cite('1.21')]);
    expect(r.unsupported).toEqual([]);
    expect(r.citations).toMatchObject({ cites: 1, verified: 1, mismatched: 0, cited: 1 });
  });

  it('a figure that is not in the read it is cited to is judged by the text check, and flagged when no read holds it', () => {
    const r = audit('Your putting is losing 3.1 strokes a round.', [cite('3.1')]);
    expect(r.unsupported.map((c) => c.text)).toContain('3.1');
    expect(r.citations).toMatchObject({ unresolved: 1, mismatched: 0 });
  });

  it('an unresolved cite changes nothing: the text heuristics decide as before', () => {
    expect(audit('Your putting is losing 1.21 strokes a round.', [cite('1.21', 'sg_unknown')]).unsupported).toEqual([]);
    expect(audit('Your putting is losing 9.99 strokes a round.', [cite('9.99', 'sg_unknown')]).unsupported.map((c) => c.text)).toEqual(['9.99']);
  });

  it('with no cites it audits as it always has and carries no citation counts', () => {
    const r = audit('Your putting is losing 1.21 strokes a round.');
    expect(r.unsupported).toEqual([]);
    expect(r.citations).toBeUndefined();
  });

  it('the ledger row of an accepted turn carries its counts too', () => {
    const r = audit('Your putting is losing 1.21 strokes a round.', [cite('1.21')]);
    const row = playerLedgerRow({ playerId: 'player-uuid-0123456789', promptTokens: 1, completionTokens: 1, costUsd: 0, unsupported: r.unsupported, citations: r.citations });
    expect(row.verified).toBe(true);
    expect(row.citations).toMatchObject({ reason: 'grounded', unmatched_tokens: [], citation_stats: { verified: 1 } });
  });

  it('the ledger row carries the counts of a flagged turn', () => {
    const r = audit('Your putting is losing 3.1 strokes a round.', [cite('3.1')]);
    const row = playerLedgerRow({ playerId: 'player-uuid-0123456789', promptTokens: 1, completionTokens: 1, costUsd: 0, unsupported: r.unsupported, citations: r.citations });
    expect(row.citations).toMatchObject({ unmatched_tokens: expect.arrayContaining(['3.1']), citation_stats: { unresolved: 1, verified: 0 } });
  });
});
