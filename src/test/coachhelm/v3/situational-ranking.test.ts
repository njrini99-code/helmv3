import { describe, expect, it } from 'vitest';
import type { AnalysisScope, HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';
import { computeDistanceProfile } from '@/lib/coachhelm/v3/metrics/distance-profile';
import { computeParOpportunities } from '@/lib/coachhelm/v3/metrics/par-opportunities';
import {
  attributeSequence,
  computeSequenceAttribution,
  type SequenceAttributionResult,
  type SequenceEvent,
} from '@/lib/coachhelm/v3/metrics/sequence-attribution';
import type { MetricResult } from '@/lib/coachhelm/v3/metrics/types';
import {
  applyMaterialChangeSuppression,
  groupIssues,
  issueToRankableInsight,
  shotClaimId,
  type ActiveIntervention,
  type Issue,
  type IssueOrigin,
  type IssueSourcePacket,
} from '@/lib/coachhelm/v3/ranking/situational-ranking';
import { rankInsights } from '@/lib/coachhelm/v3/ranking/score';

/**
 * A6 slice 1 (repair-plan addendum §13) — issue grouping and
 * ranking-input unification. See `ranking/situational-ranking.ts`'s
 * module doc comment for the full contract.
 *
 * A2 (`distance-profile.ts`, #1989) and A4 (`sequence-attribution.ts`,
 * #1988) merged to `main` during this slice — the main grouping fixture
 * below calls all three of A2/A3/A4's real, merged compute functions, so
 * every metric VALUE and STATUS the fixture asserts on is real, not
 * hand-picked. `sourceShotIds` — the actual join key `groupIssues` reads —
 * is still test-supplied for every packet, not derived from the real
 * functions' own return values: `MetricResult` (A2/A3) and
 * `SequenceAttributionResult` (A4) carry no per-shot provenance field (see
 * `metrics/types.ts`'s own doc comment on why `sourceShotIds` isn't on it
 * yet), so an honest adapter — here, the small test-local functions below —
 * must supply it from outside the family's own output. This fixture is
 * not a claim about what a real production adapter's claimId scheme will
 * look like; that wiring is a later slice's job. The "tie-breaking and
 * edge cases" describe block below stays on hand-built synthetic packets
 * on purpose: those tests exercise `groupIssues`'s own algorithm
 * (ownership sign/tie-breaks, eligibility-after-grouping, empty input,
 * determinism) independent of any one family's real shape, not a claim
 * about A2/A3/A4 behavior.
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
    miss_direction: null,
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

/** Test-local adapter from a real A2 `MetricResult` row — same rationale
 *  as `parPacketFromRow`. A2 also computes no strokes-impact number (only
 *  rates/counts/proximity-feet — see `distance-profile.ts`'s file header),
 *  so `strokesImpact` is honestly `null` here too. */
function distancePacketFromRow(row: MetricResult, sourceShotIds: string[]): IssueSourcePacket {
  return {
    claimId: `metric:${row.metricId}:${row.dimensions.band}`,
    origin: 'distance',
    label: row.metricId,
    sourceShotIds,
    eligible: row.status === 'supported' || row.status === 'descriptive_only',
    strokesImpact: null,
    confidence: null,
  };
}

/** Test-local adapter from a real A4 `SequenceEvent` — the one family here
 *  that DOES compute a genuine strokes-gained-style number
 *  (`measuredContribution`), so it is honestly non-null when the event
 *  resolved (no `baselineGap`). No confidence notion applies to an exact
 *  computed value, so that field stays `null` like the others. */
function sequencePacketFromEvent(result: SequenceAttributionResult, event: SequenceEvent): IssueSourcePacket {
  const sourceShotIds = event.shotNumbers.map((n) =>
    shotClaimId({ round_id: result.round_id, hole_number: result.hole_number, shot_number: n }),
  );
  return {
    claimId: `sequence:${event.kind}:${result.round_id}:${result.hole_number}:${event.shotNumbers.join('-')}`,
    origin: 'sequence',
    label: event.kind,
    sourceShotIds,
    eligible: event.measuredContribution !== null,
    strokesImpact: event.measuredContribution,
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

/** A6 slice 2's corrected sequence adapter — gates `eligible` on the
 *  event's KIND clearing the #2020 rollup's scope-wide floor
 *  (`computeSequenceAttribution`'s `sequence_event_strokes_gained` row
 *  being `status: 'supported'`), never on the single event's own
 *  `measuredContribution !== null` alone (slice 1's `sequencePacketFromEvent`
 *  above, which this fixture deliberately does NOT use, would let one
 *  hole's single occurrence found or own an issue with no population
 *  behind it). The packet's own `sourceShotIds`/`strokesImpact` still
 *  describe this ONE occurrence — only eligibility is gated scope-wide;
 *  see `situational-ranking.ts`'s module doc comment, "Slice 2
 *  additions". `evidenceKey` is kind-level (not shot/hole-specific) so
 *  material-change suppression recognizes "the same pattern" across a
 *  re-run with different underlying shots. */
function sequencePacketFromRollupGatedEvent(
  result: SequenceAttributionResult,
  event: SequenceEvent,
  kindRow: MetricResult,
): IssueSourcePacket {
  const sourceShotIds = event.shotNumbers.map((n) =>
    shotClaimId({ round_id: result.round_id, hole_number: result.hole_number, shot_number: n }),
  );
  return {
    claimId: `sequence:${event.kind}:${result.round_id}:${result.hole_number}:${event.shotNumbers.join('-')}`,
    origin: 'sequence',
    label: event.kind,
    sourceShotIds,
    eligible: kindRow.status === 'supported',
    strokesImpact: event.measuredContribution,
    confidence: null,
    evidenceKey: `sequence:${event.kind}`,
  };
}

/** A minimal par-4 hole that always yields exactly one resolved
 *  `approach_to_recovery` event (tee→fairway, approach-miss→rough,
 *  recovery→green, single putt — mirrors A4's own `CONSERVATION_HOLE`
 *  shape in `sequence-attribution.test.ts`). Used to build a
 *  multi-round, multi-hole fixture large enough to clear the #2020
 *  rollup's `SEQUENCE_MIN_EVENTS`/`SEQUENCE_MIN_ROUNDS` floors for that
 *  one kind — filler evidence, never itself appearing in any packet's
 *  `sourceShotIds` below. */
function recoveryHole(round_id: string, hole_number: number): { hole: HoleContext; facts: ShotFact[] } {
  const facts: ShotFact[] = [
    shot({
      round_id, hole_number, shot_number: 1, shot_type: 'tee',
      lie_before: 'tee', distance_to_hole_before_feet: 1500,
      lie_after: 'fairway', distance_to_hole_after_feet: 300, result: 'fairway',
    }),
    shot({
      round_id, hole_number, shot_number: 2, shot_type: 'approach',
      lie_before: 'fairway', distance_to_hole_before_feet: 300,
      lie_after: 'rough', distance_to_hole_after_feet: 60, result: 'rough',
    }),
    shot({
      round_id, hole_number, shot_number: 3, shot_type: 'around_green',
      lie_before: 'rough', distance_to_hole_before_feet: 60,
      lie_after: 'green', distance_to_hole_after_feet: 5, result: 'green',
    }),
    shot({
      round_id, hole_number, shot_number: 4, shot_type: 'putting', club_type: 'putter', intent: 'putt',
      lie_before: 'green', distance_to_hole_before_feet: 5,
      lie_after: 'hole', distance_to_hole_after_feet: 0, result: 'hole', putt_made: true,
    }),
  ];
  return { hole: hole({ round_id, hole_number, par: 4, total_strokes: 4, putts: 1 }), facts };
}

/** Attaches the distance/lie detail `par5Play`'s own fixture omits (A3
 *  never reads it, so the shared helper leaves it null) — needed for A2
 *  (band bucketing) and A4 (strokes-gained resolution) to compute a real
 *  value from this exact sequence: a big drive to 100yd out, a fairway
 *  shot to 20ft short, a green-finding approach to 15ft, a lag putt to
 *  5ft, then holed out. Continuity holds (each shot's `before` matches
 *  the previous shot's `after`). */
function withSequenceDetail(facts: readonly ShotFact[]): ShotFact[] {
  const detail: Record<number, Partial<ShotFact>> = {
    1: { lie_before: 'tee', distance_to_hole_before_feet: 1500, lie_after: 'fairway', distance_to_hole_after_feet: 300 },
    2: { lie_before: 'fairway', distance_to_hole_before_feet: 300, lie_after: 'fairway', distance_to_hole_after_feet: 60 },
    3: { lie_before: 'fairway', distance_to_hole_before_feet: 60, lie_after: 'green', distance_to_hole_after_feet: 15 },
    4: { lie_before: 'green', distance_to_hole_before_feet: 15, lie_after: 'green', distance_to_hole_after_feet: 5 },
    5: { lie_before: 'green', distance_to_hole_before_feet: 5, lie_after: 'green', distance_to_hole_after_feet: 0 },
  };
  return facts.map((f) => ({ ...f, ...(f.shot_number !== null ? detail[f.shot_number] : undefined) }));
}

/** A2's own MIN_ATTEMPTS(10)/MIN_ROUNDS(3) support floor, cleared with
 *  filler approach shots on an unrelated hole — never appearing in any
 *  packet's `sourceShotIds`, existing only so the real row is
 *  `status: 'supported'`. */
function fillerApproachShot(round_id: string, shot_number: number): ShotFact {
  return shot({
    round_id,
    hole_number: 1,
    shot_number,
    shot_type: 'approach',
    distance_to_hole_before_feet: 300, // 100yd — same band as approach1 below
    result: 'rough',
  });
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

  const sequenceFacts = withSequenceDetail(play.facts);
  const sequenceResult = attributeSequence(sequenceFacts, play.hole, scope());
  const approachEvent = sequenceResult.events.find((e) => e.kind === 'approach_to_recovery')!;

  const fillers = [
    ...[101, 102, 103, 104].map((n) => fillerApproachShot(ROUND, n)),
    ...[101, 102, 103].map((n) => fillerApproachShot('round-1b', n)),
    ...[101, 102].map((n) => fillerApproachShot('round-1c', n)),
  ];
  const distanceRows = computeDistanceProfile(
    [sequenceFacts.find((f) => f.shot_number === 2)!, ...fillers],
    scope(),
    [play.hole, extraPlay1.hole, extraPlay2.hole],
  );
  const greenHitRow = distanceRows.find((r) => r.metricId === 'approach_green_hit_rate' && r.dimensions.band === '50_125ft')!;

  // par covers BOTH approach shots (its own opportunity-creation check
  // spans the whole hole); the real A4 event also covers both (the same
  // fairway-miss-then-green-find chain, see `approach_to_recovery`'s own
  // grouping rule); distance covers only approach1's own band membership.
  // Distance and par/sequence still share approach1 directly — this
  // fixture proves the union correctly DEDUPLICATES that overlap rather
  // than needing a purely transitive chain to prove grouping at all (a
  // purely transitive case is covered separately below).
  const parPacket = parPacketFromRow(opportunityRow, [approach1, approach2]);
  const distancePacket = distancePacketFromRow(greenHitRow, [approach1]);
  const sequencePacket = sequencePacketFromEvent(sequenceResult, approachEvent);

  // An unrelated hypothesis-origin packet on a totally different shot —
  // must never merge into the group above.
  const unrelatedShot = shotClaimId({ round_id: 'round-2', hole_number: 12, shot_number: 2 });
  const unrelatedPacket = syntheticPacket({
    claimId: 'hyp:rough_gap:round-2:12:2',
    origin: 'hypothesis',
    label: 'rough_gap',
    sourceShotIds: [unrelatedShot],
    eligible: true,
    strokesImpact: -0.3, // a genuine loss, so this singleton owns itself
    confidence: 0.5,
  });

  // An ineligible packet sharing a shot with the group, carrying a huge
  // LOSS (negative — a real ownership candidate by sign alone) that must
  // never win ownership or even appear: eligibility still gates ownership
  // and scoring, even though grouping itself now runs before eligibility.
  const ineligiblePacket = syntheticPacket({
    claimId: 'metric:some_unsupported_row:x',
    origin: 'distance',
    label: 'some_unsupported_row',
    sourceShotIds: [approach1],
    eligible: false,
    strokesImpact: -99,
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
    expect(byId.get(distancePacket.claimId)).toMatchObject({ origin: 'distance', label: 'approach_green_hit_rate' });
    expect(byId.get(sequencePacket.claimId)).toMatchObject({ origin: 'sequence', label: 'approach_to_recovery' });
  });

  it('impact ownership is non-overlapping: the issue is not inflated by duplicate perspectives', () => {
    // Precondition: A4 resolved a real, NEGATIVE (strokes-lost) number here
    // (neither endpoint hit a baselineGap, and this par-5 approach came up
    // short of expectation) — this test is meaningless against a null, and
    // ownership specifically requires a loss, not just any real number.
    expect(approachEvent.measuredContribution).not.toBeNull();
    expect(approachEvent.measuredContribution).toBeLessThan(0);

    const issues = groupIssues(allPackets);
    const grouped = issues.find((i) => i.claims.length > 1)!;

    // par and distance compute NO strokes-impact number at all (both
    // file headers say so) — only sequence's measuredContribution is a
    // real number, so it owns by being the only real claim, not by
    // out-competing a rival number.
    expect(grouped.impactOwnership.ownerClaimId).toBe(sequencePacket.claimId);
    expect(new Set(grouped.impactOwnership.nonOwningClaimIds)).toEqual(
      new Set([parPacket.claimId, distancePacket.claimId]),
    );

    // The issue's policy input mirrors ONLY the owner's real number —
    // par's and distance's null contributions never turn into a fabricated
    // 0 that gets added to it.
    expect(grouped.policyInput.strokesImpact).toBe(approachEvent.measuredContribution);
    expect(grouped.policyInput.confidence).toBe(0); // owner's confidence is null → policyInput's documented `?? 0`
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
    // Values must be genuine LOSSES (negative) to be ownership candidates
    // at all — a tie among strengths would resolve to "no owner", not to
    // origin priority.
    const packets: IssueSourcePacket[] = [
      syntheticPacket({ claimId: 'seq', origin: 'sequence', sourceShotIds: [s1], strokesImpact: -1.0, confidence: 0.6 }),
      syntheticPacket({ claimId: 'dist', origin: 'distance', sourceShotIds: [s1], strokesImpact: -1.0, confidence: 0.6 }),
      syntheticPacket({ claimId: 'hyp', origin: 'hypothesis', sourceShotIds: [s1], strokesImpact: -1.0, confidence: 0.6 }),
    ];
    const [issue] = groupIssues(packets);
    expect(issue!.impactOwnership.ownerClaimId).toBe('dist');
  });

  it('a null strokesImpact never outranks a real loss, however small', () => {
    const s1 = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 1 });
    const packets: IssueSourcePacket[] = [
      syntheticPacket({ claimId: 'par-no-impact', origin: 'par', sourceShotIds: [s1], strokesImpact: null }),
      syntheticPacket({ claimId: 'seq-tiny-loss', origin: 'sequence', sourceShotIds: [s1], strokesImpact: -0.01 }),
    ];
    const [issue] = groupIssues(packets);
    expect(issue!.impactOwnership.ownerClaimId).toBe('seq-tiny-loss');
    expect(issue!.policyInput.strokesImpact).toBe(-0.01);
  });

  it('only a strokes-lost claim may own an issue — a strength never owns, however large', () => {
    const s1 = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 1 });
    const packets: IssueSourcePacket[] = [
      syntheticPacket({ claimId: 'weakness', origin: 'sequence', sourceShotIds: [s1], strokesImpact: -0.4, confidence: 0.7 }),
      syntheticPacket({ claimId: 'strength', origin: 'distance', sourceShotIds: [s1], strokesImpact: 2.0, confidence: 0.9 }),
    ];
    const [issue] = groupIssues(packets);
    expect(issue!.impactOwnership.ownerClaimId).toBe('weakness');
    expect(issue!.impactOwnership.nonOwningClaimIds).toEqual(['strength']);
    expect(issue!.policyInput.strokesImpact).toBe(-0.4);
    expect(issue!.policyInput.confidence).toBe(0.7);
  });

  it('a group with no loss at all (strengths and/or nulls only) has no impact owner', () => {
    const s1 = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 1 });
    const packets: IssueSourcePacket[] = [
      syntheticPacket({ claimId: 'strength', origin: 'distance', sourceShotIds: [s1], strokesImpact: 2.0, confidence: 0.9 }),
      syntheticPacket({ claimId: 'zero', origin: 'sequence', sourceShotIds: [s1], strokesImpact: 0, confidence: 0.5 }),
      syntheticPacket({ claimId: 'no-number', origin: 'par', sourceShotIds: [s1], strokesImpact: null }),
    ];
    const [issue] = groupIssues(packets);
    expect(issue!.impactOwnership.ownerClaimId).toBeNull();
    expect(new Set(issue!.impactOwnership.nonOwningClaimIds)).toEqual(new Set(['strength', 'zero', 'no-number']));
    expect(issue!.claims.map((c) => c.claimId).sort()).toEqual(['no-number', 'strength', 'zero']);
    expect(issue!.policyInput).toEqual({ strokesImpact: 0, confidence: 0, sampleSize: 0 });
  });

  it("policyInput.sampleSize mirrors only the owner's own sample, never the union", () => {
    const shared = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 1 });
    const aggregateOnlyShots = Array.from({ length: 38 }, (_, i) =>
      shotClaimId({ round_id: 'r', hole_number: 1, shot_number: i + 2 }),
    );
    const owner = syntheticPacket({
      claimId: 'owner-1-shot',
      origin: 'sequence',
      sourceShotIds: [shared],
      strokesImpact: -0.5,
      confidence: 0.6,
    });
    const aggregate = syntheticPacket({
      claimId: 'aggregate-39-shots',
      origin: 'par',
      sourceShotIds: [shared, ...aggregateOnlyShots],
      strokesImpact: null,
    });
    const [issue] = groupIssues([owner, aggregate]);
    expect(issue!.opportunityFrequency.shotCount).toBe(39); // the union — unaffected
    expect(issue!.impactOwnership.ownerClaimId).toBe('owner-1-shot');
    expect(issue!.policyInput.sampleSize).toBe(1); // the owner's own sample, not 39 or 40
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

  it('a true A-B-C chain groups transitively even when A and C share no shot directly', () => {
    const sAB = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 1 });
    const sBC = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 2 });
    const a = syntheticPacket({ claimId: 'a', origin: 'par', sourceShotIds: [sAB], strokesImpact: -0.2 });
    const b = syntheticPacket({ claimId: 'b', origin: 'distance', sourceShotIds: [sAB, sBC] });
    const c = syntheticPacket({ claimId: 'c', origin: 'sequence', sourceShotIds: [sBC], strokesImpact: -0.6 });

    const issues = groupIssues([a, b, c]);
    expect(issues).toHaveLength(1);
    expect(new Set(issues[0]!.claims.map((claim) => claim.claimId))).toEqual(new Set(['a', 'b', 'c']));
    expect(issues[0]!.impactOwnership.ownerClaimId).toBe('c'); // larger loss magnitude
  });

  it('an ineligible packet still bridges a chain: eligibility is applied AFTER grouping, not before', () => {
    const sAB = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 1 });
    const sBC = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 2 });
    const bOnlyShot = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 3 });
    const a = syntheticPacket({ claimId: 'a', origin: 'par', sourceShotIds: [sAB], strokesImpact: -0.3 });
    const bridge = syntheticPacket({
      claimId: 'bridge',
      origin: 'distance',
      sourceShotIds: [sAB, sBC, bOnlyShot],
      eligible: false,
      strokesImpact: -99, // must never surface or own despite the huge magnitude
    });
    const c = syntheticPacket({ claimId: 'c', origin: 'sequence', sourceShotIds: [sBC], strokesImpact: -0.5 });

    const issues = groupIssues([a, bridge, c]);
    // a and c share no shot directly — without the ineligible bridge still
    // participating in union-find, this would wrongly split into 2 issues.
    expect(issues).toHaveLength(1);
    const [issue] = issues;
    expect(new Set(issue!.claims.map((claim) => claim.claimId))).toEqual(new Set(['a', 'c']));
    expect(issue!.impactOwnership.ownerClaimId).toBe('c');
    // The hidden bridge's own private shot must never leak into the
    // surfaced issue's sourceShotIds.
    expect(issue!.sourceShotIds).not.toContain(bOnlyShot);
    expect(issue!.sourceShotIds.sort()).toEqual([sAB, sBC].sort());
  });

  it('a group where every member is ineligible surfaces no issue at all', () => {
    const s1 = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 1 });
    const packets: IssueSourcePacket[] = [
      syntheticPacket({ claimId: 'a', origin: 'par', sourceShotIds: [s1], eligible: false }),
      syntheticPacket({ claimId: 'b', origin: 'distance', sourceShotIds: [s1], eligible: false }),
    ];
    expect(groupIssues(packets)).toEqual([]);
  });

  it('two different unknown shots (null hole/shot number) never collide into one issue', () => {
    // Both render to the SAME fixed marker (`shot:r:unknown:unknown`) —
    // that's fine and deterministic; `groupIssues` deliberately never
    // uses that marker as a union-find join key, so two packets sharing
    // it never merge on that basis alone. Only a matching KNOWN shot id
    // can merge two packets.
    const unknown1 = shotClaimId({ round_id: 'r', hole_number: null, shot_number: null });
    const unknown2 = shotClaimId({ round_id: 'r', hole_number: null, shot_number: null });
    expect(unknown1).toBe(unknown2);

    const packets: IssueSourcePacket[] = [
      syntheticPacket({ claimId: 'a', origin: 'par', sourceShotIds: [unknown1] }),
      syntheticPacket({ claimId: 'b', origin: 'distance', sourceShotIds: [unknown2] }),
    ];
    expect(groupIssues(packets)).toHaveLength(2);
  });

  it('stable issue identity holds even for a packet with an unknown-numbered shot', () => {
    // The old per-call-counter scheme made this non-reproducible (a fresh
    // counter value every call); the fixed-marker scheme is pure, so the
    // same input always yields the same id.
    const build = (): IssueSourcePacket[] => [
      syntheticPacket({
        claimId: 'solo',
        origin: 'hypothesis',
        sourceShotIds: [shotClaimId({ round_id: 'r', hole_number: null, shot_number: null })],
      }),
    ];
    const first = groupIssues(build());
    const second = groupIssues(build());
    expect(first.map((i) => i.id)).toEqual(second.map((i) => i.id));
  });

  it("an unknown shot from one packet is disambiguated by claimId, never dropped by dedup, when it shares an issue with another packet's unknown shot", () => {
    const known = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 1 });
    const unknownA = shotClaimId({ round_id: 'r', hole_number: null, shot_number: null });
    const unknownB = shotClaimId({ round_id: 'r', hole_number: null, shot_number: null });
    expect(unknownA).toBe(unknownB); // same literal marker

    const a = syntheticPacket({ claimId: 'a', origin: 'par', sourceShotIds: [known, unknownA] });
    const b = syntheticPacket({ claimId: 'b', origin: 'distance', sourceShotIds: [known, unknownB] });

    const [issue] = groupIssues([a, b]);
    // Both packets' distinct unknown shots must survive in the issue's own
    // sourceShotIds (qualified by claimId), not collapse into one entry
    // via a naive Set dedup on the raw marker string.
    expect(issue!.sourceShotIds).toHaveLength(3); // known + a's unknown + b's unknown
  });

  it('rejects two distinct packets sharing the same claimId instead of silently dropping one', () => {
    const s1 = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 1 });
    const s2 = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 2 });
    const packets: IssueSourcePacket[] = [
      syntheticPacket({ claimId: 'dup', origin: 'par', sourceShotIds: [s1], strokesImpact: -1 }),
      syntheticPacket({ claimId: 'dup', origin: 'distance', sourceShotIds: [s1, s2] }),
    ];
    expect(() => groupIssues(packets)).toThrow(/duplicate claimId "dup"/);
  });

  it('is deterministic across many random permutations of the input, not just a single reversal', () => {
    const s1 = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 1 });
    const s2 = shotClaimId({ round_id: 'r', hole_number: 1, shot_number: 2 });
    const s3 = shotClaimId({ round_id: 'r', hole_number: 2, shot_number: 1 });
    const s4 = shotClaimId({ round_id: 'r', hole_number: 3, shot_number: 1 });
    const packets: IssueSourcePacket[] = [
      syntheticPacket({ claimId: 'a', origin: 'par', sourceShotIds: [s1], strokesImpact: -0.2 }),
      syntheticPacket({ claimId: 'b', origin: 'distance', sourceShotIds: [s1, s2] }),
      syntheticPacket({ claimId: 'c', origin: 'sequence', sourceShotIds: [s2], strokesImpact: -0.6 }),
      syntheticPacket({ claimId: 'd', origin: 'hypothesis', sourceShotIds: [s3], strokesImpact: 1.2 }),
      syntheticPacket({ claimId: 'e', origin: 'par', sourceShotIds: [s4] }),
    ];

    // Deterministic seeded PRNG (mulberry32) — a fixed seed makes this
    // reproducible while still exercising many distinct orderings, not
    // just a single hand-picked reversal.
    function mulberry32(seed: number): () => number {
      let a = seed;
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function shuffled(input: readonly IssueSourcePacket[], rand: () => number): IssueSourcePacket[] {
      const arr = [...input];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [arr[i], arr[j]] = [arr[j]!, arr[i]!];
      }
      return arr;
    }

    const baseline = groupIssues(packets);
    for (let seed = 1; seed <= 8; seed++) {
      const permuted = shuffled(packets, mulberry32(seed));
      const result = groupIssues(permuted);
      expect(result).toEqual(baseline);
    }
  });
});

