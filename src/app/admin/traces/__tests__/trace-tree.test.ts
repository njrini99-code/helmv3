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
  // `verify.round`/`verify.holes`/`verify.shots` were 'required' in
  // golf.round.submit's declaration when this suite was first written, so
  // REAL_STEPS (which never records them — the transaction died first) used
  // to ghost all three. As of 2026-09-02 they are 'best_effort' (see
  // golf-round-flight-workflow.ts's own comment: a failed or short
  // verification read must not inflate missing-required counts), so
  // REAL_STEPS alone no longer has ANY genuinely missing required step —
  // server.validation/auth/player and db.submit_round_atomic all ran. This
  // fixture drops `server.player` (still required, SHARED_MUTATION_STEPS) to
  // keep exercising real ghosting rather than letting these tests degrade
  // into vacuously passing over an empty `missing` array.
  const STEPS_MISSING_A_REQUIRED_STEP = REAL_STEPS.filter((s) => s.step_key !== 'server.player');

  it('materialises required steps the trace never recorded', () => {
    // This is the feature that makes the tool a debugger rather than a log
    // viewer: a required step the trace never recorded must not read as
    // "nothing further was needed".
    const tree = buildTraceTree(STEPS_MISSING_A_REQUIRED_STEP, 'golf.round.submit');
    const missing = tree.flat.filter((n) => n.isMissing).map((n) => n.key);
    expect(missing).toContain('server.player');
    expect(tree.missingRequiredCount).toBe(missing.length);
  });

  it('does NOT ghost verify.round/holes/shots — they are best_effort, not required', () => {
    // Regression guard for the requiredness change itself: a short or failed
    // verification read must not inflate missing-required counts even when
    // (as here) it genuinely never ran.
    const tree = buildTraceTree(REAL_STEPS, 'golf.round.submit');
    const missing = tree.flat.filter((n) => n.isMissing).map((n) => n.key);
    expect(missing).not.toContain('verify.round');
    expect(missing).not.toContain('verify.holes');
    expect(missing).not.toContain('verify.shots');
    expect(tree.missingRequiredCount).toBe(0);
  });

  it('marks missing steps with status "missing", never a quiet success', () => {
    const tree = buildTraceTree(STEPS_MISSING_A_REQUIRED_STEP, 'golf.round.submit');
    const missingNodes = tree.flat.filter((n) => n.isMissing);
    // Guards against this test silently degrading to a vacuous pass over an
    // empty array the way it did when the fixture above stopped producing
    // any missing steps at all.
    expect(missingNodes.length).toBeGreaterThan(0);
    for (const node of missingNodes) {
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
