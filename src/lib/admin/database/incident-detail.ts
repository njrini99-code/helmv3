import 'server-only';

/**
 * Helm Bridge — Database incident detail (brief §34).
 *
 * "Incident title; primary class; feature; service; RPC; SQLSTATE; HTTP;
 * first/last seen; occurrences; release SHA; Sentry issue/trace; Helm flight
 * trace; database workflow stages with the failing one; query health vs
 * baseline; database health at the time; locks; data invariant
 * pass/fail/unknown; recent change; evidence confidence; repair links."
 *
 * ONE FINGERPRINT, EVERY SOURCE, EVERY SOURCE INDEPENDENTLY NULLABLE
 * -------------------------------------------------------------------
 * This composes six reads and five pure evaluators into one view. The rule
 * that governs every field is the one the rest of this directory already
 * follows: a source that could not be read produces `null` plus an explicit
 * `unconfigured`/`blind` marker, NEVER a zero and never a green. A detail page
 * whose "locks at the time" section renders "none" because the locks migration
 * is HELD is worse than one that says "not shipped yet" — the first is a
 * confident wrong answer.
 *
 * So `DatabaseIncidentDetail` carries a `SectionState` beside every composed
 * section rather than only its data, and the caller renders on that state.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * No Sentry API call and no Flight Recorder read. The error store already
 * persists `sentry_trace_id` and `helm_trace_id` per event, so the links are
 * built from what is on the row; fetching the issue itself would add a second
 * failure mode and a credential dependency for a link. `sentryIssue` is
 * therefore always `null` here and says so in its own doc comment, rather
 * than being absent and looking like an oversight.
 *
 * Nothing in `src/lib/admin/incidents/**` is imported. That model answers a
 * different question (the unified cross-source incident); this is the database
 * detail surface, and coupling them would make each harder to change.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { failed, ok, unconfigured, type AdminFetchResult } from '@/lib/admin/fetch-result';
import {
  diagnoseAuthorization,
  type AuthorizationDiagnosis,
  type AuthorizationExpectation,
} from '@/lib/observability/supabase/authorization-diagnosis';
import {
  correlateWithRelease,
  type ReleaseCorrelation,
  type ReleaseFacts,
} from '@/lib/observability/supabase/release-correlation';
import {
  attributeServiceLayer,
  type ServiceLayerAttribution,
} from '@/lib/observability/supabase/service-layers';
import {
  classifyDriftMechanism,
  diagnoseSchemaDrift,
  type SchemaDriftDiagnosis,
} from '@/lib/observability/supabase/schema-drift';
import { readSchemaDriftInputs } from '@/lib/admin/database/drift-inputs';

type MaybePostgrestError = { code?: string | null; message?: string | null } | null;

/** Same code set every reader in this directory uses. Copied rather than
 *  extracted: a shared helper would touch files sibling tracks are editing,
 *  for no behavioural gain. */
const MIGRATION_NOT_APPLIED_CODES = new Set(['PGRST202', '42883', '42P01', '3F000']);

function isMigrationNotAppliedError(error: MaybePostgrestError): boolean {
  if (!error) return false;
  if (MIGRATION_NOT_APPLIED_CODES.has(error.code ?? '')) return true;
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('could not find the function') ||
    (message.includes('function') && message.includes('does not exist')) ||
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('schema') && message.includes('does not exist'))
  );
}

// ---------------------------------------------------------------------------
// Section state — the shape that keeps "nothing" and "we could not look" apart
// ---------------------------------------------------------------------------

export const SECTION_STATES = ['ok', 'empty', 'unconfigured', 'blind'] as const;
export type SectionState = (typeof SECTION_STATES)[number];

export const SECTION_STATE_LABEL: Readonly<Record<SectionState, string>> = {
  ok: 'READ',
  empty: 'NONE IN WINDOW',
  unconfigured: 'NOT SHIPPED YET',
  blind: 'UNREADABLE',
};

export interface Section<T> {
  state: SectionState;
  data: T | null;
  /** Why, when the state is not `ok`. */
  note: string | null;
}

