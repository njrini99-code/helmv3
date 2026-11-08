import { afterEach, describe, expect, it, vi } from 'vitest';
import { AskPerf, askPerfEnabled, askPerfProviderOptions } from '../ask-perf';

const req = (headers: Record<string, string>) => new Request('http://localhost/x', { headers });

afterEach(() => vi.unstubAllEnvs());

describe('askPerfEnabled', () => {
  it('needs the header', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(askPerfEnabled(req({}))).toBe(false);
    expect(askPerfEnabled(req({ 'x-ask-perf': '1' }))).toBe(true);
    expect(askPerfEnabled(req({ 'x-ask-perf': 'capture' }))).toBe(true);
  });

  it('is never on in production, whatever the request says', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(askPerfEnabled(req({ 'x-ask-perf': '1' }))).toBe(false);
    expect(askPerfProviderOptions(req({ 'x-ask-perf': '1', 'x-ask-effort': 'low' }))).toBeUndefined();
  });
});

describe('askPerfProviderOptions', () => {
  it('maps the effort header in development and ignores anything else', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(askPerfProviderOptions(req({ 'x-ask-perf': '1', 'x-ask-effort': 'low' }))).toEqual({ anthropic: { effort: 'low' } });
    expect(askPerfProviderOptions(req({ 'x-ask-perf': '1', 'x-ask-effort': 'bogus' }))).toBeUndefined();
    expect(askPerfProviderOptions(req({ 'x-ask-effort': 'low' }))).toBeUndefined();
  });
});

describe('AskPerf', () => {
  it('records nothing when off', () => {
    const p = new AskPerf(false);
    p.mark('a');
    expect(p.snapshot().marks).toEqual([]);
    expect(p.snapshot()).not.toHaveProperty('request');
  });

  it('records marks and model calls, and the request only when capturing', () => {
    const p = new AskPerf(true);
    p.mark('ctx');
    p.modelRequest({ tools: [1] });
    p.modelCall({
      usage: { inputTokens: 100, outputTokens: 10, inputTokenDetails: { noCacheTokens: 4, cacheReadTokens: 90, cacheWriteTokens: 6 }, outputTokenDetails: { reasoningTokens: 3 } },
      finishReason: 'stop',
      performance: { responseTimeMs: 1200.4, timeToFirstOutputMs: 800.2, outputTokensPerSecond: 50 },
    });
    const s = p.snapshot();
    expect(s.marks.map((m) => m[0])).toEqual(['ctx']);
    expect(s.calls[0]).toMatchObject({ input: 100, fresh: 4, cacheRead: 90, cacheWrite: 6, output: 10, reasoning: 3, ttftMs: 800, responseMs: 1200 });
    expect(s).not.toHaveProperty('request');
    const c = new AskPerf(true, true);
    c.modelRequest({ tools: [1] });
    expect(c.snapshot().request).toEqual({ tools: [1], messages: undefined, system: undefined, instructions: undefined, prompt: undefined });
  });
});
