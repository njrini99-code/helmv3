import { describe, expect, it } from 'vitest';
import {
  ANCHOR_SYNC_COLUMNS, ONE_TAP_ANCHOR_TABLE, ONE_TAP_PENALTY_TABLE, ONE_TAP_ROUND_BINDING_TABLE,
  PENALTY_SYNC_COLUMNS, SupabaseSyncTransport, anchorRow, isSyncableRoundId, supabaseSyncTransport,
  type OneTapSyncClient, type OneTapUpsertResult,
} from '../supabase-sync-transport';
import type { PenaltyEvent } from '../penalty-event';
import type { ShotAnchor } from '../shot-anchor';

const ROUND = '3f1c2b90-5a4d-4e8b-9c11-0a2b3c4d5e6f';

// SYNTHETIC TEST VECTOR
function anchor(id: string, overrides: Partial<ShotAnchor> = {}): ShotAnchor {
  return {
    schemaVersion: 2, id, roundId: ROUND, courseId: 'peek-n-peak-upper', siteId: 'osm-way-136097904',
    holeKey: 'peek-n-peak-upper-07', holeId: 7, sequence: 0, tapTimestamp: '2026-09-17T12:00:00.000Z',
    finalizedTimestamp: '2026-09-17T12:00:02.000Z', provisional: false,
    positionWgs84: [-79.744, 42.06, 512.5], positionENU: [12.5, -4.25, 512.5],
    covarianceENU2D: [[4, 0.5], [0.5, 9]], sigmaM: 3, reportedAccuracyMedianM: 4.5, calibratedUncertaintyM: 4.5,
    captureMotion: 'stationary', liePosterior: [{ featureId: 'f1', lieClass: 'fairway', p: 0.92 }],
    primaryLie: 'fairway', confidence: 'HIGH', terrainElevationMeters: 512.5, terrainSlopeDegrees: 2.1,
    terrainAspectDegrees: 180, geometryVersion: 'g-hash', terrainVersion: null, terminal: false,
    terminalMethod: null, syncState: 'QUEUED', deletedAt: null,
    estimatorSummary: {
      sampleCount: 9, rejectedResiduals: 1, scatterMajorM: 1.2, scatterMinorM: 0.8, kAcc: 1,
      kAccCalibration: 'provisional', poorAccuracy: false, reportedSpeedMps: 0.1, displacementM: 0.3,
      basis: 'weighted_mean_of_window',
    },
    classification: { method: 'exact', sampleCount: 0, edgeSigmaM: 3, basis: 'canonical_partition' },
    ...overrides,
  };
}
function penalty(id: string, overrides: Partial<PenaltyEvent> = {}): PenaltyEvent {
  return {
    schemaVersion: 1, id, roundId: ROUND, courseId: 'peek-n-peak-upper', siteId: 'osm-way-136097904',
    holeKey: 'peek-n-peak-upper-07', holeId: 7, createdAt: '2026-09-17T12:01:00.000Z', strokes: 1,
    kind: 'penalty_area', relatedAnchorId: 'a1', syncState: 'QUEUED', deletedAt: null, ...overrides,
  };
}

interface UpsertCall { table: string; rows: Record<string, unknown>[]; onConflict: string; selected: string }
/** Stands in for PostgREST: an upsert keyed on `onConflict` into a per-table
 * map, so "the same payload twice" really does collapse to one row here too. */
function fakeClient() {
  const calls: UpsertCall[] = [];
  const store = new Map<string, Map<string, Record<string, unknown>>>();
  let error: { message: string } | null = null;
  let acceptOnly: string[] | null = null;
  const client: OneTapSyncClient = {
    from(table) {
      return {
        upsert(rows, options) {
          return {
            select(selected): PromiseLike<OneTapUpsertResult> {
              calls.push({ table, rows: rows.map(r => ({ ...r })), onConflict: options.onConflict, selected });
              if (error) return Promise.resolve({ data: null, error });
              const rowsForTable = store.get(table) ?? new Map<string, Record<string, unknown>>();
              store.set(table, rowsForTable);
              const returned: { id: string }[] = [];
              for (const row of rows) {
                const key = String(row[options.onConflict]);
                if (acceptOnly && !acceptOnly.includes(key)) continue;
                rowsForTable.set(key, { ...row });
                returned.push({ id: String(row[selected]) });
              }
              return Promise.resolve({ data: returned, error: null });
            },
          };
        },
      };
    },
  };
  return {
    client, calls, store,
    rows: (table: string) => [...(store.get(table)?.values() ?? [])],
    failWith(message: string | null) { error = message ? { message } : null; },
    acceptOnlyIds(ids: string[] | null) { acceptOnly = ids; },
  };
}

