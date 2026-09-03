/**
 * Canonical Supabase error envelope — brief §5
 * (`docs/ai-system/briefs/SUPABASE_ZERO_COST_OBSERVABILITY_BRIEF_2026-09-03.md`).
 *
 * ONE normalized shape for every Supabase-adjacent failure Helm observes:
 * PostgREST, Postgres RPC, Auth, Storage, Realtime, Edge Functions, pg_cron,
 * pg_net. No per-sport, per-feature or per-workflow variant — every call
 * site that wants to record a Supabase failure builds one of these and hands
 * it to `observeSupabaseResult` / `recordDbErrorOutOfBand`
 * (`observe-result.ts`, `record-db-error.ts`).
 *
 * PRIVACY IS STRUCTURAL, NOT A CONVENTION (brief §6)
 * -----------------------------------------------------
 * Nothing in this file accepts a raw request body, raw SQL parameter, JWT,
 * cookie, or arbitrary user-identifying id as a "safe" field. `safeDetails`
 * / `safeHint` / `safeMetadata` are the ONLY free-text carriers, and every
 * value that reaches them is routed through `sanitizeSupabaseFreeText`
 * (below), which reuses the exact `redactFreeTextForStorage` masking the
 * server error logger already applies to `error_logs`/`admin_events` —
 * see `redact-pii.ts`. There is no second, weaker redaction rule here.
 *
 * FINGERPRINT IS CODE-FIRST (brief §9, §33)
 * ---------------------------------------------
 * `buildSupabaseFingerprint` never reads `normalizedMessage`. Two errors
 * with different message text but the same
 * (source, service, feature, operation, rpc-or-relation, code) are the SAME
 * mechanism and must dedupe to the same row in `helm_debug.db_error_events`
 * — see `classify.test.ts` for the discriminating test.
 */
import { redactFreeTextForStorage } from '../redact-pii';

// ---------------------------------------------------------------------------
// Enumerated dimensions
// ---------------------------------------------------------------------------

export const SUPABASE_SERVICES = [
  'postgrest',
  'postgres',
  'auth',
  'storage',
  'realtime',
  'edge_function',
  'pg_cron',
  'pg_net',
] as const;
export type SupabaseService = (typeof SUPABASE_SERVICES)[number];

export const SUPABASE_RUNTIMES = ['browser', 'node', 'edge', 'postgres'] as const;
export type SupabaseRuntime = (typeof SUPABASE_RUNTIMES)[number];

export const SUPABASE_OPERATIONS = [
  'select',
  'insert',
  'update',
  'delete',
  'upsert',
  'rpc',
  'auth',
  'upload',
  'download',
  'subscribe',
  'invoke',
  'job',
] as const;
export type SupabaseOperation = (typeof SUPABASE_OPERATIONS)[number];

export const RETRYABILITY_VALUES = ['yes', 'no', 'conditional', 'unknown'] as const;
export type Retryability = (typeof RETRYABILITY_VALUES)[number];

export const EXPECTEDNESS_VALUES = ['expected', 'routine_recovery', 'unexpected', 'unknown'] as const;
export type Expectedness = (typeof EXPECTEDNESS_VALUES)[number];

export const SEVERITY_VALUES = ['info', 'warning', 'error', 'critical'] as const;
export type Severity = (typeof SEVERITY_VALUES)[number];

// ---------------------------------------------------------------------------
// The envelope
// ---------------------------------------------------------------------------

/**
 * Every field the brief's §5 conceptual shape names. Optional fields are
 * genuinely optional — a Storage failure has no `sqlstate`, a connection
 * failure has no `relation`. `safeMetadata` is a closed, small jsonb-shaped
 * bag for anything else worth keeping (never a place to smuggle an
 * unsanitized value past the typed fields above it).
 */
export interface SupabaseErrorEnvelope {
  occurredAt: string; // ISO-8601
  source: 'supabase';
  service: SupabaseService;
  environment: string;
  releaseSha: string | null;
  runtime: SupabaseRuntime;
  sport: string | null;
  feature: string;
  action: string;
  journey: string | null;
  operation: SupabaseOperation;
  relation: string | null;
  rpc: string | null;
  functionName: string | null;
  bucketClass: string | null;
  code: string | null;
  sqlstate: string | null;
  postgrestCode: string | null;
  authCode: string | null;
  storageCode: string | null;
  httpStatus: number | null;
  retryability: Retryability;
  expectedness: Expectedness;
  severity: Severity;
  fingerprint: string;
  normalizedMessage: string;
  safeDetails: string | null;
  safeHint: string | null;
  sentryTraceId: string | null;
  sentrySpanId: string | null;
  helmTraceId: string | null;
  durationMs: number | null;
  attempt: number | null;
  terminal: boolean;
  /** Small, closed jsonb bag — every value already sanitized before it lands here. */
  safeMetadata: Record<string, string | number | boolean> | null;
}