// ---------------------------------------------------------------------------
// A6 slice 2 (repair-plan addendum §13). Builds on slice 1's own fixture
// pattern (real A2/A3 compute functions + a real A4 result) but adds the
// #2020 rollup (`computeSequenceAttribution`) as the sequence packet's
// ELIGIBILITY gate, and exercises the two genuinely new slice-2 pieces:
// `Issue.evidenceKey` / `applyMaterialChangeSuppression`, and
// `issueToRankableInsight`. Deliberately a SEPARATE fixture from slice 1's
// (different round/hole ids throughout) so slice 1's own pinned tests are
// never touched.
// ---------------------------------------------------------------------------
describe('groupIssues — par, distance, and sequence via the #2020 rollup-gated eligibility gate (A6 slice 2)', () => {
  const ROUND = 'seq-rollup-r1';
  const HOLE = 15;
  const COURSE = 'course-rollup';

  // Same par-5 shape as slice 1's `play` (greenShotNumber=3, putts=2),
  // on its own round/hole so this fixture is fully independent.
  const play = par5Play({ round_id: ROUND, course_id: COURSE, hole_number: HOLE, greenShotNumber: 3, putts: 2 });
  const extraPlay1 = par5Play({ round_id: 'seq-rollup-r1b', course_id: COURSE, hole_number: HOLE, greenShotNumber: 3, putts: 2 });
  const extraPlay2 = par5Play({ round_id: 'seq-rollup-r1c', course_id: COURSE, hole_number: HOLE, greenShotNumber: 3, putts: 2 });
  const parRows = computeParOpportunities(
    [...play.facts, ...extraPlay1.facts, ...extraPlay2.facts],
    [play.hole, extraPlay1.hole, extraPlay2.hole],
    scope(),
  );
  const opportunityRow = parRows.find((r) => r.metricId === 'par5_regulation_opportunity_rate')!;

  const approach1 = shotClaimId({ round_id: ROUND, hole_number: HOLE, shot_number: 2 });
  const approach2 = shotClaimId({ round_id: ROUND, hole_number: HOLE, shot_number: 3 });

  const fillers = [
    ...[101, 102, 103, 104].map((n) => fillerApproachShot(ROUND, n)),
    ...[101, 102, 103].map((n) => fillerApproachShot('seq-rollup-r1b', n)),
    ...[101, 102].map((n) => fillerApproachShot('seq-rollup-r1c', n)),
  ];
  const distanceRows = computeDistanceProfile(
    [withSequenceDetail(play.facts).find((f) => f.shot_number === 2)!, ...fillers],
    scope(),
    [play.hole, extraPlay1.hole, extraPlay2.hole],
  );
  const greenHitRow = distanceRows.find((r) => r.metricId === 'approach_green_hit_rate' && r.dimensions.band === '50_125ft')!;

  // The anchor event, resolved via the real per-hole `attributeSequence` —
  // this ONE occurrence's own shots/impact are what the packet describes.
  const sequenceFacts = withSequenceDetail(play.facts);
  const sequenceResult = attributeSequence(sequenceFacts, play.hole, scope());
  const approachEvent = sequenceResult.events.find((e) => e.kind === 'approach_to_recovery')!;

  // 9 filler `approach_to_recovery` events (never appearing in any
  // packet's own `sourceShotIds`) across 2 MORE distinct rounds, so the
  // KIND clears the #2020 rollup's SEQUENCE_MIN_EVENTS(10)/
  // SEQUENCE_MIN_ROUNDS(3) floor: anchor (1, round seq-rollup-r1) + 3 more
  // in seq-rollup-r1 + 3 in seq-rollup-r2 + 3 in seq-rollup-r3 = 10 events
  // / 3 rounds — exactly at both floors.
  const recoveryFillers = [
    recoveryHole(ROUND, 16), recoveryHole(ROUND, 17), recoveryHole(ROUND, 18),
    recoveryHole('seq-rollup-r2', 15), recoveryHole('seq-rollup-r2', 16), recoveryHole('seq-rollup-r2', 17),
    recoveryHole('seq-rollup-r3', 15), recoveryHole('seq-rollup-r3', 16), recoveryHole('seq-rollup-r3', 17),
  ];
  const sequenceRows = computeSequenceAttribution(
    [...sequenceFacts, ...recoveryFillers.flatMap((f) => f.facts)],
    [play.hole, ...recoveryFillers.map((f) => f.hole)],
    scope(),
  );
  const approachToRecoveryRow = sequenceRows.find(
    (r) => r.metricId === 'sequence_event_strokes_gained' && r.dimensions.event_kind === 'approach_to_recovery',
  )!;

  const parPacket: IssueSourcePacket = {
    ...parPacketFromRow(opportunityRow, [approach1, approach2]),
    evidenceKey: `par:${opportunityRow.metricId}:${COURSE}:${HOLE}`,
  };
  const distancePacket: IssueSourcePacket = {
    ...distancePacketFromRow(greenHitRow, [approach1]),
    evidenceKey: `distance:${greenHitRow.metricId}:${greenHitRow.dimensions.band}`,
  };
  const sequencePacket = sequencePacketFromRollupGatedEvent(sequenceResult, approachEvent, approachToRecoveryRow);

  const allPackets = [parPacket, distancePacket, sequencePacket];

  it('clears the rollup floor as a precondition, then groups all three into one issue', () => {
    expect(opportunityRow.status).toBe('supported');
    expect(approachToRecoveryRow.status).toBe('supported');
    expect(approachToRecoveryRow.denominator).toBe(10);
    expect(approachToRecoveryRow.distinctRounds).toBe(3);

    const issues = groupIssues(allPackets);
    expect(issues).toHaveLength(1);
    const [issue] = issues;
    expect(new Set(issue!.claims.map((c) => c.claimId))).toEqual(
      new Set([parPacket.claimId, distancePacket.claimId, sequencePacket.claimId]),
    );
    // Gated by the rollup, but still describes only THIS occurrence — not
    // every shot behind the rollup's 10-event population.
    expect(issue!.sourceShotIds.sort()).toEqual([approach1, approach2].sort());
  });

  it('the rollup gates ELIGIBILITY only — a kind that has NOT cleared the floor never owns or joins', () => {
    const unclearedKindRow: MetricResult = { ...approachToRecoveryRow, status: 'insufficient' };
    const ungatedPacket = sequencePacketFromRollupGatedEvent(sequenceResult, approachEvent, unclearedKindRow);
    const issues = groupIssues([parPacket, distancePacket, ungatedPacket]);
    // Still one issue (par+distance still overlap and group), but the
    // sequence claim never appears in it.
    expect(issues).toHaveLength(1);
    expect(issues[0]!.claims.map((c) => c.claimId)).not.toContain(ungatedPacket.claimId);
    // With sequence gone, neither par nor distance computes an impact
    // number at all — the group has no owner.
    expect(issues[0]!.impactOwnership.ownerClaimId).toBeNull();
  });

  it('the grouped issue carries a stable, kind-level evidenceKey — distinct from its shot-set-addressed id', () => {
    const issues = groupIssues(allPackets);
    const issue = issues[0]!;
    expect(issue.evidenceKey).toBe('sequence:approach_to_recovery');
    expect(issue.evidenceKey).not.toBe(issue.id);
    // The owner is the sequence claim (the only real impact number) —
    // evidenceKey matches ITS evidenceKey, not par's or distance's.
    expect(issue.impactOwnership.ownerClaimId).toBe(sequencePacket.claimId);
  });

  it('a group with no impact owner has evidenceKey: null', () => {
    // par and distance alone: neither computes a strokes-impact number.
    const issues = groupIssues([parPacket, distancePacket]);
    expect(issues[0]!.impactOwnership.ownerClaimId).toBeNull();
    expect(issues[0]!.evidenceKey).toBeNull();
  });

  it('falls back to an origin:label evidenceKey when a packet omits one', () => {
    const shotId = shotClaimId({ round_id: 'seq-rollup-fallback', hole_number: 1, shot_number: 1 });
    const packet = syntheticPacket({ claimId: 'fallback-1', origin: 'hypothesis', sourceShotIds: [shotId], strokesImpact: -0.4 });
    const issue = groupIssues([packet])[0]!;
    expect(issue.evidenceKey).toBe('hypothesis:fallback-1'); // label defaults to claimId in syntheticPacket
  });
});

