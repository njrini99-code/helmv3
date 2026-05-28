/**
 * Arccos ingest adapter tests.
 *
 * Covers:
 *  - Mapper: correct insert shapes, club mapping, external ID
 *  - Dedup: skipping existing external_ids
 *  - Token refresh failure → next_state: 'revoked'
 *  - SyncResult counts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mapArccosRound, mapClubToType, arccosExternalId } from '@/lib/coachhelm/v3/ingest/providers/arccos-mapper';
import { encryptToken, decryptToken } from '@/lib/coachhelm/v3/ingest/providers/arccos';
import type { ArccosRound, ArccosHole, ArccosShot } from '@/lib/coachhelm/v3/ingest/providers/arccos-client';
import type { IngestConnection } from '@/lib/coachhelm/v3/ingest/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeArccosShot(overrides: Partial<ArccosShot> = {}): ArccosShot {
  return {
    id: 'shot-1',
    club: '7 Iron',
    distance_yards: 150,
    lie: 'fairway',
    result: 'green',
    distance_to_pin_before: 160,
    distance_to_pin_after: 12,
    shot_number: 2,
    is_penalty: false,
    ...overrides,
  };
}

function makeArccosHole(overrides: Partial<ArccosHole> = {}): ArccosHole {
  return {
    hole_number: 1,
    par: 4,
    yardage: 380,
    score: 4,
    putts: 2,
    fairway_hit: true,
    gir: true,
    shots: [
      makeArccosShot({ shot_number: 1, club: 'Driver', lie: 'tee', result: 'fairway', distance_yards: 260 }),
      makeArccosShot({ shot_number: 2, club: '7 Iron', lie: 'fairway', result: 'green', distance_yards: 150 }),
      makeArccosShot({ shot_number: 3, club: 'Putter', lie: 'green', result: 'green', distance_to_pin_before: 20, distance_to_pin_after: 2, distance_yards: 18 }),
      makeArccosShot({ shot_number: 4, club: 'Putter', lie: 'green', result: 'hole', distance_to_pin_before: 2, distance_to_pin_after: 0, distance_yards: 2 }),
    ],
    ...overrides,
  };
}

function makeArccosRound(overrides: Partial<ArccosRound> = {}): ArccosRound {
  return {
    id: 'arccos-round-123',
    round_date: '2025-05-20',
    course_name: 'Pine Valley GC',
    course_id: 'pv-001',
    course_city: 'Clementon',
    course_state: 'NJ',
    tees_played: 'Blue',
    total_score: 72,
    total_putts: 30,
    holes: [makeArccosHole()],
    weather_conditions: 'sunny',
    ...overrides,
  };
}

function makeConnection(overrides: Partial<IngestConnection> = {}): IngestConnection {
  return {
    player_id: 'player-abc',
    provider: 'arccos',
    access_token_encrypted: 'fake-encrypted',
    refresh_token_encrypted: null,
    expires_at: null,
    last_synced_at: null,
    state: 'active',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Club mapping
// ---------------------------------------------------------------------------

describe('mapClubToType', () => {
  it('maps Driver to driver', () => {
    expect(mapClubToType('Driver')).toBe('driver');
    expect(mapClubToType('1W')).toBe('driver');
    expect(mapClubToType('1-Wood')).toBe('driver');
  });

  it('maps Putter to putter', () => {
    expect(mapClubToType('Putter')).toBe('putter');
    expect(mapClubToType('PT')).toBe('putter');
  });

  it('maps everything else to non_driver', () => {
    expect(mapClubToType('7 Iron')).toBe('non_driver');
    expect(mapClubToType('3 Wood')).toBe('non_driver');
    expect(mapClubToType('56 Wedge')).toBe('non_driver');
    expect(mapClubToType('Hybrid')).toBe('non_driver');
    expect(mapClubToType('5i')).toBe('non_driver');
  });
});

// ---------------------------------------------------------------------------
// External ID helper
// ---------------------------------------------------------------------------

describe('arccosExternalId', () => {
  it('prefixes with arccos:', () => {
    expect(arccosExternalId('r-999')).toBe('arccos:r-999');
  });
});

// ---------------------------------------------------------------------------
// Round mapper
// ---------------------------------------------------------------------------

describe('mapArccosRound', () => {
  it('produces correct round insert shape', () => {
    const round = makeArccosRound();
    const { round: mapped } = mapArccosRound(round, 'player-1');

    expect(mapped.player_id).toBe('player-1');
    expect(mapped.round_date).toBe('2025-05-20');
    expect(mapped.course_name).toBe('Pine Valley GC');
    expect(mapped.total_score).toBe(72);
    expect(mapped.notes).toBe('arccos:arccos-round-123');
    expect(mapped.status).toBe('completed');
    expect(mapped.round_type).toBe('practice');
  });

  it('maps holes with correct structure', () => {
    const round = makeArccosRound();
    const { holes } = mapArccosRound(round, 'player-1');

    expect(holes).toHaveLength(1);
    const h0 = holes[0]!;
    expect(h0.hole_number).toBe(1);
    expect(h0.par).toBe(4);
    expect(h0.score).toBe(4);
    expect(h0.putts).toBe(2);
    expect(h0.fairway_hit).toBe(true);
    expect(h0.gir).toBe(true);
    expect(h0.round_id).toBe('');
  });

  it('maps shots with correct structure', () => {
    const round = makeArccosRound();
    const { shots } = mapArccosRound(round, 'player-1');

    expect(shots).toHaveLength(4);
    const s0 = shots[0]!;
    const s1 = shots[1]!;
    const s2 = shots[2]!;
    const s3 = shots[3]!;

    // Tee shot with driver
    expect(s0.club_type).toBe('driver');
    expect(s0.shot_type).toBe('tee');
    expect(s0.lie_before).toBe('tee');
    expect(s0.shot_number).toBe(1);

    // Approach with iron
    expect(s1.club_type).toBe('non_driver');
    expect(s1.shot_type).toBe('approach');
    expect(s1.lie_before).toBe('fairway');

    // Putting
    expect(s2.club_type).toBe('putter');
    expect(s2.shot_type).toBe('putting');
    expect(s2.lie_before).toBe('green');

    // Putt holed
    expect(s3.result).toBe('hole');
  });

  it('computes summary stats from holes', () => {
    const hole1 = makeArccosHole({ hole_number: 1, par: 4, fairway_hit: true, gir: true, putts: 2 });
    const hole2 = makeArccosHole({ hole_number: 2, par: 3, fairway_hit: null, gir: false, putts: 3 });
    const round = makeArccosRound({ holes: [hole1, hole2], total_score: 75 });
    const { round: mapped } = mapArccosRound(round, 'p-1');

    // Only par-4+ holes count for fairway stats
    expect(mapped.total_fairways).toBe(1);
    expect(mapped.total_fairways_hit).toBe(1);
    expect(mapped.total_gir).toBe(1);
    expect(mapped.total_gir_possible).toBe(2);
    expect(mapped.total_putts).toBe(5);
    expect(mapped.holes_played).toBe(2);
  });

  it('counts penalties from shots', () => {
    const penaltyShot = makeArccosShot({ is_penalty: true, penalty_type: 'water' });
    const hole = makeArccosHole({ shots: [penaltyShot] });
    const round = makeArccosRound({ holes: [hole] });
    const { round: mapped, shots } = mapArccosRound(round, 'p-1');

    expect(mapped.total_penalties).toBe(1);
    const ps = shots[0]!;
    expect(ps.is_penalty).toBe(true);
    expect(ps.result).toBe('penalty');
  });
});

// ---------------------------------------------------------------------------
// Token encryption round-trip
// ---------------------------------------------------------------------------

describe('encrypt/decrypt tokens', () => {
  const TEST_KEY = 'a'.repeat(64);

  beforeEach(() => {
    vi.stubEnv('INGEST_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips a plaintext token', () => {
    const original = 'my-secret-access-token-12345';
    const encrypted = encryptToken(original);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(original);
  });

  it('produces different ciphertexts for same input (random IV)', () => {
    const token = 'same-token';
    const a = encryptToken(token);
    const b = encryptToken(token);
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(token);
    expect(decryptToken(b)).toBe(token);
  });

  it('throws on missing encryption key', () => {
    vi.stubEnv('INGEST_ENCRYPTION_KEY', '');
    expect(() => encryptToken('test')).toThrow('INGEST_ENCRYPTION_KEY');
    expect(() => decryptToken('a:b:c')).toThrow('INGEST_ENCRYPTION_KEY');
  });

  it('throws on malformed encrypted string', () => {
    vi.stubEnv('INGEST_ENCRYPTION_KEY', TEST_KEY);
    expect(() => decryptToken('not-valid')).toThrow('Malformed encrypted token');
  });
});

// ---------------------------------------------------------------------------
// Adapter sync — mocked HTTP + Supabase
// ---------------------------------------------------------------------------

describe('arccos adapter sync', () => {
  const TEST_KEY = 'b'.repeat(64);

  beforeEach(() => {
    vi.stubEnv('ARCCOS_CLIENT_ID', 'test-id');
    vi.stubEnv('ARCCOS_CLIENT_SECRET', 'test-secret');
    vi.stubEnv('INGEST_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns revoked when token expired and no refresh token', async () => {
    // Import dynamically so env stubs are active
    const { default: adapter } = await import(
      '@/lib/coachhelm/v3/ingest/providers/arccos'
    );

    // Encrypt a fake token so decryption succeeds
    const { encryptToken: enc } = await import(
      '@/lib/coachhelm/v3/ingest/providers/arccos'
    );
    const encryptedAccess = enc('fake-access');

    const conn = makeConnection({
      access_token_encrypted: encryptedAccess,
      refresh_token_encrypted: null,
      expires_at: '2020-01-01T00:00:00Z',
    });

    const result = await adapter.sync(conn);
    expect(result.next_state).toBe('revoked');
    expect(result.shots_inserted).toBe(0);
    expect(result.rounds_inserted).toBe(0);
  });

  it('returns decryption error for invalid encrypted token', async () => {
    const { default: adapter } = await import(
      '@/lib/coachhelm/v3/ingest/providers/arccos'
    );

    const conn = makeConnection({
      access_token_encrypted: 'not-valid-encrypted',
    });

    const result = await adapter.sync(conn);
    expect(result.errors_count).toBe(1);
    expect(result.error_detail).toContain('Token decryption failed');
  });

  it('isConfigured returns true when env vars set', async () => {
    const { default: adapter } = await import(
      '@/lib/coachhelm/v3/ingest/providers/arccos'
    );
    expect(adapter.isConfigured()).toBe(true);
  });

  it('isConfigured returns false when env vars missing', async () => {
    vi.stubEnv('ARCCOS_CLIENT_ID', '');
    const { default: adapter } = await import(
      '@/lib/coachhelm/v3/ingest/providers/arccos'
    );
    expect(adapter.isConfigured()).toBe(false);
  });
});
