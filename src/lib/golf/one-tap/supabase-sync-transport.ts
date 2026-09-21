import type { SyncResult, SyncTransport } from './anchor-repository';
import type { PenaltyEvent } from './penalty-event';
import type { ShotAnchor } from './shot-anchor';

/** §75/§76 sync outbox transport: the Supabase half of the one-tap outbox.
 *
 * Contract, in full:
 *   1. The local write already happened. Nothing here is on the path to
 *      "Saved" — the repository is the durable record and this only mirrors it.
 *   2. `id` is the idempotency key. Every send is an upsert `on conflict (id)`,
 *      so the same payload sent twice produces one row and the same final
 *      state. `acceptedIds` comes from the server's returned ids, never from
 *      the ids we sent, so a partial accept leaves the rest queued.
 *   3. A tombstone is an ordinary upsert of a row carrying `deleted_at`. There
 *      is no delete call, and the tables have no delete policy.
 *   4. Only the privacy-minimized columns leave the device (§71). The raw GNSS
 *      sample window has no column, no key and no code path here.
 *   5. A failure throws; the queue's retry ladder owns the backoff.
 *
 * The client is taken structurally rather than as `SupabaseClient<Database>`:
 * these tables post-date the generated types, and a narrow interface is also
 * what makes the payload testable without a network. A real browser client is
 * passed as `supabaseSyncTransport(client as unknown as OneTapSyncClient)`
 * until `npm run db:types` regenerates the schema.
 */
export const ONE_TAP_ANCHOR_TABLE = 'golf_shot_anchors';
export const ONE_TAP_PENALTY_TABLE = 'golf_penalty_events';
export const ONE_TAP_ROUND_BINDING_TABLE = 'golf_round_course_bindings';

export interface OneTapUpsertResult { data: { id: string }[] | null; error: { message: string } | null }
export interface OneTapUpsertBuilder { select(columns: string): PromiseLike<OneTapUpsertResult> }
export interface OneTapTableBuilder { upsert(rows: readonly Record<string, unknown>[], options: { onConflict: string }): OneTapUpsertBuilder }
export interface OneTapSyncClient { from(table: string): OneTapTableBuilder }

/** A round id has to be a real `golf_rounds` uuid before it can be sent: the
 * column is `uuid not null references golf_rounds(id)`. The lab drives rounds
 * by free-form string ids, and posting one of those would be a permanent 400
 * that the retry ladder could never clear. Such rows are reported as rejected
 * and stay queued locally, which is honest — the device kept them. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isSyncableRoundId(roundId: string): boolean { return UUID_RE.test(roundId); }

/** The exact column set an anchor upsert sends. Exported so a test can assert
 * the payload's keys EQUAL this list: that fails the moment anyone adds a
 * field to `ShotAnchor` and wires it through, which is how a raw sample window
 * would come back. There is deliberately no created_at/updated_at — the server
 * owns those — and deliberately no raw-sample key of any kind. */
export const ANCHOR_SYNC_COLUMNS = [
  'id', 'round_id', 'course_id', 'site_id', 'hole_key', 'hole_id', 'sequence',
  'tap_at', 'finalized_at', 'provisional',
  'lon', 'lat', 'alt_m', 'e_m', 'n_m', 'u_m',
  'cov_ee', 'cov_en', 'cov_ne', 'cov_nn',
  'sigma_m', 'reported_accuracy_median_m', 'calibrated_uncertainty_m',
  'capture_motion', 'lie_posterior', 'primary_lie', 'confidence',
  'terrain_elevation_m', 'terrain_slope_degrees', 'terrain_aspect_degrees',
  'geometry_version', 'terrain_version', 'terminal', 'terminal_method',
  'estimator_summary', 'classification', 'schema_version', 'deleted_at',
] as const;
export const PENALTY_SYNC_COLUMNS = [
  'id', 'round_id', 'course_id', 'site_id', 'hole_key', 'hole_id',
  'occurred_at', 'strokes', 'kind', 'related_anchor_id', 'schema_version', 'deleted_at',
] as const;

