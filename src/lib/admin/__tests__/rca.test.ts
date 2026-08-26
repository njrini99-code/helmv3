import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Mirrors schedule-vision-transport.test.ts's mocking shape: `generateObject`
 * is the only network-shaped dependency, so it is the only thing mocked.
 * `resolveModelProvider` is left real — with no ANTHROPIC_API_KEY set it just
 * returns the bare gateway-id string, which the mocked `generateObject` never
 * actually dispatches anywhere.
 */
const { generateObject } = vi.hoisted(() => ({ generateObject: vi.fn() }));
vi.mock('ai', () => ({ generateObject }));

import {
  buildRcaContextText,
  runRcaAnalysis,
  rcaAnalysisSchema,
  type RcaSourceContext,
} from '@/lib/admin/rca';

const baseContext: RcaSourceContext = {
  fingerprint: 'fp-1',
  incidentReport: 'REPORT BODY',
  rawStacks: [],
  classificationKind: null,
  sourceFilePath: null,
};

describe('buildRcaContextText', () => {
  it('always includes the fingerprint and the incident report', () => {
    const text = buildRcaContextText(baseContext);
    expect(text).toContain('Fingerprint: fp-1');
    expect(text).toContain('--- Incident report ---\nREPORT BODY');
  });

  it('omits classification/source-file/deploy sections when absent, includes them when present', () => {
    const withoutExtras = buildRcaContextText(baseContext);
    expect(withoutExtras).not.toContain('Incident classification');
    expect(withoutExtras).not.toContain('Source file');
    expect(withoutExtras).not.toContain('Nearby deploys');

    const withExtras = buildRcaContextText({
      ...baseContext,
      classificationKind: 'defect',
      sourceFilePath: 'src/lib/golf/foo.ts',
      nearbyDeploys: [{ sha: 'abc1234', time: '2026-08-24T00:00:00Z' }],
    });
    expect(withExtras).toContain('Incident classification: defect');
    expect(withExtras).toContain('Source file (resolved from the feature registry): src/lib/golf/foo.ts');
    expect(withExtras).toContain('Nearby deploys (most recent first):\n- 2026-08-24T00:00:00Z sha=abc1234');
  });

  it('includes at most 3 raw stacks, in order, even when more are supplied', () => {
    const text = buildRcaContextText({
      ...baseContext,
      rawStacks: ['stack-A', 'stack-B', 'stack-C', 'stack-D'],
    });
    expect(text).toContain('Stack trace 1:\nstack-A');
    expect(text).toContain('Stack trace 2:\nstack-B');
    expect(text).toContain('Stack trace 3:\nstack-C');
    expect(text).not.toContain('stack-D');
  });

  it('caps the assembled text at ~20k chars rather than growing unbounded', () => {
    const text = buildRcaContextText({
      ...baseContext,
      incidentReport: 'x'.repeat(50_000),
    });
    expect(text.length).toBeLessThan(21_000);
    expect(text).toContain('[context truncated at 20000 chars]');
  });
});

describe('runRcaAnalysis', () => {
  beforeEach(() => {
    generateObject.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns unconfigured and never calls the model when ANTHROPIC_API_KEY is unset', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    const result = await runRcaAnalysis(baseContext);

    expect(result.status).toBe('unconfigured');
    if (result.status === 'unconfigured') {
      expect(result.message).toContain('ANTHROPIC_API_KEY');
    }
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('treats a blank-but-present key the same as absent (vercel env pull masking)', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '   ');

    const result = await runRcaAnalysis(baseContext);

    expect(result.status).toBe('unconfigured');
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('returns ok with the model output plus a stamped model id and generatedAt', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-key');
    generateObject.mockResolvedValue({
      object: {
        probableCause: 'Null pointer in the save path',
        suspectFiles: [{ path: 'src/lib/golf/foo.ts', reason: 'named in the stack trace' }],
        suggestedFix: 'Guard the null case',
        confidence: 'high',
        relatedFingerprints: [],
      },
    });

    const before = Date.now();
    const result = await runRcaAnalysis(baseContext);
    const after = Date.now();

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.analysis.probableCause).toBe('Null pointer in the save path');
      expect(result.analysis.model).toBe('anthropic/claude-sonnet-5');
      const generatedAtMs = Date.parse(result.analysis.generatedAt);
      expect(generatedAtMs).toBeGreaterThanOrEqual(before);
      expect(generatedAtMs).toBeLessThanOrEqual(after);
      // Round-trips through the same schema getStoredRcaAnalysis validates
      // stored rows with — proves the two stay in sync.
      expect(rcaAnalysisSchema.safeParse(result.analysis).success).toBe(true);
    }

    const call = generateObject.mock.calls[0]?.[0];
    // `instructions` + `prompt`, never `messages` — see the comment in
    // runRcaAnalysis for why: the installed AI SDK rejects a system-role
    // entry inside `messages` unless `allowSystemInMessages` is set.
    expect(call.messages).toBeUndefined();
    expect(typeof call.instructions).toBe('string');
    expect(call.prompt).toContain('fp-1');
  });

  it('returns error, never throws, when the model call fails', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-key');
    generateObject.mockRejectedValue(new Error('model unavailable'));

    const result = await runRcaAnalysis(baseContext);

    expect(result).toEqual({ status: 'error', message: 'model unavailable' });
  });
});
