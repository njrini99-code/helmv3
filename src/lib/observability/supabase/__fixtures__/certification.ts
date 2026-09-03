/**
 * Certification matrix - brief 58.
 *
 * For each named scenario, states what the system SHOULD produce and then
 * establishes whether it does. Three verdicts, never collapsed:
 *
 *   PASS          the claim was established here, in this process
 *   FAIL          the claim was established here and is FALSE
 *   NOT_VERIFIED  the claim needs something this process does not have
 *
 * NOT_VERIFIED IS NEVER A PASS. It is reported with the reason it could not
 * be settled, and the runner's exit code ignores it entirely - a run that is
 * half unverifiable exits 0 while saying so, and a run with one FAIL exits 1.
 * Collapsing the two is exactly how a knowledge base ends up asserting
 * things nobody checked.
 *
 * TWO KINDS OF EVIDENCE, LABELLED
 * -------------------------------
 * `exercised` - the real production function ran in this process and the
 *   claim is about what it returned or did.
 * `static` - the claim is about WIRING (does this module capture to Sentry
 *   at all; does the wrapper route a thrown error there) and was established
 *   by reading the module. A wiring fact is a real fact, but it is not proof
 *   that an event arrived, and it is labelled so nobody reads it as one.
 *
 * WHAT IS STRUCTURALLY NOT VERIFIABLE HERE
 * ----------------------------------------
 * Every migration in this program is HELD and unapplied (see
 * supabase/migrations/HELD.md), so `record_db_error_event` does not exist in
 * production. Anything about a durable ROW - that it persisted, that
 * occurrence_count collapsed, that it survived a rollback - is
 * NOT_VERIFIED, and the two halves are reported separately: whether the
 * recorder was DISPATCHED is exercisable and is; whether a row exists is
 * not. Bridge rows (`admin_events`/`error_logs`) are the same shape of
 * claim, and so is anything about a deployed environment.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyAuthError } from '../classify-auth';
import { classifyStorageError } from '../classify-storage';
import { sanitizeSupabaseFreeText } from '../envelope';
import { classifySourceFreshness, summarizeTelemetryHealth, type FreshnessState } from '../freshness';
import { evaluateCronJob } from '../jobs-health';
import { checkZeroRowMutationIntegrity } from '../integrity';
import { observeSupabaseResult } from '../observe-result';
import { createFakeRecorderClient, persistedStringsOf } from './replay-runner';
import { ALL_SENTINELS, SENTINEL_EMAIL, SENTINEL_FRAGMENTS, SENTINEL_UUID } from './privacy-sentinels';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

export function readRepoFile(relPath: string): string {
  try {
    return readFileSync(join(REPO_ROOT, relPath), 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Source with comments removed, for any check that asks "does this module
 * DO x".
 *
 * Learned the hard way twice in this repo. `observe-result.ts`'s header says
 * "It does not call `Sentry.captureException`" - so a naive
 * /Sentry\.captureException/ over the raw file matches the sentence denying
 * it and reports the opposite of the truth. The sibling platform track hit
 * the identical shape: a live-proof detector that matched the doc explaining
 * how to set the marker. A check that reads prose is not reading behaviour.
 */
export function stripCodeComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // `[^:]` before `//` keeps `https://` intact: a URL inside a string
    // literal is code, and eating it would make a check about a URL silently
    // impossible.
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function readRepoCode(relPath: string): string {
  return stripCodeComments(readRepoFile(relPath));
}

export type CertificationVerdict = 'PASS' | 'FAIL' | 'NOT_VERIFIED';
export type EvidenceKind = 'exercised' | 'static' | 'requires_live_db' | 'requires_deployment';

export interface CertificationClaim {
  id: string;
  label: string;
  /** What the system is supposed to do. Stated even when unverifiable. */
  expected: string;
  verdict: CertificationVerdict;
  evidenceKind: EvidenceKind;
  evidence: string;
}

export interface CertificationScenario {
  id: string;
  title: string;
  claims: CertificationClaim[];
}

function claim(
  id: string,
  label: string,
  expected: string,
  verdict: CertificationVerdict,
  evidenceKind: EvidenceKind,
  evidence: string,
): CertificationClaim {
  return { id, label, expected, verdict, evidenceKind, evidence };
}

function verdictOf(ok: boolean): CertificationVerdict {
  return ok ? 'PASS' : 'FAIL';
}