function sectionOk<T>(data: T): Section<T> {
  return { state: 'ok', data, note: null };
}
function sectionEmpty<T>(note: string): Section<T> {
  return { state: 'empty', data: null, note };
}
function sectionUnconfigured<T>(note: string): Section<T> {
  return { state: 'unconfigured', data: null, note };
}
function sectionBlind<T>(note: string): Section<T> {
  return { state: 'blind', data: null, note };
}

// ---------------------------------------------------------------------------
// Workflow stages — brief §34's "database workflow stages with the failing one"
// ---------------------------------------------------------------------------

export const DB_WORKFLOW_STAGES = [
  'client-request',
  'server-action',
  'postgrest',
  'postgres-execution',
  'commit',
  'verification',
] as const;
export type DbWorkflowStage = (typeof DB_WORKFLOW_STAGES)[number];

export const DB_WORKFLOW_STAGE_LABEL: Readonly<Record<DbWorkflowStage, string>> = {
  'client-request': 'Client request',
  'server-action': 'Server action',
  postgrest: 'PostgREST',
  'postgres-execution': 'Postgres execution',
  commit: 'Commit',
  verification: 'Verification read-back',
};

export type StageStatus = 'reached' | 'failed-here' | 'not-reached' | 'unknown';

export interface DbWorkflowStageRow {
  stage: DbWorkflowStage;
  status: StageStatus;
  /** Short, safe. Never a query, never a payload. */
  detail: string | null;
}

/**
 * Transport/connection failures: the statement may never have been sent, or
 * may have been sent AND committed before the connection died. `commit-outcome.ts`
 * calls exactly this case `UNKNOWN_COMMIT`, and the brief's §36-39 is explicit
 * that a client-side timeout must never be read as "nothing committed". So for
 * these codes the commit stage is `unknown` rather than `not-reached` — the
 * positive assertion would be a claim the evidence does not support.
 */
const TRANSPORT_CODES_WITH_UNKNOWN_COMMIT = new Set(['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003']);

function commitStateIsUnknown(code: string | null): boolean {
  if (code === null) return false;
  if (TRANSPORT_CODES_WITH_UNKNOWN_COMMIT.has(code)) return true;
  // SQLSTATE class 08 — connection_exception and friends.
  return /^08[0-9A-Z]{3}$/.test(code);
}

/**
 * Where the failure landed, derived from the service-layer attribution rather
 * than re-decided. Every stage after the failing one is `not-reached`; every
 * stage before it is `reached`. When the origin layer is ambiguous, the whole
 * ladder is `unknown` — a guessed stage marker is worse than none.
 *
 * One exception to "everything after the failure is not-reached": for a
 * transport or connection failure the COMMIT stage is `unknown`, because the
 * client losing the connection is not evidence the server rolled back.
 */
export function buildWorkflowStages(
  attribution: ServiceLayerAttribution,
  options?: { code?: string | null },
): DbWorkflowStageRow[] {
  const commitUnknown = commitStateIsUnknown(options?.code ?? null);
  const failingStage: DbWorkflowStage | null =
    attribution.likelyOriginLayer === 'postgres'
      ? 'postgres-execution'
      : attribution.likelyOriginLayer === 'postgrest'
        ? 'postgrest'
        : attribution.likelyOriginLayer === 'gateway_api'
          ? 'client-request'
          : null;

  if (failingStage === null) {
    return DB_WORKFLOW_STAGES.map((stage) => ({
      stage,
      status: 'unknown' as StageStatus,
      detail: 'The evidence does not separate the layers, so no stage can be marked.',
    }));
  }

  const failingIndex = DB_WORKFLOW_STAGES.indexOf(failingStage);
  return DB_WORKFLOW_STAGES.map((stage, index) => {
    if (index < failingIndex) return { stage, status: 'reached' as StageStatus, detail: null };
    if (index === failingIndex) {
      return { stage, status: 'failed-here' as StageStatus, detail: attribution.reasons[0] ?? null };
    }
    if (stage === 'commit' && commitUnknown) {
      return {
        stage,
        status: 'unknown' as StageStatus,
        detail: 'A transport or connection failure is not evidence the server rolled back.',
      };
    }
    return { stage, status: 'not-reached' as StageStatus, detail: null };
  });
}

