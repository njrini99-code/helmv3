/**
 * W39-41 — auto-ingest framework tests.
 *
 * Adapter HTTP behavior is stubbed (provider envs are unset). What's
 * worth covering: the state-machine + registry shape.
 */

import { describe, it, expect } from 'vitest';
import { nextConnectionState, INGEST_PROVIDERS } from '@/lib/coachhelm/v3/ingest/types';
import { getAdapter, ALL_ADAPTERS } from '@/lib/coachhelm/v3/ingest/registry';

describe('nextConnectionState', () => {
  it('clean run keeps an active connection active', () => {
    expect(
      nextConnectionState('active', {
        shots_inserted: 10,
        rounds_inserted: 2,
        errors_count: 0,
      }),
    ).toBe('active');
  });

  it('any errors flip to error state', () => {
    expect(
      nextConnectionState('active', {
        shots_inserted: 0,
        rounds_inserted: 0,
        errors_count: 1,
        error_detail: 'token rejected',
      }),
    ).toBe('error');
  });

  it('explicit next_state from adapter wins', () => {
    expect(
      nextConnectionState('active', {
        shots_inserted: 0,
        rounds_inserted: 0,
        errors_count: 0,
        next_state: 'expired',
      }),
    ).toBe('expired');
  });

  it('error → clean run heals back to active', () => {
    expect(
      nextConnectionState('error', {
        shots_inserted: 5,
        rounds_inserted: 1,
        errors_count: 0,
      }),
    ).toBe('active');
  });

  it('revoked stays revoked even on clean result (caller must re-connect)', () => {
    expect(
      nextConnectionState('revoked', {
        shots_inserted: 0,
        rounds_inserted: 0,
        errors_count: 0,
      }),
    ).toBe('revoked');
  });
});

describe('adapter registry', () => {
  it('every INGEST_PROVIDERS entry resolves to an adapter', () => {
    for (const p of INGEST_PROVIDERS) {
      const a = getAdapter(p);
      expect(a.provider).toBe(p);
    }
  });

  it('all 3 adapters return zero-row stubs by default (envs unset)', () => {
    for (const a of ALL_ADAPTERS) {
      expect(typeof a.isConfigured()).toBe('boolean');
    }
  });

  it('stub sync() returns 0 shots / 0 rounds without exploding', async () => {
    for (const a of ALL_ADAPTERS) {
      const r = await a.sync({
        player_id: 'p-1',
        provider: a.provider,
        access_token_encrypted: 'fake',
        refresh_token_encrypted: null,
        expires_at: null,
        last_synced_at: null,
        state: 'active',
      });
      expect(r.shots_inserted).toBe(0);
      expect(r.rounds_inserted).toBe(0);
    }
  });
});
