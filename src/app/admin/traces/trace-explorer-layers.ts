/**
 * Trace Explorer — brief §56's LAYER VOCABULARY over the containment tree.
 *
 * `trace-tree.ts` owns the containment MODEL: it folds flat `trace_steps`
 * rows into the nested shape they actually had, synthesises the steps a
 * workflow declared but never ran, and marks what was observed vs declared.
 * This module is the presentation vocabulary on top of it — the seven layers
 * the brief names, plus the per-step facts an operator triages from
 * (status, duration or checkpoint time, requiredness, function, safe table,
 * SQLSTATE, Sentry link, release).
 *
 * It is a SECOND VIEW, not a second model. Nothing here re-reads a database
 * row or re-derives containment; `buildTraceTree` has already done both, and
 * duplicating either is how two renderings of one trace start disagreeing.
 *
 * WHY THE LAYER NAMES DIFFER FROM `FlightStepLayer`
 * -------------------------------------------------
 * `FlightStepLayer` ('client' | 'next' | 'server_action' | 'supabase' |
 * 'postgres' | 'trigger' | 'verification' | 'cache' | 'background') is a
 * STORAGE vocabulary, shared by the workflow definition, the JS recorder and
 * two SQL writers. Widening or renaming it would change what
 * `helm_debug_record_trace_step` is handed at write time — a migration-shaped
 * change for a display concern. So the storage union is untouched and this
 * module maps onto it.
 *
 * POSTGRES_SUBSTEPS IS CONTAINMENT-DERIVED, NOT COLUMN-DERIVED
 * -----------------------------------------------------------
 * There is no `layer = 'postgres_substep'` row and there must not be. The
 * SQL checkpoint writer
 * (supabase/migrations/20260902160000_postgres_checkpoints_reach_trace_steps.sql)
 * writes EVERY in-transaction checkpoint as `layer = 'postgres'`, including
 * the ones nested under a step the JS workflow declared as `'supabase'` —
 * that migration's own header says the UPSERT deliberately never overwrites
 * an already-recorded layer, because `db.save_partial_round_atomic` is
 * declared `'supabase'` in golf-round-flight-workflow.ts and the SQL write
 * "must not fight the application layer over a row it already owns".
 *
 * So a per-row `layer -> ExplorerLayer` lookup gets this exactly backwards:
 * it would render four in-transaction checkpoints as four separate top-level
 * RPCs. What makes a postgres row a SUBSTEP is that it sits INSIDE another
 * database step, which is a fact about the tree, not about the row. Hence
 * the parent-aware walk in `toExplorerView`.
 */

import type { FlightStepRequiredness, FlightStepStatus } from '@/lib/observability/golf-round-flight-workflow';
import type { TraceStepNode, TraceTree } from './trace-tree';

export const EXPLORER_LAYERS = [
  'CLIENT',
  'SERVER_ACTION',
  'SUPABASE_POSTGREST',
  'POSTGRES_RPC',
  'POSTGRES_SUBSTEPS',
  'VERIFICATION',
  'ASYNC_DOWNSTREAM',
] as const;

export type ExplorerLayer = (typeof EXPLORER_LAYERS)[number];

/** The layers that represent work happening at or below the database boundary. */
const DATABASE_LAYERS: ReadonlySet<ExplorerLayer> = new Set<ExplorerLayer>([
  'SUPABASE_POSTGREST',
  'POSTGRES_RPC',
  'POSTGRES_SUBSTEPS',
]);

/**
 * A step either ran for a measurable span, fired at a single instant, or has
 * no timing at all. These are three different facts and the brief asks for
 * "duration OR checkpoint time" — collapsing them to `durationMs: number |
 * null` makes an instantaneous checkpoint and a step that never ran render
 * identically as a blank cell.
 */
export type StepTiming =
  | { kind: 'duration'; durationMs: number }
  | { kind: 'checkpoint'; at: string }
  | { kind: 'none' };

export interface ExplorerStep {
  key: string;
  parentKey: string | null;
  depth: number;
  layer: ExplorerLayer;
  status: FlightStepStatus;
  requiredness: FlightStepRequiredness;
  timing: StepTiming;
  functionName: string | null;
  /**
   * A BARE relation name and nothing else — never a query, never a filter
   * value, never a `schema.table(column)` fragment carrying a predicate.
   * Anything that does not match a plain identifier shape is dropped to
   * null rather than rendered, per brief §6: a table name is a safe
   * dimension, an arbitrary string from a jsonb column is not.
   */
  tableName: string | null;
  /** Five-character SQLSTATE only. A PostgREST code lands in `errorCode`. */
  sqlstate: string | null;
  /** Whatever code the row carried, SQLSTATE-shaped or not. */
  errorCode: string | null;
  errorSummary: string | null;
  sentryTraceId: string | null;
  /** Null unless the caller supplied a Sentry org slug — never a guessed host. */
  sentryLink: string | null;
  /** Null when the trace never recorded one. NEVER defaulted to "current". */
  release: string | null;
  isMissing: boolean;
  isUndeclared: boolean;
}

