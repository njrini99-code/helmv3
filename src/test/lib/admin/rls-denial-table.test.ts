/**
 * `RLS denial: select on unknown` was the second-most-common RLS incident in
 * the Bridge (n=6) and the only one nobody could act on: with the relation name
 * missing, `featureForTable` can't attach a feature, the message can't be
 * distinguished from any other unnamed denial, and the fingerprint groups
 * denials from unrelated tables together.
 *
 * Postgres always names the offending relation in the denial text, so the name
 * is recoverable even when the caller can't thread an `rlsCtx`.
 */

import { describe, it, expect } from 'vitest';
import { resolveDenialTable } from '@/lib/admin/rls-denial';

describe('resolveDenialTable', () => {
  it('recovers the relation from a "permission denied" message', () => {
    expect(
      resolveDenialTable('unknown', 'permission denied for table crm_coaches'),
    ).toBe('crm_coaches');
  });

  it('recovers the relation from an RLS policy violation message', () => {
    expect(
      resolveDenialTable(
        'unknown',
        'new row violates row-level security policy for table "golf_conversations"',
      ),
    ).toBe('golf_conversations');
  });

  it('handles views and materialized views', () => {
    expect(
      resolveDenialTable('unknown', 'permission denied for view golf_team_summary'),
    ).toBe('golf_team_summary');
    expect(
      resolveDenialTable('unknown', 'permission denied for materialized view golf_sg_rollup'),
    ).toBe('golf_sg_rollup');
  });

  it('never overrides a table the caller already knows', () => {
    expect(
      resolveDenialTable('golf_rounds', 'permission denied for table crm_coaches'),
    ).toBe('golf_rounds');
  });

  it('leaves the placeholder alone when the message names nothing', () => {
    expect(resolveDenialTable('unknown', 'permission denied')).toBe('unknown');
    expect(resolveDenialTable('unknown', null)).toBe('unknown');
    expect(resolveDenialTable('', undefined)).toBe('');
  });
});
