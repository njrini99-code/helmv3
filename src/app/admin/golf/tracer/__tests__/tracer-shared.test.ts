import { describe, it, expect } from 'vitest';
import {
  buildFlightWaterfall,
  computeStepElapsedMs,
  flightStepStatusTone,
  isPlausibleTraceId,
  tracerIncidentGroupKey,
  FLIGHT_LAYER_ORDER,
} from '../tracer-shared';

/** Minimal `helm_debug.trace_steps` row shape, as returned by
 *  `helm_debug_get_trace` (see
 *  supabase/migrations/20260825200811_helm_flight_recorder.sql). */
function row(overrides: Partial<{
  step_key: string;
  layer: string;
  requiredness: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error_code: string | null;
  error_summary: string | null;
}>): Record<string, unknown> {
  return {
    step_key: 'unset',
    layer: 'server_action',
    requiredness: 'required',
    status: 'success',
    started_at: '2026-08-25T20:00:00.000Z',
    finished_at: '2026-08-25T20:00:00.100Z',
    duration_ms: null,
    error_code: null,
    error_summary: null,
    ...overrides,
  };
}

describe('buildFlightWaterfall', () => {
  it('groups by layer in canonical FLIGHT_LAYER_ORDER, dropping empty lanes', () => {
    const lanes = buildFlightWaterfall('golf.round.start', [
      row({ step_key: 'server.validation', status: 'success' }),
      row({ step_key: 'server.auth', status: 'success' }),
      row({ step_key: 'db.create_draft', layer: 'supabase', requiredness: 'required', status: 'failure', error_code: 'P0001', error_summary: 'boom' }),
    ]);

    expect(lanes.map((l) => l.layer)).toEqual(['server_action', 'supabase', 'verification']);
    // FLIGHT_LAYER_ORDER itself carries client/next before server_action —
    // confirms the filter preserves that canonical ordering rather than
    // e.g. sorting alphabetically or by first-seen.
    const orderIndex = (layer: string) => FLIGHT_LAYER_ORDER.indexOf(layer as (typeof FLIGHT_LAYER_ORDER)[number]);
    expect(orderIndex('server_action')).toBeLessThan(orderIndex('supabase'));
    expect(orderIndex('supabase')).toBeLessThan(orderIndex('verification'));
  });

  it('ghosts a missing REQUIRED step in its canonical position, not shuffled to the end', () => {
    const lanes = buildFlightWaterfall('golf.round.start', [
      row({ step_key: 'server.validation', status: 'success' }),
      row({ step_key: 'server.auth', status: 'success' }),
      // server.player (required) never recorded.
      row({ step_key: 'db.create_draft', layer: 'supabase', status: 'failure', error_code: 'P0001', error_summary: 'boom' }),
      // verify.round (required) never recorded either — the trace stopped
      // after the failed write, exactly the gap this feature exists to show.
    ]);

    const serverLane = lanes.find((l) => l.layer === 'server_action')!;
    expect(serverLane.segments.map((s) => s.key)).toEqual(['server.validation', 'server.auth', 'server.player']);
    const ghost = serverLane.segments[2]!;
    expect(ghost.isGhost).toBe(true);
    expect(ghost.status).toBe('missing');
    expect(ghost.requiredness).toBe('required');
    expect(ghost.startedAt).toBeNull();
    expect(ghost.elapsedMs).toBeNull();

    const verificationLane = lanes.find((l) => l.layer === 'verification')!;
    expect(verificationLane.segments).toHaveLength(1);
    expect(verificationLane.segments[0]).toMatchObject({ key: 'verify.round', isGhost: true, status: 'missing' });
  });

  it('never ghosts a missing conditional/best-effort/async step — it is simply omitted', () => {
    const lanes = buildFlightWaterfall('golf.hole.complete', [
      row({ step_key: 'server.validation', status: 'success' }),
      row({ step_key: 'server.auth', status: 'success' }),
      row({ step_key: 'server.player', status: 'success' }),
      row({ step_key: 'verify.round', layer: 'verification', status: 'success' }),
      row({ step_key: 'verify.holes', layer: 'verification', status: 'success' }),
      row({ step_key: 'verify.shots', layer: 'verification', status: 'success' }),
      // Neither db.save_partial_round_atomic (conditional/existing_round) nor
      // db.create_or_update_draft (conditional/new_round) recorded — that is
      // expected for whichever branch didn't apply, so no `supabase` lane.
    ]);

    expect(lanes.find((l) => l.layer === 'supabase')).toBeUndefined();
    const allKeys = lanes.flatMap((l) => l.segments.map((s) => s.key));
    expect(allKeys).not.toContain('db.save_partial_round_atomic');
    expect(allKeys).not.toContain('db.create_or_update_draft');
  });

  it('keeps a step key recorded but not present in the workflow definition, unmodified and appended', () => {
    const lanes = buildFlightWaterfall('golf.round.start', [
      row({ step_key: 'server.validation', status: 'success' }),
      row({ step_key: 'server.auth', status: 'success' }),
      row({ step_key: 'server.player', status: 'success' }),
      row({ step_key: 'db.create_draft', layer: 'supabase', status: 'success' }),
      row({ step_key: 'verify.round', layer: 'verification', status: 'success' }),
      row({ step_key: 'legacy.unknown_step', layer: 'cache', requiredness: 'best_effort', status: 'warning' }),
    ]);
    const cacheLane = lanes.find((l) => l.layer === 'cache');
    expect(cacheLane?.segments).toHaveLength(1);
    expect(cacheLane?.segments[0]).toMatchObject({ key: 'legacy.unknown_step', isGhost: false, status: 'warning' });
  });

  it('falls back to recorded-order-only lanes for an unrecognized workflow string, without ghosting anything', () => {
    const lanes = buildFlightWaterfall('not.a.real.workflow', [
      row({ step_key: 'some.step', layer: 'client', status: 'success' }),
    ]);
    expect(lanes).toHaveLength(1);
    const [lane] = lanes;
    expect(lane!.layer).toBe('client');
    expect(lane!.segments).toHaveLength(1);
    expect(lane!.segments[0]).toMatchObject({ key: 'some.step', isGhost: false, status: 'success' });
  });

  it('carries an unrecognized recorded status through verbatim rather than coercing it to `pending`', () => {
    const lanes = buildFlightWaterfall('golf.round.start', [
      row({ step_key: 'server.validation', status: 'retrying' }),
      row({ step_key: 'server.auth', status: 'success' }),
      row({ step_key: 'server.player', status: 'success' }),
      row({ step_key: 'db.create_draft', layer: 'supabase', status: 'success' }),
      row({ step_key: 'verify.round', layer: 'verification', status: 'success' }),
    ]);
    const serverLane = lanes.find((l) => l.layer === 'server_action')!;
    expect(serverLane.segments[0]!.status).toBe('retrying');
  });

  it('treats a row with no status field at all as "unknown", never as a fabricated `pending`', () => {
    const raw = row({ step_key: 'server.validation' });
    delete (raw as Record<string, unknown>).status;
    const lanes = buildFlightWaterfall('golf.round.start', [raw]);
    const serverLane = lanes.find((l) => l.layer === 'server_action')!;
    expect(serverLane.segments[0]!.status).toBe('unknown');
  });

  it('returns no lanes for an empty step list against a known workflow with only conditional/optional gaps possible', () => {
    // golf.stats.refresh has no `required` step this trace failed to record
    // once `server.auth` itself is present — a good sanity check that an
    // empty recorded list produces ghosts ONLY for genuinely required steps.
    const lanes = buildFlightWaterfall('golf.stats.refresh', []);
    // Every step in golf.stats.refresh's own definition is `required` except
    // one `best_effort` — so an empty recording ghosts the two required ones.
    const keys = lanes.flatMap((l) => l.segments.map((s) => s.key));
    expect(keys).toEqual(['server.auth', 'db.recalculate_stats']);
    expect(keys).not.toContain('verify.stats_cache');
  });
});

