import { describe, it, expect } from 'vitest';
import { extractAndValidateChatClaims } from '@/lib/coachhelm/v3/chat/claims-packet';
import type { Measurement } from '@/lib/coachhelm/v3/chat/provenance';

/**
 * Audit row 47(a): the typed claim gate (behind `coachhelm_chat_claim_gate`).
 *
 * Before: a packet was built only when the turn's measurements resolved to ONE
 * player and ONE window, so every multi-player or multi-window turn had its
 * claims block stripped and never checked — "Bob: 58% GIR" with Alice's 58
 * passed. The gate now builds one packet per (player, window) and routes each
 * claim to the packet its own player_id/window names, so with the flag on a
 * turn passes only when every claimed number binds to the right player and
 * metric in the tool results.
 */

const m = (over: Partial<Measurement>): Measurement => ({
  metric_id: 'gir_pct',
  metric_label: 'Greens in regulation',
  unit: 'percent',
  value: 58.333,
  entity: { kind: 'player', id: 'p-alice', label: 'Alice Moreno' },
  window_start: '2026-06-01',
  window_end: '2026-07-20',
  sample_size: 9,
  sample_unit: 'rounds',
  as_of: '2026-07-20T12:00:00Z',
  coverage: 'complete',
  coverage_note: null,
  source: 'stats cache',
  method: 'gir_over_holes',
  denominator: null,
  benchmark: null,
  direction: 'higher_better',
  ...over,
});

const aliceGir = m({});
const alicePutts = m({ metric_id: 'putts_per_round', metric_label: 'Putts per round', unit: 'count', value: 31.5 });
const bobGir = m({ value: 42.1, entity: { kind: 'player', id: 'p-bob', label: 'Bob Tran' } });

const claim = (over: Record<string, unknown>) => ({
  claim_id: 'c1',
  metric_id: 'gir_pct',
  value: 58.333,
  player_id: 'p-alice',
  window_start: '2026-06-01',
  window_end: '2026-07-20',
  unit: 'percent',
  denominator: null,
  claim_type: 'fact',
  ...over,
});

const withBlock = (prose: string, claims: unknown[]) => `${prose}\n<<<CLAIMS>>>${JSON.stringify(claims)}<<<END_CLAIMS>>>`;

describe('extractAndValidateChatClaims', () => {
  it('accepts a correctly bound claim and strips the block', () => {
    const out = extractAndValidateChatClaims(withBlock('Alice hits 58.333% of greens.', [claim({})]), [aliceGir]);
    expect(out.strippedText).toBe('Alice hits 58.333% of greens.');
    expect(out.claims?.malformed).toBe(false);
    expect(out.claims?.rejected).toEqual([]);
  });

  it('checks claims in a MULTI-player turn (previously never checked)', () => {
    const out = extractAndValidateChatClaims(
      withBlock('Bob hits 58.333% of greens.', [claim({ player_id: 'p-bob' })]),
      [aliceGir, bobGir],
    );
    expect(out.claims?.rejected.map((r) => r.reason)).toEqual(['value_mismatch']);
  });

  it('accepts correct claims for two players in one turn', () => {
    const out = extractAndValidateChatClaims(
      withBlock('Alice 58.333%, Bob 42.1%.', [claim({}), claim({ claim_id: 'c2', player_id: 'p-bob', value: 42.1 })]),
      [aliceGir, bobGir],
    );
    expect(out.claims?.rejected).toEqual([]);
    expect(out.claims?.accepted).toHaveLength(2);
  });

  it('rejects a claim about a player with no evidence this turn', () => {
    const out = extractAndValidateChatClaims(withBlock('x', [claim({ player_id: 'p-cara' })]), [aliceGir]);
    expect(out.claims?.rejected.map((r) => r.reason)).toEqual(['wrong_player']);
  });

  it('rejects a claim whose window no measurement of that player has', () => {
    const out = extractAndValidateChatClaims(withBlock('x', [claim({ window_start: '2026-01-01' })]), [aliceGir]);
    expect(out.claims?.rejected.map((r) => r.reason)).toEqual(['wrong_window']);
  });

  it('checks claims in a multi-WINDOW single-player turn', () => {
    const aliceGirSpring = m({ value: 64, window_start: '2026-03-01', window_end: '2026-05-31' });
    const ok = extractAndValidateChatClaims(
      withBlock('x', [claim({}), claim({ claim_id: 'c2', value: 64, window_start: '2026-03-01', window_end: '2026-05-31' })]),
      [aliceGir, aliceGirSpring],
    );
    expect(ok.claims?.rejected).toEqual([]);
    const swapped = extractAndValidateChatClaims(
      withBlock('x', [claim({ value: 64 })]),
      [aliceGir, aliceGirSpring],
    );
    expect(swapped.claims?.rejected.map((r) => r.reason)).toEqual(['value_mismatch']);
  });

  it('rejects a real number filed under the wrong metric', () => {
    const out = extractAndValidateChatClaims(withBlock('x', [claim({ value: 31.5 })]), [aliceGir, alicePutts]);
    expect(out.claims?.rejected.map((r) => r.reason)).toEqual(['wrong_field']);
  });

  it('accepts a claim rounded to its own precision', () => {
    const out = extractAndValidateChatClaims(
      withBlock('Alice hits 58.3% of greens.', [claim({ value: 58.3 })]),
      [aliceGir],
    );
    expect(out.claims?.rejected).toEqual([]);
    const whole = extractAndValidateChatClaims(withBlock('58%', [claim({ value: 58 })]), [aliceGir]);
    expect(whole.claims?.rejected).toEqual([]);
  });

  it('does not accept a rounding that is off at its own precision', () => {
    const out = extractAndValidateChatClaims(withBlock('x', [claim({ value: 58.4 })]), [aliceGir]);
    expect(out.claims?.rejected.map((r) => r.reason)).toEqual(['value_mismatch']);
  });

  it('leaves prose numbers to the (player- and metric-bound) numeric audit', () => {
    // 77 is a round score from `detail`; it is not a packet entry. The numeric
    // audit already binds it; the typed gate must not re-reject it as uncited.
    const out = extractAndValidateChatClaims(
      withBlock('Alice hits 58.333% of greens and shot 77 on Tuesday.', [claim({})]),
      [aliceGir],
    );
    expect(out.claims?.rejected).toEqual([]);
  });

  it('treats a missing block as malformed when the turn has player evidence', () => {
    const out = extractAndValidateChatClaims('Alice hits 58.333% of greens.', [aliceGir]);
    expect(out.claims?.malformed).toBe(true);
  });

  it('does not engage for a turn with no player-scoped measurements, but still strips a block', () => {
    const team = m({ entity: { kind: 'team', id: 't1', label: 'Ridge' } });
    const out = extractAndValidateChatClaims(withBlock('Team GIR 58.333%.', []), [team]);
    expect(out.claims).toBeNull();
    expect(out.strippedText).toBe('Team GIR 58.333%.');
  });

  it('treats an unparseable block as malformed', () => {
    const out = extractAndValidateChatClaims('x <<<CLAIMS>>>[{nope<<<END_CLAIMS>>>', [aliceGir]);
    expect(out.claims?.malformed).toBe(true);
    expect(out.strippedText).toBe('x');
  });
});
