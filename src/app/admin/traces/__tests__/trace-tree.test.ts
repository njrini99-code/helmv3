import { describe, it, expect } from 'vitest';
import { buildTraceTree } from '../trace-tree';

/**
 * These fixtures are the REAL rows recorded by `public.helm_debug_record_trace_step`
 * against a local Supabase stack on 2026-08-27, for the scenario the flight
 * recorder spec uses as its worked example: 73 shots submitted, 18 holes
 * written, the shot write dying on hole 11 shot 4, the transaction rolling
 * back, and verification never running.
 *
 * They are copied from the database rather than invented so the shape under
 * test is the shape the facade actually produces — including the detail that
 * `parent_step_key` arrives via the metadata jsonb, not a dedicated column.
 */
const REAL_STEPS: Record<string, unknown>[] = [
  { step_key: 'server.validation', parent_step_key: null, layer: 'server_action', status: 'success', requiredness: 'required', duration_ms: 2, expected: { shots: 73 }, observed: { shots: 73 } },
  { step_key: 'server.auth', parent_step_key: null, layer: 'server_action', status: 'success', requiredness: 'required', duration_ms: 17 },
  { step_key: 'server.player', parent_step_key: null, layer: 'server_action', status: 'success', requiredness: 'required', duration_ms: 8 },
  { step_key: 'db.submit_round_atomic', parent_step_key: null, layer: 'postgres', status: 'failure', requiredness: 'required', duration_ms: 412, function_name: 'submit_round_atomic', error_code: '23505' },
  { step_key: 'db.submit_round_atomic.lock_round', parent_step_key: 'db.submit_round_atomic', layer: 'postgres', status: 'success', requiredness: 'required', duration_ms: 9, table_name: 'golf_rounds' },
  { step_key: 'db.submit_round_atomic.lifecycle_guard', parent_step_key: 'db.submit_round_atomic', layer: 'postgres', status: 'success', requiredness: 'required', duration_ms: 3 },
  { step_key: 'db.submit_round_atomic.update_round', parent_step_key: 'db.submit_round_atomic', layer: 'postgres', status: 'success', requiredness: 'required', duration_ms: 11, table_name: 'golf_rounds' },
  { step_key: 'db.submit_round_atomic.insert_holes', parent_step_key: 'db.submit_round_atomic', layer: 'postgres', status: 'success', requiredness: 'required', duration_ms: 88, table_name: 'golf_holes', expected: { holes: 18 }, observed: { holes: 18 } },
  { step_key: 'db.submit_round_atomic.insert_shots', parent_step_key: 'db.submit_round_atomic', layer: 'postgres', status: 'failure', requiredness: 'required', duration_ms: 297, table_name: 'golf_shots', error_code: '23505', error_summary: 'hole 11 shot 4 - duplicate key', expected: { shots: 73 }, observed: { shots: 72 } },
];

describe('buildTraceTree — containment', () => {
  it('nests the in-transaction checkpoints under the RPC that ran them', () => {
    // The whole point of the tree over the existing layer-lane waterfall: the
    // shot insert failed INSIDE submit_round_atomic, and the view has to say so.
    const tree = buildTraceTree(REAL_STEPS, 'golf.round.submit');
    const rpc = tree.roots.find((n) => n.key === 'db.submit_round_atomic')!;
    expect(rpc).toBeDefined();
    expect(rpc.children.map((c) => c.key)).toEqual([
      'db.submit_round_atomic.lock_round',
      'db.submit_round_atomic.lifecycle_guard',
      'db.submit_round_atomic.update_round',
      'db.submit_round_atomic.insert_holes',
      'db.submit_round_atomic.insert_shots',
    ]);
    expect(rpc.children.every((c) => c.depth === 1)).toBe(true);
  });

  it('identifies where reality diverged', () => {
    const tree = buildTraceTree(REAL_STEPS, 'golf.round.submit');
    expect(tree.failureKey).toBe('db.submit_round_atomic');
  });

  it('carries expected-vs-observed through, so a silent undercount is visible', () => {
    const tree = buildTraceTree(REAL_STEPS, 'golf.round.submit');
    const shots = tree.flat.find((n) => n.key === 'db.submit_round_atomic.insert_shots')!;
    expect(shots.expected).toEqual({ shots: 73 });
    expect(shots.observed).toEqual({ shots: 72 });
    expect(shots.errorCode).toBe('23505');
  });
});