/** Everything a caller supplies; envelope-level bookkeeping (`occurredAt`,
 *  `fingerprint`, `source`) is computed by `buildSupabaseErrorEnvelope`. */
export type SupabaseErrorEnvelopeInput = Omit<SupabaseErrorEnvelope, 'occurredAt' | 'source' | 'fingerprint'>;

// ---------------------------------------------------------------------------
// Free-text sanitization — the ONLY path a message/detail/hint may take
// ---------------------------------------------------------------------------

const MAX_SAFE_TEXT_CHARS = 300;

/** RFC 4122-shaped UUID, any version/variant — never a safe dimension per brief §6. */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * `redactFreeTextForStorage` (masks emails, strips embedded URL secrets,
 * bounds length, fails open to a placeholder — never to the raw value) plus
 * one more pass this call site needs that the shared helper doesn't do:
 * UUIDs are stripped too. A Postgres constraint-violation message routinely
 * embeds the offending row's id ("Key (round_id)=(...) already exists"), and
 * brief §6 is explicit that a UUID must never become a stored/queryable
 * dimension even when it looks harmless. Never throws.
 */
export function sanitizeSupabaseFreeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  try {
    const withoutUuids = value.replace(UUID_RE, '[id]');
    const safe = redactFreeTextForStorage(withoutUuids, MAX_SAFE_TEXT_CHARS);
    return safe.length > 0 ? safe : null;
  } catch {
    return '[redaction failed]';
  }
}

// ---------------------------------------------------------------------------
// Fingerprint — brief §8 example: supabase|postgrest|round_tracking|rpc|save_partial_round_atomic|42501
// ---------------------------------------------------------------------------

function fingerprintSegment(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  return trimmed.length > 0 ? trimmed.replace(/[^a-z0-9_.]/g, '_') : 'none';
}

/**
 * Deterministic, explainable, code-first. Never reads `normalizedMessage`,
 * `safeDetails`, `safeHint`, `helmTraceId`, `occurredAt` or any identity
 * value — those vary per occurrence of the SAME mechanism and must not
 * split one fingerprint into many. The rpc-or-relation segment prefers
 * `rpc` (an RPC call names the mechanism precisely); falls back to
 * `relation` for direct table operations.
 */
export function buildSupabaseFingerprint(
  input: Pick<SupabaseErrorEnvelopeInput, 'service' | 'feature' | 'operation' | 'rpc' | 'relation' | 'code'>,
): string {
  const objectSegment = input.rpc ?? input.relation ?? null;
  return [
    'supabase',
    fingerprintSegment(input.service),
    fingerprintSegment(input.feature),
    fingerprintSegment(input.operation),
    fingerprintSegment(objectSegment),
    fingerprintSegment(input.code),
  ].join('|');
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Builds a complete, safe-to-persist envelope from caller input. Free-text
 * fields are sanitized here — a caller can pass a raw Postgres `details`/
 * `hint` string straight through; it never reaches a store or Sentry
 * unsanitized. `safeMetadata` is NOT sanitized here (the caller already
 * built it from typed/allow-listed values, matching the `metrics.ts`
 * discipline of allow-listing at the producer rather than scrubbing at the
 * consumer) — keep any free-text metadata value routed through
 * `sanitizeSupabaseFreeText` before it is placed in that bag.
 */
export function buildSupabaseErrorEnvelope(input: SupabaseErrorEnvelopeInput): SupabaseErrorEnvelope {
  const safeDetails = sanitizeSupabaseFreeText(input.safeDetails);
  const safeHint = sanitizeSupabaseFreeText(input.safeHint);
  const normalizedMessage = sanitizeSupabaseFreeText(input.normalizedMessage) ?? 'unknown_error';

  return {
    ...input,
    occurredAt: new Date().toISOString(),
    source: 'supabase',
    safeDetails,
    safeHint,
    normalizedMessage,
    fingerprint: buildSupabaseFingerprint(input),
  };
}