// ---------------------------------------------------------------------------
// Composed shapes
// ---------------------------------------------------------------------------

export interface IncidentIdentity {
  fingerprint: string;
  /** Built from the safe dimensions, never from the message. */
  title: string;
  /** e.g. DATABASE_AUTHORIZATION — brief §34's "primary class". */
  primaryClass: string;
  feature: string;
  action: string;
  service: string;
  operation: string;
  relation: string | null;
  rpc: string | null;
  sqlstate: string | null;
  errorCode: string | null;
  /** The error store has no HTTP column, so this is structurally always null.
   *  Stated rather than omitted, so a reader sees it is a gap, not an oversight. */
  httpStatus: number | null;
  severity: string;
  expectedness: string;
  retryability: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrences: number;
  releaseSha: string | null;
  environment: string;
  helmTraceId: string | null;
  sentryTraceId: string | null;
  /** Safe, already-sanitized text from the store. */
  normalizedMessage: string;
  safeDetails: string | null;
  safeHint: string | null;
}

export interface HealthAtTheTime {
  sampledAt: string;
  connectionsPctMax: number | null;
  cacheHitRatio: number | null;
  xactRollbackDelta: number | null;
  deadlocksDelta: number | null;
  longestLockWaitMs: number | null;
  /** Minutes between the sample and the incident's last occurrence. */
  offsetMinutes: number;
}

export interface LockAtTheTime {
  detectedAt: string;
  kind: string;
  severity: string;
  waitMs: number | null;
  relationName: string | null;
  feature: string | null;
}

export interface QueryHealthAtTheTime {
  sampledAt: string;
  safeQueryClass: string;
  sourceClass: string;
  callsDelta: number | null;
  meanExecMsWindow: number | null;
  regressionFlags: readonly string[];
  baselineStatus: string;
}

export interface RepairLink {
  label: string;
  /** A repo command or an in-app href. Never an external mutation. */
  target: string;
  kind: 'command' | 'href' | 'doc';
}

export interface DatabaseIncidentDetail {
  identity: IncidentIdentity;
  /** Every occurrence bucket for this fingerprint, most recent first. */
  bucketCount: number;
  serviceLayer: ServiceLayerAttribution;
  workflowStages: readonly DbWorkflowStageRow[];
  authorization: AuthorizationDiagnosis;
  schemaDrift: Section<SchemaDriftDiagnosis>;
  releaseCorrelation: Section<ReleaseCorrelation>;
  healthAtTheTime: Section<HealthAtTheTime>;
  locksAtTheTime: Section<readonly LockAtTheTime[]>;
  queryHealth: Section<readonly QueryHealthAtTheTime[]>;
  /**
   * Brief §34's "data invariant pass/fail/unknown". No invariant registry is
   * wired to a fingerprint in this repo, so this is structurally `unconfigured`
   * — declared and stated, never rendered as a pass.
   */
  dataInvariant: Section<never>;
  /** Brief §34's "Sentry issue". Not fetched — see the file header. */
  sentryIssue: Section<never>;
  recentChange: Section<{ migrationFilenames: readonly string[]; releaseSha: string | null }>;
  repairLinks: readonly RepairLink[];
}

// ---------------------------------------------------------------------------
// Row shapes (mirroring the read RPCs, same mapping style as errors.ts)
// ---------------------------------------------------------------------------

interface RawErrorRow {
  id: string;
  fingerprint: string;
  service: string;
  environment: string;
  release_sha: string | null;
  feature: string;
  action: string;
  operation: string;
  relation_name: string | null;
  rpc_name: string | null;
  error_code: string | null;
  sqlstate: string | null;
  severity: string;
  expectedness: string;
  retryability: string;
  normalized_message: string;
  safe_details: string | null;
  safe_hint: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  helm_trace_id: string | null;
  sentry_trace_id: string | null;
}

interface RawHealthRow {
  sampled_at: string;
  connections_pct_max: number | null;
  cache_hit_ratio: number | null;
  xact_rollback_delta: number | null;
  deadlocks_delta: number | null;
  longest_lock_wait_ms: number | null;
}

interface RawLockRow {
  detected_at: string;
  kind: string;
  severity: string;
  wait_ms: number | null;
  relation_name: string | null;
  feature: string | null;
}