describe('applyMaterialChangeSuppression — A6 slice 2 (rev-2020-style floor-boundary discipline)', () => {
  function issueWithImpact(claimId: string, evidenceKey: string, strokesImpact: number): Issue {
    const shotId = shotClaimId({ round_id: `mc-${claimId}`, hole_number: 1, shot_number: 1 });
    const packet = syntheticPacket({ claimId, origin: 'sequence', sourceShotIds: [shotId], strokesImpact, evidenceKey });
    return groupIssues([packet])[0]!;
  }

  it('suppresses an unchanged issue (0% change from baseline) — the issue itself is never dropped', () => {
    const issue = issueWithImpact('c1', 'sequence:approach_to_recovery', -1.0);
    const result = applyMaterialChangeSuppression([issue], [{ evidenceKey: 'sequence:approach_to_recovery', baselineImpactMagnitude: 1.0 }]);
    expect(result).toHaveLength(1);
    expect(result[0]!.issue).toBe(issue);
    expect(result[0]!.suppressed).toBe('active_intervention_unchanged');
  });

  it('does NOT resurface just below the threshold (49% worse)', () => {
    const issue = issueWithImpact('c2', 'sequence:approach_to_recovery', -1.49);
    const result = applyMaterialChangeSuppression([issue], [{ evidenceKey: 'sequence:approach_to_recovery', baselineImpactMagnitude: 1.0 }]);
    expect(result[0]!.suppressed).toBe('active_intervention_unchanged');
  });

  it('resurfaces exactly AT the threshold (50% worse) — the boundary itself', () => {
    const issue = issueWithImpact('c3', 'sequence:approach_to_recovery', -1.5);
    const result = applyMaterialChangeSuppression([issue], [{ evidenceKey: 'sequence:approach_to_recovery', baselineImpactMagnitude: 1.0 }]);
    expect(result[0]!.suppressed).toBeNull();
  });

  it('resurfaces well past the threshold', () => {
    const issue = issueWithImpact('c4', 'sequence:approach_to_recovery', -3.0);
    const result = applyMaterialChangeSuppression([issue], [{ evidenceKey: 'sequence:approach_to_recovery', baselineImpactMagnitude: 1.0 }]);
    expect(result[0]!.suppressed).toBeNull();
  });

  it('never suppresses when no active intervention matches this evidenceKey — a genuinely different pattern always surfaces', () => {
    const issue = issueWithImpact('c5', 'par:unrelated_metric:course-z:9', -5.0);
    const interventions: ActiveIntervention[] = [{ evidenceKey: 'sequence:approach_to_recovery', baselineImpactMagnitude: 1.0 }];
    const result = applyMaterialChangeSuppression([issue], interventions);
    expect(result[0]!.suppressed).toBeNull();
  });

  it('never suppresses an issue with no impact owner (evidenceKey: null)', () => {
    const shotId = shotClaimId({ round_id: 'mc-strength', hole_number: 1, shot_number: 1 });
    const packet = syntheticPacket({ claimId: 'strength-1', origin: 'par', sourceShotIds: [shotId], strokesImpact: 2.0 });
    const issue = groupIssues([packet])[0]!;
    expect(issue.evidenceKey).toBeNull();
    const result = applyMaterialChangeSuppression([issue], [{ evidenceKey: 'par:strength-1', baselineImpactMagnitude: 1.0 }]);
    expect(result[0]!.suppressed).toBeNull();
  });

  it('a zero baseline treats any real current magnitude as material — resurfaces rather than dividing by zero', () => {
    const issue = issueWithImpact('c6', 'sequence:zero-baseline-case', -0.01);
    const result = applyMaterialChangeSuppression([issue], [{ evidenceKey: 'sequence:zero-baseline-case', baselineImpactMagnitude: 0 }]);
    expect(result[0]!.suppressed).toBeNull();
  });

  it('never drops an issue from the returned list, suppressed or not, and preserves input order', () => {
    const a = issueWithImpact('c7a', 'k7a', -1.0);
    const b = issueWithImpact('c7b', 'k7b', -9.0); // no matching intervention — surfaces
    const result = applyMaterialChangeSuppression([a, b], [{ evidenceKey: 'k7a', baselineImpactMagnitude: 1.0 }]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.issue.id)).toEqual([a.id, b.id]);
    expect(result[0]!.suppressed).toBe('active_intervention_unchanged');
    expect(result[1]!.suppressed).toBeNull();
  });
});

