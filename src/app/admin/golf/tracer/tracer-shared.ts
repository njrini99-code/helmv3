import type { FwStatusTone } from '@/components/fairway';
import type { TracerIncident } from '@/app/golf/actions/admin-tracer-data';
import {
  getGolfRoundWorkflowDefinition,
  type FlightStepLayer,
  type FlightStepRequiredness,
  type FlightStepStatus,
  type GolfRoundWorkflow,
} from '@/lib/observability/golf-round-flight-workflow';

/** Shared severity → StatusPill tone map — one definition for the main
 *  incidents list (page.tsx) and the round-scoped incident view
 *  (TracerRoundDiagnostic.tsx) so a "critical" incident reads identically
 *  wherever it surfaces. */
export const TRACER_SEVERITY_TONE: Record<TracerIncident['severity'], FwStatusTone> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

/** Round status → StatusPill tone, used on the per-player rounds list. */
export const ROUND_STATUS_TONE: Record<string, FwStatusTone> = {
  completed: 'success',
  in_progress: 'warning',
  draft: 'neutral',
};

/**
 * `hours_stuck` is plain arithmetic on a fixed instant already computed
 * server-side (getTracerEnrichedDataImpl) — no locale/timezone involved, so
 * this is safe to call from a Client Component's very first render (unlike
 * `toLocaleString()`, it can't disagree between server and client passes).
 */
export function formatStuckDuration(hours: number): string {
  if (hours < 24) return `${hours.toFixed(1)}h stuck`;
  return `${(hours / 24).toFixed(1)}d stuck`;
}

/* ────────────────────────────────────────────────────────────────────────
 * Flight Trace Explorer — step waterfall
 *
 * `bridgeGetFlightTrace` hands back a trace's steps as
 * `Array<Record<string, unknown>>` (the raw shape of
 * `helm_debug.trace_steps` rows returned by the `helm_debug_get_trace` RPC —
 * see supabase/migrations/20260825200811_helm_flight_recorder.sql). These
 * helpers turn that into layer-grouped, gap-aware lanes without ever
 * inventing a value the row didn't actually carry.
 * ────────────────────────────────────────────────────────────────────── */

/** Canonical lane order — mirrors `FlightStepLayer` in
 *  golf-round-flight-workflow.ts so a lane can never drift from the
 *  executable step-key map it renders. */
export const FLIGHT_LAYER_ORDER: readonly FlightStepLayer[] = [
  'client', 'next', 'server_action', 'supabase', 'postgres', 'trigger',
  'verification', 'cache', 'background',
];

/** Status → StatusPill tone for one step segment. `missing` (a REQUIRED step
 *  the workflow definition expects but this trace never recorded) reads as
 *  `danger` — the same tone as an outright failure — because an unrun
 *  required step is exactly as much a gap as a failed one. */
export const FLIGHT_STEP_STATUS_TONE: Record<FlightStepStatus, FwStatusTone> = {
  success: 'success',
  started: 'accent',
  pending: 'neutral',
  warning: 'warning',
  failure: 'danger',
  missing: 'danger',
  skipped: 'neutral',
};

export function flightStepStatusTone(status: string): FwStatusTone {
  return (FLIGHT_STEP_STATUS_TONE as Record<string, FwStatusTone>)[status] ?? 'neutral';
}

export const FLIGHT_REQUIREDNESS_LABEL: Record<FlightStepRequiredness, string> = {
  required: 'Required',
  conditional: 'Conditional',
  best_effort: 'Best effort',
  async: 'Async',
};

export interface FlightWaterfallSegment {
  key: string;
  layer: FlightStepLayer;
  requiredness: FlightStepRequiredness;
  /** The canonical `FlightStepStatus` value when the row's own `status`
   *  matched one, otherwise the raw string the row actually carried (never
   *  coerced to a value it didn't claim — see `normalizeRecordedStep`). */
  status: string;
  /** True when this segment stands in for a required step the trace never
   *  recorded — rendered as a ghost so the gap is visible instead of just
   *  absent. */
  isGhost: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  /** Real elapsed time derived from the row's own timestamps, or null when
   *  the row doesn't carry enough to compute one. Never fabricated. */
  elapsedMs: number | null;
  errorCode: string | null;
  errorSummary: string | null;
}