/**
 * Brief §56's rollback banner. Rendered VERBATIM — the wording is the
 * contract, because its job is to stop an operator reading an empty step
 * list as a healthy one.
 */
export interface RollbackEvidenceNotice {
  /** The failed database step whose in-transaction detail is missing. */
  stepKey: string;
  /** The code the APPLICATION observed after the RPC returned. */
  observedSqlstate: string;
  text: string;
}

export interface TraceExplorerView {
  steps: ExplorerStep[];
  /** Every layer is present, empty array included — a layer with no steps is
   *  a fact worth rendering ("nothing ran here"), not a row to omit. */
  byLayer: Record<ExplorerLayer, ExplorerStep[]>;
  rollbackNotices: RollbackEvidenceNotice[];
}

export interface ToExplorerViewOptions {
  /**
   * Sentry organization slug, for building a per-step trace link. Omitted =>
   * `sentryLink` stays null everywhere. This module never hardcodes a host:
   * a wrong Sentry link is worse than none, because it looks clickable.
   */
  sentryOrgSlug?: string | null;
  /** The release/commit this trace ran under, when the caller knows it. */
  release?: string | null;
  /**
   * Step keys that are RPC calls but are stored at layer `'supabase'` —
   * `db.save_partial_round_atomic` is the live example (declared `'supabase'`
   * in golf-round-flight-workflow.ts, executed as a single Postgres
   * transaction). See `isRollbackCandidate` for why this cannot be inferred.
   */
  additionalRpcStepKeys?: readonly string[];
}

const SQLSTATE_RE = /^[0-9A-Z]{5}$/;
/** A bare Postgres identifier, optionally schema-qualified. Nothing else. */
const SAFE_RELATION_RE = /^[A-Za-z_][A-Za-z0-9_]{0,62}(\.[A-Za-z_][A-Za-z0-9_]{0,62})?$/;

function safeRelationName(value: string | null): string | null {
  if (value === null) return null;
  return SAFE_RELATION_RE.test(value) ? value : null;
}

function sqlstateOf(errorCode: string | null): string | null {
  if (errorCode === null) return null;
  return SQLSTATE_RE.test(errorCode) ? errorCode : null;
}

function timingOf(node: TraceStepNode): StepTiming {
  if (node.durationMs !== null && Number.isFinite(node.durationMs)) {
    return { kind: 'duration', durationMs: node.durationMs };
  }
  if (node.isPointInTime && node.finishedAt !== null) {
    return { kind: 'checkpoint', at: node.finishedAt };
  }
  return { kind: 'none' };
}

/**
 * A Sentry trace permalink. Built only from an explicitly supplied org slug
 * and a trace id that looks like one (32 hex chars) — a malformed id
 * produces null rather than a link to nothing.
 */
function sentryLinkFor(orgSlug: string | null | undefined, traceId: string | null): string | null {
  if (!orgSlug || traceId === null) return null;
  if (!/^[0-9a-f]{32}$/i.test(traceId)) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/i.test(orgSlug)) return null;
  return `https://${orgSlug}.sentry.io/explore/traces/trace/${traceId}/`;
}

