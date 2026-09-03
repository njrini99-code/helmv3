import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  createGolfRoundWorkflowTrace,
  getMissingRequiredSteps,
  type FlightStepRequiredness,
  type FlightStepStatus,
  type GolfRoundWorkflow,
} from './golf-round-flight-workflow';
import { vercelWaitUntil } from './vercel-wait-until';

type SafeMetadata = Record<string, unknown>;

export interface StartHelmFlightRecorderInput {
  workflow: GolfRoundWorkflow;
  traceId?: string;
  roundId?: string | null;
  teamId?: string | null;
  playerId?: string | null;
  qualifierId?: string | null;
  existingRoundId?: string | null;
  environment?: string;
  metadata?: SafeMetadata;
}

export interface FlightRecorderStepInput {
  parentStepKey?: string;
  category?: string;
  tableName?: string;
  functionName?: string;
  triggerName?: string;
  errorCode?: string;
  errorSummary?: string;
  expected?: SafeMetadata;
  observed?: SafeMetadata;
  metadata?: SafeMetadata;
}

interface RecorderSpan {
  traceId?: string;
  spanId?: string;
  end(): void;
  setStatus(status: 'ok' | 'internal_error'): void;
}

export interface FlightRecorderDependencies {
  newTraceId(): string;
  startSpan(input: { workflow: GolfRoundWorkflow; traceId: string; attributes: SafeMetadata }): RecorderSpan;
  persistStart(payload: SafeMetadata): Promise<void>;
  persistStep(payload: SafeMetadata): Promise<void>;
  persistFinalize(payload: SafeMetadata): Promise<void>;
  onRecorderFailure(error: unknown, context: SafeMetadata): void;
}

export interface HelmFlightRecorder {
  traceId: string;
  workflow: GolfRoundWorkflow;
  start(stepKey: string, input?: FlightRecorderStepInput): Promise<void>;
  complete(stepKey: string, input?: FlightRecorderStepInput): Promise<void>;
  fail(stepKey: string, input?: FlightRecorderStepInput): Promise<void>;
  warn(stepKey: string, input?: FlightRecorderStepInput): Promise<void>;
  skip(stepKey: string, input?: FlightRecorderStepInput): Promise<void>;
  finalize(status: 'success' | 'failure' | 'warning' | 'pending'): Promise<void>;
}

type TraceRpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ error: { code?: string; message: string } | null }>;
};

const SAFE_METADATA_KEYS_TO_DROP = new Set([
  'authorization', 'cookie', 'cookies', 'token', 'access_token', 'refresh_token',
  'service_role', 'service_role_key', 'password', 'payload', 'round_payload', 'headers',
]);

function safeMetadata(input: SafeMetadata | undefined): SafeMetadata {
  if (!input) return {};
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => !SAFE_METADATA_KEYS_TO_DROP.has(key.toLowerCase())),
  );
}

function defaultDependencies(): FlightRecorderDependencies {
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const result = await (createAdminClient() as unknown as TraceRpcClient).rpc(name, args);
    if (result.error) throw new Error(`${result.error.code ?? 'TRACE_RPC'}: ${result.error.message}`);
  };

  return {
    newTraceId: () => crypto.randomUUID(),
    startSpan: ({ workflow, traceId, attributes }) => {
      const span = Sentry.startInactiveSpan({
        name: workflow,
        op: 'golf.workflow',
        attributes: {
          'helm.trace_id': traceId,
          'golf.workflow': workflow,
          ...safeMetadata(attributes),
        },
      });
      const context = span.spanContext();
      return {
        traceId: context.traceId,
        spanId: context.spanId,
        end: () => span.end(),
        setStatus: (status) => span.setStatus({ code: status === 'ok' ? 1 : 2, message: status }),
      };
    },
    persistStart: async (payload) => rpc('helm_debug_start_trace', {
      p_trace_id: payload.traceId,
      p_workflow: payload.workflow,
      p_environment: payload.environment,
      p_metadata: payload.metadata,
    }),
    persistStep: async (payload) => rpc('helm_debug_record_trace_step', {
      p_trace_id: payload.traceId,
      p_step_key: payload.stepKey,
      p_layer: payload.layer,
      p_status: payload.status,
      p_requiredness: payload.requiredness,
      p_metadata: payload.metadata,
    }),
    persistFinalize: async (payload) => rpc('helm_debug_finalize_trace', {
      p_trace_id: payload.traceId,
      p_status: payload.status,
      p_metadata: payload.metadata,
    }),
    onRecorderFailure: (error, context) => {
      Sentry.withScope((scope) => {
        scope.setLevel('warning');
        scope.setTag('helm.flight_recorder', 'write_failed');
        scope.setContext('helm_flight_recorder', safeMetadata(context));
        Sentry.captureException(error);
      });
    },
  };
}

