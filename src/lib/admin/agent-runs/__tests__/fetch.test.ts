import { describe, it, expect, vi, beforeEach } from 'vitest';

let rpcImpl: (name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: unknown) => rpcImpl(name, args),
  }),
}));

import { fetchAgentRuns, fetchAgentRun, toAgentRunDetail } from '@/lib/admin/agent-runs/fetch';

describe('fetchAgentRuns', () => {
  beforeEach(() => {
    rpcImpl = async () => ({ data: [], error: null });
  });

  it('maps a successful RPC result into AgentRunListRow[]', async () => {
    rpcImpl = async () => ({
      data: [
        {
          run_id: 'r1',
          workflow: 'selfheal.diagnose',
          status: 'success',
          incident_fingerprint: 'fp-1',
          charter: 'Diagnose INC-1',
          verifier_verdict: 'accept',
          production_outcome: 'proven',
          confidence: 0.8,
          started_at: '2026-09-01T00:00:00Z',
          finished_at: '2026-09-01T00:05:00Z',
          duration_ms: 300000,
        },
      ],
      error: null,
    });
    const result = await fetchAgentRuns();
    expect(result.status).toBe('ok');
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.runId).toBe('r1');
    expect(result.data?.[0]?.workflow).toBe('selfheal.diagnose');
  });

  it('reports unconfigured (not error) when the HELD migration has not been applied yet', async () => {
    rpcImpl = async () => ({
      data: null,
      error: { code: '42883', message: 'function helm_debug_list_agent_runs(integer, text, text) does not exist' },
    });
    const result = await fetchAgentRuns();
    expect(result.status).toBe('unconfigured');
    expect(result.data).toBeNull();
  });

  it('reports unconfigured when the RPC call itself throws a "does not exist" error', async () => {
    rpcImpl = async () => {
      throw new Error('relation "helm_debug.agent_runs" does not exist');
    };
    const result = await fetchAgentRuns();
    expect(result.status).toBe('unconfigured');
  });

  it('reports a real failure as error, distinct from unconfigured', async () => {
    rpcImpl = async () => ({ data: null, error: { code: '08006', message: 'connection failure' } });
    const result = await fetchAgentRuns();
    expect(result.status).toBe('error');
    expect(result.error).toContain('connection failure');
  });

  it('never reports zero runs as if the source were configured and simply empty vs blind — status stays ok with an empty array', async () => {
    rpcImpl = async () => ({ data: [], error: null });
    const result = await fetchAgentRuns();
    expect(result.status).toBe('ok');
    expect(result.data).toEqual([]);
  });
});

describe('fetchAgentRun', () => {
  it('returns ok(null) when no row matches the run id', async () => {
    rpcImpl = async () => ({ data: {}, error: null });
    const result = await fetchAgentRun('missing');
    expect(result.status).toBe('ok');
    expect(result.data).toBeNull();
  });

  it('maps a full detail row', async () => {
    rpcImpl = async () => ({
      data: {
        run_id: 'r1',
        workflow: 'selfheal.repair',
        status: 'success',
        incident_fingerprint: null,
        charter: null,
        verifier_verdict: null,
        production_outcome: null,
        confidence: null,
        started_at: '2026-09-01T00:00:00Z',
        finished_at: null,
        duration_ms: null,
        hypotheses: ['h1', 'h2'],
        context_loaded: ['docs/a.md'],
        tools_used: ['Read'],
        files_changed: ['src/x.ts'],
        verification: { judge: { verdict: 'accept' } },
      },
      error: null,
    });
    const result = await fetchAgentRun('r1');
    expect(result.status).toBe('ok');
    expect(result.data?.hypotheses).toEqual(['h1', 'h2']);
    expect(result.data?.verification.judge?.verdict).toBe('accept');
  });
});

describe('toAgentRunDetail', () => {
  it('is pure and defaults array fields to [] when the RPC returns a non-array', () => {
    const detail = toAgentRunDetail({
      run_id: 'r1',
      workflow: 'selfheal.diagnose',
      status: 'started',
      incident_fingerprint: null,
      charter: null,
      verifier_verdict: null,
      production_outcome: null,
      confidence: null,
      started_at: '2026-09-01T00:00:00Z',
      finished_at: null,
      duration_ms: null,
      hypotheses: null,
      context_loaded: undefined,
      tools_used: 'not-an-array',
      files_changed: [],
      verification: null,
    });
    expect(detail.hypotheses).toEqual([]);
    expect(detail.toolsUsed).toEqual([]);
    expect(detail.verification).toEqual({});
  });
});
