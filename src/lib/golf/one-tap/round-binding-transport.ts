import { createClient } from '@/lib/supabase/client';
import { roundCourseBindingSchema, type BindingReadResult, type RoundBindingTransport, type RoundBindingProposal } from './round-course-binding';

export interface RoundBindingRpcClient {
  rpc(name: string, args: { p_round_id: string; p_proposal: RoundBindingProposal | null }): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}
/** RPC operates under the caller's JWT/RLS, reads the saved scorecard itself,
 * and serializes first claims with the existing round row. No service role. */
export function roundBindingTransport(client: RoundBindingRpcClient): RoundBindingTransport {
  const request = async (roundId: string, proposal: RoundBindingProposal | null): Promise<BindingReadResult> => {
    try {
      const { data, error } = await client.rpc('resolve_golf_round_course_binding', { p_round_id: roundId, p_proposal: proposal });
      if (error) return { status: ['42501', 'PGRST301', 'PGRST302', '401', '403'].includes(error.code ?? '') ? 'conflict' : 'unavailable' };
      if (!data || typeof data !== 'object') return { status: 'unavailable' };
      const result = data as { status?: string; binding?: unknown };
      if (result.status === 'missing') return { status: 'missing' };
      if (result.status === 'conflict') return { status: 'conflict' };
      const parsed = roundCourseBindingSchema.safeParse(result.binding);
      return result.status === 'found' && parsed.success && parsed.data.roundId === roundId
        ? { status: 'found', binding: parsed.data } : { status: 'unavailable' };
    } catch { return { status: 'unavailable' }; }
  };
  return { read: id => request(id, null), claim: proposal => request(proposal.roundId, proposal) };
}
export function browserRoundBindingTransport(roundId?: string | null): RoundBindingTransport | null {
  if (!roundId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roundId)) return null;
  try { return roundBindingTransport(createClient() as unknown as RoundBindingRpcClient); }
  catch { return { read: async () => ({ status: 'unavailable' }), claim: async () => ({ status: 'unavailable' }) }; }
}
