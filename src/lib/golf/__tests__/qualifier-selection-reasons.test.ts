import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readQualifierSelectionReasons } from '../qualifier-selection-reasons';

/**
 * The coach-gated RPC ships with a HELD migration, so today every call answers PGRST202 and the reader falls back to
 * the column. That path is the expected one until the apply: it must return the column's reasons and no error, so
 * no caller logs it (the Sentry auto-capture of the PGRST202 itself is dropped in src/instrumentation.ts).
 */
type Res = { data: unknown; error: { message: string; code?: string } | null };

function client(rpc: Res, column: Res) {
  const calls: string[] = [];
  const fake = {
    rpc: async (fn: string) => {
      calls.push(`rpc:${fn}`);
      return rpc;
    },
    from: (table: string) => {
      calls.push(`from:${table}`);
      return { select: () => ({ eq: async () => column }) };
    },
  };
  return { supabase: fake as unknown as SupabaseClient, calls };
}

const notDeployed = { message: 'Could not find the function public.golf_qualifier_selection_reasons(p_qualifier_id) in the schema cache', code: 'PGRST202' };

describe('readQualifierSelectionReasons', () => {
  it('uses the function when it answers', async () => {
    const { supabase, calls } = client({ data: [{ player_id: 'p1', coach_reasoning: 'Steady' }], error: null }, { data: [], error: null });
    const out = await readQualifierSelectionReasons(supabase, 'q1');
    expect(out.error).toBeNull();
    expect(out.reasons.get('p1')).toBe('Steady');
    expect(calls).toEqual(['rpc:golf_qualifier_selection_reasons']);
  });

  it('treats PGRST202 (not deployed) as expected: the column answers and no error comes back', async () => {
    const { supabase, calls } = client({ data: null, error: notDeployed }, { data: [{ player_id: 'p2', coach_reasoning: null }], error: null });
    const out = await readQualifierSelectionReasons(supabase, 'q1');
    expect(out.error).toBeNull();
    expect([...out.reasons]).toEqual([['p2', null]]);
    expect(calls).toEqual(['rpc:golf_qualifier_selection_reasons', 'from:golf_qualifier_selections']);
  });

  it('still fails, never an empty map, when both the function and the column fail', async () => {
    const { supabase } = client({ data: null, error: { message: 'boom', code: '42501' } }, { data: null, error: { message: 'column refused', code: '42501' } });
    const out = await readQualifierSelectionReasons(supabase, 'q1');
    expect(out.error?.code).toBe('42501');
    expect(out.reasons.size).toBe(0);
  });
});