describe('buildTraceTree — steps that never ran', () => {
  it('materialises required steps the trace never recorded', () => {
    // This is the feature that makes the tool a debugger rather than a log
    // viewer. verify.* never ran because the transaction died; omitting them
    // would read as "nothing further was needed".
    const tree = buildTraceTree(REAL_STEPS, 'golf.round.submit');
    const missing = tree.flat.filter((n) => n.isMissing).map((n) => n.key);
    expect(missing).toContain('verify.round');
    expect(missing).toContain('verify.holes');
    expect(missing).toContain('verify.shots');
    expect(tree.missingRequiredCount).toBe(missing.length);
  });

  it('marks missing steps with status "missing", never a quiet success', () => {
    const tree = buildTraceTree(REAL_STEPS, 'golf.round.submit');
    for (const node of tree.flat.filter((n) => n.isMissing)) {
      expect(node.status).toBe('missing');
      expect(node.durationMs).toBeNull();
    }
  });

  it('does NOT report async or conditional steps as missing', () => {
    // `post.coachhelm` is async and legitimately still in flight; a qualifier
    // transition that correctly did not apply is not a fault. Reporting either
    // as MISSING would cry wolf on every healthy submit.
    const tree = buildTraceTree(REAL_STEPS, 'golf.round.submit');
    const missing = tree.flat.filter((n) => n.isMissing).map((n) => n.key);
    expect(missing).not.toContain('post.coachhelm');
    expect(missing).not.toContain('post.stats');
    expect(missing).not.toContain('post.qualifier_transition');
  });

  it('reports nothing missing when every required step ran', () => {
    const complete = [
      ...REAL_STEPS,
      { step_key: 'verify.round', layer: 'verification', status: 'success', requiredness: 'required' },
      { step_key: 'verify.holes', layer: 'verification', status: 'success', requiredness: 'required' },
      { step_key: 'verify.shots', layer: 'verification', status: 'success', requiredness: 'required' },
    ];
    expect(buildTraceTree(complete, 'golf.round.submit').missingRequiredCount).toBe(0);
  });
});