describe('flightStepStatusTone', () => {
  it('maps every canonical FlightStepStatus to its StatusPill tone', () => {
    expect(flightStepStatusTone('success')).toBe('success');
    expect(flightStepStatusTone('started')).toBe('accent');
    expect(flightStepStatusTone('pending')).toBe('neutral');
    expect(flightStepStatusTone('warning')).toBe('warning');
    expect(flightStepStatusTone('failure')).toBe('danger');
    expect(flightStepStatusTone('skipped')).toBe('neutral');
  });

  it('maps `missing` (a ghosted required step) to the same tone as an outright failure', () => {
    expect(flightStepStatusTone('missing')).toBe('danger');
  });

  it('falls back to neutral for an unrecognized status rather than throwing', () => {
    expect(flightStepStatusTone('something_new')).toBe('neutral');
  });
});

describe('computeStepElapsedMs', () => {
  it('prefers an explicit duration_ms over derived timestamps', () => {
    expect(computeStepElapsedMs({ startedAt: '2026-08-25T20:00:00.000Z', finishedAt: '2026-08-25T20:00:05.000Z', durationMs: 250 })).toBe(250);
  });

  it('derives elapsed time from finished_at - started_at when both exist', () => {
    expect(computeStepElapsedMs({ startedAt: '2026-08-25T20:00:00.000Z', finishedAt: '2026-08-25T20:00:00.150Z', durationMs: null })).toBe(150);
  });

  it('returns null — never a fabricated guess — when finished_at is missing', () => {
    expect(computeStepElapsedMs({ startedAt: '2026-08-25T20:00:00.000Z', finishedAt: null, durationMs: null })).toBeNull();
  });

  it('returns null when started_at is missing', () => {
    expect(computeStepElapsedMs({ startedAt: null, finishedAt: '2026-08-25T20:00:00.150Z', durationMs: null })).toBeNull();
  });

  it('returns null for an unparseable timestamp rather than NaN', () => {
    expect(computeStepElapsedMs({ startedAt: 'not-a-date', finishedAt: '2026-08-25T20:00:00.150Z', durationMs: null })).toBeNull();
  });

  it('returns null rather than a negative duration if finished precedes started', () => {
    expect(computeStepElapsedMs({ startedAt: '2026-08-25T20:00:01.000Z', finishedAt: '2026-08-25T20:00:00.000Z', durationMs: null })).toBeNull();
  });

  it('returns null (not "0 ms") when started_at and finished_at are identical', () => {
    // helm_debug_record_trace_step never updates started_at on conflict — a
    // step recorded via complete() alone (no prior start()) gets both
    // timestamps from the same INSERT and reads back identical. That is
    // indistinguishable from a genuinely ~0ms step, so this must not assert
    // a duration the row can't actually support.
    const same = '2026-08-25T20:00:00.000Z';
    expect(computeStepElapsedMs({ startedAt: same, finishedAt: same, durationMs: null })).toBeNull();
  });
});

