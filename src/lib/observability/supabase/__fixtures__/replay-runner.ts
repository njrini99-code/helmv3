/**
 * Replay engine — brief §57.
 *
 * Runs each fixture through the REAL production pipeline
 * (`observeSupabaseResult` / `checkZeroRowMutationIntegrity`, which compose
 * the real `classifyPostgrestError`, `classifyBucket`,
 * `buildSupabaseErrorEnvelope` and `recordDbErrorOutOfBand`) and reports
 * what it observed. It asserts nothing; the vitest suite and the CLI runner
 * each decide what to do with the result, so one engine serves both.
 *
 * THE FAKE CLIENT IS THE WHOLE SAFETY ARGUMENT. `createFakeRecorderClient`
 * records the RPC name and arguments and returns a synthetic id. It performs
 * no I/O of any kind. Because it is passed in explicitly
 * (`RecordDbErrorOptions.client`), a replay can never construct an admin
 * client, never read a service-role secret, and never reach production, a
 * preview, or a local stack — the safety property holds by construction, not
 * by remembering to set an environment variable.
 */

import { observeSupabaseResult } from '../observe-result';
import { checkZeroRowMutationIntegrity } from '../integrity';
import { classifyBucket, type SupabaseFailureBucket } from '../observe-result';
import { recordDbErrorOutOfBand, type DbErrorRecorderClient } from '../record-db-error';
import type { SupabaseErrorEnvelope } from '../envelope';
import { REPLAY_ENVIRONMENT, type ReplayFixture } from './replay-fixtures';

export interface RecordedRpcCall {
  name: string;
  args: Record<string, unknown>;
}

export interface FakeRecorderClient extends DbErrorRecorderClient {
  readonly calls: RecordedRpcCall[];
}

/**
 * @param behaviour
 *   'ok'                    — the RPC succeeds and returns an id.
 *   'migration-not-applied' — the shape a HELD migration produces today
 *                             (`record_db_error_event` does not exist in
 *                             production; see supabase/migrations/HELD.md).
 *   'throws'                — the client itself blows up, to exercise the
 *                             fail-open catch rather than the error branch.
 */
export function createFakeRecorderClient(
  behaviour: 'ok' | 'migration-not-applied' | 'throws' = 'ok',
): FakeRecorderClient {
  const calls: RecordedRpcCall[] = [];
  return {
    calls,
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (behaviour === 'throws') throw new Error('fake recorder client failure');
      if (behaviour === 'migration-not-applied') {
        return Promise.resolve({
          data: null,
          error: { code: 'PGRST202', message: 'Could not find the function public.record_db_error_event' },
        });
      }
      return Promise.resolve({ data: 'replay-error-id', error: null });
    },
  };
}

export interface ReplayObservation {
  id: string;
  title: string;
  bucket: SupabaseFailureBucket | null;
  code: string | null;
  sqlstate: string | null;
  severity: SupabaseErrorEnvelope['severity'] | null;
  expectedness: SupabaseErrorEnvelope['expectedness'] | null;
  retryability: SupabaseErrorEnvelope['retryability'] | null;
  fingerprint: string;
  recorded: boolean;
  forceIndividualRow: boolean;
  /** The envelope, when one was built — for the privacy sweep. */
  envelope: SupabaseErrorEnvelope | null;
  /** Exactly what the recorder would have sent, when it ran. */
  recorderCalls: RecordedRpcCall[];
}

/**
 * `forceIndividualRow` as the RECORDER received it, read out of the RPC
 * arguments rather than re-derived from the fixture — the point is to prove
 * the value survived the whole path, not that we can restate it.
 */
function readForceIndividualRow(calls: RecordedRpcCall[]): boolean {
  const arg = calls[0]?.args.p_force_individual_row;
  return arg === true;
}

