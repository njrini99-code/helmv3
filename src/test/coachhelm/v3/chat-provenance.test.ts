import { describe, it, expect } from 'vitest';
import {
  auditNumericClaims,
  collectNumbers,
  coverageFor,
  unavailableEnvelope,
  type Measurement,
  type MeasurementSeries,
} from '@/lib/coachhelm/v3/chat/provenance';

const measurement = (over: Partial<Measurement> = {}): Measurement => ({
  metric_id: 'putt_make_pct_3_8ft',
  metric_label: 'Make rate inside 8 feet',
  unit: 'percent',
  value: 58,
  entity: { kind: 'player', id: 'p1', label: 'Nick' },
  window_start: '2026-06-01',
  window_end: '2026-07-20',
  sample_size: 43,
  sample_unit: 'attempts',
  as_of: '2026-07-20T12:00:00Z',
  coverage: 'complete',
  coverage_note: null,
  source: 'stats cache',
  method: 'putts_made_over_attempts',
  denominator: 43,
  benchmark: null,
  direction: 'higher_better',
  ...over,
});

/**
 * The grounding check this replaces asked only "did a tool run?", which a
 * fabricated number passes trivially. These tests pin the behaviour that
 * actually matters: a figure with no measurement behind it is caught.
 */
describe('auditNumericClaims', () => {
  it('catches the invented before-and-after that motivated this check', () => {
    // Tools returned 58% over 43 attempts. The model wrote a 71% that never
    // existed — the single most common failure mode for this kind of surface.
    const claims = auditNumericClaims(
      'His make rate fell from 71% to 58% across 43 attempts.',
      [measurement()],
    );
    expect(claims.map((c) => c.text)).toEqual(['71']);
  });

  it('accepts every figure a tool actually produced', () => {
    expect(
      auditNumericClaims('58% over 43 attempts.', [measurement()]),
    ).toEqual([]);
  });

  it('accepts sensible rounding rather than punishing it', () => {
    // A check that fires on 58 vs 58.3 is a check that gets switched off.
    expect(auditNumericClaims('about 58%', [measurement({ value: 58.3 })])).toEqual([]);
  });

  it('accepts a stated delta between two points of a series', () => {
    const series: MeasurementSeries = {
      metric_id: 'sg_putting',
      metric_label: 'Strokes gained putting',
      unit: 'strokes',
      entity: { kind: 'player', id: 'p1', label: 'Nick' },
      points: [
        { at: '2026-07-01', value: 71, bucket: null, sample_size: 1 },
        { at: '2026-07-10', value: 58, bucket: null, sample_size: 1 },
      ],
      window_start: '2026-07-01',
      window_end: '2026-07-10',
      as_of: '2026-07-20T12:00:00Z',
      coverage: 'complete',
      coverage_note: null,
      source: 'rounds',
      method: 'round_level',
      benchmark: null,
      direction: 'higher_better',
    };
    // 71 → 58 is a drop of 13, and saying so is supported by the series.
    expect(auditNumericClaims('down 13 from 71 to 58', [], [series])).toEqual([]);
  });

  it('ignores dates, times and small counts', () => {
    const text =
      'Over his last 5 rounds, on 2026-07-14 at 3:00 PM, across 3 events with 8 players.';
    expect(auditNumericClaims(text, [measurement()])).toEqual([]);
  });

  it('accepts figures a tool returned in its structured detail', () => {
    // Found in live verification: the weakest-area tool returns each metric's
    // team average in `detail.gaps`, the model correctly cited it, and the
    // audit flagged five sourced numbers as fabricated because only
    // `measurements` was checked. A check that cries wolf gets switched off.
    const detail = { gaps: [{ team_average: -0.09, player_value: -0.45 }], recorded_rounds: 12 };
    const claims = auditNumericClaims(
      'His gap is -0.45 against a team average of -0.09 over 12 rounds.',
      [measurement({ metric_id: 'sg_around_green', unit: 'strokes', value: -0.45 })],
      [],
      collectNumbers(detail),
    );
    expect(claims).toEqual([]);
  });

  it('still catches a fabrication when detail is present', () => {
    const detail = { gaps: [{ team_average: -0.09 }] };
    const claims = auditNumericClaims(
      'A team average of -0.09, and his make rate is 71%.',
      [measurement({ value: 58 })],
      [],
      collectNumbers(detail),
    );
    expect(claims.map((c) => c.value)).toEqual([71]);
  });

  it('accepts a gap between two players on the same metric', () => {
    // Verification, two-player putting comparison: the tools returned each
    // player's five-round mean, the model subtracted them, and the audit called
    // the difference a fabrication. Comparing is the whole point of the
    // question, and no tool can pre-compute every pair a coach might ask for.
    const rivers = measurement({
      metric_id: 'sg_putting_mean',
      unit: 'strokes',
      value: -3.45,
      entity: { kind: 'player', id: 'p1', label: 'Mason Rivers' },
    });
    const bennett = measurement({
      metric_id: 'sg_putting_mean',
      unit: 'strokes',
      value: -5.86,
      entity: { kind: 'player', id: 'p2', label: 'Cole Bennett' },
    });
    const claims = auditNumericClaims(
      "Bennett's deficit is roughly 2.4 strokes per round larger than Rivers's.",
      [rivers, bennett],
    );
    expect(claims).toEqual([]);
  });

  it('will not justify a figure by subtracting two unrelated metrics', () => {
    // 34 putts minus 2.4 strokes gained is not a quantity. Grouping deltas by
    // metric is what stops the pairwise allowance becoming a blank cheque.
    const putts = measurement({ metric_id: 'putts_per_round', unit: 'count', value: 34 });
    const sg = measurement({ metric_id: 'sg_putting_mean', unit: 'strokes', value: 2.4 });
    const claims = auditNumericClaims('He gave up 31.6 shots on the greens.', [putts, sg]);
    expect(claims.map((c) => c.value)).toEqual([31.6]);
  });

  it('accepts a magnitude written without its sign', () => {
    // "lost 7.61 strokes" and "-7.61 strokes" are the same statement.
    const m = measurement({ metric_id: 'sg_putting', unit: 'strokes', value: -7.61 });
    expect(auditNumericClaims('He lost 7.61 strokes putting.', [m])).toEqual([]);
  });

  it('accepts a hedged bound rounded outward from a real value', () => {
    // "more than 7.5" against a measured -7.61 is careful writing, not invention.
    const m = measurement({ metric_id: 'sg_putting', unit: 'strokes', value: -7.61 });
    expect(auditNumericClaims('Two rounds where he lost more than 7.5 strokes.', [m])).toEqual([]);
  });

  it('still catches invention even when it is hedged', () => {
    // A hedge widens the tolerance by a tenth; it does not license a number
    // that no measurement is anywhere near.
    const claims = auditNumericClaims('His make rate is roughly 71%.', [measurement({ value: 58 })]);
    expect(claims.map((c) => c.value)).toEqual([71]);
  });

  it('flags an invented benchmark', () => {
    // No benchmark was retrieved, so no Tour figure can be supported.
    const claims = auditNumericClaims(
      'The PGA Tour average inside eight feet is 88%.',
      [measurement()],
    );
    expect(claims.map((c) => c.value)).toContain(88);
  });

  it('accepts a benchmark that WAS retrieved, with its source', () => {
    const withBenchmark = measurement({
      benchmark: {
        source: 'PGA Tour expected strokes (Broadie / ShotLink)',
        version: '2026-06-06 calibration',
        value: 88,
        omitted_for_cohort: false,
      },
    });
    expect(auditNumericClaims('Tour reference is 88%.', [withBenchmark])).toEqual([]);
  });

  /**
   * Production 2026-09-22 (issue #1540 / repair plan N15): 33 of the last 30
   * days' chat replies were marked 'failed', most of them real, correctly
   * sourced answers. Two dominant false-positive classes accounted for most
   * of them — both reproduced from actual failed rows' persisted `ui_parts`.
   */
  it('accepts a distance-band bucket label whose bounds are both > 12', () => {
    // get_putting_distance_profile's own bucket names ('15-25 ft', '10-15
    // ft') were read as two bare numbers by the audit — "15" and "25" (or
    // "-25", once the hyphen was misread as a sign) — even though they are
    // the tool's own vocabulary for which band the pct/attempts belong to,
    // not a claim in their own right.
    const series: MeasurementSeries = {
      metric_id: 'putt_make_pct_by_distance',
      metric_label: 'Make rate by distance',
      unit: 'percent',
      entity: { kind: 'player', id: 'p1', label: 'Elliott' },
      points: [{ at: '15-25 ft', value: 4, bucket: '15-25 ft', sample_size: 23 }],
      window_start: '2026-08-21',
      window_end: '2026-08-25',
      as_of: '2026-08-26T02:20:07Z',
      coverage: 'complete',
      coverage_note: null,
      source: 'stats cache',
      method: 'putt_make_pct',
      benchmark: null,
      direction: 'higher_better',
    };
    expect(
      auditNumericClaims('Making 4% from 15-25 ft (23 attempts).', [], [series]),
    ).toEqual([]);
  });

  it('accepts a figure a tool wrote into its own prose, not a numeric field', () => {
    // Reproduced from a real failed row: get_player_insights returns
    // measurements: [] and puts every number inside `detail.insights[].content`
    // ("you're making 50% of putts from 3-5 ft (20 attempts) (PGA Tour ~91%)").
    // collectNumbers only walked numeric leaves, so none of it — including the
    // insight's OWN Tour comparison — ever reached `extraSupported`, and a
    // chat turn that faithfully restated the insight was discarded as
    // fabrication.
    const detail = {
      insights: [
        {
          title: '3-5 ft putting: 50%',
          content:
            "Across your last 5 rounds you're making 50% of putts from 3-5 ft " +
            '(20 attempts) (PGA Tour ~91%).',
          insight_id: 'f7c5a144-bf4a-49de-aa72-40971effe4d6',
          created_at: '2026-08-30T12:49:51.053068+00:00',
        },
      ],
    };
    const claims = auditNumericClaims(
      "Making 50% from 3-5 ft (20 attempts) — well off the PGA Tour's ~91%.",
      [],
      [],
      collectNumbers(detail),
    );
    expect(claims).toEqual([]);
  });

  it('does not mine an id or a timestamp for digits', () => {
    // A round/insight id or a `created_at` happening to contain "23" or "51"
    // must not silently support an unrelated fabricated claim of 23 or 51.
    const detail = {
      insight_id: 'f7c5a144-bf4a-49de-aa72-40971effe4d6',
      created_at: '2026-08-30T12:49:51.053068+00:00',
    };
    const claims = auditNumericClaims('His make rate is 23%.', [], [], collectNumbers(detail));
    expect(claims.map((c) => c.value)).toEqual([23]);
  });

  it('still catches a fabrication sitting next to a real distance-band claim', () => {
    const series: MeasurementSeries = {
      metric_id: 'putt_make_pct_by_distance',
      metric_label: 'Make rate by distance',
      unit: 'percent',
      entity: { kind: 'player', id: 'p1', label: 'Elliott' },
      points: [{ at: '3-5 ft', value: 50, bucket: '3-5 ft', sample_size: 20 }],
      window_start: '2026-08-21',
      window_end: '2026-08-25',
      as_of: '2026-08-26T02:20:07Z',
      coverage: 'complete',
      coverage_note: null,
      source: 'stats cache',
      method: 'putt_make_pct',
      benchmark: null,
      direction: 'higher_better',
    };
    const claims = auditNumericClaims(
      'Making 50% from 3-5 ft (20 attempts), and his overall make rate is 71%.',
      [],
      [series],
    );
    expect(claims.map((c) => c.value)).toEqual([71]);
  });

  /**
   * Review of PR #1975 (2026-09-22): `route.ts`'s `priorTurnEvidence` can feed
   * this function many prior turns' worth of measurements of one metric in a
   * single call. Two separate risks follow, and each gets its own test below:
   * a caller handing in evidence that does not actually match the type it
   * claims to (a stored `ui_parts` blob, not something just built and
   * validated) must not crash the audit, and enough accumulated volume of one
   * metric must not become a way to sneak a real fabrication past the check.
   */
  it('does not throw when a series carries a malformed points field', () => {
    // `series` is typed as `MeasurementSeries[]`, but `priorTurnEvidence`
    // hands this function evidence read back out of the database — a legacy
    // row predating a schema field, or simply bad data, can arrive with
    // `points` missing or not an array. Before the guard, `for (const p of
    // s.points)` threw a TypeError here, which crashed the whole turn's
    // audit rather than the audit just skipping the one malformed series.
    const malformed = {
      metric_id: 'putts_per_round',
      metric_label: 'Putts per round',
      unit: 'count',
      entity: { kind: 'player', id: 'p1', label: 'Elliott' },
      points: undefined,
      window_start: null,
      window_end: null,
      as_of: '2026-01-01T00:00:00Z',
      coverage: 'complete',
      coverage_note: null,
      source: 'rounds',
      method: 'round_level',
      benchmark: null,
      direction: null,
    } as unknown as MeasurementSeries;
    expect(() => auditNumericClaims('He made 71%.', [], [malformed])).not.toThrow();
    // The fabrication is still caught — the malformed series is skipped, not
    // treated as a free pass for anything unsourced.
    expect(auditNumericClaims('He made 71%.', [], [malformed]).map((c) => c.value)).toEqual([71]);
  });

  it('still catches a fabrication after many prior-turn measurements of one metric have accumulated', () => {
    // `priorTurnEvidence` can carry several prior turns' measurements of the
    // same metric into one audit call, comfortably past
    // PAIRWISE_ANCHOR_CAP (32). Their sheer volume must not become a way to
    // launder an unrelated, clearly invented number through the pairwise-
    // differencing allowance — the group is capped and evicts its oldest
    // members rather than disabling differencing (or, worse, the check
    // itself) once it grows past the cap.
    const many: Measurement[] = Array.from({ length: 50 }, (_, i) =>
      measurement({ metric_id: 'putts_per_round', unit: 'count', value: 1000 + i * 37 }),
    );
    const claims = auditNumericClaims('His putts per round jumped to 9999.', many);
    expect(claims.map((c) => c.value)).toEqual([9999]);
  });

  it('keeps supporting a same-turn pairwise difference even after the metric group exceeds the anchor cap', () => {
    // 40 prior-turn values of one metric push that metric's anchor group well
    // past PAIRWISE_ANCHOR_CAP (32) before the two CURRENT-turn values (a, b)
    // are even added. Old code disabled pairwise differencing for the WHOLE
    // group once it exceeded the cap, so a genuine same-turn comparison would
    // be wrongly flagged just because unrelated prior turns padded the group.
    // New code evicts the OLDEST members instead, so a and b — added last —
    // always survive and their difference stays supported.
    const old: Measurement[] = Array.from({ length: 40 }, (_, i) =>
      measurement({ metric_id: 'sg_putting_mean', unit: 'strokes', value: 1000 + i * 37 }),
    );
    const a = measurement({
      metric_id: 'sg_putting_mean',
      unit: 'strokes',
      value: -3.45,
      entity: { kind: 'player', id: 'p1', label: 'Nick' },
    });
    const b = measurement({
      metric_id: 'sg_putting_mean',
      unit: 'strokes',
      value: -5.86,
      entity: { kind: 'player', id: 'p2', label: 'Someone' },
    });
    const claims = auditNumericClaims(
      'The gap between them is roughly 2.41 strokes per round.',
      [...old, a, b],
    );
    expect(claims).toEqual([]);
  });

  it('accepts a measurement window date written in non-ISO prose', () => {
    // Found in a replay of stored production chat turns (task: read-only
    // chat false-positive replay, 2026-09-23): a ranking tool's
    // window_start/window_end ('2026-08-16'..'2026-09-15') are real
    // evidence, but the model rendered them as "Aug 16-Sep 15" rather than
    // the ISO form the tool returned. Neither CLAIM_EXEMPT (ISO
    // YYYY-MM-DD only) nor any prior anchor recognized "16" or "15" as
    // sourced, so a real date read as an invented number on every turn
    // that used this tool — 8 of 11 stored failed turns, confirmed by
    // replaying this exact check against them before this fix.
    const claims = auditNumericClaims(
      'Penalty rate 0.09 over 11 rounds, window Aug 16-Sep 15.',
      [measurement({ metric_id: 'penalties_per_round', value: 0.09, sample_size: 11, window_start: '2026-08-16', window_end: '2026-09-15' })],
    );
    expect(claims).toEqual([]);
  });

  it('accepts a series point date written in non-ISO prose', () => {
    const series: MeasurementSeries = {
      metric_id: 'sg_putting',
      metric_label: 'Strokes gained putting',
      unit: 'strokes',
      entity: { kind: 'player', id: 'p1', label: 'Nick' },
      points: [{ at: '2026-08-16', value: 58, bucket: null, sample_size: 1 }],
      window_start: '2026-08-16',
      window_end: '2026-08-16',
      as_of: '2026-08-16T12:00:00Z',
      coverage: 'complete',
      coverage_note: null,
      source: 'rounds',
      method: 'round_level',
      benchmark: null,
      direction: 'higher_better',
    };
    expect(auditNumericClaims('58 on Aug 16.', [], [series])).toEqual([]);
  });

  it('accepts an ISO date embedded in detail, restated in non-ISO prose', () => {
    // Same gap as the two tests above, but through the `detail`/
    // `collectNumbers` path rather than a `Measurement`: a round-by-round
    // tool returns `{ date: '2026-09-06', ... }` inside `detail.rounds[]`,
    // the model writes "9/6/26", and the two-digit year ('26') was
    // previously unsourced because `numbersInText` skipped the whole ISO
    // string rather than reading its day/year out of it.
    const detail = { rounds: [{ date: '2026-09-06', total_score: 74, putts: 30 }] };
    const claims = auditNumericClaims(
      'His 9/6/26 round: 74 strokes, 30 putts.',
      [],
      [],
      collectNumbers(detail),
    );
    expect(claims).toEqual([]);
  });

  it('still does not mine an ISO timestamp for its hour/minute', () => {
    // The day-of-month/year carve-out must not widen into "mine the whole
    // timestamp" — an event's start hour is not evidence for an unrelated
    // claimed figure that happens to share a digit with it.
    const detail = { events: [{ starts_at: '2026-08-27T11:30:00+00:00' }] };
    const claims = auditNumericClaims('The tee time is 45 minutes long.', [], [], collectNumbers(detail));
    expect(claims.map((c) => c.text)).toEqual(['45']);
  });
});

