/**
 * The canonical, executable expectation map for Golf's highest-risk mutation
 * flows.  It intentionally contains no I/O: the browser, Server Actions,
 * database recorder, tests, and Trace Explorer all use the same step keys.
 */

export type GolfRoundWorkflow =
  | 'golf.round.start'
  | 'golf.shot.add_or_edit'
  | 'golf.hole.complete'
  | 'golf.round.autosave'
  | 'golf.round.resume'
  | 'golf.shot.delete'
  | 'golf.round.submit'
  | 'golf.qualifier.submit'
  | 'golf.stats.refresh'
  | 'golf.coachhelm.post_round';

export type FlightStepStatus = 'pending' | 'started' | 'success' | 'failure' | 'skipped' | 'missing' | 'warning';
export type FlightStepRequiredness = 'required' | 'conditional' | 'best_effort' | 'async';
export type FlightStepLayer = 'client' | 'next' | 'server_action' | 'supabase' | 'postgres' | 'trigger' | 'verification' | 'cache' | 'background';

export interface FlightStepDefinition {
  key: string;
  parentKey?: string;
  layer: FlightStepLayer;
  requiredness: FlightStepRequiredness;
  when?: 'qualifier' | 'existing_round' | 'new_round';
}

export interface FlightStepState extends FlightStepDefinition {
  status: FlightStepStatus;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

const SHARED_MUTATION_STEPS: readonly FlightStepDefinition[] = [
  { key: 'server.validation', layer: 'server_action', requiredness: 'required' },
  { key: 'server.auth', layer: 'server_action', requiredness: 'required' },
  { key: 'server.player', layer: 'server_action', requiredness: 'required' },
];

// Verification (verify.*) is read-only, post-write instrumentation — it can
// prove a write's row counts, but a failed or slow read must never turn a
// committed save into an error, and (2026-09-02) a trace with a genuinely
// short verification read must never be flagged "required steps missing"
// either. Every verify.* step below is 'best_effort': it still runs, still
// gets start()+complete() so its OWN duration is visible (the historical bug
// this closes is a verify step completing with no start(), which reports
// 0 ms even when the read took real time), it just no longer inflates
// missing-required-step counts or gates a trace's overall status.
const WORKFLOW_DEFINITIONS: Readonly<Record<GolfRoundWorkflow, readonly FlightStepDefinition[]>> = {
  'golf.round.start': [
    ...SHARED_MUTATION_STEPS,
    { key: 'db.create_draft', layer: 'supabase', requiredness: 'required' },
    { key: 'verify.round', layer: 'verification', requiredness: 'best_effort' },
  ],
  'golf.shot.add_or_edit': [
    ...SHARED_MUTATION_STEPS,
    { key: 'db.shot_mutation', layer: 'supabase', requiredness: 'required' },
    { key: 'verify.shots', layer: 'verification', requiredness: 'best_effort' },
    { key: 'post.stats', layer: 'cache', requiredness: 'async' },
  ],
  'golf.hole.complete': [
    ...SHARED_MUTATION_STEPS,
    { key: 'db.save_partial_round_atomic', layer: 'supabase', requiredness: 'conditional', when: 'existing_round' },
    { key: 'db.create_or_update_draft', layer: 'supabase', requiredness: 'conditional', when: 'new_round' },
    { key: 'verify.round', layer: 'verification', requiredness: 'best_effort' },
    { key: 'verify.holes', layer: 'verification', requiredness: 'best_effort' },
    { key: 'verify.shots', layer: 'verification', requiredness: 'best_effort' },
  ],
  'golf.round.autosave': [
    ...SHARED_MUTATION_STEPS,
    { key: 'db.save_partial_round_atomic', layer: 'supabase', requiredness: 'conditional', when: 'existing_round' },
    { key: 'db.create_or_update_draft', layer: 'supabase', requiredness: 'conditional', when: 'new_round' },
    // The no-id/new-round branch is NOT the single atomic RPC the
    // existing-round branch uses — it upserts the parent round, then holes,
    // then shots, then these two, as separate round trips. Measured
    // 2026-08-25/26: five autosaves in one 5-minute window took 12-24s of
    // TOTAL DURATION while the atomic RPC step measured ~100ms and every
    // other step read 0ms, because the detail inserts and the trim below had
    // no call site at all — the time was real but unattributed. Both are
    // 'best_effort': neither ever blocks or fails the save (see the
    // non-critical/non-fatal comments at their call sites in golf.ts).
    { key: 'db.shot_details', layer: 'supabase', requiredness: 'best_effort', when: 'new_round' },
    { key: 'db.orphan_trim', layer: 'supabase', requiredness: 'best_effort', when: 'new_round' },
    { key: 'verify.round', layer: 'verification', requiredness: 'best_effort' },
    { key: 'verify.holes', layer: 'verification', requiredness: 'best_effort' },
    { key: 'verify.shots', layer: 'verification', requiredness: 'best_effort' },
  ],
  'golf.round.resume': [
    ...SHARED_MUTATION_STEPS,
    { key: 'db.load_round', layer: 'supabase', requiredness: 'required' },
    { key: 'verify.recovery_state', layer: 'verification', requiredness: 'best_effort' },
  ],
  'golf.shot.delete': [
    ...SHARED_MUTATION_STEPS,
    { key: 'db.delete_shot', layer: 'supabase', requiredness: 'required' },
    { key: 'verify.shots', layer: 'verification', requiredness: 'best_effort' },
    { key: 'post.stats', layer: 'cache', requiredness: 'async' },
  ],
  'golf.round.submit': [
    ...SHARED_MUTATION_STEPS,
    { key: 'db.submit_round_atomic', layer: 'postgres', requiredness: 'required' },
    // Only attempted (and only ever reaches 'success') when the atomic RPC
    // fails at the transport level and a direct-submit fallback rescues the
    // write. 'best_effort' — not 'required' — because it must never appear
    // in missing_required_steps for the overwhelming majority of submits
    // that never touch this path at all.
    { key: 'db.direct_submit_fallback', layer: 'supabase', requiredness: 'best_effort' },
    { key: 'verify.round', layer: 'verification', requiredness: 'best_effort' },
    { key: 'verify.holes', layer: 'verification', requiredness: 'best_effort' },
    { key: 'verify.shots', layer: 'verification', requiredness: 'best_effort' },
    { key: 'post.stats', layer: 'cache', requiredness: 'async' },
    { key: 'post.qualifier_transition', layer: 'background', requiredness: 'conditional', when: 'qualifier' },
    { key: 'post.coachhelm', layer: 'background', requiredness: 'async' },
  ],
  'golf.qualifier.submit': [
    ...SHARED_MUTATION_STEPS,
    { key: 'db.submit_round_atomic', layer: 'postgres', requiredness: 'required' },
    { key: 'db.direct_submit_fallback', layer: 'supabase', requiredness: 'best_effort' },
    { key: 'verify.round', layer: 'verification', requiredness: 'best_effort' },
    { key: 'verify.holes', layer: 'verification', requiredness: 'best_effort' },
    { key: 'verify.shots', layer: 'verification', requiredness: 'best_effort' },
    { key: 'post.stats', layer: 'cache', requiredness: 'async' },
    { key: 'post.qualifier_transition', layer: 'background', requiredness: 'required' },
    { key: 'post.coachhelm', layer: 'background', requiredness: 'async' },
  ],
  'golf.stats.refresh': [
    { key: 'server.auth', layer: 'server_action', requiredness: 'required' },
    { key: 'db.recalculate_stats', layer: 'postgres', requiredness: 'required' },
    { key: 'verify.stats_cache', layer: 'verification', requiredness: 'best_effort' },
  ],
  'golf.coachhelm.post_round': [
    { key: 'server.round_read', layer: 'server_action', requiredness: 'required' },
    { key: 'db.record_terminal_state', layer: 'postgres', requiredness: 'required' },
    { key: 'background.generate_insights', layer: 'background', requiredness: 'required' },
  ],
};

export function getGolfRoundWorkflowDefinition(workflow: GolfRoundWorkflow): readonly FlightStepDefinition[] {
  return WORKFLOW_DEFINITIONS[workflow];
}

export interface CreateGolfRoundWorkflowTraceOptions {
  workflow: GolfRoundWorkflow;
  traceId?: string;
  qualifierId?: string | null;
  existingRoundId?: string | null;
}

export interface GolfRoundWorkflowTrace {
  traceId: string;
  workflow: GolfRoundWorkflow;
  step(key: string): FlightStepState | undefined;
  start(key: string, metadata?: Record<string, unknown>): void;
  complete(key: string, metadata?: Record<string, unknown>): void;
  fail(key: string, metadata?: Record<string, unknown> & { errorCode?: string }): void;
  warn(key: string, metadata?: Record<string, unknown>): void;
  skip(key: string, metadata?: Record<string, unknown>): void;
  steps(): readonly FlightStepState[];
}

export function createGolfRoundWorkflowTrace(options: CreateGolfRoundWorkflowTraceOptions): GolfRoundWorkflowTrace {
  const traceId = options.traceId ?? crypto.randomUUID();
  const stepMap = new Map<string, FlightStepState>();

  for (const definition of getGolfRoundWorkflowDefinition(options.workflow)) {
    stepMap.set(definition.key, {
      ...definition,
      status: (
        (definition.when === 'qualifier' && !options.qualifierId)
        || (definition.when === 'existing_round' && !options.existingRoundId)
        || (definition.when === 'new_round' && options.existingRoundId != null)
      ) ? 'skipped' : 'pending',
    });
  }

  const transition = (
    key: string,
    status: FlightStepStatus,
    metadata?: Record<string, unknown> & { errorCode?: string },
  ) => {
    const prior = stepMap.get(key);
    if (!prior) return;
    const now = new Date().toISOString();
    stepMap.set(key, {
      ...prior,
      status,
      startedAt: prior.startedAt ?? now,
      finishedAt: status === 'started' ? undefined : now,
      ...(metadata ? { metadata } : {}),
      ...(metadata?.errorCode ? { errorCode: metadata.errorCode } : {}),
    });
  };

  return {
    traceId,
    workflow: options.workflow,
    step: (key) => stepMap.get(key),
    start: (key, metadata) => transition(key, 'started', metadata),
    complete: (key, metadata) => transition(key, 'success', metadata),
    fail: (key, metadata) => transition(key, 'failure', metadata),
    warn: (key, metadata) => transition(key, 'warning', metadata),
    skip: (key, metadata) => transition(key, 'skipped', metadata),
    steps: () => [...stepMap.values()],
  };
}

export function getMissingRequiredSteps(trace: GolfRoundWorkflowTrace): string[] {
  return trace.steps()
    .filter((step) => step.requiredness === 'required' && step.status === 'pending')
    .map((step) => step.key);
}