function environmentForTrace(value: string | undefined): string {
  return (value ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown').slice(0, 64);
}

/**
 * The trace-start write is opt-in diagnostics, not a request dependency — it
 * must never be the thing that makes a round save slow. Recorder writes are
 * enabled by default in dev/test and are opt-in in production (see `enabled`
 * below), which means the one time this write actually happens in production
 * is mid-incident: exactly when a hung RPC would otherwise stack extra
 * latency onto every round write. `persistStart`'s own `failOpen` wrapper
 * only guards against a REJECTION; a hang that never settles at all would
 * still block the caller forever without this.
 *
 * Lowered from 1500ms to 500ms (2026-09-02, flight-recorder real-timings
 * reviewer fix): the real-per-stage-timing refit moved recorder construction
 * — which awaits this bounded write — BEFORE any business logic in
 * `deleteShot`, `updateShot`, and `savePartialRound`'s new-round branch (it
 * already led `submitGolfRoundComprehensive`). A hung `helm_debug` write now
 * stalls the start of every one of those actions, not only submit, and
 * exactly during the mid-incident window described above — when a player
 * can least afford extra latency on a shot edit or autosave. 500ms is still
 * generous for a healthy same-region Supabase RPC (typically tens of ms) and
 * caps the worst case those newly-affected call sites can add.
 */
export const PERSIST_START_TIMEOUT_MS = 500;

/**
 * Resolves 'settled' once `promise` settles, or 'timeout' after `ms` —
 * whichever comes first. Never rejects: `promise` here is always the return
 * of `failOpen(...)`, whose own try/catch guarantees it resolves rather than
 * rejects, but the `.catch` below is kept as a second line of defense so a
 * future edit to that guarantee can't turn this into an unhandled rejection.
 */
function raceAgainstTimeout(promise: Promise<void>, ms: number): Promise<'settled' | 'timeout'> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), ms);
    const settle = () => {
      clearTimeout(timer);
      resolve('settled');
    };
    promise.then(settle, settle);
  });
}

/**
 * Creates a fail-open recorder. It is intentionally server-only because the
 * private helm_debug schema can only be accessed through service-role RPCs.
 * Browser actions pass the opaque UUID to the Server Action; the server owns
 * all persisted trace metadata.
 */
