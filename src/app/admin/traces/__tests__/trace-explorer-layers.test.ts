import { describe, it, expect } from 'vitest';
import { buildTraceTree, type TraceStepNode, type TraceTree } from '../trace-tree';
import {
  EXPLORER_LAYERS,
  ROLLBACK_NOTICE_PREFIX,
  buildRollbackNoticeText,
  resolveExplorerLayer,
  toExplorerView,
} from '../trace-explorer-layers';

/**
 * Brief §56 — the seven-layer Trace Explorer vocabulary, the per-step facts
 * it must carry, and the rollback banner that stops an empty step list
 * reading as a healthy one.
 *
 * The row shapes below match `trace-tree.test.ts`'s fixtures, which were
 * copied out of a real local `helm_debug.trace_steps` rather than invented.
 */

/** The scenario the flight-recorder spec uses: submit dies on the shot insert. */
const SUBMIT_WITH_SURVIVING_CHECKPOINTS: Record<string, unknown>[] = [
  { step_key: 'server.validation', parent_step_key: null, layer: 'server_action', status: 'success', requiredness: 'required', duration_ms: 2 },
  { step_key: 'server.auth', parent_step_key: null, layer: 'server_action', status: 'success', requiredness: 'required', duration_ms: 17 },
  { step_key: 'server.player', parent_step_key: null, layer: 'server_action', status: 'success', requiredness: 'required', duration_ms: 8 },
  { step_key: 'db.submit_round_atomic', parent_step_key: null, layer: 'postgres', status: 'failure', requiredness: 'required', duration_ms: 412, function_name: 'submit_round_atomic', error_code: '23505' },
  { step_key: 'db.submit_round_atomic.insert_holes', parent_step_key: 'db.submit_round_atomic', layer: 'postgres', status: 'success', requiredness: 'best_effort', duration_ms: 88, table_name: 'golf_holes' },
  { step_key: 'db.submit_round_atomic.insert_shots', parent_step_key: 'db.submit_round_atomic', layer: 'postgres', status: 'failure', requiredness: 'best_effort', duration_ms: 297, table_name: 'golf_shots', error_code: '23505' },
];

/**
 * The SAME failure after a total rollback: the transaction erased its own
 * checkpoint rows, so only the JS-written parent survives. This is brief §2's
 * whole premise, and the shape the banner exists for.
 */
const SUBMIT_AFTER_TOTAL_ROLLBACK: Record<string, unknown>[] = [
  { step_key: 'server.validation', parent_step_key: null, layer: 'server_action', status: 'success', requiredness: 'required', duration_ms: 2 },
  { step_key: 'server.auth', parent_step_key: null, layer: 'server_action', status: 'success', requiredness: 'required', duration_ms: 17 },
  { step_key: 'server.player', parent_step_key: null, layer: 'server_action', status: 'success', requiredness: 'required', duration_ms: 8 },
  { step_key: 'db.submit_round_atomic', parent_step_key: null, layer: 'postgres', status: 'failure', requiredness: 'required', duration_ms: 412, error_code: '40P01' },
];

/** A minimal, fully-populated node — every field explicit, so a future
 *  field addition to TraceStepNode fails here rather than silently. */
function baseNode(key: string): TraceStepNode {
  return {
    key,
    parentKey: null,
    layer: 'postgres',
    status: 'success',
    requiredness: 'required',
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    functionName: null,
    triggerName: null,
    tableName: null,
    errorCode: null,
    errorSummary: null,
    expected: null,
    observed: null,
    metadata: {},
    isMissing: false,
    isUndeclared: false,
    isPointInTime: false,
    depth: 0,
    children: [],
  };
}

