/**
 * P2-22 — Arccos external-round ingest must be transactional.
 *
 * The adapter now writes each new round through the `ingest_external_round_atomic`
 * RPC (one transaction: round + holes + shots). These tests assert the two
 * audit acceptance criteria at the adapter seam:
 *
 *   1. A hole/shot insert failure rolls back the round insert — i.e. when the
 *      RPC reports failure, the adapter counts ZERO rounds_inserted and surfaces
 *      an error (no orphaned partial round is recorded as success).
 *   2. A failed item is retried on the next sync — because nothing was persisted,
 *      the round is still ABSENT from the dedup set, so a re-run re-attempts it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ArccosRound } from '@/lib/coachhelm/v3/ingest/providers/arccos-client';
import type { IngestConnection } from '@/lib/coachhelm/v3/ingest/types';

// ── Mock the admin Supabase client + the Arccos HTTP client ───────────────────
const { createAdminClientMock, fetchRoundsMock, refreshAccessTokenMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  fetchRoundsMock: vi.fn(),
  refreshAccessTokenMock: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}));

vi.mock('@/lib/coachhelm/v3/ingest/providers/arccos-client', () => ({
  fetchRounds: (...args: unknown[]) => fetchRoundsMock(...args),
  refreshAccessToken: (...args: unknown[]) => refreshAccessTokenMock(...args),
}));

const TEST_KEY = 'c'.repeat(64);

function makeRound(id = 'arccos-round-xyz'): ArccosRound {
  return {
    id,
    round_date: '2025-06-01',
    course_name: 'Augusta National',
    course_id: 'aug-1',
    course_city: 'Augusta',
    course_state: 'GA',
    tees_played: 'Member',
    total_score: 70,
    total_putts: 28,
    weather_conditions: 'clear',
    holes: [
      {
        hole_number: 1,
        par: 4,
        yardage: 445,
        score: 4,
        putts: 2,
        fairway_hit: true,
        gir: true,
        shots: [
          {
            id: 's1',
            club: 'Driver',
            distance_yards: 300,
            lie: 'tee',
            result: 'fairway',
            distance_to_pin_before: 445,
            distance_to_pin_after: 145,
            shot_number: 1,
            is_penalty: false,
          },
        ],
      },
    ],
  };
}

function makeConnection(overrides: Partial<IngestConnection> = {}): IngestConnection {
  return {
    player_id: 'player-1',
    provider: 'arccos',
    access_token_encrypted: '',
    refresh_token_encrypted: null,
    expires_at: null,
    last_synced_at: null,
    state: 'active',
    ...overrides,
  };
}

/**
 * Minimal admin-client double:
 *  - `.from('golf_rounds').select().eq().in()` → the dedup query (no existing rows)
 *  - `.rpc('ingest_external_round_atomic', …)` → driven by `rpcResult`
 */
function makeAdminClient(rpcResult: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const dedupChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  return {
    rpc,
    from: vi.fn(() => dedupChain),
    _rpc: rpc,
    _dedup: dedupChain,
  };
}

describe('arccos adapter — transactional ingest (P2-22)', () => {
  beforeEach(() => {
    vi.stubEnv('ARCCOS_CLIENT_ID', 'id');
    vi.stubEnv('ARCCOS_CLIENT_SECRET', 'secret');
    vi.stubEnv('INGEST_ENCRYPTION_KEY', TEST_KEY);
    fetchRoundsMock.mockReset();
    refreshAccessTokenMock.mockReset();
    createAdminClientMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function loadAdapter() {
    const mod = await import('@/lib/coachhelm/v3/ingest/providers/arccos');
    return mod.default;
  }

  async function encryptedAccessToken() {
    const { encryptToken } = await import('@/lib/coachhelm/v3/ingest/providers/arccos');
    return encryptToken('live-access');
  }

  it('rolls back the round when the atomic RPC reports failure (no partial round counted)', async () => {
    fetchRoundsMock.mockResolvedValue([makeRound()]);
    // RPC fails (e.g. a hole/shot insert raised → whole tx rolled back).
    const client = makeAdminClient({
      data: null,
      error: { message: 'null value in column "hole_number" violates not-null constraint' },
    });
    createAdminClientMock.mockReturnValue(client);

    const adapter = await loadAdapter();
    const result = await adapter.sync(makeConnection({ access_token_encrypted: await encryptedAccessToken() }));

    // Round was NOT persisted as success — zero counted, error surfaced.
    expect(result.rounds_inserted).toBe(0);
    expect(result.shots_inserted).toBe(0);
    expect(result.errors_count).toBe(1);
    expect(result.error_detail).toContain('arccos-round-xyz');

    // It went through the transactional RPC, not three separate table inserts.
    expect(client._rpc).toHaveBeenCalledWith(
      'ingest_external_round_atomic',
      expect.objectContaining({
        p_round: expect.any(Object),
        p_holes: expect.any(Array),
        p_shots: expect.any(Array),
      }),
    );
  });

  it('retries a previously-failed round on the next sync (still absent → not deduped → counted)', async () => {
    fetchRoundsMock.mockResolvedValue([makeRound()]);
    // The failed round left NO row, so the dedup query still returns []. This
    // run's RPC succeeds → the round is finally imported.
    const client = makeAdminClient({
      data: { success: true, round_id: 'new-uuid', holes_inserted: 1, shots_inserted: 1 },
      error: null,
    });
    createAdminClientMock.mockReturnValue(client);

    const adapter = await loadAdapter();
    const result = await adapter.sync(makeConnection({ access_token_encrypted: await encryptedAccessToken() }));

    expect(result.rounds_inserted).toBe(1);
    expect(result.shots_inserted).toBe(1);
    expect(result.errors_count).toBe(0);
  });
});
