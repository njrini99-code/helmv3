import { describe, expect, it } from 'vitest';
import type { AnalysisScope, HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';
import { computeParOpportunities } from '@/lib/coachhelm/v3/metrics/par-opportunities';
import type { MetricResult } from '@/lib/coachhelm/v3/metrics/types';
import {
  groupIssues,
  shotClaimId,
  type IssueOrigin,
  type IssueSourcePacket,
} from '@/lib/coachhelm/v3/ranking/situational-ranking';

/**
 * A6 slice 1 (repair-plan addendum §13) — issue grouping and
 * ranking-input unification. See `ranking/situational-ranking.ts`'s
 * module doc comment for the full contract.
 *
 * A2 (`distance-profile.ts`, #1989) and A4 (`sequence-attribution.ts`,
 * #1988) had not merged to `main` as of this slice, so their packets are
 * hand-built here in the shape their real adapters will eventually
 * produce (`IssueSourcePacket`, `origin: 'distance' | 'sequence'`) rather
 * than sourced from real modules. A3 (`par-opportunities.ts`) IS real and
 * merged — `parPacketFromRow` below is a test-local adapter (not a claim
 * about what a real production adapter's claimId scheme will look like)
 * that turns one of its actual `MetricResult` rows into a packet.
 */

function scope(overrides: Partial<AnalysisScope> = {}): AnalysisScope {
  return {
    player_id: 'p-1',
    window_start: null,
    window_end: null,
    analysis_cutoff: '2026-12-31T00:00:00.000Z',
    ...overrides,
  };
}

function hole(
  overrides: Partial<HoleContext> & Pick<HoleContext, 'round_id' | 'hole_number' | 'par' | 'total_strokes'>,
): HoleContext {
  return {
    course_id: null,
    penalty_strokes: 0,
    putts: 2,
    gir: null,
    yardage: null,
    ...overrides,
  };
}

function shot(overrides: Partial<ShotFact> & Pick<ShotFact, 'round_id' | 'hole_number' | 'shot_number'>): ShotFact {
  return {
    shot_type: 'unknown',
    club_type: null,
    intent: 'unknown',
    distance_to_hole_before_feet: null,
    distance_to_hole_after_feet: null,
    lie_before: null,
    lie_after: null,
    result: null,
    is_penalty: false,
    putt_made: null,
    observed_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

/** A par-5 play: tee shot, then approach shots up to `greenShotNumber`
 *  (which reaches the green), then `putts` putts. Mirrors
 *  `par-opportunities.test.ts`'s own fixture helper. */
function par5Play(opts: {
  round_id: string;
  course_id: string | null;
  hole_number: number;
  greenShotNumber: number;
  putts: 0 | 1 | 2 | 3;
}): { hole: HoleContext; facts: ShotFact[] } {
  const { round_id, course_id, hole_number, greenShotNumber, putts } = opts;
  const totalStrokes = greenShotNumber + putts;
  const facts: ShotFact[] = [];
  for (let n = 1; n <= greenShotNumber; n++) {
    const isGreenShot = n === greenShotNumber;
    facts.push(
      shot({
        round_id,
        hole_number,
        shot_number: n,
        shot_type: n === 1 ? 'tee' : 'approach',
        result: isGreenShot ? (putts === 0 ? 'hole' : 'green') : 'fairway',
      }),
    );
  }
  for (let p = 1; p <= putts; p++) {
    const shotNumber = greenShotNumber + p;
    facts.push(
      shot({
        round_id,
        hole_number,
        shot_number: shotNumber,
        shot_type: 'putting',
        club_type: 'putter',
        intent: 'putt',
        result: p === putts ? 'hole' : null,
        putt_made: p === putts,
      }),
    );
  }
  return {
    hole: hole({
      round_id,
      course_id,
      hole_number,
      par: 5,
      total_strokes: totalStrokes,
      putts,
    }),
    facts,
  };
}

/** Test-local adapter from a real A3 `MetricResult` row to a packet — see
 *  the file header. `sourceShotIds` is supplied by the caller (the test),
 *  since today's `MetricResult` carries no per-shot provenance (see
 *  `metrics/types.ts`'s own doc comment on why `sourceShotIds` isn't on
 *  it yet). */
function parPacketFromRow(row: MetricResult, sourceShotIds: string[]): IssueSourcePacket {
  return {
    claimId: `metric:${row.metricId}:${row.dimensions.course_hole_key ?? 'unknown'}`,
    origin: 'par',
    label: row.metricId,
    sourceShotIds,
    eligible: row.status === 'supported' || row.status === 'descriptive_only',
    strokesImpact: null, // real par-opportunities.ts computes no impact — see its file header
    confidence: null,
  };
}

function syntheticPacket(overrides: Partial<IssueSourcePacket> & Pick<IssueSourcePacket, 'claimId' | 'origin' | 'sourceShotIds'>): IssueSourcePacket {
  return {
    label: overrides.claimId,
    eligible: true,
    strokesImpact: null,
    confidence: null,
    ...overrides,
  };
}

describe('groupIssues — par, distance, and sequence describing the same source shots', () => {
  const ROUND = 'round-1';
  const HOLE = 7;
  const COURSE = 'course-a';

  // par-opportunities.ts's own HOLE_OPPORTUNITY_MIN_SAMPLE_N is 3 — two
  // extra plays of the SAME course_hole_key (different rounds) exist only
  // to clear that floor so the row is `status: 'supported'` and therefore
  // `eligible` per parPacketFromRow. The issue this test groups is anchored
  // to `play`'s own two approach shots specifically; the other two plays
  // never appear in any packet's `sourceShotIds`.
  const play = par5Play({ round_id: ROUND, course_id: COURSE, hole_number: HOLE, greenShotNumber: 3, putts: 2 });
  const extraPlay1 = par5Play({ round_id: 'round-1b', course_id: COURSE, hole_number: HOLE, greenShotNumber: 3, putts: 2 });
  const extraPlay2 = par5Play({ round_id: 'round-1c', course_id: COURSE, hole_number: HOLE, greenShotNumber: 3, putts: 2 });
  const parRows = computeParOpportunities(
    [...play.facts, ...extraPlay1.facts, ...extraPlay2.facts],
    [play.hole, extraPlay1.hole, extraPlay2.hole],
    scope(),
  );
  const opportunityRow = parRows.find((r) => r.metricId === 'par5_regulation_opportunity_rate')!;

  const approach1 = shotClaimId({ round_id: ROUND, hole_number: HOLE, shot_number: 2 });
  const approach2 = shotClaimId({ round_id: ROUND, hole_number: HOLE, shot_number: 3 });

  // par ↔ distance overlap on approach1 only; par ↔ sequence overlap on
  // approach2 only; distance and sequence share NO shot directly — the
  // transitive closure through `par` is what proves they still group.
  const parPacket = parPacketFromRow(opportunityRow, [approach1, approach2]);
  const distancePacket = syntheticPacket({
    claimId: 'metric:approach_distance_band:225_275',
    origin: 'distance',
    label: 'approach_distance_band',
    sourceShotIds: [approach1],
    eligible: true,
    strokesImpact: 0.9,
    confidence: 0.7,
  });
  const sequencePacket = syntheticPacket({
    claimId: 'sequence:par5-approach-chain:round-1:7',
    origin: 'sequence',
    label: 'par5_approach_chain',
    sourceShotIds: [approach2],
    eligible: true,
    strokesImpact: 1.4,
    confidence: 0.8,
  });

  // An unrelated hypothesis-origin packet on a totally different shot —
  // must never merge into the group above.
  const unrelatedShot = shotClaimId({ round_id: 'round-2', hole_number: 12, shot_number: 2 });
  const unrelatedPacket = syntheticPacket({
    claimId: 'hyp:rough_gap:round-2:12:2',
    origin: 'hypothesis',
    label: 'rough_gap',
    sourceShotIds: [unrelatedShot],
    eligible: true,
    strokesImpact: 0.3,
    confidence: 0.5,
  });

  // An ineligible packet sharing a shot with the group, carrying a huge
  // impact that must never win ownership or even appear — eligibility is
  // applied BEFORE grouping/scoring.
  const ineligiblePacket = syntheticPacket({
    claimId: 'metric:some_unsupported_row:x',
    origin: 'distance',
    label: 'some_unsupported_row',
    sourceShotIds: [approach1],
    eligible: false,
    strokesImpact: 99,
    confidence: 0.99,
  });

  const allPackets = [parPacket, distancePacket, sequencePacket, unrelatedPacket, ineligiblePacket];

  it('groups par, distance, and sequence into ONE issue via transitive shot overlap', () => {
    expect(opportunityRow.status).toBe('supported'); // precondition — see comment above
    const issues = groupIssues(allPackets);
    // One issue for the grouped trio, one singleton for the unrelated
    // hypothesis packet. The ineligible packet founds/joins nothing.
    expect(issues).toHaveLength(2);

    const grouped = issues.find((i) => i.claims.length > 1)!;
    expect(grouped).toBeDefined();
    expect(new Set(grouped.claims.map((c) => c.claimId))).toEqual(
      new Set([parPacket.claimId, distancePacket.claimId, sequencePacket.claimId]),
    );
    expect(grouped.sourceShotIds.sort()).toEqual([approach1, approach2].sort());
  });

  it('preserves drill-down: every member claim survives unmerged with its own origin/label', () => {
    const issues = groupIssues(allPackets);
    const grouped = issues.find((i) => i.claims.length > 1)!;
    const byId = new Map(grouped.claims.map((c) => [c.claimId, c]));
    expect(byId.get(parPacket.claimId)).toMatchObject({ origin: 'par', label: 'par5_regulation_opportunity_rate' });
    expect(byId.get(distancePacket.claimId)).toMatchObject({ origin: 'distance', label: 'approach_distance_band' });
    expect(byId.get(sequencePacket.claimId)).toMatchObject({ origin: 'sequence', label: 'par5_approach_chain' });
  });

  it('impact ownership is non-overlapping: the issue is not inflated by duplicate perspectives', () => {
    const issues = groupIssues(allPackets);
    const grouped = issues.find((i) => i.claims.length > 1)!;

    // sequence (1.4) > distance (0.9) > par (null) — sequence owns.
    expect(grouped.impactOwnership.ownerClaimId).toBe(sequencePacket.claimId);
    expect(new Set(grouped.impactOwnership.nonOwningClaimIds)).toEqual(
      new Set([parPacket.claimId, distancePacket.claimId]),
    );

    // The issue's policy input mirrors ONLY the owner — never the sum
    // (0.9 + 1.4 = 2.3) or an average across the three perspectives.
    expect(grouped.policyInput.strokesImpact).toBe(1.4);
    expect(grouped.policyInput.confidence).toBe(0.8);
  });

  it('one underlying issue yields one leading priority (a single deterministic owner, claims owner-first)', () => {
    const issues = groupIssues(allPackets);
    const grouped = issues.find((i) => i.claims.length > 1)!;
    expect(grouped.claims[0]!.claimId).toBe(sequencePacket.claimId);
  });

  it('opportunity frequency reflects only the real, deduplicated evidence', () => {
    const issues = groupIssues(allPackets);
    const grouped = issues.find((i) => i.claims.length > 1)!;
    expect(grouped.opportunityFrequency).toEqual({ shotCount: 2, distinctRounds: 1 });
    expect(grouped.policyInput.sampleSize).toBe(2);
  });

  it('an ineligible packet joins no issue and never wins ownership despite a larger claimed impact', () => {
    const issues = groupIssues(allPackets);
    const allClaimIds = issues.flatMap((i) => i.claims.map((c) => c.claimId));
    expect(allClaimIds).not.toContain(ineligiblePacket.claimId);
  });

  it('an unrelated packet on different shots forms its own separate issue', () => {
    const issues = groupIssues(allPackets);
    const singleton = issues.find((i) => i.claims.length === 1)!;
    expect(singleton.claims[0]!.claimId).toBe(unrelatedPacket.claimId);
    expect(singleton.sourceShotIds).toEqual([unrelatedShot]);
    expect(singleton.impactOwnership).toEqual({ ownerClaimId: unrelatedPacket.claimId, nonOwningClaimIds: [] });
  });

  it('is deterministic regardless of input packet order', () => {
    const forward = groupIssues(allPackets);
    const shuffled = groupIssues([...allPackets].reverse());
    expect(shuffled.map((i) => i.id)).toEqual(forward.map((i) => i.id));
    expect(shuffled).toEqual(forward);
  });
});

describe('groupIssues — tie-breaking and edge cases', () => {
  it('breaks an exact impact tie by ORIGIN_PRIORITY (par > distance > sequence > hypothesis)', () => {
    const s1 = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 1 });
    const packets: IssueSourcePacket[] = [
      syntheticPacket({ claimId: 'seq', origin: 'sequence', sourceShotIds: [s1], strokesImpact: 1.0, confidence: 0.6 }),
      syntheticPacket({ claimId: 'dist', origin: 'distance', sourceShotIds: [s1], strokesImpact: 1.0, confidence: 0.6 }),
      syntheticPacket({ claimId: 'hyp', origin: 'hypothesis', sourceShotIds: [s1], strokesImpact: 1.0, confidence: 0.6 }),
    ];
    const [issue] = groupIssues(packets);
    expect(issue!.impactOwnership.ownerClaimId).toBe('dist');
  });

  it('a null strokesImpact never outranks a real (including zero) impact', () => {
    const s1 = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 1 });
    const packets: IssueSourcePacket[] = [
      syntheticPacket({ claimId: 'par-no-impact', origin: 'par', sourceShotIds: [s1], strokesImpact: null }),
      syntheticPacket({ claimId: 'seq-zero-impact', origin: 'sequence', sourceShotIds: [s1], strokesImpact: 0 }),
    ];
    const [issue] = groupIssues(packets);
    expect(issue!.impactOwnership.ownerClaimId).toBe('seq-zero-impact');
    expect(issue!.policyInput.strokesImpact).toBe(0);
  });

  it('an empty packet list produces no issues', () => {
    expect(groupIssues([])).toEqual([]);
  });

  it('a packet with no source shots joins and founds nothing', () => {
    const packets: IssueSourcePacket[] = [
      syntheticPacket({ claimId: 'no-shots', origin: 'hypothesis', sourceShotIds: [] }),
    ];
    expect(groupIssues(packets)).toEqual([]);
  });

  it('stable issue identity: the same underlying evidence produces the same id every time', () => {
    const s1 = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 1 });
    const s2 = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 2 });
    const build = (): IssueSourcePacket[] => [
      syntheticPacket({ claimId: 'a', origin: 'par', sourceShotIds: [s1] }),
      syntheticPacket({ claimId: 'b', origin: 'distance', sourceShotIds: [s1, s2] }),
    ];
    const first = groupIssues(build());
    const second = groupIssues(build());
    expect(first.map((i) => i.id)).toEqual(second.map((i) => i.id));
  });

  it('two packets sharing no shot at all never merge, even from the same origin', () => {
    const s1 = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 1 });
    const s2 = shotClaimId({ round_id: 'r', hole_number: 2, shot_number: 1 });
    const packets: IssueSourcePacket[] = [
      syntheticPacket({ claimId: 'a', origin: 'par', sourceShotIds: [s1] }),
      syntheticPacket({ claimId: 'b', origin: 'par', sourceShotIds: [s2] }),
    ];
    const issues = groupIssues(packets);
    expect(issues).toHaveLength(2);
  });
});

// Exercised for lint/typecheck purposes only — confirms IssueOrigin's
// literal union is what syntheticPacket's callers above rely on.
const _originsUsed: IssueOrigin[] = ['par', 'distance', 'sequence', 'hypothesis'];
void _originsUsed;
