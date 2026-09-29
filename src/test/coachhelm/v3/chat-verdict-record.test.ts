import { describe, it, expect } from 'vitest';
import {
  STREAM_INCOMPLETE_NOTE,
  UNGROUNDED_NOTE,
  CLAIM_VALIDATION_FAILED_NOTE,
  verdictRecord,
  withVerdictPart,
  type TurnVerdict,
} from '@/lib/coachhelm/v3/chat/verdict';

/**
 * Audit row 47(c): every failed turn must say WHY, durably, on the message
 * itself. `withVerdictPart` guarantees the stored `ui_parts` carry a verdict
 * part with the reason kind and unmatched tokens — including the path where
 * `execute` never reached a verdict and no part was ever streamed.
 */

const ungrounded: TurnVerdict = {
  outcome: 'rejected',
  reason: 'ungrounded_claims',
  note: UNGROUNDED_NOTE,
  unsupported: [
    { text: '71', value: 71 },
    { text: '58', value: 58, misattributed: true },
  ],
};
const incomplete: TurnVerdict = { outcome: 'rejected', reason: 'stream_incomplete', note: STREAM_INCOMPLETE_NOTE, unsupported: [] };
const claimFailed: TurnVerdict = {
  outcome: 'rejected',
  reason: 'claim_validation_failed',
  note: CLAIM_VALIDATION_FAILED_NOTE,
  unsupported: [],
  rejectedClaims: [
    {
      claim: { claim_id: 'c1', metric_id: 'gir_pct', value: 58, player_id: 'p', window_start: 'a', window_end: 'b' },
      reason: 'wrong_player',
    },
  ],
};

describe('verdictRecord', () => {
  it('is null for an accepted turn', () => {
    expect(verdictRecord({ outcome: 'accepted' })).toBeNull();
  });

  it('carries the reason, the unmatched tokens and which were misattributed', () => {
    expect(verdictRecord(ungrounded)).toEqual({
      reason: 'ungrounded_claims',
      unmatched_tokens: ['71', '58'],
      misattributed_tokens: ['58'],
    });
  });

  it('names the typed gate rejection as metric:reason', () => {
    expect(verdictRecord(claimFailed)).toEqual({ reason: 'claim_validation_failed', unmatched_tokens: ['gir_pct:wrong_player'] });
  });

  it('records stream_incomplete with no tokens', () => {
    expect(verdictRecord(incomplete)).toEqual({ reason: 'stream_incomplete', unmatched_tokens: [] });
  });
});

describe('withVerdictPart', () => {
  it('leaves an accepted turn untouched', () => {
    const parts = [{ type: 'text', text: 'ok' }];
    expect(withVerdictPart(parts, { outcome: 'accepted' })).toEqual(parts);
  });

  it('merges the reason into the streamed verdict part, keeping its note', () => {
    const parts = [
      { type: 'text', text: 'x' },
      { type: 'data-grounding-flag', id: 'turn-verdict', data: { note: UNGROUNDED_NOTE } },
    ];
    const out = withVerdictPart(parts, ungrounded);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({
      type: 'data-grounding-flag',
      id: 'turn-verdict',
      data: { note: UNGROUNDED_NOTE, reason: 'ungrounded_claims', unmatched_tokens: ['71', '58'], misattributed_tokens: ['58'] },
    });
  });

  it('appends a verdict part when none was streamed (execute never reached a verdict)', () => {
    const out = withVerdictPart([{ type: 'text', text: 'partial' }], incomplete);
    expect(out[1]).toEqual({
      type: 'data-turn-incomplete',
      id: 'turn-verdict',
      data: { note: STREAM_INCOMPLETE_NOTE, reason: 'stream_incomplete', unmatched_tokens: [] },
    });
  });
});