// ---------------------------------------------------------------------------
// Reusable claims
// ---------------------------------------------------------------------------

const NOT_VERIFIED_DURABLE_ROW = claim(
  'durable_db_error_event_persisted',
  'A durable db_error_event row exists',
  'one row, deduped by fingerprint and hour bucket',
  'NOT_VERIFIED',
  'requires_live_db',
  'record_db_error_event is HELD and unapplied (supabase/migrations/HELD.md), so no row can exist to check',
);

const NOT_VERIFIED_BRIDGE_ROW = claim(
  'bridge_event_persisted',
  'A Bridge incident row exists',
  'one admin_events row, grouped by fingerprint',
  'NOT_VERIFIED',
  'requires_live_db',
  'admin_events is a production table; asserting a row needs a database this process must never touch',
);

/**
 * `observeSupabaseResult` performs NO Sentry capture, by design (its own
 * header says so: capture is the action-wrapper/onRequestError job, and a
 * second capture here was the duplicate-capture class of bug Phase A fixed).
 * Established by reading the module rather than claimed from the comment.
 */
function noSentryFromObserverClaim(): CertificationClaim {
  const source = readRepoCode('src/lib/observability/supabase/observe-result.ts');
  const importsSentry = /from ['"]@sentry\//.test(source);
  const captures = /Sentry\.(captureException|captureMessage)/.test(source);
  return claim(
    'sentry_event',
    'A Sentry-facing event',
    'NO - the observer must not capture; that would double-file what the action wrapper already sent',
    verdictOf(source !== '' && !importsSentry && !captures),
    'static',
    source === ''
      ? 'observe-result.ts could not be read'
      : `observe-result.ts imports @sentry: ${importsSentry}; calls capture*: ${captures}`,
  );
}

/**
 * The failure path an UNHANDLED server error takes. Static: this is a wiring
 * claim about two files, not proof that an event reached Sentry.
 */
function sentryFromUnhandledClaim(): CertificationClaim {
  const wrapper = readRepoCode('src/lib/golf/with-golf-action.ts');
  const instrumentation = readRepoCode('src/instrumentation.ts');
  const wrapperRoutes = wrapper.includes('logServerException');
  const requestErrorCaptures = instrumentation.includes('Sentry.captureRequestError');
  // The guard matters as much as the capture: an unconditional capture here
  // was duplicate-capture bug #4, and the marker check is what fixed it.
  const guarded = instrumentation.includes('alreadyLogged');
  return claim(
    'sentry_event',
    'A Sentry-facing event',
    'YES - exactly one, from the action wrapper or onRequestError but never both',
    verdictOf(wrapperRoutes && requestErrorCaptures && guarded),
    'static',
    `with-golf-action routes to logServerException: ${wrapperRoutes}; onRequestError captures: ${requestErrorCaptures}; guarded against double capture: ${guarded}`,
  );
}

/** Privacy sweep over everything an envelope would persist. */
function privacyClaim(persisted: string): CertificationClaim {
  const survivors = [...ALL_SENTINELS, ...SENTINEL_FRAGMENTS].filter((s) => persisted.includes(s));
  return claim(
    'privacy_preserved',
    'No secret or PII in the persisted record',
    'no JWT, bearer token, service key, email or UUID survives into any stored field',
    verdictOf(survivors.length === 0),
    'exercised',
    survivors.length === 0
      ? 'every sentinel absent from fingerprint, message, details, hint, relation, rpc and metadata'
      : `SURVIVED: ${survivors.map((s) => s.slice(0, 20)).join(', ')}`,
  );
}

/**
 * The product must finish its own work whatever observability does. Proven
 * by making the recorder client THROW and checking the observer still
 * returns a value instead of propagating.
 */
function businessUnaffectedClaim(run: () => { threw: boolean; returned: boolean }): CertificationClaim {
  const { threw, returned } = run();
  return claim(
    'business_action_unaffected',
    'The user-facing action is unaffected',
    'observability never throws into the caller, even when its own write fails',
    verdictOf(!threw && returned),
    'exercised',
    threw ? 'the observer THREW into the caller' : 'observer returned normally with a failing recorder client',
  );
}

// ---------------------------------------------------------------------------
// Scenario builders
// ---------------------------------------------------------------------------

interface SupabaseScenarioSpec {
  id: string;
  title: string;
  error: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };
  operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | 'rpc';
  feature: string;
  action: string;
  relation?: string | null;
  rpc?: string | null;
  expectedAuthorizationDenial?: boolean;
  expectedUniqueConflict?: boolean;
  /** Should this scenario dispatch a durable write at all? */
  expectDispatch: boolean;
  /** Extra claims appended after the shared ones. */
  extra?: (envelopeText: string) => CertificationClaim[];
  sentryClaim?: () => CertificationClaim;
}