interface RawStatRow {
  sampled_at: string;
  safe_query_class: string;
  source_class: string;
  calls_delta: number | null;
  mean_exec_ms_window: number | null;
  regression_flags: string[] | null;
  baseline_status: string;
}

// ---------------------------------------------------------------------------
// Primary class — brief §34
// ---------------------------------------------------------------------------

const PRIMARY_CLASS_BY_CODE: Readonly<Record<string, string>> = {
  '42501': 'DATABASE_AUTHORIZATION',
  '42P01': 'DATABASE_SCHEMA_MISMATCH',
  '42703': 'DATABASE_SCHEMA_MISMATCH',
  '42883': 'DATABASE_SCHEMA_MISMATCH',
  '3F000': 'DATABASE_SCHEMA_MISMATCH',
  '42P17': 'DATABASE_SCHEMA_MISMATCH',
  '40P01': 'DATABASE_DEADLOCK',
  '40001': 'DATABASE_SERIALIZATION',
  '57014': 'DATABASE_TIMEOUT',
  '23505': 'DATABASE_UNIQUE_CONFLICT',
  '23503': 'DATABASE_REFERENTIAL_CONFLICT',
  '23514': 'DATABASE_CHECK_VIOLATION',
  '53400': 'DATABASE_RESOURCE_EXHAUSTION',
  PGRST000: 'DATABASE_UNAVAILABLE',
  PGRST001: 'DATABASE_UNAVAILABLE',
  PGRST002: 'DATABASE_UNAVAILABLE',
  PGRST003: 'DATABASE_POOL_TIMEOUT',
  PGRST202: 'DATABASE_SCHEMA_MISMATCH',
  PGRST204: 'DATABASE_SCHEMA_MISMATCH',
  PGRST205: 'DATABASE_SCHEMA_MISMATCH',
};

export function primaryClassFor(code: string | null): string {
  if (code === null) return 'DATABASE_UNCLASSIFIED';
  const known = PRIMARY_CLASS_BY_CODE[code];
  if (known !== undefined) return known;
  if (code.startsWith('08')) return 'DATABASE_CONNECTION';
  if (code.startsWith('53')) return 'DATABASE_RESOURCE_EXHAUSTION';
  if (code.startsWith('XX')) return 'DATABASE_INTERNAL';
  return 'DATABASE_UNCLASSIFIED';
}

/** Title from safe dimensions only — never the message, which could carry
 *  anything a Postgres error decided to embed. */
export function buildIncidentTitle(row: Pick<RawErrorRow, 'feature' | 'action' | 'operation' | 'rpc_name' | 'relation_name' | 'error_code'>): string {
  const object = row.rpc_name ?? row.relation_name ?? 'an unnamed object';
  const code = row.error_code ?? 'no code';
  return `${row.feature}/${row.action}: ${row.operation} on ${object} failed with ${code}`;
}

// ---------------------------------------------------------------------------
// The read
// ---------------------------------------------------------------------------

const ERROR_LOOKBACK_LIMIT = 300;
const HEALTH_LOOKBACK_LIMIT = 200;
const LOCK_LOOKBACK_LIMIT = 100;
const STAT_LOOKBACK_LIMIT = 200;

/** A health sample this far from the incident is not "at the time". */
const HEALTH_PROXIMITY_MS = 30 * 60_000;
/** A lock incident this far from the incident is not "at the time". */
const LOCK_PROXIMITY_MS = 30 * 60_000;

function nearestHealthSample(rows: readonly RawHealthRow[], atMs: number): HealthAtTheTime | null {
  let best: { row: RawHealthRow; deltaMs: number } | null = null;
  for (const row of rows) {
    const sampleMs = Date.parse(row.sampled_at);
    if (!Number.isFinite(sampleMs)) continue;
    const deltaMs = Math.abs(sampleMs - atMs);
    if (best === null || deltaMs < best.deltaMs) best = { row, deltaMs };
  }
  if (best === null || best.deltaMs > HEALTH_PROXIMITY_MS) return null;
  return {
    sampledAt: best.row.sampled_at,
    connectionsPctMax: best.row.connections_pct_max,
    cacheHitRatio: best.row.cache_hit_ratio,
    xactRollbackDelta: best.row.xact_rollback_delta,
    deadlocksDelta: best.row.deadlocks_delta,
    longestLockWaitMs: best.row.longest_lock_wait_ms,
    offsetMinutes: Math.round(best.deltaMs / 60_000),
  };
}

