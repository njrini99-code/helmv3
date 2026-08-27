/**
 * Flight Recorder — flat trace steps folded into the nested tree the Bridge renders.
 *
 * WHY A TREE, WHEN A WATERFALL ALREADY EXISTS
 * -------------------------------------------
 * `FlightTraceExplorer` (inside the legacy Golf Tracer page) lays steps out as
 * horizontal lanes grouped by LAYER. That answers "how long did the database
 * take", which is a real question but not the one this system was built for.
 *
 * The question it was built for is "where exactly did reality diverge from the
 * expected workflow", and that is a question about CONTAINMENT: the shot insert
 * failed *inside* submit_round_atomic, which ran *inside* the server action.
 * Layer lanes flatten that away — `db.submit_round_atomic.insert_shots` and
 * `server.validation` sit in different lanes with nothing showing that one
 * happened within the other.
 *
 * `helm_debug.trace_steps.parent_step_key` has carried the containment all
 * along; nothing rendered it. This module is that missing fold.
 *
 * MISSING STEPS ARE SYNTHESISED, NOT OMITTED
 * ------------------------------------------
 * A trace can only record what happened. The most valuable thing an operator
 * needs to see is often what DIDN'T — `verify.shots` never running because the
 * transaction died before it. So the workflow definition (the same one the
 * recorder uses, never a second copy) is diffed against observed steps and any
 * unobserved step is materialised as an explicit `missing` node.
 *
 * Without this the tree would be quietly, plausibly wrong: a submit that rolled
 * back would render as a short green-ish tree that simply stopped, which reads
 * like "nothing else was needed" rather than "three required checks never ran".
 */

import {
  getGolfRoundWorkflowDefinition,
  type FlightStepLayer,
  type FlightStepRequiredness,
  type FlightStepStatus,
  type GolfRoundWorkflow,
} from '@/lib/observability/golf-round-flight-workflow';

export interface TraceStepNode {
  key: string;
  parentKey: string | null;
  layer: FlightStepLayer;
  status: FlightStepStatus;
  requiredness: FlightStepRequiredness;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  functionName: string | null;
  triggerName: string | null;
  tableName: string | null;
  errorCode: string | null;
  errorSummary: string | null;
  expected: unknown;
  observed: unknown;
  /** True when the workflow expected this step and the trace never recorded it. */
  isMissing: boolean;
  depth: number;
  children: TraceStepNode[];
}

const VALID_STATUSES: readonly FlightStepStatus[] = [
  'pending', 'started', 'success', 'failure', 'skipped', 'missing', 'warning',
];

const VALID_LAYERS: readonly FlightStepLayer[] = [
  'client', 'next', 'server_action', 'supabase', 'postgres', 'trigger',
  'verification', 'cache', 'background',
];

