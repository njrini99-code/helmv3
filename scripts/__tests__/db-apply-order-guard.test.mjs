/**
 * .github/scripts/order-guard.mjs — db-apply's "what is production missing?" gate.
 *
 * This exists because the guard it replaces was WRONG in the direction that
 * matters. It parsed `supabase migration list` text with awk, matched a row
 * shape CLI 2.115.0 no longer prints, and reported ZERO pending migrations
 * while production was in fact missing ten — then failed the run claiming the
 * named migration was "not pending" (run 34178071502). A guard that reports
 * the opposite of the truth is worse than no guard, so the replacement is
 * pinned here against the real production ledger state.
 */
import { describe, it, expect } from 'vitest';

import { computePending, olderThan } from '../../.github/scripts/order-guard.mjs';

// Measured against production 2026-09-08: the ledger carried nothing at or
// after 20260906, so every 20260906*/20260907* file on disk was pending.
const LEDGER_TIP = ['20260904160000', '20260905100000'];
const ON_DISK = [
  '20260904160000_golf_messaging_structured.sql',
  '20260905100000_revoke_secdef_execute_from_authenticated.sql',
  '20260906140000_helm_jobs_pgmq_queues.sql',
  '20260906150000_helm_debug_something.sql',
  '20260907160000_golf_team_chat_membership_management.sql',
];

describe('computePending', () => {
  it('reports what the ledger is missing — the case the awk parser got backwards', () => {
    expect(computePending(LEDGER_TIP, ON_DISK)).toEqual([
      '20260906140000',
      '20260906150000',
      '20260907160000',
    ]);
  });

  it('does not report an applied migration as pending', () => {
    expect(computePending(LEDGER_TIP, ON_DISK)).not.toContain('20260904160000');
  });

  it('returns nothing when the ledger has everything', () => {
    const all = ON_DISK.map((f) => f.slice(0, 14));
    expect(computePending(all, ON_DISK)).toEqual([]);
  });

  it('ignores non-migration files in the directory', () => {
    expect(computePending([], ['HELD.md', 'README.md', '20260907160000_x.sql'])).toEqual(['20260907160000']);
  });

  it('tolerates a ledger whose versions come back as numbers, not strings', () => {
    expect(computePending([20260904160000], ['20260904160000_a.sql', '20260907160000_b.sql'])).toEqual([
      '20260907160000',
    ]);
  });
});

describe('olderThan', () => {
  const pending = ['20260906140000', '20260906150000', '20260907160000', '20260908000000'];

  it('flags only migrations older than the one being applied', () => {
    // Newer pending files are untouched by a single-file apply, so they are
    // not an ordering hazard and must not demand an acknowledgement.
    expect(olderThan(pending, '20260907160000')).toEqual(['20260906140000', '20260906150000']);
  });

  it('is empty when the target is the oldest pending migration', () => {
    expect(olderThan(pending, '20260906140000')).toEqual([]);
  });
});