/**
 * The authorization expectation is NOT inferred here. The error store persists
 * the classifier's OUTPUT (`expectedness`), which already encodes what the call
 * site stated: `expected` means the call site declared a denial possible,
 * `unexpected` means it did not, and anything else means nobody said. Reading
 * it back is faithful; guessing from the feature name would not be.
 */
function expectationFrom(expectedness: string): AuthorizationExpectation {
  if (expectedness === 'expected') return 'denial-is-possible';
  if (expectedness === 'unexpected') return 'must-be-authorized';
  return 'unknown';
}

/**
 * "Recent change" is a claim ABOUT the migration axis, so its state must come
 * from that axis — never from `migrationFilenames.length`.
 *
 * An empty filename list means two completely different things: the drift read
 * worked and found nothing, or the drift read never happened. In a DEPLOYED
 * Bridge the second is the DEFAULT, because `drift-inputs.ts` cannot read
 * repository files from a serverless bundle (its own header says so). Keying
 * on the array length would therefore render "No migration in this tree names
 * the failing object" — a confident denial — on essentially every production
 * incident. That is the exact "we could not look" rendered as "we looked and
 * there is nothing" failure this whole track exists to prevent.
 */
function buildRecentChangeSection(
  drift: Section<SchemaDriftDiagnosis>,
  releaseSha: string | null,
): Section<{ migrationFilenames: readonly string[]; releaseSha: string | null }> {
  // Mechanism first: it is derived from the failure's CODE alone, so it is
  // knowable whether or not any listing could be read. Recent-change
  // attribution here is object-based — it names the migrations that create the
  // object the failure could not find — and a 42501 or a deadlock has no such
  // object. Declared unconfigured, never "no migration exists".
  if (drift.data !== null && drift.data.mechanism === 'not_a_missing_object_failure') {
    return {
      state: 'unconfigured',
      data: null,
      note: 'Recent-change attribution is object-based and this failure names no missing object, so no migration can be tied to it here.',
    };
  }
  if (drift.state !== 'ok' || drift.data === null) {
    return {
      state: drift.state === 'ok' ? 'blind' : drift.state,
      data: null,
      note: drift.note ?? 'The migration listing could not be read, so no claim about recent changes is supportable.',
    };
  }
  if (drift.data.migrationFile === 'unknown') {
    return {
      state: 'blind',
      data: null,
      note: 'The migrations directory could not be listed here, so whether one names the failing object is unknown.',
    };
  }
  if (drift.data.migrationFilenames.length === 0) {
    return { state: 'empty', data: null, note: 'No migration in this tree names the failing object.' };
  }
  return sectionOk({ migrationFilenames: drift.data.migrationFilenames, releaseSha });
}

function buildRepairLinks(input: {
  drift: SchemaDriftDiagnosis | null;
  authorization: AuthorizationDiagnosis;
  helmTraceId: string | null;
}): RepairLink[] {
  const links: RepairLink[] = [
    { label: 'Confirm what is actually live in the catalog', target: 'npm run db:drift:check', kind: 'command' },
    { label: 'Re-audit the Supabase call paths', target: 'npm run audit:supabase-errors', kind: 'command' },
  ];

  if (input.helmTraceId !== null) {
    // `/admin/traces` takes NO searchParams (verified: its page component's
    // signature has none), so a `?trace=` deep link would be silently dropped
    // and land on the index anyway. Link the index honestly and let the trace
    // id travel as a field the operator can search for — a repair link that
    // quietly does something other than it says is worse than a plainer one.
    links.push({ label: `Open the Flight Trace explorer (trace ${input.helmTraceId})`, target: '/admin/traces', kind: 'href' });
  }
  if (input.drift?.verdict === 'migration-held') {
    links.push({ label: 'Read why the migration is held', target: 'supabase/migrations/HELD.md', kind: 'doc' });
  }
  if (input.drift?.verdict === 'migration-not-in-ledger') {
    links.push({ label: 'Check local/production migration drift', target: 'npm run db:ledger-drift', kind: 'command' });
  }
  if (input.drift?.generatedTypes === 'absent') {
    links.push({ label: 'Check generated types against production', target: 'npm run db:types:check', kind: 'command' });
  }
  if (input.authorization.verdict === 'UNEXPECTED_PRODUCT_FAILURE') {
    links.push({ label: 'Run the RLS policy tests', target: 'npm run test:rls', kind: 'command' });
  }
  return links;
}