describe('issueToRankableInsight + rankInsights — A6 slice 2 ranking-input unification', () => {
  it('a par/distance/sequence trio (one issue) yields exactly ONE ranked entry, not one per claim', () => {
    const groupedShotId1 = shotClaimId({ round_id: 'rank-r1', hole_number: 7, shot_number: 2 });
    const groupedShotId2 = shotClaimId({ round_id: 'rank-r1', hole_number: 7, shot_number: 3 });
    const trio = [
      syntheticPacket({ claimId: 'rank-par', origin: 'par', sourceShotIds: [groupedShotId1, groupedShotId2], strokesImpact: null }),
      syntheticPacket({ claimId: 'rank-distance', origin: 'distance', sourceShotIds: [groupedShotId1], strokesImpact: null }),
      syntheticPacket({
        claimId: 'rank-sequence', origin: 'sequence', sourceShotIds: [groupedShotId1, groupedShotId2],
        strokesImpact: -1.2, confidence: 0.8, evidenceKey: 'sequence:approach_to_recovery',
      }),
    ];
    const standaloneA = syntheticPacket({
      claimId: 'rank-standalone-a', origin: 'hypothesis',
      sourceShotIds: [shotClaimId({ round_id: 'rank-r2', hole_number: 1, shot_number: 1 })],
      strokesImpact: -0.3, confidence: 0.5,
    });
    const standaloneB = syntheticPacket({
      claimId: 'rank-standalone-b', origin: 'hypothesis',
      sourceShotIds: [shotClaimId({ round_id: 'rank-r3', hole_number: 1, shot_number: 1 })],
      strokesImpact: -5.0, confidence: 0.9,
    });

    const issues = groupIssues([...trio, standaloneA, standaloneB]);
    expect(issues).toHaveLength(3); // the trio's one issue + 2 standalones — never 5

    const ranked = rankInsights(issues.map(issueToRankableInsight), {});
    expect(ranked).toHaveLength(issues.length);

    // The trio's issue ranks by its owner's real -1.2 impact, never a
    // fabricated 0/null from par or distance's non-owning claims.
    const trioIssue = issues.find((i) => i.claims.length > 1)!;
    const trioRanked = issueToRankableInsight(trioIssue);
    expect(trioRanked.strokes_impact).toBe(-1.2);
    expect(trioRanked.confidence).toBe(0.8);
    expect(trioRanked.sample_n).toBe(2);

    // standaloneB's -5.0 impact outranks everything else in the list.
    expect(ranked[0]!.strokes_impact).toBe(-5.0);
  });
});

// Exercised for lint/typecheck purposes only — confirms IssueOrigin's
// literal union is what syntheticPacket's callers above rely on.
const _originsUsed: IssueOrigin[] = ['par', 'distance', 'sequence', 'hypothesis'];
void _originsUsed;