describe('resolveExplorerLayer', () => {
  it('maps every storage layer onto a brief §56 layer', () => {
    expect(resolveExplorerLayer('client', null)).toBe('CLIENT');
    expect(resolveExplorerLayer('next', null)).toBe('SERVER_ACTION');
    expect(resolveExplorerLayer('server_action', null)).toBe('SERVER_ACTION');
    expect(resolveExplorerLayer('supabase', null)).toBe('SUPABASE_POSTGREST');
    expect(resolveExplorerLayer('verification', null)).toBe('VERIFICATION');
    expect(resolveExplorerLayer('cache', null)).toBe('ASYNC_DOWNSTREAM');
    expect(resolveExplorerLayer('background', null)).toBe('ASYNC_DOWNSTREAM');
  });

  it('reads a postgres step as an RPC at the database boundary and a substep inside one', () => {
    expect(resolveExplorerLayer('postgres', null)).toBe('POSTGRES_RPC');
    expect(resolveExplorerLayer('postgres', 'SERVER_ACTION')).toBe('POSTGRES_RPC');
    expect(resolveExplorerLayer('postgres', 'POSTGRES_RPC')).toBe('POSTGRES_SUBSTEPS');
    expect(resolveExplorerLayer('postgres', 'POSTGRES_SUBSTEPS')).toBe('POSTGRES_SUBSTEPS');
  });

  it('reads a postgres checkpoint under a supabase-declared RPC as a substep', () => {
    // The live case: db.save_partial_round_atomic is declared 'supabase' in
    // golf-round-flight-workflow.ts, and 20260902160000's UPSERT deliberately
    // never overwrites that layer — while writing every one of its
    // in-transaction checkpoints as 'postgres'. A per-row map would render
    // four checkpoints as four separate top-level RPCs.
    expect(resolveExplorerLayer('postgres', 'SUPABASE_POSTGREST')).toBe('POSTGRES_SUBSTEPS');
  });

  it('reads a trigger as a substep regardless of where it sits', () => {
    expect(resolveExplorerLayer('trigger', null)).toBe('POSTGRES_SUBSTEPS');
    expect(resolveExplorerLayer('trigger', 'SERVER_ACTION')).toBe('POSTGRES_SUBSTEPS');
  });
});

describe('toExplorerView — layers and per-step facts', () => {
  it('places every step in exactly one layer and keeps empty layers present', () => {
    const view = toExplorerView(buildTraceTree(SUBMIT_WITH_SURVIVING_CHECKPOINTS, 'golf.round.submit'));
    for (const layer of EXPLORER_LAYERS) {
      expect(view.byLayer[layer]).toBeDefined();
    }
    // CLIENT genuinely has no steps in this trace. An absent layer and an
    // empty one are different facts; the view must render the second.
    expect(view.byLayer.CLIENT).toEqual([]);
    const total = EXPLORER_LAYERS.reduce((n, l) => n + view.byLayer[l].length, 0);
    expect(total).toBe(view.steps.length);
  });

  it('nests the in-transaction checkpoints under the RPC as substeps', () => {
    const view = toExplorerView(buildTraceTree(SUBMIT_WITH_SURVIVING_CHECKPOINTS, 'golf.round.submit'));
    expect(view.byLayer.POSTGRES_RPC.map((s) => s.key)).toEqual(['db.submit_round_atomic']);
    expect(view.byLayer.POSTGRES_SUBSTEPS.map((s) => s.key)).toEqual([
      'db.submit_round_atomic.insert_holes',
      'db.submit_round_atomic.insert_shots',
    ]);
  });

  it('carries status, requiredness, function, safe table and SQLSTATE per step', () => {
    const view = toExplorerView(buildTraceTree(SUBMIT_WITH_SURVIVING_CHECKPOINTS, 'golf.round.submit'));
    const rpc = view.steps.find((s) => s.key === 'db.submit_round_atomic')!;
    expect(rpc.status).toBe('failure');
    expect(rpc.requiredness).toBe('required');
    expect(rpc.functionName).toBe('submit_round_atomic');
    expect(rpc.sqlstate).toBe('23505');
    const shots = view.steps.find((s) => s.key === 'db.submit_round_atomic.insert_shots')!;
    expect(shots.tableName).toBe('golf_shots');
  });

  it('reports duration and a point-in-time checkpoint as different facts', () => {
    const view = toExplorerView(
      buildTraceTree(
        [
          { step_key: 'db.rpc', parent_step_key: null, layer: 'postgres', status: 'success', requiredness: 'required', duration_ms: 40 },
          { step_key: 'db.rpc.enter', parent_step_key: 'db.rpc', layer: 'postgres', status: 'started', requiredness: 'best_effort', finished_at: '2026-09-03T10:00:00.000Z' },
          { step_key: 'db.rpc.never_timed', parent_step_key: 'db.rpc', layer: 'postgres', status: 'success', requiredness: 'best_effort' },
        ],
        'golf.round.submit',
      ),
    );
    expect(view.steps.find((s) => s.key === 'db.rpc')!.timing).toEqual({ kind: 'duration', durationMs: 40 });
    expect(view.steps.find((s) => s.key === 'db.rpc.enter')!.timing).toEqual({
      kind: 'checkpoint',
      at: '2026-09-03T10:00:00.000Z',
    });
    expect(view.steps.find((s) => s.key === 'db.rpc.never_timed')!.timing).toEqual({ kind: 'none' });
  });

  it('drops a table name that is not a bare identifier rather than rendering it', () => {
    // brief §6: a relation name is a safe dimension; an arbitrary string out
    // of a jsonb column is not. Anything predicate-shaped is withheld.
    const view = toExplorerView(
      buildTraceTree(
        [
          { step_key: 'db.rpc', parent_step_key: null, layer: 'postgres', status: 'failure', requiredness: 'required', table_name: "golf_rounds where player_id = 'a@b.edu'" },
        ],
        'golf.round.submit',
      ),
    );
    expect(view.steps[0]!.tableName).toBeNull();
  });

  it('never invents a Sentry link, and builds one only from a supplied org slug', () => {
    const rows: Record<string, unknown>[] = [
      { step_key: 'db.rpc', parent_step_key: null, layer: 'postgres', status: 'success', requiredness: 'required', metadata: { sentry_trace_id: 'a'.repeat(32) } },
    ];
    const without = toExplorerView(buildTraceTree(rows, 'golf.round.submit'));
    expect(without.steps[0]!.sentryTraceId).toBe('a'.repeat(32));
    expect(without.steps[0]!.sentryLink).toBeNull();

    const withSlug = toExplorerView(buildTraceTree(rows, 'golf.round.submit'), { sentryOrgSlug: 'helm-xs' });
    expect(withSlug.steps[0]!.sentryLink).toBe(
      `https://helm-xs.sentry.io/explore/traces/trace/${'a'.repeat(32)}/`,
    );
  });

  it('leaves release null when the trace recorded none', () => {
    // The JS recorder's baseMetadata (helm-flight-recorder.ts) carries
    // round/team/player ids and sentry_trace_id — no release. Defaulting to
    // "current" would attribute an old trace to today's deploy.
    const view = toExplorerView(buildTraceTree(SUBMIT_AFTER_TOTAL_ROLLBACK, 'golf.round.submit'));
    expect(view.steps.every((s) => s.release === null)).toBe(true);
  });
});