export function replayFixture(fixture: ReplayFixture): ReplayObservation {
  const client = createFakeRecorderClient('ok');

  if (fixture.path === 'observe_result') {
    const outcome = observeSupabaseResult({
      ...fixture.input,
      environment: REPLAY_ENVIRONMENT,
      // Pinned so a fixture's fingerprint and envelope never depend on which
      // machine or deploy ran it.
      runtime: 'node',
      releaseSha: null,
      recorderClient: client,
    });
    const envelope = outcome.envelope;
    return {
      id: fixture.id,
      title: fixture.title,
      bucket: outcome.bucket,
      code: envelope?.code ?? null,
      sqlstate: envelope?.sqlstate ?? null,
      severity: envelope?.severity ?? null,
      expectedness: envelope?.expectedness ?? null,
      retryability: envelope?.retryability ?? null,
      fingerprint: envelope?.fingerprint ?? '',
      recorded: envelope !== null,
      forceIndividualRow: readForceIndividualRow(client.calls),
      envelope,
      recorderCalls: client.calls,
    };
  }

  const outcome = checkZeroRowMutationIntegrity({
    ...fixture.input,
    recorderClient: client,
  });
  const envelope = outcome.envelope;
  return {
    id: fixture.id,
    title: fixture.title,
    // The integrity path does not go through `classifyBucket` itself — it
    // builds a critical envelope directly — so the bucket is derived from
    // the envelope it produced, using the same function the other path uses.
    bucket: envelope ? classifyBucket(envelope.expectedness, envelope.severity) : null,
    code: envelope?.code ?? null,
    sqlstate: envelope?.sqlstate ?? null,
    severity: envelope?.severity ?? null,
    expectedness: envelope?.expectedness ?? null,
    retryability: envelope?.retryability ?? null,
    fingerprint: envelope?.fingerprint ?? '',
    recorded: envelope !== null,
    forceIndividualRow: readForceIndividualRow(client.calls),
    envelope,
    recorderCalls: client.calls,
  };
}

export interface ReplayComparison {
  id: string;
  title: string;
  observed: ReplayObservation;
  /** Field-by-field mismatches. Empty means the fixture's contract held. */
  mismatches: { field: string; expected: unknown; observed: unknown }[];
  ok: boolean;
}

export function compareFixture(fixture: ReplayFixture): ReplayComparison {
  const observed = replayFixture(fixture);
  const e = fixture.expected;
  const mismatches: { field: string; expected: unknown; observed: unknown }[] = [];
  const check = (field: string, expected: unknown, actual: unknown) => {
    if (expected !== actual) mismatches.push({ field, expected, observed: actual });
  };

  check('bucket', e.bucket, observed.bucket);
  check('recorded', e.recorded, observed.recorded);
  check('fingerprint', e.fingerprint, observed.fingerprint);
  check('forceIndividualRow', e.forceIndividualRow, observed.forceIndividualRow);
  if (e.recorded) {
    check('code', e.code, observed.code);
    check('sqlstate', e.sqlstate, observed.sqlstate);
    check('severity', e.severity, observed.severity);
    check('expectedness', e.expectedness, observed.expectedness);
    check('retryability', e.retryability, observed.retryability);
  }

  return { id: fixture.id, title: fixture.title, observed, mismatches, ok: mismatches.length === 0 };
}

/**
 * Every string a fixture's envelope would persist. The privacy sweep asserts
 * over this exact set, so a sentinel hiding in a field nobody thought to
 * check still fails.
 *
 * `safeMetadata` is INCLUDED even though `buildSupabaseErrorEnvelope`
 * documents that it does not sanitize that bag (the producer allow-lists it
 * instead). Including it means the sweep would catch a future caller that
 * put free text there — the check is stricter than the contract, on purpose.
 */
export function persistedStringsOf(envelope: SupabaseErrorEnvelope): string[] {
  const out: string[] = [envelope.fingerprint, envelope.normalizedMessage];
  if (envelope.safeDetails !== null) out.push(envelope.safeDetails);
  if (envelope.safeHint !== null) out.push(envelope.safeHint);
  if (envelope.relation !== null) out.push(envelope.relation);
  if (envelope.rpc !== null) out.push(envelope.rpc);
  if (envelope.safeMetadata) out.push(JSON.stringify(envelope.safeMetadata));
  return out;
}

/**
 * Dedupe (brief §33) as it is ACTUALLY implemented: the fingerprint is the
 * dedupe key, and `record_db_error_event`'s upsert collapses equal keys into
 * one row. This function answers only the half that lives in TypeScript —
 * do two occurrences of one mechanism produce one key, and do two different
 * mechanisms produce two. The row-collapsing half needs the HELD migration
 * applied and is reported NOT VERIFIED.
 */
export function fingerprintGroups(fixtures: readonly ReplayFixture[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const fixture of fixtures) {
    const { fingerprint } = replayFixture(fixture);
    if (fingerprint === '') continue;
    const existing = groups.get(fingerprint) ?? [];
    existing.push(fixture.id);
    groups.set(fingerprint, existing);
  }
  return groups;
}

export async function replayRecorderBehaviour(
  envelope: SupabaseErrorEnvelope,
  behaviour: 'ok' | 'migration-not-applied' | 'throws',
) {
  const client = createFakeRecorderClient(behaviour);
  const outcome = await recordDbErrorOutOfBand(envelope, { client });
  return { outcome, calls: client.calls };
}