describe('supabase one-tap sync transport', () => {
  it('sends exactly the privacy-minimized columns and no raw sample window', async () => {
    const fake = fakeClient();
    await supabaseSyncTransport(fake.client).upsertAnchors([anchor('00000001-a')]);
    const row = fake.calls[0]!.rows[0]!;
    // Key-set EQUALITY, not "does not contain": adding any field to ShotAnchor
    // and wiring it through fails here, which is how a raw window comes back.
    expect(Object.keys(row).sort()).toEqual([...ANCHOR_SYNC_COLUMNS].sort());
    const payload = JSON.stringify(row);
    for (const forbidden of ['rawLocationSamples', 'samples', 'horizontalAccuracyM', 'timestampMs', 'headingDegrees']) {
      expect(payload).not.toContain(forbidden);
    }
    expect(row).toMatchObject({
      round_id: ROUND, hole_key: 'peek-n-peak-upper-07', hole_id: 7,
      lon: -79.744, lat: 42.06, e_m: 12.5, n_m: -4.25, u_m: 512.5,
      cov_ee: 4, cov_en: 0.5, cov_ne: 0.5, cov_nn: 9, sigma_m: 3, schema_version: 2,
    });
    expect(fake.calls[0]).toMatchObject({ table: ONE_TAP_ANCHOR_TABLE, onConflict: 'id', selected: 'id' });
  });

  it('upserts on the anchor id, so the same payload sent twice is one row and the same result', async () => {
    const fake = fakeClient();
    const transport = new SupabaseSyncTransport(fake.client);
    const batch = [anchor('00000001-a'), anchor('00000002-b', { sequence: 1 })];
    const first = await transport.upsertAnchors(batch);
    const second = await transport.upsertAnchors(batch);
    expect(first.acceptedIds).toEqual(['00000001-a', '00000002-b']);
    expect(second.acceptedIds).toEqual(first.acceptedIds);
    expect(fake.rows(ONE_TAP_ANCHOR_TABLE)).toHaveLength(2);
    expect(fake.calls).toHaveLength(2);
  });

  it('synchronizes a tombstone as an ordinary upsert carrying deleted_at', async () => {
    const fake = fakeClient();
    const transport = new SupabaseSyncTransport(fake.client);
    await transport.upsertAnchors([anchor('00000001-a')]);
    expect(fake.rows(ONE_TAP_ANCHOR_TABLE)[0]!.deleted_at).toBeNull();
    await transport.upsertAnchors([anchor('00000001-a', { deletedAt: '2026-09-17T12:00:09.000Z', terminal: false })]);
    expect(fake.rows(ONE_TAP_ANCHOR_TABLE)).toHaveLength(1);
    expect(fake.rows(ONE_TAP_ANCHOR_TABLE)[0]!.deleted_at).toBe('2026-09-17T12:00:09.000Z');
    // No delete call exists: every table touch is an upsert.
    expect(fake.calls.every(c => c.onConflict === 'id')).toBe(true);
  });

  it('accepts only the ids the server returns, leaving a partial batch for the next attempt', async () => {
    const fake = fakeClient();
    fake.acceptOnlyIds(['00000001-a']);
    const result = await new SupabaseSyncTransport(fake.client).upsertAnchors([anchor('00000001-a'), anchor('00000002-b', { sequence: 1 })]);
    expect(result.acceptedIds).toEqual(['00000001-a']);
  });

  it('throws on a server error so the queue owns the backoff', async () => {
    const fake = fakeClient();
    fake.failWith('permission denied for table golf_shot_anchors');
    await expect(new SupabaseSyncTransport(fake.client).upsertAnchors([anchor('00000001-a')])).rejects.toThrow(/golf_shot_anchors sync failed/);
  });

  it('refuses a round id that is not a golf_rounds uuid instead of posting a permanent 400', async () => {
    const fake = fakeClient();
    const result = await new SupabaseSyncTransport(fake.client).upsertAnchors([anchor('00000001-a', { roundId: 'lab-round' })]);
    expect(result).toEqual({ acceptedIds: [], rejectedIds: ['00000001-a'] });
    expect(fake.calls).toHaveLength(0);
    expect(isSyncableRoundId('lab-round')).toBe(false);
    expect(isSyncableRoundId(ROUND)).toBe(true);
  });

  it('sends penalties as their own rows, with the client clock and the mark they follow', async () => {
    const fake = fakeClient();
    const transport = new SupabaseSyncTransport(fake.client);
    const events = [penalty('p1'), penalty('p2', { kind: 'lost_ball', strokes: 1, relatedAnchorId: null })];
    expect((await transport.upsertPenalties(events)).acceptedIds).toEqual(['p1', 'p2']);
    expect((await transport.upsertPenalties(events)).acceptedIds).toEqual(['p1', 'p2']);
    expect(fake.rows(ONE_TAP_PENALTY_TABLE)).toHaveLength(2);
    const row = fake.calls[0]!.rows[0]!;
    expect(Object.keys(row).sort()).toEqual([...PENALTY_SYNC_COLUMNS].sort());
    expect(row).toMatchObject({ occurred_at: '2026-09-17T12:01:00.000Z', strokes: 1, kind: 'penalty_area', related_anchor_id: 'a1' });
    // A penalty carries no position of any kind: the phone is with the golfer,
    // not the ball, so an event must never assert where the ball went in.
    for (const positional of ['lat', 'lon', 'alt_m', 'e_m', 'n_m', 'u_m', 'sigma_m', 'lie_posterior']) {
      expect(Object.keys(row)).not.toContain(positional);
    }
    expect(fake.calls[0]!.table).toBe(ONE_TAP_PENALTY_TABLE);
  });

  it('tombstones a penalty by upsert too', async () => {
    const fake = fakeClient();
    const transport = new SupabaseSyncTransport(fake.client);
    await transport.upsertPenalties([penalty('p1')]);
    await transport.upsertPenalties([penalty('p1', { deletedAt: '2026-09-17T12:05:00.000Z' })]);
    expect(fake.rows(ONE_TAP_PENALTY_TABLE)).toHaveLength(1);
    expect(fake.rows(ONE_TAP_PENALTY_TABLE)[0]!.deleted_at).toBe('2026-09-17T12:05:00.000Z');
  });

  it('writes the round-course binding idempotently on round_id', async () => {
    const fake = fakeClient();
    const transport = new SupabaseSyncTransport(fake.client);
    const binding = { roundId: ROUND, courseId: 'peek-n-peak-upper', siteId: 'osm-way-136097904', geometryVersion: 'g-hash', terrainVersion: null, oneTapMode: true };
    expect((await transport.upsertRoundBinding(binding)).acceptedIds).toEqual([ROUND]);
    expect((await transport.upsertRoundBinding(binding)).acceptedIds).toEqual([ROUND]);
    expect(fake.rows(ONE_TAP_ROUND_BINDING_TABLE)).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({ table: ONE_TAP_ROUND_BINDING_TABLE, onConflict: 'round_id' });
    expect(await transport.upsertRoundBinding({ ...binding, roundId: 'lab-round' })).toEqual({ acceptedIds: [], rejectedIds: ['lab-round'] });
  });

  it('maps a provisional anchor with no fix, keeping finalized_at null', async () => {
    const row = anchorRow(anchor('00000001-a', { provisional: true, finalizedTimestamp: null, positionWgs84: [-79.744, 42.06, null], terrainVersion: null, estimatorSummary: null, classification: null }));
    expect(row).toMatchObject({ provisional: true, finalized_at: null, alt_m: null, estimator_summary: null, classification: null });
    expect(Object.keys(row).sort()).toEqual([...ANCHOR_SYNC_COLUMNS].sort());
  });
});