/**
 * Compose one incident's detail view.
 *
 * `unconfigured` when the error store itself is not shipped; every OTHER
 * source degrades within an `ok` result, as its own section.
 */
export async function fetchDatabaseIncidentDetail(
  fingerprint: string,
  options?: { releaseFacts?: Partial<ReleaseFacts> },
): Promise<AdminFetchResult<DatabaseIncidentDetail>> {
  const admin = createAdminClient();

  const errorsResult = (await admin.rpc('helm_debug_read_db_error_events' as never, {
    p_limit: ERROR_LOOKBACK_LIMIT,
  } as never)) as unknown as { data: RawErrorRow[] | null; error: MaybePostgrestError };

  if (errorsResult.error) {
    if (isMigrationNotAppliedError(errorsResult.error)) {
      return unconfigured('db_error_events (migration HELD — see supabase/migrations/HELD.md)');
    }
    return failed(errorsResult.error.message ?? 'helm_debug_read_db_error_events failed');
  }

  const buckets = (errorsResult.data ?? [])
    .filter((row) => row.fingerprint === fingerprint)
    .sort((a, b) => (a.last_seen_at < b.last_seen_at ? 1 : -1));

  if (buckets.length === 0) {
    return failed(`No database error events found for fingerprint ${fingerprint}`);
  }

  const latest = buckets[0]!;
  const lastSeenMs = Date.parse(latest.last_seen_at);
  const firstSeenAt = buckets.reduce((min, r) => (r.first_seen_at < min ? r.first_seen_at : min), latest.first_seen_at);
  const firstSeenMs = Date.parse(firstSeenAt);
  const occurrences = buckets.reduce((sum, r) => sum + r.occurrence_count, 0);

  // --- Pure evaluators over the identity ----------------------------------
  // `postgrestCode` is ONLY a PGRST-prefixed code. The store's `error_code`
  // also holds `classify.ts`'s message-fallback labels (`unknown_authorization`,
  // `unknown_deadlock`, `unknown_timeout`, `unknown_missing_object`,
  // `classifier_failure`) whenever a proxy swallowed the SQLSTATE — those are
  // swallowed POSTGRES verdicts, and calling them PostgREST-native would state
  // the opposite of the truth. `service-layers.ts` also rejects a non-PGRST
  // value; both sides guard, because a mis-derivation here is the kind of
  // false assertion this whole track exists to prevent.
  const postgrestCodeOrNull =
    latest.error_code !== null && latest.error_code.startsWith('PGRST') ? latest.error_code : null;

  const envelopeLike = {
    service: latest.service as never,
    sqlstate: latest.sqlstate,
    postgrestCode: postgrestCodeOrNull,
    authCode: null,
    storageCode: null,
    code: latest.error_code,
    httpStatus: null,
  };
  const serviceLayer = attributeServiceLayer(envelopeLike);
  const workflowStages = buildWorkflowStages(serviceLayer, { code: latest.sqlstate ?? latest.error_code });

  const authorization = diagnoseAuthorization({
    envelope: {
      code: latest.error_code,
      sqlstate: latest.sqlstate,
      feature: latest.feature,
      action: latest.action,
      operation: latest.operation as never,
      relation: latest.relation_name,
      rpc: latest.rpc_name,
    },
    expectation: expectationFrom(latest.expectedness),
  });

  // --- Schema drift, from the on-demand reader ----------------------------
  let schemaDrift: Section<SchemaDriftDiagnosis>;
  try {
    // The applied-ledger read is a network call, so ask for it ONLY when the
    // axis means something. For a 42501 — the majority case — whether a
    // migration is recorded says nothing, and the page's own 60s AutoRefresh
    // would otherwise turn one on-demand query into a standing poll.
    const isMissingObject =
      classifyDriftMechanism({
        code: latest.error_code,
        sqlstate: latest.sqlstate,
        postgrestCode: postgrestCodeOrNull,
      }) !== 'not_a_missing_object_failure';
    const inputs = await readSchemaDriftInputs({ includeAppliedLedger: isMissingObject });
    const diagnosis = diagnoseSchemaDrift({
      envelope: {
        code: latest.error_code,
        sqlstate: latest.sqlstate,
        postgrestCode: postgrestCodeOrNull,
        relation: latest.relation_name,
        rpc: latest.rpc_name,
        normalizedMessage: latest.normalized_message,
        releaseSha: latest.release_sha,
      },
      ledger: inputs.ledger,
      types: inputs.types,
    });
    schemaDrift = !inputs.ledger.filesReadable && !inputs.types.readable
      ? { state: 'blind', data: diagnosis, note: 'Neither the migrations directory nor the generated types could be read here (they are not part of a deployed function bundle).' }
      : sectionOk(diagnosis);
  } catch {
    schemaDrift = sectionBlind('The drift inputs could not be read.');
  }

  // --- The three collector reads, each degrading on its own ----------------
  const [healthResult, locksResult, statsResult] = await Promise.all([
    admin
      .rpc('helm_debug_read_db_health_history' as never, { p_limit: HEALTH_LOOKBACK_LIMIT } as never)
      .then((r) => r as unknown as { data: RawHealthRow[] | null; error: MaybePostgrestError }),
    admin
      .rpc('helm_debug_read_db_lock_incidents' as never, { p_limit: LOCK_LOOKBACK_LIMIT } as never)
      .then((r) => r as unknown as { data: RawLockRow[] | null; error: MaybePostgrestError }),
    admin
      .rpc('helm_debug_read_db_stat_deltas' as never, { p_limit: STAT_LOOKBACK_LIMIT } as never)
      .then((r) => r as unknown as { data: RawStatRow[] | null; error: MaybePostgrestError }),
  ]);

  let healthAtTheTime: Section<HealthAtTheTime>;
  if (healthResult.error) {
    healthAtTheTime = isMigrationNotAppliedError(healthResult.error)
      ? sectionUnconfigured('The database health sampler migration is HELD.')
      : sectionBlind(healthResult.error.message ?? 'helm_debug_read_db_health_history failed');
  } else {
    const nearest = nearestHealthSample(healthResult.data ?? [], lastSeenMs);
    healthAtTheTime = nearest === null
      ? sectionEmpty('No health sample within 30 minutes of the last occurrence.')
      : sectionOk(nearest);
  }

  let locksAtTheTime: Section<readonly LockAtTheTime[]>;
  if (locksResult.error) {
    locksAtTheTime = isMigrationNotAppliedError(locksResult.error)
      ? sectionUnconfigured('The lock-incident migration is HELD.')
      : sectionBlind(locksResult.error.message ?? 'helm_debug_read_db_lock_incidents failed');
  } else {
    const near = (locksResult.data ?? [])
      .filter((row) => {
        const ms = Date.parse(row.detected_at);
        return Number.isFinite(ms) && Math.abs(ms - lastSeenMs) <= LOCK_PROXIMITY_MS;
      })
      .map<LockAtTheTime>((row) => ({
        detectedAt: row.detected_at,
        kind: row.kind,
        severity: row.severity,
        waitMs: row.wait_ms,
        relationName: row.relation_name,
        feature: row.feature,
      }));
    locksAtTheTime = near.length === 0
      ? sectionEmpty('No lock incident within 30 minutes of the last occurrence.')
      : sectionOk(near);
  }

  let queryHealth: Section<readonly QueryHealthAtTheTime[]>;
  if (statsResult.error) {
    queryHealth = isMigrationNotAppliedError(statsResult.error)
      ? sectionUnconfigured('The query-delta migration is HELD.')
      : sectionBlind(statsResult.error.message ?? 'helm_debug_read_db_stat_deltas failed');
  } else {
    // Only rows carrying a regression flag are "query health vs baseline" for
    // this incident. Everything else is ordinary workload and would be noise.
    const regressions = (statsResult.data ?? [])
      .filter((row) => (row.regression_flags ?? []).length > 0)
      .slice(0, 10)
      .map<QueryHealthAtTheTime>((row) => ({
        sampledAt: row.sampled_at,
        safeQueryClass: row.safe_query_class,
        sourceClass: row.source_class,
        callsDelta: row.calls_delta,
        meanExecMsWindow: row.mean_exec_ms_window,
        regressionFlags: row.regression_flags ?? [],
        baselineStatus: row.baseline_status,
      }));
    queryHealth = regressions.length === 0
      ? sectionEmpty('No query regression flagged in the recent windows.')
      : sectionOk(regressions);
  }

  // --- Release correlation -------------------------------------------------
  // Every release-side fact the caller did not supply stays `null`, which
  // `correlateWithRelease` treats as "not determined" and never as false. The
  // only fact this module can determine on its own is whether a migration in
  // the tree names the failing object — and only when the drift read worked.
  const driftDiagnosis = schemaDrift.data;
  const migrationNamesObject =
    driftDiagnosis === null || driftDiagnosis.migrationFile === 'unknown'
      ? null
      : driftDiagnosis.migrationFile === 'found';

  const releaseFacts: ReleaseFacts = {
    releaseSha: latest.release_sha,
    deployedAtMs: null,
    featureChanged: null,
    rpcOrRelationChanged: null,
    codeInTraceChanged: null,
    migrationNamesObject,
    candidateCohortOnly: null,
    baselineCohortClean: null,
    replayReproducesOnNewShaOnly: null,
    providerOutageOverlaps: null,
    recurredAfterUnrelatedReleases: null,
    presentOnBaselineSha: null,
    ...options?.releaseFacts,
  };

  const correlation = correlateWithRelease({
    occurrence: {
      firstSeenMs,
      eventReleaseSha: latest.release_sha,
      sqlstate: latest.sqlstate,
    },
    release: releaseFacts,
  });
  const releaseCorrelation: Section<ReleaseCorrelation> = releaseFacts.deployedAtMs === null
    ? { state: 'unconfigured', data: correlation, note: 'No deploy time is available for this release, so the causal ladder is not computable.' }
    : sectionOk(correlation);

  const identity: IncidentIdentity = {
    fingerprint,
    title: buildIncidentTitle(latest),
    primaryClass: primaryClassFor(latest.error_code),
    feature: latest.feature,
    action: latest.action,
    service: latest.service,
    operation: latest.operation,
    relation: latest.relation_name,
    rpc: latest.rpc_name,
    sqlstate: latest.sqlstate,
    errorCode: latest.error_code,
    httpStatus: null,
    severity: latest.severity,
    expectedness: latest.expectedness,
    retryability: latest.retryability,
    firstSeenAt,
    lastSeenAt: latest.last_seen_at,
    occurrences,
    releaseSha: latest.release_sha,
    environment: latest.environment,
    helmTraceId: latest.helm_trace_id,
    sentryTraceId: latest.sentry_trace_id,
    normalizedMessage: latest.normalized_message,
    safeDetails: latest.safe_details,
    safeHint: latest.safe_hint,
  };

  return ok({
    identity,
    bucketCount: buckets.length,
    serviceLayer,
    workflowStages,
    authorization,
    schemaDrift,
    releaseCorrelation,
    healthAtTheTime,
    locksAtTheTime,
    queryHealth,
    dataInvariant: sectionUnconfigured(
      'No data-invariant registry is wired to a fingerprint in this repo, so pass/fail cannot be stated for this incident.',
    ),
    sentryIssue: sectionUnconfigured(
      'The Sentry issue is not fetched here. The trace id on the event is the correlation key; the issue itself lives in Sentry.',
    ),
    recentChange: buildRecentChangeSection(schemaDrift, latest.release_sha),
    repairLinks: buildRepairLinks({
      drift: driftDiagnosis,
      authorization,
      helmTraceId: latest.helm_trace_id,
    }),
  });
}