export interface FlightWaterfallLane {
  layer: FlightStepLayer;
  segments: FlightWaterfallSegment[];
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const KNOWN_LAYERS = new Set<string>(FLIGHT_LAYER_ORDER);
const KNOWN_REQUIREDNESS = new Set<string>(['required', 'conditional', 'best_effort', 'async']);

interface NormalizedRecordedStep {
  key: string;
  // layer/requiredness fall back to the workflow DEFINITION's own value when
  // the row's own field is missing or unrecognized (see buildFlightWaterfall)
  // — that fallback is principled because the definition genuinely IS the
  // canonical source for which layer/requiredness a given step key belongs
  // to. `status` has no such canonical fallback: it is the row's own runtime
  // observation of what happened, so it is carried through verbatim below —
  // never coerced to a status (e.g. `pending`, which specifically means
  // "queued, not yet started") the row never actually claimed.
  layer: FlightStepLayer | null;
  requiredness: FlightStepRequiredness | null;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorSummary: string | null;
}

function normalizeRecordedStep(record: Record<string, unknown>): NormalizedRecordedStep | null {
  const key = readString(record, 'step_key');
  if (!key) return null;
  const rawLayer = readString(record, 'layer');
  const rawRequiredness = readString(record, 'requiredness');
  return {
    key,
    layer: rawLayer && KNOWN_LAYERS.has(rawLayer) ? (rawLayer as FlightStepLayer) : null,
    requiredness: rawRequiredness && KNOWN_REQUIREDNESS.has(rawRequiredness) ? (rawRequiredness as FlightStepRequiredness) : null,
    // `helm_debug.trace_steps.status` is `not null` in the schema, so a real
    // row always carries one; `readString` only returns null for a
    // malformed/absent value, in which case 'unknown' is a label, not a
    // status this trace claimed happened — `flightStepStatusTone` already
    // falls back to a neutral tone for anything it doesn't recognize.
    status: readString(record, 'status') ?? 'unknown',
    startedAt: readString(record, 'started_at'),
    finishedAt: readString(record, 'finished_at'),
    durationMs: readNumber(record, 'duration_ms'),
    errorCode: readString(record, 'error_code'),
    errorSummary: readString(record, 'error_summary'),
  };
}

/**
 * Real, on-clock elapsed time for one step — never fabricated. Prefers a
 * persisted `duration_ms` (only ever set when a caller supplies one
 * explicitly); otherwise derives it from `finished_at - started_at`.
 *
 * `helm_debug_record_trace_step` sets `started_at` on the FIRST write for a
 * step and never updates it again on conflict, while `finished_at` updates
 * whenever a write carries a terminal status. When a caller records a step
 * with `start()` and later `complete()`, those land as two separate writes
 * at two real moments, so the delta is genuine. When a caller only ever
 * calls `complete()` — recording the step once, already terminal —
 * `started_at` and `finished_at` come from the same INSERT and read back
 * identical. That case can't be told apart from a truly ~0ms step, and
 * showing "0 ms" on nearly every segment would read as broken
 * instrumentation rather than as data, so it returns null (no elapsed
 * time reported) instead of asserting a duration this row can't actually
 * support.
 */
export function computeStepElapsedMs(step: {
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}): number | null {
  if (typeof step.durationMs === 'number' && Number.isFinite(step.durationMs)) {
    return step.durationMs;
  }
  if (!step.startedAt || !step.finishedAt) return null;
  if (step.startedAt === step.finishedAt) return null;
  const start = Date.parse(step.startedAt);
  const end = Date.parse(step.finishedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const delta = end - start;
  return delta >= 0 ? delta : null;
}

/**
 * Builds the step waterfall for one trace: every recorded step, plus a ghost
 * segment for each REQUIRED step the workflow definition
 * (`golf-round-flight-workflow.ts`) expects but this trace never recorded —
 * the gap the explorer exists to surface. A conditional/best-effort/async
 * step that never ran is simply omitted (not required, so not a gap).
 *
 * Ordering: this walks the canonical workflow definition in its own defined
 * execution order — recorded steps normally land in that same order (the
 * `helm_debug_get_trace` RPC already returns them `order by created_at,
 * id`), so a real step and the ghost standing in for one that never ran both
 * land exactly where the workflow expected them, with the gap visible right
 * where it happened rather than shuffled to the end. Any recorded step whose
 * key isn't part of the known definition (an older workflow revision, or an
 * unrecognized workflow string) is appended afterward in its original
 * recorded order rather than silently dropped.
 */
export function buildFlightWaterfall(
  workflow: string | null | undefined,
  steps: ReadonlyArray<Record<string, unknown>>,
): FlightWaterfallLane[] {
  const recordedList = steps
    .map(normalizeRecordedStep)
    .filter((step): step is NormalizedRecordedStep => step !== null);

  const recordedByKey = new Map<string, NormalizedRecordedStep>();
  for (const step of recordedList) recordedByKey.set(step.key, step);

  // getGolfRoundWorkflowDefinition is a plain lookup keyed by the
  // GolfRoundWorkflow union; an unrecognized/legacy workflow string simply
  // isn't a key in that record and the index returns undefined at runtime
  // despite the non-optional return type, so guard defensively rather than
  // trusting the cast.
  const rawDefinitions = workflow
    ? getGolfRoundWorkflowDefinition(workflow as GolfRoundWorkflow)
    : undefined;
  const definitions = Array.isArray(rawDefinitions) ? rawDefinitions : [];

  const seenKeys = new Set<string>();
  const segments: FlightWaterfallSegment[] = [];

  for (const def of definitions) {
    seenKeys.add(def.key);
    const recorded = recordedByKey.get(def.key);
    if (recorded) {
      segments.push({
        key: def.key,
        layer: recorded.layer ?? def.layer,
        requiredness: recorded.requiredness ?? def.requiredness,
        status: recorded.status,
        isGhost: false,
        startedAt: recorded.startedAt,
        finishedAt: recorded.finishedAt,
        elapsedMs: computeStepElapsedMs(recorded),
        errorCode: recorded.errorCode,
        errorSummary: recorded.errorSummary,
      });
    } else if (def.requiredness === 'required') {
      segments.push({
        key: def.key,
        layer: def.layer,
        requiredness: def.requiredness,
        status: 'missing',
        isGhost: true,
        startedAt: null,
        finishedAt: null,
        elapsedMs: null,
        errorCode: null,
        errorSummary: null,
      });
    }
  }

  for (const step of recordedList) {
    if (seenKeys.has(step.key)) continue;
    segments.push({
      key: step.key,
      layer: step.layer ?? 'server_action',
      requiredness: step.requiredness ?? 'required',
      status: step.status,
      isGhost: false,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      elapsedMs: computeStepElapsedMs(step),
      errorCode: step.errorCode,
      errorSummary: step.errorSummary,
    });
  }

  const byLayer = new Map<FlightStepLayer, FlightWaterfallSegment[]>();
  for (const segment of segments) {
    const lane = byLayer.get(segment.layer);
    if (lane) lane.push(segment);
    else byLayer.set(segment.layer, [segment]);
  }

  return FLIGHT_LAYER_ORDER
    .filter((layer) => byLayer.has(layer))
    .map((layer) => ({ layer, segments: byLayer.get(layer)! }));
}

/** True for a value that could plausibly be a flight trace UUID. Gates the
 *  `?trace=` deep-link param before it reaches an RPC call, so a garbled or
 *  incomplete link produces a clean explanation instead of a raw Postgres
 *  "invalid input syntax for type uuid" error surfacing as a generic
 *  fetch failure. */
const TRACE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isPlausibleTraceId(value: string | null | undefined): value is string {
  return typeof value === 'string' && TRACE_ID_RE.test(value);
}
