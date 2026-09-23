/**
 * Addendum A7 slice 1 (repair plan 14.10, "chat publication waits for
 * validation") — the typed claim gate wired into `computeTurnVerdict` as its
 * third check. "Situational explanation" is the acceptance framing from the
 * addendum text: a short factual explanation citing a specific player's own
 * data must never display stronger certainty than its evidence packet.
 *
 * Each adversarial fixture runs the SAME pipeline `chat/stream/route.ts`
 * runs: build a single-player packet from the turn's measurements, parse and
 * validate the model's `<<<CLAIMS>>>` block against it, and hand the result
 * to `computeTurnVerdict`. Every fixture cites a number that IS present in
 * `measurements` — the numeric audit (the SECOND check, which runs before
 * this one) would accept every one of them on its own. That is deliberate:
 * a fixture the numeric audit already rejects proves nothing about the
 * typed gate specifically, since `computeTurnVerdict`'s first failing check
 * always wins and nothing downstream ever runs.
 */

import { describe, it, expect } from 'vitest';
import { computeTurnVerdict } from '@/lib/coachhelm/v3/chat/verdict';
import { buildSinglePlayerPacket } from '@/lib/coachhelm/v3/chat/claims-packet';
import { extractAndValidateClaimsSafe } from '@/lib/coachhelm/v3/llm/claims-block';
import type { Measurement } from '@/lib/coachhelm/v3/chat/provenance';
import type { ClaimReference, EvidencePacket } from '@/lib/coachhelm/v3/llm/claim-validator';

const WINDOW = { window_start: '2026-09-01T00:00:00.000Z', window_end: '2026-09-08T00:00:00.000Z' };
const OTHER_WINDOW = { window_start: '2026-08-01T00:00:00.000Z', window_end: '2026-08-08T00:00:00.000Z' };
const PLAYER = 'player-1';

function measurement(overrides: Partial<Measurement> = {}): Measurement {
  return {
    metric_id: 'putts_per_round',
    metric_label: 'Putts per round',
    unit: 'count',
    value: 28,
    entity: { kind: 'player', id: PLAYER, label: 'Alice' },
    window_start: WINDOW.window_start,
    window_end: WINDOW.window_end,
    sample_size: 18,
    sample_unit: 'rounds',
    as_of: '2026-09-08T12:00:00.000Z',
    coverage: 'complete',
    coverage_note: null,
    source: 'rounds',
    method: 'avg_putts',
    denominator: 43,
    benchmark: null,
    direction: 'lower_better',
    ...overrides,
  };
}

function claim(overrides: Partial<ClaimReference> = {}): ClaimReference {
  return {
    claim_id: 'c1',
    metric_id: 'putts_per_round',
    value: 28,
    player_id: PLAYER,
    window_start: WINDOW.window_start,
    window_end: WINDOW.window_end,
    unit: 'count',
    denominator: 43,
    claim_type: 'fact',
    ...overrides,
  };
}

/** The exact shape `chat/stream/route.ts` appends after the model's prose —
 *  see `instructions.ts`'s "Claims block" section. */
function withClaimsBlock(prose: string, claims: ClaimReference[]): string {
  return `${prose}\n\n<<<CLAIMS>>>\n${JSON.stringify(claims)}\n<<<END_CLAIMS>>>`;
}

/** Run the same three-step pipeline `execute` runs in route.ts. */
function runTurn(rawText: string, measurements: Measurement[]) {
  const packet = buildSinglePlayerPacket(measurements);
  const { strippedText, claims } = extractAndValidateClaimsSafe(rawText, packet);
  const verdict = computeTurnVerdict({
    streamComplete: true,
    text: strippedText,
    measurements,
    series: [],
    detailNumbers: [],
    claims,
  });
  return { packet, strippedText, claims, verdict };
}

