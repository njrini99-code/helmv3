import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildAgentRunPayload, recordAgentRun, RECORD_AGENT_RUN_TIMEOUT_MS } from '@/lib/admin/agent-runs/record';
import type { AgentRunRecord } from '@/lib/admin/agent-runs/types';

const BASE_INPUT: AgentRunRecord = {
  runId: 'a1111111-1111-1111-1111-111111111111',
  workflow: 'selfheal.diagnose',
  status: 'started',
};

afterEach(() => {
  // Only the timeout-race test below enables fake timers; guarantee they
  // never leak into a later test in this file if that one throws first.
  vi.useRealTimers();
});

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

  // PR #1790 review item 3, part 1: metadata is spread FIRST now, structured
  // fields LAST — a caller-supplied metadata key sharing a structured
  // column's name must never win.
  it('never lets a colliding metadata key override a computed structured field (spread-order regression)', () => {
    const payload = buildAgentRunPayload({
      ...BASE_INPUT,
      confidence: 0.4,
      incidentFingerprint: 'real-fp',
      metadata: { confidence: 1, incident_fingerprint: 'attacker-supplied', charter: 'attacker-supplied charter' },
    });
    // The clamped/capped value wins, not whatever `metadata` happened to carry.
    expect(payload.confidence).toBe(0.4);
    expect(payload.incident_fingerprint).toBe('real-fp');
    expect(payload.charter).toBeNull();
  });

  // PR #1790 review item 3, part 2: sanitization must be recursive, not
  // top-level-only — a nested object/array previously passed through
  // completely unbounded once it was inside `metadata`.
  describe('recursive metadata sanitization', () => {
    it('strips an unsafe key nested inside an object, not just at the top level', () => {
      const payload = buildAgentRunPayload({
        ...BASE_INPUT,
        metadata: { context: { nested: { raw_prompt: 'full transcript here', safe: 'ok' } } },
      });
      const context = payload.context as Record<string, unknown>;
      const nested = context.nested as Record<string, unknown>;
      expect(nested.raw_prompt).toBeUndefined();
      expect(nested.safe).toBe('ok');
    });

    it('bounds recursion depth instead of walking an arbitrarily deep object forever', () => {
      // Build a chain 10 levels deep — well past MAX_METADATA_DEPTH.
      let deep: Record<string, unknown> = { leaf: 'bottom' };
      for (let i = 0; i < 10; i++) deep = { child: deep };
      const payload = buildAgentRunPayload({ ...BASE_INPUT, metadata: { deep } });
      // Walk down until we hit the depth-exceeded marker rather than an
      // infinitely nested object — proves the recursion actually stops.
      let cursor: unknown = payload.deep;
      let hops = 0;
      while (cursor && typeof cursor === 'object' && 'child' in (cursor as Record<string, unknown>) && hops < 20) {
        cursor = (cursor as Record<string, unknown>).child;
        hops++;
      }
      expect(hops).toBeLessThan(10);
      expect(cursor).toBe('[max-depth-exceeded]');
    });

    it('caps the number of keys read at a single object level', () => {
      const wide: Record<string, string> = {};
      for (let i = 0; i < 100; i++) wide[`key_${i}`] = 'v';
      const payload = buildAgentRunPayload({ ...BASE_INPUT, metadata: { wide } });
      const wideOut = payload.wide as Record<string, unknown>;
      expect(Object.keys(wideOut).length).toBeLessThanOrEqual(40);
    });

    it('bounds the total serialized size across many small strings, each individually under both the per-string AND per-level-key-count caps', () => {
      // 5 groups * 40 keys * 500 chars = 100,000 bytes of string content.
      // Every single string is under MAX_STRING_LEN (600) and every object
      // level holds exactly 40 keys (the MAX_KEYS_PER_LEVEL cap, not over
      // it) — spread across levels specifically so neither of those two
      // caps is what stops this test; only the 32,000-byte total budget can.
      const many: Record<string, Record<string, string>> = {};
      for (let g = 0; g < 5; g++) {
        const group: Record<string, string> = {};
        for (let i = 0; i < 40; i++) group[`field_${i}`] = 'x'.repeat(500);
        many[`group_${g}`] = group;
      }
      const payload = buildAgentRunPayload({ ...BASE_INPUT, metadata: { many } });
      const serializedBytes = JSON.stringify(payload.many).length;
      expect(serializedBytes).toBeLessThan(100_000); // proves the budget actually bit
      expect(serializedBytes).toBeLessThan(35_000); // budget + a little bookkeeping overhead
    });
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

  // PR #1790 review item 3, part 3: a hung RPC must never block the caller
  // (the self-heal loop mid-run) past RECORD_AGENT_RUN_TIMEOUT_MS.
  it('does not block its caller past RECORD_AGENT_RUN_TIMEOUT_MS when the RPC hangs forever', async () => {
    vi.useFakeTimers();
    const onFailure = vi.fn();
    // Never resolves or rejects — the shape a network partition or a
    // Postgres statement stuck behind a lock on helm_debug.agent_runs
    // produces from this function's point of view.
    const hangingRpc = () => new Promise<{ error: null }>(() => {});

    const runPromise = recordAgentRun(BASE_INPUT, { rpc: hangingRpc, onFailure });
    await vi.advanceTimersByTimeAsync(RECORD_AGENT_RUN_TIMEOUT_MS);
    await expect(runPromise).resolves.toBeUndefined();

    expect(onFailure).toHaveBeenCalledTimes(1);
    const [error, context] = onFailure.mock.calls[0] as [Error, { runId: string; workflow: string }];
    expect(error.message).toContain(String(RECORD_AGENT_RUN_TIMEOUT_MS));
    expect(context).toEqual({ runId: BASE_INPUT.runId, workflow: BASE_INPUT.workflow });
  });

  it('does NOT report a timeout when the RPC settles comfortably inside the budget', async () => {
    vi.useFakeTimers();
    const onFailure = vi.fn();
    const fastRpc = () =>
      new Promise<{ error: null }>((resolve) => setTimeout(() => resolve({ error: null }), 10));

    const runPromise = recordAgentRun(BASE_INPUT, { rpc: fastRpc, onFailure });
    await vi.advanceTimersByTimeAsync(10);
    await runPromise;

    expect(onFailure).not.toHaveBeenCalled();
  });
});