describe('toExplorerView — rollback evidence banner (brief §56)', () => {
  it('renders the banner verbatim when the transaction erased its own trace rows', () => {
    const view = toExplorerView(buildTraceTree(SUBMIT_AFTER_TOTAL_ROLLBACK, 'golf.round.submit'));
    expect(view.rollbackNotices).toHaveLength(1);
    expect(view.rollbackNotices[0]!.stepKey).toBe('db.submit_round_atomic');
    expect(view.rollbackNotices[0]!.text).toBe(
      'POSTGRES FAILURE DETAIL: NOT DURABLY CAPTURED — application-observed SQLSTATE: 40P01, raw Postgres log: manual',
    );
  });

  it('does NOT render the banner when an exception checkpoint survived', () => {
    // helm_private.trace_exception_checkpoint writes {sqlstate, message} into
    // metadata on a child row. When that row survives, the postgres failure
    // detail WAS durably captured and the banner would be a lie.
    const rows: Record<string, unknown>[] = [
      ...SUBMIT_AFTER_TOTAL_ROLLBACK,
      {
        step_key: 'db.submit_round_atomic.insert_shots',
        parent_step_key: 'db.submit_round_atomic',
        layer: 'postgres',
        status: 'failure',
        requiredness: 'best_effort',
        finished_at: '2026-09-03T10:00:00.000Z',
        metadata: { sqlstate: '40P01', message: 'deadlock detected' },
      },
    ];
    const view = toExplorerView(buildTraceTree(rows, 'golf.round.submit'));
    expect(view.rollbackNotices).toEqual([]);
    // ...and the surviving checkpoint's SQLSTATE is read out of metadata,
    // which is the only place that writer puts it.
    const substep = view.steps.find((s) => s.key === 'db.submit_round_atomic.insert_shots')!;
    expect(substep.sqlstate).toBe('40P01');
  });

  it('still renders the banner on a trace that also has synthesised missing steps', () => {
    // golf.qualifier.submit declares post.qualifier_transition 'required', so
    // this rolled-back trace carries a synthesised missing node as well as
    // the failed RPC. The banner is about the RPC's own lost detail and must
    // not be suppressed by unrelated missing work.
    const view = toExplorerView(buildTraceTree(SUBMIT_AFTER_TOTAL_ROLLBACK, 'golf.qualifier.submit'));
    expect(view.steps.some((s) => s.isMissing)).toBe(true);
    expect(view.rollbackNotices).toHaveLength(1);
    expect(view.rollbackNotices[0]!.stepKey).toBe('db.submit_round_atomic');
  });

  it('does not treat a MISSING substep as durable evidence', () => {
    // A missing node proves the step never ran. Counting it as capture would
    // suppress the banner in exactly the case the banner is for. No current
    // workflow definition declares a postgres substep, so buildTraceTree
    // cannot synthesise one — the tree is built by hand here rather than
    // asserting on a shape the synthesiser happens not to produce today.
    const rpc: TraceStepNode = { ...baseNode('db.submit_round_atomic'), layer: 'postgres', status: 'failure', requiredness: 'required', errorCode: '40P01' };
    const ghost: TraceStepNode = { ...baseNode('db.submit_round_atomic.insert_shots'), parentKey: rpc.key, layer: 'postgres', status: 'missing', requiredness: 'required', isMissing: true, depth: 1 };
    rpc.children.push(ghost);
    const tree: TraceTree = { roots: [rpc], flat: [rpc, ghost], missingRequiredCount: 1, observedStepCount: 1, failureKey: rpc.key };

    const view = toExplorerView(tree);
    expect(view.byLayer.POSTGRES_SUBSTEPS.map((s) => s.key)).toEqual([ghost.key]);
    expect(view.rollbackNotices).toHaveLength(1);
    expect(view.rollbackNotices[0]!.observedSqlstate).toBe('40P01');
  });

  it('says UNKNOWN rather than nothing when the app observed no code either', () => {
    const rows: Record<string, unknown>[] = [
      { step_key: 'db.submit_round_atomic', parent_step_key: null, layer: 'postgres', status: 'failure', requiredness: 'required' },
    ];
    const view = toExplorerView(buildTraceTree(rows, 'golf.round.submit'));
    expect(view.rollbackNotices[0]!.observedSqlstate).toBe('UNKNOWN');
    expect(view.rollbackNotices[0]!.text).toContain(ROLLBACK_NOTICE_PREFIX);
    expect(view.rollbackNotices[0]!.text).toBe(buildRollbackNoticeText('UNKNOWN'));
  });

  it('does not flag a failed plain PostgREST read', () => {
    // db.load_round never had in-transaction checkpoints to lose. Flagging it
    // would put the banner on the most common failure there is.
    const view = toExplorerView(
      buildTraceTree(
        [{ step_key: 'db.load_round', parent_step_key: null, layer: 'supabase', status: 'failure', requiredness: 'required', error_code: 'PGRST116' }],
        'golf.round.resume',
      ),
    );
    expect(view.rollbackNotices).toEqual([]);
  });

  it('flags a supabase-declared RPC when the caller names it as one', () => {
    // db.save_partial_round_atomic IS a single Postgres transaction but is
    // stored at layer 'supabase', and after a total rollback nothing left in
    // the trace proves that — the JS recorder never sends p_function_name.
    // So the caller states it rather than the module guessing from a prefix.
    const rows: Record<string, unknown>[] = [
      { step_key: 'db.save_partial_round_atomic', parent_step_key: null, layer: 'supabase', status: 'failure', requiredness: 'conditional', error_code: '57014' },
    ];
    const tree = buildTraceTree(rows, 'golf.round.autosave');
    expect(toExplorerView(tree).rollbackNotices).toEqual([]);
    const flagged = toExplorerView(tree, {
      additionalRpcStepKeys: ['db.save_partial_round_atomic'],
    });
    expect(flagged.rollbackNotices).toHaveLength(1);
    expect(flagged.rollbackNotices[0]!.observedSqlstate).toBe('57014');
  });

  it('does not flag a successful RPC', () => {
    const view = toExplorerView(
      buildTraceTree(
        [{ step_key: 'db.submit_round_atomic', parent_step_key: null, layer: 'postgres', status: 'success', requiredness: 'required', duration_ms: 40 }],
        'golf.round.submit',
      ),
    );
    expect(view.rollbackNotices).toEqual([]);
  });
});
