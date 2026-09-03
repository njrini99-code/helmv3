import { describe, it, expect, vi } from 'vitest';
import { buildAgentRunPayload, recordAgentRun } from '@/lib/admin/agent-runs/record';
import type { AgentRunRecord } from '@/lib/admin/agent-runs/types';

const BASE_INPUT: AgentRunRecord = {
  runId: 'a1111111-1111-1111-1111-111111111111',
  workflow: 'selfheal.diagnose',
  status: 'started',
};

describe('buildAgentRunPayload', () => {
  it('strips secret-shaped keys out of metadata', () => {
    const payload = buildAgentRunPayload({
      ...BASE_INPUT,
      metadata: { access_token: 'shh', raw_prompt: 'shh', safe_field: 'ok' },
    });
    expect(payload.access_token).toBeUndefined();
    expect(payload.raw_prompt).toBeUndefined();
    expect(payload.safe_field).toBe('ok');
  });

  it('never writes confidence above 0.95', () => {
    const payload = buildAgentRunPayload({ ...BASE_INPUT, confidence: 1 });
    expect(payload.confidence).toBe(0.95);
  });

  it('passes a null confidence through as null, not 0', () => {
    const payload = buildAgentRunPayload(BASE_INPUT);
    expect(payload.confidence).toBeNull();
  });

  it('truncates an oversized string field instead of storing a raw transcript-length blob', () => {
    const longCharter = 'x'.repeat(5000);
    const payload = buildAgentRunPayload({ ...BASE_INPUT, charter: longCharter });
    expect((payload.charter as string).length).toBeLessThan(longCharter.length);
    expect(payload.charter).toMatch(/…\[truncated\]$/);
  });

  it('caps hypothesis list length', () => {
    const hypotheses = Array.from({ length: 100 }, (_, i) => `hypothesis ${i}`);
    const payload = buildAgentRunPayload({ ...BASE_INPUT, hypotheses });
    expect((payload.hypotheses as string[]).length).toBeLessThanOrEqual(40);
  });
});

describe('recordAgentRun', () => {
  it('is fail-open: an RPC rejection never throws, and onFailure is told', async () => {
    const onFailure = vi.fn();
    await expect(
      recordAgentRun(BASE_INPUT, {
        rpc: () => Promise.reject(new Error('function helm_debug_record_agent_run(...) does not exist')),
        onFailure,
      }),
    ).resolves.toBeUndefined();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0]?.[1]).toEqual({ runId: BASE_INPUT.runId, workflow: BASE_INPUT.workflow });
  });

  it('is fail-open: an RPC error result never throws, and onFailure is told', async () => {
    const onFailure = vi.fn();
    await recordAgentRun(BASE_INPUT, {
      rpc: () => Promise.resolve({ error: { code: '42883', message: 'function does not exist' } }),
      onFailure,
    });
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('calls the RPC with the exact 4-parameter shape the migration expects', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await recordAgentRun({ ...BASE_INPUT, charter: 'Diagnose incident INC-1' }, { rpc, onFailure: vi.fn() });
    expect(rpc).toHaveBeenCalledWith({
      p_run_id: BASE_INPUT.runId,
      p_workflow: BASE_INPUT.workflow,
      p_status: BASE_INPUT.status,
      p_payload: expect.objectContaining({ charter: 'Diagnose incident INC-1' }),
    });
  });

  it('never throws on success', async () => {
    await expect(
      recordAgentRun(BASE_INPUT, { rpc: () => Promise.resolve({ error: null }), onFailure: vi.fn() }),
    ).resolves.toBeUndefined();
  });
});