export async function createHelmFlightRecorder(
  input: StartHelmFlightRecorderInput,
  dependencies: FlightRecorderDependencies = defaultDependencies(),
): Promise<HelmFlightRecorder> {
  const traceId = input.traceId ?? dependencies.newTraceId();
  const trace = createGolfRoundWorkflowTrace({
    workflow: input.workflow,
    traceId,
    qualifierId: input.qualifierId,
    existingRoundId: input.existingRoundId,
  });
  // Local/test runs are intentionally fully observable. Production is opt-in
  // until retention and volume are proven: an administrator can supply a
  // trace UUID, or an incident can temporarily enable the documented flag.
  const isProduction = process.env.VERCEL_ENV === 'production';
  const enabled = !isProduction || input.traceId != null || process.env.HELM_FLIGHT_RECORDER_ENABLED === 'true';
  if (!enabled) {
    const noop = async () => undefined;
    return {
      traceId,
      workflow: input.workflow,
      start: noop,
      complete: noop,
      fail: noop,
      warn: noop,
      skip: noop,
      finalize: noop,
    };
  }
  const span = dependencies.startSpan({
    workflow: input.workflow,
    traceId,
    attributes: {
      ...(input.roundId ? { 'golf.round_id': input.roundId } : {}),
      ...(input.teamId ? { 'golf.team_id': input.teamId } : {}),
      ...(input.playerId ? { 'golf.player_id': input.playerId } : {}),
    },
  });

  const baseMetadata: SafeMetadata = safeMetadata({
    ...input.metadata,
    ...(input.roundId ? { round_id: input.roundId } : {}),
    ...(input.teamId ? { team_id: input.teamId } : {}),
    ...(input.playerId ? { player_id: input.playerId } : {}),
    ...(input.qualifierId ? { qualifier_id: input.qualifierId } : {}),
    ...(span.traceId ? { sentry_trace_id: span.traceId } : {}),
    ...(span.spanId ? { root_span_id: span.spanId } : {}),
    expected_step_count: trace.steps().length,
  });

  /**
   * Every call site in golf.ts fires `void flightRecorder.x(...)` — by
   * design, so a trace write can never block the player's save. That means
   * the promise `write()` returns here is, from the caller's perspective,
   * already fire-and-forget before it ever reaches this function. On a plain
   * Node server that is merely untidy: the event loop keeps running until
   * the promise settles regardless of who is watching it. On Vercel it is a
   * race — the function can freeze the instant the Server Action's response
   * is sent, and a promise nobody registered with the platform is frozen
   * mid-flight along with it. When that frozen fetch is later resumed (on
   * whatever invocation next thaws the same execution environment) it
   * surfaces as an "unhandled fetch failed": Sentry's Supabase auto-
   * instrumentation on the admin client (src/lib/supabase/admin.ts) reports
   * it once there, and this function's own `catch` below reports it again
   * whenever it eventually gets to run — two Sentry events for one failure.
   *
   * `vercelWaitUntil` (src/lib/observability/vercel-wait-until.ts) is the
   * repo's existing fix for exactly this shape of race (see
   * src/lib/admin/schedule-bridge-write.ts for the idiom PR #1737 used for
   * Bridge writes): registering `task` tells the Vercel runtime to hold the
   * function open until it settles. That keeps the write inside the SAME
   * invocation it started in, so the `try/catch` below always gets to run —
   * exactly one handled report, through `onRecorderFailure`, every time —
   * and the freeze/resume race that produced the second, unhandled report
   * can no longer happen. Registering is additive and never throws (see the
   * helper's own contract), so this changes nothing outside Vercel: `task`
   * is still awaited here regardless, fail-open, non-blocking to the
   * caller either way.
   */
  const failOpen = async (operation: string, write: () => Promise<void>) => {
    try {
      // `write` is typed to return a promise, but nothing enforces that at
      // the call site — a bug in the closure that builds the payload (or in
      // a misbehaving dependency) can throw SYNCHRONOUSLY before any promise
      // exists. Both the construction and the `vercelWaitUntil` registration
      // live inside this try (not before it) so that case is caught exactly
      // like an async rejection: one handled report through
      // `onRecorderFailure`, never an unhandled rejection escaping to a
      // `void flightRecorder.x(...)` call site in golf.ts.
      const task = write();
      vercelWaitUntil(task);
      await task;
    } catch (error) {
      dependencies.onRecorderFailure(error, { operation, trace_id: traceId, workflow: input.workflow });
    }
  };

  /**
   * `RecorderSpan.setStatus`/`.end()` are synchronous, caller-supplied
   * (Sentry today, a test double in tests) — nothing here guarantees they
   * can't throw. Every call site is either inside a `void`-called async
   * function (`finalize`) or a fire-and-forget degrade path, so an
   * unguarded throw here becomes an unhandled promise rejection on the
   * round-save hot path instead of a caught, reported one.
   */
  const closeSpanSafely = (status: 'ok' | 'internal_error') => {
    try {
      span.setStatus(status);
      span.end();
    } catch (error) {
      dependencies.onRecorderFailure(error, { operation: 'span_close', trace_id: traceId, workflow: input.workflow });
    }
  };

  const startOutcome = await raceAgainstTimeout(
    failOpen('start', () => dependencies.persistStart({
      traceId,
      workflow: input.workflow,
      environment: environmentForTrace(input.environment),
      metadata: baseMetadata,
    })),
    PERSIST_START_TIMEOUT_MS,
  );

  if (startOutcome === 'timeout') {
    // The write is still running in the background — failOpen's own
    // try/catch means it can only ever resolve, so there is nothing to await
    // or cancel here. Degrade THIS trace to the same inert no-op shape the
    // disabled-mode branch above returns, and close out the Sentry span we
    // already opened so it doesn't leak as permanently "in progress".
    dependencies.onRecorderFailure(
      new Error(`persistStart exceeded ${PERSIST_START_TIMEOUT_MS}ms`),
      { operation: 'start_timeout', trace_id: traceId, workflow: input.workflow, timeout_ms: PERSIST_START_TIMEOUT_MS },
    );
    closeSpanSafely('internal_error');
    const noop = async () => undefined;
    return {
      traceId,
      workflow: input.workflow,
      start: noop,
      complete: noop,
      fail: noop,
      warn: noop,
      skip: noop,
      finalize: noop,
    };
  }

  const transition = async (
    stepKey: string,
    status: Exclude<FlightStepStatus, 'pending'>,
    stepInput: FlightRecorderStepInput | undefined,
  ) => {
    const metadata = safeMetadata(stepInput?.metadata);
    switch (status) {
      case 'started': trace.start(stepKey, metadata); break;
      case 'success': trace.complete(stepKey, metadata); break;
      case 'failure': trace.fail(stepKey, { ...metadata, ...(stepInput?.errorCode ? { errorCode: stepInput.errorCode } : {}) }); break;
      case 'warning': trace.warn(stepKey, metadata); break;
      case 'skipped': trace.skip(stepKey, metadata); break;
      default: return;
    }

    const state = trace.step(stepKey);
    if (!state) return;
    await failOpen('step', () => dependencies.persistStep({
      traceId,
      stepKey,
      layer: state.layer,
      status,
      requiredness: state.requiredness as FlightStepRequiredness,
      metadata: safeMetadata({
        ...metadata,
        ...(stepInput?.parentStepKey ? { parent_step_key: stepInput.parentStepKey } : {}),
        ...(stepInput?.category ? { category: stepInput.category } : {}),
        ...(stepInput?.tableName ? { table_name: stepInput.tableName } : {}),
        ...(stepInput?.functionName ? { function_name: stepInput.functionName } : {}),
        ...(stepInput?.triggerName ? { trigger_name: stepInput.triggerName } : {}),
        ...(stepInput?.errorCode ? { error_code: stepInput.errorCode } : {}),
        ...(stepInput?.errorSummary ? { error_summary: stepInput.errorSummary.slice(0, 1000) } : {}),
        ...(stepInput?.expected ? { expected: safeMetadata(stepInput.expected) } : {}),
        ...(stepInput?.observed ? { observed: safeMetadata(stepInput.observed) } : {}),
      }),
    }));
  };

  return {
    traceId,
    workflow: input.workflow,
    start: (stepKey, stepInput) => transition(stepKey, 'started', stepInput),
    complete: (stepKey, stepInput) => transition(stepKey, 'success', stepInput),
    fail: (stepKey, stepInput) => transition(stepKey, 'failure', stepInput),
    warn: (stepKey, stepInput) => transition(stepKey, 'warning', stepInput),
    skip: (stepKey, stepInput) => transition(stepKey, 'skipped', stepInput),
    finalize: async (status) => {
      const missingSteps = getMissingRequiredSteps(trace);
      const failedStep = trace.steps().find((step) => step.status === 'failure');
      const finalStatus = failedStep ? 'failure' : status;
      await failOpen('finalize', () => dependencies.persistFinalize({
        traceId,
        status: finalStatus,
        metadata: safeMetadata({
          missing_required_step_count: missingSteps.length,
          missing_required_steps: missingSteps,
          ...(failedStep ? {
            failure_step: failedStep.key,
            ...(failedStep.errorCode ? { failure_code: failedStep.errorCode } : {}),
          } : {}),
        }),
      }));
      closeSpanSafely(finalStatus === 'failure' ? 'internal_error' : 'ok');
    },
  };
}