function readMetadataString(node: TraceStepNode, key: string): string | null {
  const value = node.metadata[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * The layer a node belongs to, given the layer its PARENT resolved to.
 *
 * `parentLayer` is null at the root. Everything except `'postgres'` is a
 * straight per-row map; `'postgres'` is the containment-derived case this
 * module's header explains, and `'trigger'` is unconditionally a substep
 * because a trigger is by definition executing inside another statement.
 */
export function resolveExplorerLayer(
  storageLayer: TraceStepNode['layer'],
  parentLayer: ExplorerLayer | null,
): ExplorerLayer {
  switch (storageLayer) {
    case 'client':
      return 'CLIENT';
    case 'next':
    case 'server_action':
      return 'SERVER_ACTION';
    case 'supabase':
      return 'SUPABASE_POSTGREST';
    case 'trigger':
      return 'POSTGRES_SUBSTEPS';
    case 'verification':
      return 'VERIFICATION';
    case 'cache':
    case 'background':
      return 'ASYNC_DOWNSTREAM';
    case 'postgres':
      return parentLayer !== null && DATABASE_LAYERS.has(parentLayer)
        ? 'POSTGRES_SUBSTEPS'
        : 'POSTGRES_RPC';
  }
}

/**
 * Is this failed step one whose in-transaction detail we EXPECTED to have?
 *
 * Only a database TRANSACTION boundary qualifies. A plain PostgREST select
 * that failed never had in-transaction checkpoints to lose, so flagging it
 * "not durably captured" would be noise on the most common failure there is.
 *
 * `db.save_partial_round_atomic` is stored at layer `'supabase'` yet IS such
 * a boundary, and in the total-rollback case there is nothing left in the
 * trace to prove it: the JS recorder does not pass `p_function_name`
 * (helm-flight-recorder.ts's `persistStep` sends trace/step/layer/status/
 * requiredness/metadata and nothing else), so the surviving parent row has
 * `function_name` NULL exactly like a table read does. Rather than guess
 * from a key prefix, the caller states it — `additionalRpcStepKeys`.
 */
function isRollbackCandidate(
  step: ExplorerStep,
  additionalRpcStepKeys: ReadonlySet<string>,
): boolean {
  if (step.status !== 'failure') return false;
  if (step.isMissing) return false;
  return step.layer === 'POSTGRES_RPC' || additionalRpcStepKeys.has(step.key);
}

export const ROLLBACK_NOTICE_PREFIX = 'POSTGRES FAILURE DETAIL: NOT DURABLY CAPTURED';

/**
 * Brief §56 verbatim. `UNKNOWN` when the application observed no code at all
 * — never blank, never omitted: an absent code is itself the finding, and a
 * banner that disappears when the evidence is thinnest is the failure this
 * whole notice exists to prevent.
 */
export function buildRollbackNoticeText(observedSqlstate: string): string {
  return `${ROLLBACK_NOTICE_PREFIX} — application-observed SQLSTATE: ${observedSqlstate}, raw Postgres log: manual`;
}

/**
 * Project a built trace tree into the brief's layer vocabulary.
 *
 * Pure. Never throws on a malformed node — this renders an incident, and a
 * view that crashes on the shape of a bad trace is a view you cannot use
 * exactly when you need it.
 */
export function toExplorerView(
  tree: TraceTree,
  options: ToExplorerViewOptions = {},
): TraceExplorerView {
  const additionalRpcStepKeys = new Set(options.additionalRpcStepKeys ?? []);
  const steps: ExplorerStep[] = [];
  /** stepKey -> whether any OBSERVED substep was recorded beneath it. */
  const observedSubstepParents = new Set<string>();

  const visit = (
    node: TraceStepNode,
    parentLayer: ExplorerLayer | null,
    depth: number,
    ancestorKeys: readonly string[],
  ): void => {
    const layer = resolveExplorerLayer(node.layer, parentLayer);
    const sentryTraceId = readMetadataString(node, 'sentry_trace_id');

    steps.push({
      key: node.key,
      parentKey: node.parentKey,
      depth,
      layer,
      status: node.status,
      requiredness: node.requiredness,
      timing: timingOf(node),
      functionName: node.functionName,
      tableName: safeRelationName(node.tableName),
      sqlstate: sqlstateOf(node.errorCode),
      errorCode: node.errorCode,
      errorSummary: node.errorSummary,
      sentryTraceId,
      sentryLink: sentryLinkFor(options.sentryOrgSlug, sentryTraceId),
      release: readMetadataString(node, 'release') ?? options.release ?? null,
      isMissing: node.isMissing,
      isUndeclared: node.isUndeclared,
    });

    // A SUBSTEP that was genuinely observed is what proves the transaction's
    // own evidence survived. A synthesised missing node proves the opposite,
    // so it must never mark its ancestor as durably captured.
    if (layer === 'POSTGRES_SUBSTEPS' && !node.isMissing) {
      // Every ancestor, not just the immediate parent: a checkpoint nested
      // two deep still proves its top-level RPC left durable evidence.
      // Walked from the chain built on the way down rather than by looking
      // each parent up again — `trace-tree.ts` already tolerates cycles in
      // `parent_step_key` (three different producers write it), and a
      // lookup loop would have to re-solve that here.
      for (const ancestor of ancestorKeys) observedSubstepParents.add(ancestor);
    }

    const childAncestors = [...ancestorKeys, node.key];
    for (const child of node.children) visit(child, layer, depth + 1, childAncestors);
  };

  for (const root of tree.roots) visit(root, null, 0, []);

  const byLayer = Object.fromEntries(
    EXPLORER_LAYERS.map((layer) => [layer, steps.filter((s) => s.layer === layer)]),
  ) as Record<ExplorerLayer, ExplorerStep[]>;

  const rollbackNotices: RollbackEvidenceNotice[] = [];
  for (const step of steps) {
    if (!isRollbackCandidate(step, additionalRpcStepKeys)) continue;
    if (observedSubstepParents.has(step.key)) continue;
    const observedSqlstate = step.sqlstate ?? step.errorCode ?? 'UNKNOWN';
    rollbackNotices.push({
      stepKey: step.key,
      observedSqlstate,
      text: buildRollbackNoticeText(observedSqlstate),
    });
  }

  return { steps, byLayer, rollbackNotices };
}