describe('buildTraceTree — robustness against real-world data', () => {
  it('renders an unknown workflow without throwing, and diffs nothing', () => {
    // `workflow` is a free-text database column. A trace from a workflow this
    // build does not know about must still show what it observed.
    const tree = buildTraceTree(REAL_STEPS, 'some.workflow.from.the.future');
    expect(tree.flat.length).toBe(REAL_STEPS.length);
    expect(tree.missingRequiredCount).toBe(0);
  });

  it('keeps a step whose parent is absent, rather than dropping it', () => {
    const orphan = [{ step_key: 'db.child', parent_step_key: 'db.nonexistent', layer: 'postgres', status: 'success', requiredness: 'required' }];
    const tree = buildTraceTree(orphan, 'unknown');
    // Silently vanishing is the one behaviour a debugging tool must never have.
    expect(tree.flat.map((n) => n.key)).toEqual(['db.child']);
  });

  it('survives a parent cycle instead of hanging', () => {
    // parent_step_key is free text written by three separate producers
    // (server, collector, RPC), so a cycle is possible.
    const cyclic = [
      { step_key: 'a', parent_step_key: 'b', layer: 'postgres', status: 'success', requiredness: 'required' },
      { step_key: 'b', parent_step_key: 'a', layer: 'postgres', status: 'success', requiredness: 'required' },
    ];
    const tree = buildTraceTree(cyclic, 'unknown');
    expect(tree.flat.length).toBeLessThanOrEqual(2);
  });

  it('renders BOTH nodes of a genuine mutual cycle rather than dropping them', () => {
    // A -> parent b, B -> parent a: neither ever resolves as a root under the
    // ordinary containment walk (each is pushed into the OTHER's children),
    // so without a rescue sweep for unvisited nodes both vanish from `flat`
    // silently — exactly the failure mode this module's own header comment
    // says a debugging tool must never have. observedStepCount stays correct
    // either way (it counts the raw observed array, never the walked tree),
    // so this pins the tree/render side of the same guarantee.
    const cyclic = [
      { step_key: 'a', parent_step_key: 'b', layer: 'postgres', status: 'success', requiredness: 'required' },
      { step_key: 'b', parent_step_key: 'a', layer: 'postgres', status: 'success', requiredness: 'required' },
    ];
    const tree = buildTraceTree(cyclic, 'unknown');
    expect(tree.flat.map((n) => n.key).sort()).toEqual(['a', 'b']);
  });

  it('survives a longer mutual cycle (three nodes) without dropping any', () => {
    const cyclic = [
      { step_key: 'a', parent_step_key: 'c', layer: 'postgres', status: 'success', requiredness: 'required' },
      { step_key: 'b', parent_step_key: 'a', layer: 'postgres', status: 'success', requiredness: 'required' },
      { step_key: 'c', parent_step_key: 'b', layer: 'postgres', status: 'success', requiredness: 'required' },
    ];
    const tree = buildTraceTree(cyclic, 'unknown');
    expect(tree.flat.map((n) => n.key).sort()).toEqual(['a', 'b', 'c']);
  });

  it('treats an unrecognised status as a warning, never as success', () => {
    const weird = [{ step_key: 'x', layer: 'postgres', status: 'banana', requiredness: 'required' }];
    expect(buildTraceTree(weird, 'unknown').flat[0]!.status).toBe('warning');
  });

  it('derives duration from timestamps when duration_ms is absent', () => {
    const timed = [{
      step_key: 'x', layer: 'postgres', status: 'success', requiredness: 'required',
      started_at: '2026-08-27T10:00:00.000Z', finished_at: '2026-08-27T10:00:00.250Z',
    }];
    expect(buildTraceTree(timed, 'unknown').flat[0]!.durationMs).toBe(250);
  });

  it('ignores rows with no step_key rather than rendering a blank node', () => {
    const junk = [{ layer: 'postgres', status: 'success' }, ...REAL_STEPS];
    expect(buildTraceTree(junk, 'unknown').flat.length).toBe(REAL_STEPS.length);
  });
});

describe('buildTraceTree — observedStepCount', () => {
  it('counts exactly the observed rows, never the synthesised missing ones', () => {
    // golf.round.submit synthesises verify.round/verify.holes/verify.shots as
    // missing (never observed) against REAL_STEPS — those must not inflate
    // this count. This is the single definition the list RPC's own
    // observed_step_count column is reconciled against in bridgeGetFlightTrace.
    const tree = buildTraceTree(REAL_STEPS, 'golf.round.submit');
    expect(tree.observedStepCount).toBe(REAL_STEPS.length);
    expect(tree.missingRequiredCount).toBeGreaterThan(0);
  });

  it('increments when an undeclared-but-observed row is present', () => {
    const withExtra = [
      ...REAL_STEPS,
      {
        step_key: 'db.submit_round_atomic.checkpoint_extra',
        parent_step_key: 'db.submit_round_atomic',
        layer: 'postgres',
        status: 'success',
        requiredness: 'best_effort',
        duration_ms: 4,
        function_name: 'submit_round_atomic',
        table_name: 'golf_shots',
      },
    ];
    expect(buildTraceTree(withExtra, 'golf.round.submit').observedStepCount).toBe(REAL_STEPS.length + 1);
  });
});