/**
 * The coverage helper is the fix for the seven-players-reported-as-six bug:
 * `partial` and `empty` must stay distinct, and neither may round to complete.
 */
describe('coverageFor', () => {
  it('reports a shortfall as partial, never as complete', () => {
    expect(coverageFor(6, 7)).toBe('partial');
  });

  it('distinguishes "found nobody" from "found some"', () => {
    expect(coverageFor(0, 7)).toBe('empty');
    expect(coverageFor(1, 7)).toBe('partial');
  });

  it('is complete only when everything was found', () => {
    expect(coverageFor(7, 7)).toBe('complete');
  });

  it('treats an empty scope as empty rather than complete', () => {
    expect(coverageFor(0, 0)).toBe('empty');
  });
});

describe('unavailableEnvelope', () => {
  it('never reads as "no data" — a failed read is a different statement', () => {
    const envelope = unavailableEnvelope('Could not read rounds.', 'The query failed.');
    expect(envelope.coverage).toBe('unavailable');
    expect(envelope.coverage).not.toBe('empty');
    expect(envelope.measurements).toEqual([]);
  });
});

describe('collectNumbers', () => {
  it('walks nested tool payloads', () => {
    const found = collectNumbers({ a: 1.5, b: [{ c: 2 }, { d: [3, 4] }], e: 'no', f: null });
    expect(found.sort((x, y) => x - y)).toEqual([1.5, 2, 3, 4]);
  });

  it('is depth-bounded so a pathological payload cannot spin', () => {
    // Build a structure deeper than the bound and assert it terminates.
    let deep: unknown = 42;
    for (let i = 0; i < 40; i += 1) deep = { next: deep };
    expect(collectNumbers(deep)).toEqual([]);
  });

  it('ignores non-finite values', () => {
    expect(collectNumbers({ a: NaN, b: Infinity, c: 7 })).toEqual([7]);
  });
});