describe('situational explanation — the typed claim gate (addendum A7 slice 1)', () => {
  it('control: an accurately attributed claim is accepted, and the block never reaches the stripped text', () => {
    // Cites both the entry's VALUE (28) AND its denominator (43) in prose.
    // `validateClaims`'s "uncited number" scan used to only treat a
    // claim/entry's own VALUE as citable, so "across 43 attempts" here
    // tripped `uncited_number` on an otherwise honest answer — a real gap
    // vs. the legacy numeric audit (which already treats a denominator as
    // supported). Fixed (chat re-review, 2026-09-23): the scan now also
    // credits the denominator/sample_n of any entry an ACCEPTED claim
    // actually names, so a real, correctly-cited attempt count no longer
    // needs its own separate claim to avoid a false rejection.
    const rawText = withClaimsBlock('Alice took 28 putts across 43 attempts this week.', [claim()]);
    const { verdict, strippedText } = runTurn(rawText, [measurement()]);

    expect(verdict).toEqual({ outcome: 'accepted' });
    expect(strippedText).not.toContain('<<<CLAIMS>>>');
    expect(strippedText).not.toContain('claim_id');
  });

  it('wrong-player: a claim citing the packet\'s real value under a DIFFERENT player id is rejected', () => {
    const rawText = withClaimsBlock(
      'Alice took 28 putts across 43 attempts this week.',
      [claim({ player_id: 'player-2' })],
    );
    const { verdict } = runTurn(rawText, [measurement()]);

    expect(verdict.outcome).toBe('rejected');
    if (verdict.outcome === 'rejected') {
      expect(verdict.reason).toBe('claim_validation_failed');
      expect(verdict.rejectedClaims?.[0]?.reason).toBe('wrong_player');
    }
  });

  it('wrong-window: a claim citing the packet\'s real value for a DIFFERENT window is rejected', () => {
    const rawText = withClaimsBlock(
      'Alice took 28 putts across 43 attempts this week.',
      [claim({ window_start: OTHER_WINDOW.window_start, window_end: OTHER_WINDOW.window_end })],
    );
    const { verdict } = runTurn(rawText, [measurement()]);

    expect(verdict.outcome).toBe('rejected');
    if (verdict.outcome === 'rejected') {
      expect(verdict.reason).toBe('claim_validation_failed');
      expect(verdict.rejectedClaims?.[0]?.reason).toBe('wrong_window');
    }
  });

  it('wrong-unit: the same real number, cited under the WRONG unit, is rejected', () => {
    const rawText = withClaimsBlock(
      'Alice took 28 putts across 43 attempts this week.',
      // 28 is really a count of putts, not a percent — the model attached
      // the wrong unit to a real, correctly-attributed value.
      [claim({ unit: 'percent' })],
    );
    const { verdict } = runTurn(rawText, [measurement()]);

    expect(verdict.outcome).toBe('rejected');
    if (verdict.outcome === 'rejected') {
      expect(verdict.reason).toBe('claim_validation_failed');
      expect(verdict.rejectedClaims?.[0]?.reason).toBe('wrong_unit');
    }
  });

  it('wrong-denominator: the same real number, cited over the WRONG attempt count, is rejected', () => {
    const rawText = withClaimsBlock(
      'Alice took 28 putts across 43 attempts this week.',
      // The measurement's real denominator is 43, not 18 — a swapped
      // denominator that a bare value/metric match cannot see.
      [claim({ denominator: 18 })],
    );
    const { verdict } = runTurn(rawText, [measurement()]);

    expect(verdict.outcome).toBe('rejected');
    if (verdict.outcome === 'rejected') {
      expect(verdict.reason).toBe('claim_validation_failed');
      expect(verdict.rejectedClaims?.[0]?.reason).toBe('wrong_denominator');
    }
  });

  it('unsupported-cause (mechanics): a causal claim over a correctly attributed number is rejected — chat evidence never carries causal backing', () => {
    // Deliberately no connective word ("because", "due to", "led to", …) —
    // a real chat answer reads this way, and the rejection must come from
    // the model's OWN claim_type:"causal" tag against evidence with no
    // causal_support, not from word-matching the prose.
    const rawText = withClaimsBlock(
      "Alice's grip tightens under pressure and her putt count climbed to 28 across 43 attempts this week.",
      [claim({ claim_type: 'causal' })],
    );
    const { verdict } = runTurn(rawText, [measurement()]);

    expect(verdict.outcome).toBe('rejected');
    if (verdict.outcome === 'rejected') {
      expect(verdict.reason).toBe('claim_validation_failed');
      expect(verdict.rejectedClaims?.[0]?.reason).toBe('unsupported_cause');
    }
  });

  it('unsupported-cause (psychology): same rejection for a confidence/mental-game framing, still with no "because"-style language', () => {
    const rawText = withClaimsBlock(
      "Alice is losing confidence on short putts, and her putt count climbed to 28 across 43 attempts this week.",
      [claim({ claim_type: 'causal' })],
    );
    const { verdict } = runTurn(rawText, [measurement()]);

    expect(verdict.outcome).toBe('rejected');
    if (verdict.outcome === 'rejected') {
      expect(verdict.reason).toBe('claim_validation_failed');
      expect(verdict.rejectedClaims?.[0]?.reason).toBe('unsupported_cause');
    }
  });

  it('a missing claims block, when the turn resolved a single-player packet, is rejected as malformed — silence is not acceptance', () => {
    const rawText = 'Alice took 28 putts across 43 attempts this week.';
    const { verdict, claims } = runTurn(rawText, [measurement()]);

    expect(claims?.malformed).toBe(true);
    expect(verdict.outcome).toBe('rejected');
    if (verdict.outcome === 'rejected') {
      expect(verdict.reason).toBe('claim_validation_failed');
      expect(verdict.rejectedClaims).toEqual([]);
    }
  });

  it('a not-engaged team-level turn (no single player resolves) still accepts — the typed gate never engages, only the numeric audit runs', () => {
    const teamMeasurement = measurement({
      metric_id: 'team_gir_pct',
      value: 62,
      entity: { kind: 'team', id: 'team-1', label: 'Wildcats' },
    });
    const rawText = 'The team is hitting 62% of greens in regulation this week.';
    const { packet, claims, verdict } = runTurn(rawText, [teamMeasurement]);

    expect(packet).toBeNull();
    expect(claims).toBeNull();
    expect(verdict).toEqual({ outcome: 'accepted' });
  });

  it('a multi-player turn (two players in one turn) does not engage the typed gate either', () => {
    const alice = measurement();
    const bob = measurement({ entity: { kind: 'player', id: 'player-2', label: 'Bob' } });
    const rawText = 'Both took 28 putts across 43 attempts this week.';
    const { packet, claims, verdict } = runTurn(rawText, [alice, bob]);

    expect(packet).toBeNull();
    expect(claims).toBeNull();
    expect(verdict).toEqual({ outcome: 'accepted' });
  });

  it('validator throws → fails closed to a rejection, never an unhandled crash or an accepted answer', () => {
    // A deliberately broken packet (not something `buildSinglePlayerPacket`
    // could produce) to exercise the defensive wrapper directly: `entries`
    // missing entirely trips a real TypeError inside `checkClaim`'s own
    // `packet.entries.find(...)`.
    const brokenPacket = { player_id: PLAYER, ...WINDOW } as unknown as EvidencePacket;
    const rawText = withClaimsBlock('Alice took 28 putts across 43 attempts this week.', [claim()]);

    const { strippedText, claims } = extractAndValidateClaimsSafe(rawText, brokenPacket);
    expect(claims?.malformed).toBe(true);
    expect(strippedText).not.toContain('<<<CLAIMS>>>');

    const verdict = computeTurnVerdict({
      streamComplete: true,
      text: strippedText,
      measurements: [measurement()],
      series: [],
      detailNumbers: [],
      claims,
    });
    expect(verdict.outcome).toBe('rejected');
    if (verdict.outcome === 'rejected') expect(verdict.reason).toBe('claim_validation_failed');
  });

  describe('ordering — the typed gate is the THIRD check, never reached once an earlier one fails', () => {
    it('an incomplete stream reports stream_incomplete, even though the claims block itself would fail typed validation', () => {
      const rawText = withClaimsBlock(
        'Alice took 28 putts across 43 attempts this week.',
        [claim({ player_id: 'player-2' })], // would fail wrong_player if reached
      );
      const packet = buildSinglePlayerPacket([measurement()]);
      const { strippedText, claims } = extractAndValidateClaimsSafe(rawText, packet);
      const verdict = computeTurnVerdict({
        streamComplete: false,
        text: strippedText,
        measurements: [measurement()],
        series: [],
        detailNumbers: [],
        claims,
      });

      expect(verdict).toMatchObject({ outcome: 'rejected', reason: 'stream_incomplete' });
    });

    it('an ungrounded numeric claim reports ungrounded_claims, even though a claims block naming a DIFFERENT rejection is also present', () => {
      // 71 appears nowhere in `measurements` — the numeric audit (second
      // check) rejects before the typed gate (third check) ever runs.
      const rawText = withClaimsBlock(
        'Alice made 71% of her short putts this week.',
        [claim({ player_id: 'player-2' })],
      );
      const { verdict } = runTurn(rawText, [measurement()]);

      expect(verdict.outcome).toBe('rejected');
      if (verdict.outcome === 'rejected') expect(verdict.reason).toBe('ungrounded_claims');
    });
  });
});
