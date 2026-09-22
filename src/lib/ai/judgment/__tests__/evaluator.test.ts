import { beforeEach, describe, expect, it, vi } from 'vitest';

const askJev = vi.fn();
const isConfigured = vi.fn(() => true);
const flag = vi.fn((_id: string) => true);
const persist = vi.fn(async () => 'eval-1');
const telemetry = vi.fn(async () => undefined);

vi.mock('@/lib/typesafe/client', () => ({
  askJev: (...args: unknown[]) => askJev(...args),
  isTypeSafeConfigured: () => isConfigured(),
  TYPESAFE_MODEL: 'jev-latest',
}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (id: string) => flag(id) }));
vi.mock('../persistence', () => ({ persistJudgment: (...args: unknown[]) => persist(...(args as [])) }));
vi.mock('../telemetry', () => ({ recordJudgmentTelemetry: (...args: unknown[]) => telemetry(...(args as [])) }));

import { runJudgment } from '../evaluator';
import { resolveDisposition, resolveMode, worseDisposition } from '../policy';
import type { JudgmentRequest, NormalizedAnswers } from '../types';

const request = (over: Partial<JudgmentRequest> = {}): JudgmentRequest => ({
  useCase: 'shot_trace',
  evaluatorVersion: 'shot-trace:v1',
  policyVersion: 'shot-trace-policy:v1',
  entityType: 'trace',
  entityKey: 'round-1',
  traceId: '11111111-1111-4111-8111-111111111111',
  state: { workflow: 'golf.shot.add_or_edit' },
  questions: { q: { type: 'noul', instructions: 'x' } },
  facts: { hardInvariantFailed: false },
  applyPolicy: (answers: NormalizedAnswers) => {
    const a = answers.q;
    return a?.kind === 'noul' && a.p > 0.5 ? { disposition: 'escalate', reasonCodes: ['q_high'] } : { disposition: 'pass', reasonCodes: [] };
  },
  ...over,
});

beforeEach(() => {
  askJev.mockReset();
  persist.mockClear();
  telemetry.mockClear();
  flag.mockImplementation(() => true);
  isConfigured.mockImplementation(() => true);
});

describe('runJudgment', () => {
  it('flag off ⇒ zero provider calls and unassessed', async () => {
    flag.mockImplementation((id) => id !== 'jev_judgment_layer');
    const r = await runJudgment(request());
    expect(askJev).not.toHaveBeenCalled();
    expect(r.disposition).toBe('unassessed');
    expect(r.reasonCodes).toContain('mode_off');
    expect(persist).not.toHaveBeenCalled();
  });

  it('flag off but hard invariant failed ⇒ still escalates from the deterministic layer', async () => {
    flag.mockImplementation(() => false);
    const r = await runJudgment(request({ facts: { hardInvariantFailed: true, reasonCodes: ['ledger:duplicate_shot_number'] } }));
    expect(askJev).not.toHaveBeenCalled();
    expect(r.disposition).toBe('escalate');
    expect(r.reasonCodes).toEqual(['hard_invariant_failed', 'ledger:duplicate_shot_number']);
  });

  it('normal answer ⇒ policy applied, shadow, persisted, telemetry recorded', async () => {
    askJev.mockResolvedValue({ answers: { q: { type: 'noul', noul: 0.9 } }, model: 'jev-1.13.0', usage: {}, latencyMs: 200 });
    const r = await runJudgment(request());
    expect(r.disposition).toBe('escalate');
    expect(r.reasonCodes).toEqual(['q_high']);
    expect(r.shadow).toBe(true);
    expect(r.mode).toBe('shadow');
    expect(r.modelId).toBe('jev-1.13.0');
    expect(r.stateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.evaluationId).toBe('eval-1');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(telemetry).toHaveBeenCalledTimes(1);
  });

  it('provider failure ⇒ unassessed, never pass', async () => {
    askJev.mockResolvedValue(null);
    const r = await runJudgment(request());
    expect(r.disposition).toBe('unassessed');
    expect(r.providerErrorCode).toBe('provider_error');
    expect(r.reasonCodes).toContain('judgment_unavailable');
  });

  it('missing key ⇒ unassessed without calling the provider', async () => {
    isConfigured.mockImplementation(() => false);
    const r = await runJudgment(request());
    expect(askJev).not.toHaveBeenCalled();
    expect(r.providerErrorCode).toBe('not_configured');
    expect(r.disposition).toBe('unassessed');
  });

  it('hard invariant outranks a passing judgment', async () => {
    askJev.mockResolvedValue({ answers: { q: { type: 'noul', noul: 0.05 } }, model: 'jev', usage: {}, latencyMs: 1 });
    const r = await runJudgment(request({ facts: { hardInvariantFailed: true, reasonCodes: ['persisted_shot_count_mismatch'] } }));
    expect(r.disposition).toBe('escalate');
    expect(r.reasonCodes[0]).toBe('hard_invariant_failed');
  });

  it('a throwing policy is a judgment failure, not a request failure', async () => {
    askJev.mockResolvedValue({ answers: { q: { type: 'noul', noul: 0.5 } }, model: 'jev', usage: {}, latencyMs: 1 });
    const r = await runJudgment(request({ applyPolicy: () => { throw new TypeError('boom'); } }));
    expect(r.disposition).toBe('unassessed');
    expect(r.providerErrorCode).toBe('policy_error:TypeError');
  });

  it('redacts the state before hashing and sending', async () => {
    askJev.mockResolvedValue({ answers: { q: { type: 'noul', noul: 0.1 } }, model: 'jev', usage: {}, latencyMs: 1 });
    await runJudgment(request({ state: { player_name: 'Pat', note: 'mail pat@example.com', ok: 1 } }), { dryRun: true });
    const sent = askJev.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('player_name');
    expect(sent.note).toBe('mail [email]');
    expect(persist).not.toHaveBeenCalled();
  });

  it('a malformed answer set is a provider error', async () => {
    askJev.mockResolvedValue({ answers: { q: { type: 'weird' } }, model: 'jev', usage: {}, latencyMs: 1 });
    const r = await runJudgment(request());
    expect(r.disposition).toBe('unassessed');
    expect(r.providerErrorCode).toBe('provider_error');
  });
});

describe('policy helpers', () => {
  it('resolveMode is off unless both master and use-case flags are on', () => {
    flag.mockImplementation((id) => id === 'jev_judgment_layer');
    expect(resolveMode('shot_trace')).toBe('off');
    flag.mockImplementation(() => true);
    expect(resolveMode('shot_trace')).toBe('shadow');
  });

  it('resolveDisposition never lets a judgment soften a hard failure', () => {
    expect(resolveDisposition({ hardInvariantFailed: true }, { disposition: 'pass', reasonCodes: [] }).disposition).toBe('escalate');
    expect(resolveDisposition({ hardInvariantFailed: false }, null).disposition).toBe('unassessed');
  });

  it('worseDisposition ranks block > escalate > collect > observe > pass, unassessed never wins', () => {
    expect(worseDisposition('pass', 'observe')).toBe('observe');
    expect(worseDisposition('escalate', 'block')).toBe('block');
    expect(worseDisposition('unassessed', 'pass')).toBe('pass');
  });
});