export function anchorRow(anchor: ShotAnchor): Record<string, unknown> {
  return {
    id: anchor.id, round_id: anchor.roundId, course_id: anchor.courseId, site_id: anchor.siteId,
    hole_key: anchor.holeKey, hole_id: anchor.holeId, sequence: anchor.sequence,
    tap_at: anchor.tapTimestamp, finalized_at: anchor.finalizedTimestamp, provisional: anchor.provisional,
    lon: anchor.positionWgs84[0], lat: anchor.positionWgs84[1], alt_m: anchor.positionWgs84[2],
    e_m: anchor.positionENU[0], n_m: anchor.positionENU[1], u_m: anchor.positionENU[2],
    cov_ee: anchor.covarianceENU2D[0][0], cov_en: anchor.covarianceENU2D[0][1],
    cov_ne: anchor.covarianceENU2D[1][0], cov_nn: anchor.covarianceENU2D[1][1],
    sigma_m: anchor.sigmaM, reported_accuracy_median_m: anchor.reportedAccuracyMedianM,
    calibrated_uncertainty_m: anchor.calibratedUncertaintyM,
    capture_motion: anchor.captureMotion, lie_posterior: anchor.liePosterior,
    primary_lie: anchor.primaryLie, confidence: anchor.confidence,
    terrain_elevation_m: anchor.terrainElevationMeters, terrain_slope_degrees: anchor.terrainSlopeDegrees,
    terrain_aspect_degrees: anchor.terrainAspectDegrees,
    geometry_version: anchor.geometryVersion, terrain_version: anchor.terrainVersion,
    terminal: anchor.terminal, terminal_method: anchor.terminalMethod,
    estimator_summary: anchor.estimatorSummary, classification: anchor.classification,
    schema_version: anchor.schemaVersion, deleted_at: anchor.deletedAt,
  };
}
export function penaltyRow(event: PenaltyEvent): Record<string, unknown> {
  return {
    id: event.id, round_id: event.roundId, course_id: event.courseId, site_id: event.siteId,
    hole_key: event.holeKey, hole_id: event.holeId, occurred_at: event.createdAt,
    strokes: event.strokes, kind: event.kind, related_anchor_id: event.relatedAnchorId,
    schema_version: event.schemaVersion, deleted_at: event.deletedAt,
  };
}

/** §73 round-course binding. One row per round, written once when a round
 * enters One-Tap mode; it is not part of the per-tap outbox. */
export interface RoundCourseBinding {
  roundId: string; courseId: string; siteId: string;
  geometryVersion: string; terrainVersion: string | null; oneTapMode: boolean;
}

export class SupabaseSyncTransport implements SyncTransport {
  constructor(private readonly client: OneTapSyncClient) {}

  async upsertAnchors(anchors: readonly ShotAnchor[]): Promise<SyncResult> {
    return this.upsert(ONE_TAP_ANCHOR_TABLE, anchors, a => a.id, a => a.roundId, anchorRow);
  }

  async upsertPenalties(events: readonly PenaltyEvent[]): Promise<SyncResult> {
    return this.upsert(ONE_TAP_PENALTY_TABLE, events, e => e.id, e => e.roundId, penaltyRow);
  }

  /** Retired legacy payload cannot establish a replayable world. Use the
   * immutable round-binding RPC, which also snapshots the saved scorecard. */
  async upsertRoundBinding(binding: RoundCourseBinding): Promise<SyncResult> {
    return { acceptedIds: [], rejectedIds: [binding.roundId] };
  }

  private async upsert<T>(
    table: string,
    records: readonly T[],
    idOf: (record: T) => string,
    roundIdOf: (record: T) => string,
    toRow: (record: T) => Record<string, unknown>,
  ): Promise<SyncResult> {
    const sendable = records.filter(r => isSyncableRoundId(roundIdOf(r)));
    const rejectedIds = records.filter(r => !isSyncableRoundId(roundIdOf(r))).map(idOf);
    if (!sendable.length) return { acceptedIds: [], rejectedIds };
    // `onConflict: 'id'` + `.select('id')` is the whole idempotency story:
    // the first send inserts, every later send updates the same row, and the
    // ids that come back are the ones the server is now holding.
    const { data, error } = await this.client.from(table).upsert(sendable.map(toRow), { onConflict: 'id' }).select('id');
    if (error) throw new Error(`one-tap ${table} sync failed: ${error.message}`);
    const returned = new Set((data ?? []).map(row => row.id));
    return { acceptedIds: sendable.map(idOf).filter(id => returned.has(id)), rejectedIds };
  }
}

export function supabaseSyncTransport(client: OneTapSyncClient): SupabaseSyncTransport {
  return new SupabaseSyncTransport(client);
}