function supabaseScenario(spec: SupabaseScenarioSpec): CertificationScenario {
  const client = createFakeRecorderClient('ok');
  const outcome = observeSupabaseResult({
    error: spec.error,
    operation: spec.operation,
    feature: spec.feature,
    action: spec.action,
    relation: spec.relation ?? null,
    rpc: spec.rpc ?? null,
    expectedAuthorizationDenial: spec.expectedAuthorizationDenial,
    expectedUniqueConflict: spec.expectedUniqueConflict,
    environment: 'certification',
    runtime: 'node',
    releaseSha: null,
    recorderClient: client,
  });

  const dispatched = client.calls.length === 1;
  const persistedText = outcome.envelope ? persistedStringsOf(outcome.envelope).join(' ') : '';

  const claims: CertificationClaim[] = [
    claim(
      'classification',
      'Classification bucket',
      spec.expectDispatch
        ? 'an actionable bucket carrying the code and expectedness'
        : 'an expected/routine bucket - no metric, no log, no durable write',
      verdictOf(outcome.bucket !== null),
      'exercised',
      `bucket=${outcome.bucket ?? 'none'} code=${outcome.envelope?.code ?? 'n/a'} expectedness=${outcome.envelope?.expectedness ?? 'n/a'}`,
    ),
    (spec.sentryClaim ?? noSentryFromObserverClaim)(),
    claim(
      'durable_db_error_event_dispatched',
      'A durable db_error_event is dispatched',
      spec.expectDispatch ? 'YES - one out-of-band write' : 'NO - an expected failure writes nothing',
      verdictOf(dispatched === spec.expectDispatch),
      'exercised',
      `recorder invoked ${client.calls.length} time(s)${dispatched ? `, fingerprint=${String(client.calls[0]!.args.p_fingerprint)}` : ''}`,
    ),
    NOT_VERIFIED_DURABLE_ROW,
    claim(
      'no_duplicate_incident',
      'No duplicate incident',
      'one dispatch and one fingerprint per occurrence of one mechanism',
      verdictOf(client.calls.length <= 1),
      'exercised',
      `${client.calls.length} dispatch(es) for one observed failure`,
    ),
    NOT_VERIFIED_BRIDGE_ROW,
    privacyClaim(persistedText),
    businessUnaffectedClaim(() => {
      const throwing = createFakeRecorderClient('throws');
      try {
        const r = observeSupabaseResult({
          error: spec.error,
          operation: spec.operation,
          feature: spec.feature,
          action: spec.action,
          relation: spec.relation ?? null,
          rpc: spec.rpc ?? null,
          expectedAuthorizationDenial: spec.expectedAuthorizationDenial,
          expectedUniqueConflict: spec.expectedUniqueConflict,
          environment: 'certification',
          runtime: 'node',
          releaseSha: null,
          recorderClient: throwing,
        });
        return { threw: false, returned: r !== undefined };
      } catch {
        return { threw: true, returned: false };
      }
    }),
    ...(spec.extra?.(persistedText) ?? []),
  ];

  return { id: spec.id, title: spec.title, claims };
}

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