function str(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function asStatus(value: string | null): FlightStepStatus {
  return VALID_STATUSES.includes(value as FlightStepStatus)
    ? (value as FlightStepStatus)
    // An unrecognised status is surfaced as `warning`, never silently coerced to
    // `success` — a trace row we cannot interpret must not read as a clean step.
    : 'warning';
}

function asLayer(value: string | null): FlightStepLayer {
  return VALID_LAYERS.includes(value as FlightStepLayer)
    ? (value as FlightStepLayer)
    : 'next';
}

function asRequiredness(value: string | null): FlightStepRequiredness {
  switch (value) {
    case 'required':
    case 'conditional':
    case 'best_effort':
    case 'async':
      return value;
    default:
      return 'best_effort';
  }
}

/** Elapsed time, preferring the recorded value and falling back to timestamps. */
function elapsed(row: Record<string, unknown>): number | null {
  const recorded = num(row, 'duration_ms');
  if (recorded !== null) return recorded;
  const started = str(row, 'started_at');
  const finished = str(row, 'finished_at');
  if (!started || !finished) return null;
  const ms = new Date(finished).getTime() - new Date(started).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

function normalize(row: Record<string, unknown>): TraceStepNode | null {
  const key = str(row, 'step_key');
  if (!key) return null;
  return {
    key,
    parentKey: str(row, 'parent_step_key'),
    layer: asLayer(str(row, 'layer')),
    status: asStatus(str(row, 'status')),
    requiredness: asRequiredness(str(row, 'requiredness')),
    startedAt: str(row, 'started_at'),
    finishedAt: str(row, 'finished_at'),
    durationMs: elapsed(row),
    functionName: str(row, 'function_name'),
    triggerName: str(row, 'trigger_name'),
    tableName: str(row, 'table_name'),
    errorCode: str(row, 'error_code'),
    errorSummary: str(row, 'error_summary'),
    expected: row.expected ?? null,
    observed: row.observed ?? null,
    isMissing: false,
    depth: 0,
    children: [],
  };
}

function isKnownWorkflow(value: string): value is GolfRoundWorkflow {
  try {
    return getGolfRoundWorkflowDefinition(value as GolfRoundWorkflow) !== undefined;
  } catch {
    return false;
  }
}

/**
 * Synthesise a node for a step the workflow expected but the trace never wrote.
 *
 * Inferred parent: a dotted key nests under its own prefix when that prefix was
 * itself observed. `db.submit_round_atomic.insert_shots` therefore hangs off
 * `db.submit_round_atomic` rather than floating at the root, which is what makes
 * a missing inner step read as "the transaction stopped here" instead of "some
 * unrelated step is absent".
 */
function missingNode(
  key: string,
  layer: FlightStepLayer,
  requiredness: FlightStepRequiredness,
  observedKeys: ReadonlySet<string>,
): TraceStepNode {
  const lastDot = key.lastIndexOf('.');
  const prefix = lastDot > 0 ? key.slice(0, lastDot) : null;
  return {
    key,
    parentKey: prefix && observedKeys.has(prefix) ? prefix : null,
    layer,
    status: 'missing',
    requiredness,
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
    isMissing: true,
    depth: 0,
    children: [],
  };
}

export interface TraceTree {
  roots: TraceStepNode[];
  /** Flattened depth-first, for rendering and for counting. */
  flat: TraceStepNode[];
  missingRequiredCount: number;
  /** The first failed step in depth-first order — where reality diverged. */
  failureKey: string | null;
}

/**
 * Fold flat step rows into the tree, injecting missing expected steps.
 *
 * `workflow` may be any string (it comes from a database column); an
 * unrecognised value simply means no expected-step diff, never a throw. A trace
 * from a workflow this build does not know about should still render what it
 * observed.
 */
export function buildTraceTree(
  rows: readonly Record<string, unknown>[],
  workflow: string,
): TraceTree {
  const observed = rows.map(normalize).filter((n): n is TraceStepNode => n !== null);
  const observedKeys = new Set(observed.map((n) => n.key));

  const synthesised: TraceStepNode[] = [];
  if (isKnownWorkflow(workflow)) {
    for (const def of getGolfRoundWorkflowDefinition(workflow)) {
      // `async` steps are legitimately still in flight when the trace is read,
      // and a conditional step that correctly did not apply is not a failure —
      // so neither is reported as missing. Only a required step that never ran
      // is a genuine hole in the workflow.
      if (def.requiredness !== 'required') continue;
      if (observedKeys.has(def.key)) continue;
      synthesised.push(missingNode(def.key, def.layer, def.requiredness, observedKeys));
    }
  }

  const all = [...observed, ...synthesised];
  const byKey = new Map(all.map((n) => [n.key, n]));

  const roots: TraceStepNode[] = [];
  for (const node of all) {
    const parent = node.parentKey ? byKey.get(node.parentKey) : undefined;
    // A parent_step_key naming a step that is not in this trace would otherwise
    // drop the node entirely; treat it as a root so nothing is lost silently.
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  const flat: TraceStepNode[] = [];
  const seen = new Set<TraceStepNode>();
  const walk = (nodes: TraceStepNode[], depth: number) => {
    for (const node of nodes) {
      // Cycle guard: parent_step_key is free text written by three different
      // producers, so a cycle is possible and would otherwise hang the render.
      if (seen.has(node)) continue;
      seen.add(node);
      node.depth = depth;
      flat.push(node);
      walk(node.children, depth + 1);
    }
  };
  walk(roots, 0);

  return {
    roots,
    flat,
    missingRequiredCount: flat.filter((n) => n.isMissing).length,
    failureKey: flat.find((n) => n.status === 'failure')?.key ?? null,
  };
}