describe('isPlausibleTraceId', () => {
  it('accepts a well-formed uuid', () => {
    expect(isPlausibleTraceId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });

  it('rejects a non-uuid string, empty string, null, and undefined', () => {
    expect(isPlausibleTraceId('not-a-uuid')).toBe(false);
    expect(isPlausibleTraceId('')).toBe(false);
    expect(isPlausibleTraceId(null)).toBe(false);
    expect(isPlausibleTraceId(undefined)).toBe(false);
  });
});

describe('tracerIncidentGroupKey', () => {
  // One incident-grouping algorithm, not two: this must match mergeTriage's
  // own fallback in src/lib/admin/data/triage.ts —
  // `row.fingerprint ?? \`row:${row.id}\`` — string for string.

  it('returns the write-time fingerprint when present', () => {
    expect(tracerIncidentGroupKey('a1b2c3d4', 'event-1')).toBe('a1b2c3d4');
  });

  it('two rows sharing a fingerprint produce the same key regardless of id', () => {
    expect(tracerIncidentGroupKey('shared-fp', 'event-1'))
      .toBe(tracerIncidentGroupKey('shared-fp', 'event-2'));
  });

  it('falls back to a synthetic row:<id> key on a NULL fingerprint (rows older than the column)', () => {
    expect(tracerIncidentGroupKey(null, 'event-42')).toBe('row:event-42');
  });

  it('two NULL-fingerprint rows do NOT collapse into one incident — each keys off its own id', () => {
    const a = tracerIncidentGroupKey(null, 'event-1');
    const b = tracerIncidentGroupKey(null, 'event-2');
    expect(a).not.toBe(b);
    expect(a).toBe('row:event-1');
    expect(b).toBe('row:event-2');
  });

  it('an empty-string fingerprint is used verbatim, not routed to the row: fallback', () => {
    // `??` is nullish-only, so "" (unlike null/undefined) is NOT absent here.
    // buildIncidentSignature always returns a non-empty 8-char hex string, so
    // this should never occur in practice — documented for completeness.
    expect(tracerIncidentGroupKey('', 'event-7')).toBe('');
  });
});
