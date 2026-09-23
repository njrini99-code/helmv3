import { describe, it, expect } from 'vitest';
import {
  computeTurnVerdict,
  verdictPartType,
  STREAM_INCOMPLETE_NOTE,
  UNGROUNDED_NOTE,
} from '@/lib/coachhelm/v3/chat/verdict';
import type { Measurement } from '@/lib/coachhelm/v3/chat/provenance';

function measurement(value: number): Measurement {
  return {
    metric_id: 'putts_per_round',
    value,
    entity: { kind: 'team', id: 't1', label: 'Team' },
  } as Measurement;
}

describe('computeTurnVerdict — ordered checks (repair plan §14.10, chat publication)', () => {
  it('accepts a complete stream whose numbers are all traceable to tool evidence', () => {
    const verdict = computeTurnVerdict({
      streamComplete: true,
      text: 'The team averages 28.5 putts per round.',
      measurements: [measurement(28.5)],
      series: [],
      detailNumbers: [],
    });

    expect(verdict).toEqual({ outcome: 'accepted' });
  });

  it('rejects an incomplete stream BEFORE running the numeric audit, even when the fragment audits clean', () => {
    // No numbers in this fragment at all — a numeric audit alone would find
    // nothing wrong and accept it. Stream completeness must still veto it.
    const verdict = computeTurnVerdict({
      streamComplete: false,
      text: 'The team is trending well',
      measurements: [],
      series: [],
      detailNumbers: [],
    });

    expect(verdict).toEqual({
      outcome: 'rejected',
      reason: 'stream_incomplete',
      note: STREAM_INCOMPLETE_NOTE,
      unsupported: [],
    });
  });

  it('rejects a complete stream that states an untraceable number', () => {
    const verdict = computeTurnVerdict({
      streamComplete: true,
      text: 'His make rate is 71%.',
      measurements: [],
      series: [],
      detailNumbers: [],
    });

    expect(verdict.outcome).toBe('rejected');
    if (verdict.outcome === 'rejected') {
      expect(verdict.reason).toBe('ungrounded_claims');
      expect(verdict.note).toBe(UNGROUNDED_NOTE);
      expect(verdict.unsupported.map((c) => c.text)).toContain('71');
    }
  });

  it('an incomplete stream that ALSO contains an untraceable number is rejected for stream_incomplete, not both', () => {
    // Ordering matters: once the stream itself never finished, there is no
    // complete answer worth auditing for claims — the FIRST failing check
    // wins, so this never reports two disagreeing reasons for one turn.
    const verdict = computeTurnVerdict({
      streamComplete: false,
      text: 'His make rate is 71%',
      measurements: [],
      series: [],
      detailNumbers: [],
    });

    expect(verdict).toMatchObject({ outcome: 'rejected', reason: 'stream_incomplete' });
  });

  it('an empty fragment from an incomplete stream is still rejected, not accepted as "nothing to audit"', () => {
    const verdict = computeTurnVerdict({
      streamComplete: false,
      text: '',
      measurements: [],
      series: [],
      detailNumbers: [],
    });

    expect(verdict.outcome).toBe('rejected');
  });
});

describe('verdictPartType — wire name per reason', () => {
  it('keeps the pre-existing data-grounding-flag name for ungrounded_claims (production already has rows with it)', () => {
    expect(verdictPartType('ungrounded_claims')).toBe('data-grounding-flag');
  });

  it('uses the new, additive data-turn-incomplete name for stream_incomplete', () => {
    expect(verdictPartType('stream_incomplete')).toBe('data-turn-incomplete');
  });
});