export interface RescuedStepOutcomeInput {
  /** The step that failed at the transport/RPC layer. */
  failedStepKey: string;
  /** The step recording the fallback write that may have rescued the save. */
  fallbackStepKey: string;
  /** True when the fallback actually saved the data the failed step could not. */
  rescued: boolean;
  /** Attached to the failed step's `fail`/`warn` call either way (error code/summary). */
  stepInput?: FlightRecorderStepInput;
  /** Attached to the fallback step's `complete` call — only used when `rescued`. */
  fallbackStepInput?: FlightRecorderStepInput;
  /**
   * When true, a RESCUED outcome (`rescued: true`) still marks the failed
   * step warned and the fallback step complete, but does NOT call
   * `finalize('success')` — the caller has more response-blocking work left
   * to record (e.g. golf.ts's `post.qualifier_transition`) before the
   * trace's real window closes, and must finalize itself once that work is
   * done. Has no effect on the unrescued branch, which always finalizes
   * 'failure' immediately: that branch returns control to the caller before
   * any such later step could run, so there is nothing left to protect.
   * Defaults to false (finalize immediately either way), preserving the
   * original contract for any caller that doesn't pass it.
   */
  deferFinalizeOnRescue?: boolean;
}

/**
 * Records the correct trace outcome for a required step that failed at the
 * transport layer but may have been rescued by a fallback write — call this
 * only AFTER the fallback has resolved, never before it starts.
 *
 * `finalize()` above intentionally overrides its `status` argument to
 * 'failure' whenever ANY recorded step carries status 'failure' (see the
 * `trace.steps().find` above). Marking the failed step `fail()` before a
 * fallback runs — then `finalize('success')` once the fallback saves the
 * data — would still report the whole trace as a failure, because the
 * earlier `fail()` call already poisoned it; the diagnostic record would lie
 * about a round that was genuinely saved. Downgrading the step to a warning
 * and recording the fallback as its own completed step keeps the trace
 * honest whichever way the fallback resolves, without ever hiding that the
 * primary path failed.
 */
export async function recordRescuedStepOutcome(
  recorder: HelmFlightRecorder,
  input: RescuedStepOutcomeInput,
): Promise<void> {
  if (!input.rescued) {
    await recorder.fail(input.failedStepKey, input.stepInput);
    await recorder.finalize('failure');
    return;
  }
  await recorder.warn(input.failedStepKey, input.stepInput);
  await recorder.start(input.fallbackStepKey);
  await recorder.complete(input.fallbackStepKey, input.fallbackStepInput);
  if (input.deferFinalizeOnRescue) return;
  await recorder.finalize('success');
}