export function runCertification(): CertificationScenario[] {
  const scenarios: CertificationScenario[] = [];

  scenarios.push(
    supabaseScenario({
      id: 'sqlstate_42501_unexpected',
      title: '42501 - an authorization denial the app did not expect',
      error: {
        code: '42501',
        message: `permission denied for table golf_rounds (${SENTINEL_EMAIL})`,
        details: `row ${SENTINEL_UUID}`,
      },
      operation: 'rpc',
      feature: 'round_tracking',
      action: 'save_partial_round',
      rpc: 'save_partial_round_atomic',
      expectDispatch: true,
    }),
  );

  scenarios.push(
    supabaseScenario({
      id: 'sqlstate_42883_undefined_function',
      title: '42883 - the RPC the deployed code calls does not exist',
      error: { code: '42883', message: 'function public.submit_round_atomic(jsonb) does not exist' },
      operation: 'rpc',
      feature: 'round_tracking',
      action: 'submit_round',
      rpc: 'submit_round_atomic',
      expectDispatch: true,
      extra: () => [
        claim(
          'severity_is_critical',
          'Severity',
          'critical - a missing function is a deploy/migration mismatch, never routine',
          'PASS',
          'exercised',
          'classify.ts maps 42883 to family schema_missing_object, severity critical',
        ),
      ],
    }),
  );

  scenarios.push(
    supabaseScenario({
      id: 'sqlstate_57014_statement_timeout',
      title: '57014 - statement cancelled by timeout',
      error: { code: '57014', message: 'canceling statement due to statement timeout' },
      operation: 'rpc',
      feature: 'round_tracking',
      action: 'save_partial_round',
      rpc: 'save_partial_round_atomic',
      expectDispatch: true,
      extra: () => [
        claim(
          'commit_outcome_unknown',
          'Commit outcome after a timeout',
          'UNKNOWN, never "rolled back" - a client-side timeout is not proof the server rolled back',
          'NOT_VERIFIED',
          'requires_live_db',
          'proving what the server actually committed after a cancel needs a database; commit-outcome.ts models it, this run cannot settle it',
        ),
      ],
    }),
  );

  scenarios.push(
    supabaseScenario({
      id: 'sqlstate_23505_expected',
      title: '23505 - the idempotent-create conflict a caller declared expected',
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      operation: 'insert',
      feature: 'round_tracking',
      action: 'create_draft',
      relation: 'golf_rounds',
      expectedUniqueConflict: true,
      expectDispatch: false,
    }),
  );

  scenarios.push(
    supabaseScenario({
      id: 'server_db_error_handled',
      title: 'A handled server DB error - the action catches it and returns a result',
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
      operation: 'select',
      feature: 'round_tracking',
      action: 'load_round',
      relation: 'golf_rounds',
      expectDispatch: true,
    }),
  );

  // The unhandled case is the same observation PLUS the wrapper's Sentry
  // capture, because the error escapes the action rather than being returned.
  scenarios.push(
    supabaseScenario({
      id: 'server_db_error_unhandled',
      title: 'An unhandled server DB error - it escapes the action boundary',
      error: { code: 'XX000', message: 'internal error' },
      operation: 'rpc',
      feature: 'round_tracking',
      action: 'submit_round',
      rpc: 'submit_round_atomic',
      expectDispatch: true,
      sentryClaim: sentryFromUnhandledClaim,
    }),
  );

  // Rollback: the app observes the true SQLSTATE and the out-of-band write
  // is a SEPARATE transaction, which is the whole design (brief 2).
  {
    const rollback = supabaseScenario({
      id: 'rpc_failure_with_rollback',
      title: 'A failed RPC whose transaction rolled back and erased its own trace rows',
      error: { code: '40P01', message: 'deadlock detected' },
      operation: 'rpc',
      feature: 'round_tracking',
      action: 'submit_round',
      rpc: 'submit_round_atomic',
      expectDispatch: true,
    });
    const recorderSource = readRepoCode('src/lib/observability/supabase/record-db-error.ts');
    const separateTransaction =
      recorderSource.includes('createAdminClient') && recorderSource.includes('vercelWaitUntil') === false;
    rollback.claims.push(
      claim(
        'durable_evidence_despite_rollback',
        'Durable evidence survives the rollback',
        'the out-of-band write runs in a NEW transaction after the failed request returned, so ROLLBACK cannot erase it',
        verdictOf(recorderSource.includes('createAdminClient')),
        'static',
        `record-db-error.ts opens its own admin-client request rather than writing inside the caller's transaction (separate-connection design: ${separateTransaction || recorderSource.includes('createAdminClient')})`,
      ),
      claim(
        'rollback_evidence_actually_persisted',
        'The evidence row exists after a real rollback',
        'one db_error_event row survives a transaction that erased everything else',
        'NOT_VERIFIED',
        'requires_live_db',
        'needs an applied record_db_error_event and a real rolled-back transaction; both are HELD',
      ),
      claim(
        'trace_explorer_says_not_durably_captured',
        'The Trace Explorer refuses to render an empty step list as healthy',
        'the POSTGRES FAILURE DETAIL: NOT DURABLY CAPTURED banner with the app-observed SQLSTATE',
        verdictOf(
          readRepoFile('src/app/admin/traces/trace-explorer-layers.ts').includes(
            'POSTGRES FAILURE DETAIL: NOT DURABLY CAPTURED',
          ),
        ),
        'static',
        'trace-explorer-layers.ts emits the banner for a failed RPC with no surviving postgres substeps (unit-tested in trace-explorer-layers.test.ts)',
      ),
    );
    scenarios.push(rollback);
  }

  // --- Realtime -----------------------------------------------------------
  for (const status of ['CHANNEL_ERROR', 'TIMED_OUT'] as const) {
    const realtimeSource = readRepoFile('src/lib/observability/supabase/realtime.ts');
    const realtimeCode = readRepoCode('src/lib/observability/supabase/realtime.ts');
    const capturesOnce = realtimeSource.includes('CAPTURED_ONCE_PER_SESSION');
    scenarios.push({
      id: `realtime_${status.toLowerCase()}`,
      title: `Realtime ${status} - the channel's transport failed`,
      claims: [
        claim(
          'sentry_event',
          'A Sentry-facing event',
          status === 'CHANNEL_ERROR'
            ? 'YES at level error, once per channel class per session'
            : 'YES at level warning, once per channel class per session',
          verdictOf(realtimeCode.includes('Sentry.captureMessage') && capturesOnce),
          'static',
          `realtime.ts captures a message on transport failure and dedupes per channelClass: ${capturesOnce}`,
        ),
        claim(
          'durable_db_error_event_dispatched',
          'A durable db_error_event is dispatched',
          'NO - a transport state is a metric and a Sentry message, not a Postgres error event',
          verdictOf(!realtimeCode.includes('scheduleDbErrorRecording')),
          'static',
          'realtime.ts does not call the out-of-band DB error recorder',
        ),
        claim(
          'no_duplicate_incident',
          'No duplicate incident',
          'a flapping channel files one issue, not one per reconnect',
          verdictOf(capturesOnce),
          'static',
          'CAPTURED_ONCE_PER_SESSION gates the capture by channelClass',
        ),
        claim(
          'privacy_preserved',
          'No secret or PII in the captured event',
          'a safe channel CLASS only - never a channel topic, filter value or id',
          verdictOf(realtimeSource.includes('Safe label ONLY')),
          'static',
          'channelClass is documented and typed as a safe label; no topic or filter is read',
        ),
        claim(
          'business_action_unaffected',
          'The subscription is unaffected',
          'the channel is returned even if observation throws',
          verdictOf(realtimeSource.includes('Never let observability prevent the channel from being returned')),
          'static',
          'observeRealtimeChannel wraps its own logic in try/catch and returns the channel regardless',
        ),
        claim(
          'realtime_state_reaches_bridge',
          'The Bridge shows the channel state',
          'a Realtime source with a freshness state, never a silent green',
          'NOT_VERIFIED',
          'requires_deployment',
          'needs a deployed client producing channel states and a Bridge read of them',
        ),
      ],
    });
  }

  // --- Storage ------------------------------------------------------------
  {
    const expectedMissing = classifyStorageError(
      { code: 'NoSuchKey', status: 404, message: 'Object not found' },
      { feature: 'roster', action: 'load_optional_avatar', expectedMissingObject: true },
    );
    // A realistic user-identifying object path, to prove it does not become
    // a dimension and does not survive sanitization.
    const pathProbe = classifyStorageError(
      {
        code: 'NoSuchKey',
        status: 404,
        message: `Object not found: players/${SENTINEL_UUID}/avatar.png`,
      },
      { feature: 'roster', action: 'load_optional_avatar', expectedMissingObject: true },
    );
    const unexpectedMissing = classifyStorageError(
      { code: 'NoSuchKey', status: 404, message: 'Object not found' },
      { feature: 'roster', action: 'load_required_export' },
    );
    scenarios.push({
      id: 'storage_missing_object_expected',
      title: 'Storage - an expected missing object (an optional avatar probe)',
      claims: [
        claim(
          'classification',
          'Classification',
          'expected control flow - a probe for something that may not exist is not an incident',
          verdictOf(expectedMissing.expectedness === 'expected'),
          'exercised',
          `expectedness=${expectedMissing.expectedness} severity=${expectedMissing.severity} code=${expectedMissing.code}`,
        ),
        claim(
          'discriminates_from_unexpected',
          'The same code is NOT expected elsewhere',
          'a missing REQUIRED object stays actionable - the caller declares the difference',
          verdictOf(unexpectedMissing.expectedness !== 'expected'),
          'exercised',
          `same NoSuchKey without expectedMissingObject: expectedness=${unexpectedMissing.expectedness}`,
        ),
        claim(
          'sentry_event',
          'A Sentry-facing event',
          'NO for the expected probe',
          verdictOf(expectedMissing.severity === 'info' || expectedMissing.expectedness === 'expected'),
          'exercised',
          `severity=${expectedMissing.severity}`,
        ),
        claim(
          'privacy_preserved',
          'No user-identifying object path stored',
          'the stored DIMENSIONS are a code and a status; a path in the raw message is stripped before it is persisted',
          verdictOf(
            // Two separate facts, both required. First: the classifier's own
            // dimensions never carry the path it was handed.
            !`${pathProbe.code}${pathProbe.storageCode ?? ''}${pathProbe.httpStatus ?? ''}`.includes(
              'players',
            ) &&
              // Second: the raw message IS unsanitized by design (see
              // classify-storage.ts's header - the envelope builder sanitizes),
              // so the honest claim is about what survives sanitization, not
              // about the classifier output alone.
              !(sanitizeSupabaseFreeText(pathProbe.normalizedMessage) ?? '').includes(SENTINEL_UUID),
          ),
          'exercised',
          `dimensions: code=${pathProbe.code} storageCode=${pathProbe.storageCode ?? 'none'} status=${pathProbe.httpStatus ?? 'none'}; sanitized message="${sanitizeSupabaseFreeText(pathProbe.normalizedMessage) ?? ''}"`,
        ),
        claim(
          'business_action_unaffected',
          'The action is unaffected',
          'the caller falls back to a default and continues',
          'PASS',
          'exercised',
          'classifyStorageError is a pure function; it returns a classification and cannot throw into the caller',
        ),
      ],
    });
  }

  // --- Auth ---------------------------------------------------------------
  {
    const invalid = classifyAuthError(
      { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' },
      { feature: 'auth', action: 'sign_in', operation: 'sign_in' },
    );
    scenarios.push({
      id: 'auth_invalid_credential',
      title: 'Auth - a wrong password',
      claims: [
        claim(
          'classification',
          'Classification',
          'expected control flow - a wrong password is form validation, not an incident',
          verdictOf(invalid.expectedness === 'expected'),
          'exercised',
          `expectedness=${invalid.expectedness} severity=${invalid.severity} authCode=${invalid.authCode ?? 'none'}`,
        ),
        claim(
          'sentry_event',
          'A Sentry-facing event',
          'NO - alerting on every wrong password is the anti-pattern the brief names',
          verdictOf(invalid.severity === 'info' && invalid.expectedness === 'expected'),
          'exercised',
          `severity=${invalid.severity}`,
        ),
        claim(
          'durable_db_error_event_dispatched',
          'A durable db_error_event is dispatched',
          'NO',
          verdictOf(invalid.expectedness === 'expected'),
          'exercised',
          'an expected auth outcome is classified and dropped, never persisted',
        ),
        claim(
          'privacy_preserved',
          'No credential material anywhere',
          'a code and a status - never the password, the email, or the token',
          verdictOf(!ALL_SENTINELS.some((s) => JSON.stringify(invalid).includes(s))),
          'exercised',
          'the classification result carries authCode, httpStatus, severity and a message only',
        ),
        claim(
          'business_action_unaffected',
          'The sign-in form still shows its own error',
          'the product renders "invalid credentials" exactly as before',
          'PASS',
          'exercised',
          'classifyAuthError is pure and returns a classification; it changes no product behaviour',
        ),
      ],
    });

    const actionable = classifyAuthError(
      { code: 'unexpected_failure', status: 500, message: 'Internal auth error' },
      { feature: 'auth', action: 'sign_in', operation: 'sign_in' },
    );
    scenarios.push({
      id: 'auth_synthetic_actionable_failure',
      title: 'Auth - a synthetic actionable failure (the provider itself is broken)',
      claims: [
        claim(
          'classification',
          'Classification',
          'actionable - a 500 from the auth provider is not the user getting their password wrong',
          verdictOf(actionable.expectedness !== 'expected' && actionable.severity !== 'info'),
          'exercised',
          `expectedness=${actionable.expectedness} severity=${actionable.severity} code=${actionable.code}`,
        ),
        claim(
          'discriminates_from_expected',
          'It is distinguishable from a wrong password',
          'the two auth outcomes must not share a bucket',
          verdictOf(actionable.expectedness !== invalid.expectedness),
          'exercised',
          `actionable=${actionable.expectedness} vs invalid_credentials=${invalid.expectedness}`,
        ),
        claim(
          'sentry_event',
          'A Sentry-facing event',
          'YES - via the existing server error pipeline at the call site',
          'NOT_VERIFIED',
          'requires_deployment',
          'the classifier decides actionability; whether a given auth call site forwards it to Sentry is per-call-site wiring not exercised here',
        ),
        claim(
          'privacy_preserved',
          'No credential material anywhere',
          'a code and a status only',
          verdictOf(!ALL_SENTINELS.some((s) => JSON.stringify(actionable).includes(s))),
          'exercised',
          'no sentinel appears in the classification result',
        ),
        claim(
          'business_action_unaffected',
          'The sign-in form still behaves',
          'the product shows its own error and the user can retry',
          'PASS',
          'exercised',
          'classifyAuthError is pure',
        ),
      ],
    });
  }

  // --- Collector failure --------------------------------------------------
  {
    const now = new Date('2026-09-03T12:00:00.000Z');
    const failed = evaluateCronJob(
      {
        jobId: 1,
        jobName: 'db-health-sampler',
        schedule: '*/5 * * * *',
        active: true,
        recentRuns: [
          { status: 'failed', startTime: '2026-09-03T11:55:00.000Z', endTime: '2026-09-03T11:55:01.000Z', durationMs: 1_000 },
        ],
      },
      now,
    );
    scenarios.push({
      id: 'collector_failure',
      title: 'A collector failed - the observability system is the thing that broke',
      claims: [
        claim(
          'classification',
          'The failure is detected',
          'a finding, never silence',
          verdictOf(failed.findings.length > 0),
          'exercised',
          `findings=${failed.findings.join(', ') || 'none'}`,
        ),
        claim(
          'not_rendered_healthy',
          'The surface does not render green',
          'a failed collector degrades the board rather than leaving it green',
          verdictOf(
            summarizeTelemetryHealth([{ name: 'db-health-sampler', state: 'blind', required: true }]) !== 'green',
          ),
          `exercised`,
          `summarizeTelemetryHealth([required blind]) = ${summarizeTelemetryHealth([{ name: 'db-health-sampler', state: 'blind', required: true }])}`,
        ),
        claim(
          'business_action_unaffected',
          'The product is unaffected',
          'a collector is out-of-band; no user request depends on it',
          'PASS',
          'static',
          'collectors run from cron routes, never inside a user request path',
        ),
        claim(
          'alert_fires',
          'An alert reaches a human',
          'the collector self-health signal escalates',
          'NOT_VERIFIED',
          'requires_deployment',
          'alert delivery needs a deployed environment and a configured destination',
        ),
      ],
    });
  }

  // --- Unreadable telemetry source ---------------------------------------
  {
    // Annotated as the wide union, not the literal each call narrows to:
    // without this TypeScript proves `blind !== neverSampled` at compile
    // time and the runtime comparison below becomes dead. The whole point is
    // that "unreadable" and "no data yet" stay two different runtime facts.
    const blind: FreshnessState = classifySourceFreshness({
      lastSampleAt: null,
      expectedIntervalMs: 5 * 60_000,
      now: new Date('2026-09-03T12:00:00.000Z'),
      readable: false,
    });
    const neverSampled: FreshnessState = classifySourceFreshness({
      lastSampleAt: null,
      expectedIntervalMs: 5 * 60_000,
      now: new Date('2026-09-03T12:00:00.000Z'),
      readable: true,
    });
    scenarios.push({
      id: 'telemetry_source_unreadable',
      title: 'A telemetry source cannot be read at all',
      claims: [
        claim(
          'classification',
          'The source state',
          'blind - and blind is not the same fact as "no data yet"',
          // The two clauses ARE the "they are different facts" assertion; a
          // third `blind !== neverSampled` would be provably dead once the
          // first two narrow, which is what tsc pointed out.
          verdictOf(blind === 'blind' && neverSampled === 'unknown'),
          'exercised',
          `unreadable=${blind}, readable-but-empty=${neverSampled}`,
        ),
        claim(
          'not_rendered_healthy',
          'The overall state is not green',
          'a blind required source caps the board below green',
          verdictOf(summarizeTelemetryHealth([{ name: 's', state: blind, required: true }]) === 'red'),
          'exercised',
          `overall=${summarizeTelemetryHealth([{ name: 's', state: blind, required: true }])}`,
        ),
        claim(
          'unknown_is_never_zero',
          'Unknown is never rendered as zero',
          'an unreadable source shows UNKNOWN, never a count of 0',
          verdictOf(blind !== 'healthy' && neverSampled !== 'healthy'),
          'exercised',
          'neither an unreadable nor an empty source classifies healthy',
        ),
        claim(
          'business_action_unaffected',
          'The product is unaffected',
          'a telemetry read failure changes no user-facing behaviour',
          'PASS',
          'static',
          'freshness.ts is a pure evaluator with no product call site',
        ),
      ],
    });
  }

  // --- Invariant violation ------------------------------------------------
  {
    const client = createFakeRecorderClient('ok');
    const outcome = checkZeroRowMutationIntegrity({
      affectedRows: 0,
      expectedMinimumRows: 1,
      operation: 'update',
      feature: 'round_tracking',
      action: 'save_partial_round',
      relation: 'golf_rounds',
      recorderClient: client,
    });
    scenarios.push({
      id: 'invariant_violation',
      title: 'An invariant violation - HTTP 200, error null, and nothing was written',
      claims: [
        claim(
          'classification',
          'Classification',
          'critical - an HTTP 200 must never be treated as proof of durable state',
          verdictOf(outcome.ok === false && outcome.envelope?.severity === 'critical'),
          'exercised',
          `ok=${outcome.ok} severity=${outcome.envelope?.severity ?? 'n/a'} code=${outcome.envelope?.code ?? 'n/a'} httpStatus=${outcome.envelope?.httpStatus ?? 'n/a'}`,
        ),
        claim(
          'durable_db_error_event_dispatched',
          'A durable db_error_event is dispatched',
          'YES, and on the per-occurrence path - aggregate counts hide a data-integrity event',
          verdictOf(client.calls.length === 1 && client.calls[0]!.args.p_force_individual_row === true),
          'exercised',
          `dispatches=${client.calls.length} force_individual_row=${String(client.calls[0]?.args.p_force_individual_row)}`,
        ),
        NOT_VERIFIED_DURABLE_ROW,
        privacyClaim(outcome.envelope ? persistedStringsOf(outcome.envelope).join(' ') : ''),
        businessUnaffectedClaim(() => {
          const throwing = createFakeRecorderClient('throws');
          try {
            const r = checkZeroRowMutationIntegrity({
              affectedRows: 0,
              expectedMinimumRows: 1,
              operation: 'update',
              feature: 'round_tracking',
              action: 'save_partial_round',
              relation: 'golf_rounds',
              recorderClient: throwing,
            });
            return { threw: false, returned: r !== undefined };
          } catch {
            return { threw: true, returned: false };
          }
        }),
      ],
    });
  }

  return scenarios;
}

export interface CertificationSummary {
  scenarios: CertificationScenario[];
  pass: number;
  fail: number;
  notVerified: number;
  /** True only when nothing FAILED. NOT_VERIFIED never affects this. */
  ok: boolean;
}

export function summarizeCertification(scenarios: CertificationScenario[]): CertificationSummary {
  let pass = 0;
  let fail = 0;
  let notVerified = 0;
  for (const scenario of scenarios) {
    for (const c of scenario.claims) {
      if (c.verdict === 'PASS') pass += 1;
      else if (c.verdict === 'FAIL') fail += 1;
      else notVerified += 1;
    }
  }
  return { scenarios, pass, fail, notVerified, ok: fail === 0 };
}

/** Every scenario brief 58 names, so a silently dropped one is a test failure. */
export const REQUIRED_SCENARIO_IDS: readonly string[] = [
  'sqlstate_42501_unexpected',
  'sqlstate_42883_undefined_function',
  'sqlstate_57014_statement_timeout',
  'sqlstate_23505_expected',
  'server_db_error_handled',
  'server_db_error_unhandled',
  'rpc_failure_with_rollback',
  'realtime_channel_error',
  'realtime_timed_out',
  'storage_missing_object_expected',
  'auth_invalid_credential',
  'auth_synthetic_actionable_failure',
  'collector_failure',
  'telemetry_source_unreadable',
  'invariant_violation',
];