describe('buildTraceTree — undeclared observed steps', () => {
  it('marks an observed row nested under a declared parent as undeclared, not missing', () => {
    // db.submit_round_atomic.lock_round etc. are already observed today and
    // already nest correctly (see the containment describe block above) —
    // but golf.round.submit's own workflow definition declares ONLY the
    // top-level db.submit_round_atomic key, so every one of those children is,
    // by definition, not in the declared step set. A future postgres-layer
    // checkpoint (the db checkpoints migration) writes exactly this shape.
    const tree = buildTraceTree(REAL_STEPS, 'golf.round.submit');
    const child = tree.flat.find((n) => n.key === 'db.submit_round_atomic.lock_round')!;
    expect(child.isUndeclared).toBe(true);
    expect(child.isMissing).toBe(false);
  });

  it('does not count an undeclared observed row in missingRequiredCount', () => {
    const tree = buildTraceTree(REAL_STEPS, 'golf.round.submit');
    expect(tree.missingRequiredCount).toBe(3); // verify.round, verify.holes, verify.shots
  });

  it('leaves a declared, top-level, actually-observed step as not undeclared', () => {
    const tree = buildTraceTree(REAL_STEPS, 'golf.round.submit');
    const rpc = tree.flat.find((n) => n.key === 'db.submit_round_atomic')!;
    expect(rpc.isUndeclared).toBe(false);
  });

  it('never marks a synthesised missing node as undeclared', () => {
    const tree = buildTraceTree(REAL_STEPS, 'golf.round.submit');
    for (const node of tree.flat.filter((n) => n.isMissing)) {
      expect(node.isUndeclared).toBe(false);
    }
  });

  it('for an unknown workflow, treats every observed row as undeclared (nothing was declared to check against)', () => {
    const tree = buildTraceTree(REAL_STEPS, 'some.workflow.from.the.future');
    expect(tree.flat.every((n) => n.isUndeclared)).toBe(true);
  });
});

describe('buildTraceTree — point-in-time steps and metadata error fallback', () => {
  it('flags a row with only finished_at as point-in-time, with no duration', () => {
    const checkpointOnly = [{
      step_key: 'db.checkpoint_only',
      layer: 'postgres',
      status: 'success',
      requiredness: 'best_effort',
      finished_at: '2026-09-01T00:00:00.000Z',
    }];
    const node = buildTraceTree(checkpointOnly, 'unknown').flat[0]!;
    expect(node.isPointInTime).toBe(true);
    expect(node.durationMs).toBeNull();
  });

  it('does not flag a synthesised missing node as point-in-time', () => {
    const tree = buildTraceTree(REAL_STEPS, 'golf.round.submit');
    for (const node of tree.flat.filter((n) => n.isMissing)) {
      expect(node.isPointInTime).toBe(false);
    }
  });

  it('does not flag a row with both started_at and finished_at as point-in-time', () => {
    const timed = [{
      step_key: 'x', layer: 'postgres', status: 'success', requiredness: 'required',
      started_at: '2026-08-27T10:00:00.000Z', finished_at: '2026-08-27T10:00:00.250Z',
    }];
    expect(buildTraceTree(timed, 'unknown').flat[0]!.isPointInTime).toBe(false);
  });

  it('reads a SQLSTATE from metadata.sqlstate when error_code column is absent, matching trace_exception_checkpoint', () => {
    // trace_exception_checkpoint (helm_private, see the flight recorder
    // migration) writes { sqlstate, message } inside metadata, never a
    // top-level error_code column.
    const row = [{
      step_key: 'db.submit_round_atomic.exception',
      layer: 'postgres',
      status: 'failure',
      requiredness: 'required',
      metadata: { sqlstate: '40001', message: 'could not serialize access' },
    }];
    const node = buildTraceTree(row, 'unknown').flat[0]!;
    expect(node.errorCode).toBe('40001');
  });

  it('prefers a real error_code column over the metadata fallback', () => {
    const row = [{
      step_key: 'x', layer: 'postgres', status: 'failure', requiredness: 'required',
      error_code: '23505', metadata: { sqlstate: '40001' },
    }];
    expect(buildTraceTree(row, 'unknown').flat[0]!.errorCode).toBe('23505');
  });

  it('falls back to metadata.failure_code when sqlstate is absent too', () => {
    const row = [{
      step_key: 'x', layer: 'postgres', status: 'failure', requiredness: 'required',
      metadata: { failure_code: 'BLOCKED' },
    }];
    expect(buildTraceTree(row, 'unknown').flat[0]!.errorCode).toBe('BLOCKED');
  });

  it('is unaffected by a non-object metadata value', () => {
    const row = [{ step_key: 'x', layer: 'postgres', status: 'failure', requiredness: 'required', metadata: 'not an object' }];
    expect(buildTraceTree(row, 'unknown').flat[0]!.errorCode).toBeNull();
  });
});
