import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mirrors `rca.test.ts`'s mocking shape: `generateObject` is the only
 * network-shaped dependency. `isFlagEnabled` is mocked directly (rather than
 * exercised through the real generated registry) so this suite can flip the
 * ensemble on/off without depending on `config/feature-flags.yml`'s current
 * committed state.
 */
const { generateObject, recordAi, isFlagEnabled } = vi.hoisted(() => ({
  generateObject: vi.fn(),
  recordAi: vi.fn(),
  isFlagEnabled: vi.fn(),
}));
vi.mock('ai', () => ({ generateObject }));
vi.mock('@/lib/observability/metrics', () => ({ recordAi }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled }));

import {
  runVerificationEnsemble,
  touchesAuthOrRlsSurface,
  checkSuggestedFixContract,
} from '@/lib/admin/ensemble/verification-ensemble';
import type { RcaAnalysis, RcaSourceContext } from '@/lib/admin/rca';

const context: RcaSourceContext = {
  fingerprint: 'fp-1',
  incidentReport: 'REPORT',
  rawStacks: [],
  classificationKind: null,
  sourceFilePath: null,
};

function healer(overrides: Partial<RcaAnalysis> = {}): RcaAnalysis {
  return {
    probableCause: 'Null check missing',
    suspectFiles: [{ path: 'src/lib/golf/foo.ts', reason: 'named in stack' }],
    suggestedFix: 'FIX HERE: add a null guard',
    confidence: 'high',
    relatedFingerprints: [],
    model: 'anthropic/claude-sonnet-5',
    generatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  generateObject.mockReset();
  recordAi.mockReset();
  isFlagEnabled.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

describe('runVerificationEnsemble — inertness when disabled', () => {
  it('makes ZERO calls to generateObject when the flag is off', async () => {
    isFlagEnabled.mockReturnValue(false);
    const result = await runVerificationEnsemble(context, healer());
    expect(result.status).toBe('disabled');
    expect(generateObject).not.toHaveBeenCalled();
    expect(result.finalVerdict).toBeNull();
  });

  it('checks the flag before touching the model config', async () => {
    isFlagEnabled.mockReturnValue(false);
    delete process.env.ANTHROPIC_API_KEY;
    const result = await runVerificationEnsemble(context, healer());
    expect(result.status).toBe('disabled');
    expect(generateObject).not.toHaveBeenCalled();
  });
});

describe('runVerificationEnsemble — enabled path', () => {
  beforeEach(() => {
    isFlagEnabled.mockReturnValue(true);
  });

  it('returns unconfigured with zero model calls when ANTHROPIC_API_KEY is absent', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await runVerificationEnsemble(context, healer());
    expect(result.status).toBe('unconfigured');
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('skips the SECURITY role when the analysis has no auth/RLS surface, and runs ADVERSARY + PRODUCT', async () => {
    generateObject.mockResolvedValue({ object: { verdict: 'ACCEPT', findings: [] }, usage: {} });
    const result = await runVerificationEnsemble(context, healer());
    const security = result.roles.find((r) => r.role === 'security')!;
    expect(security.status).toBe('skipped');
    expect(result.roles.find((r) => r.role === 'adversary')!.status).toBe('ok');
    expect(result.roles.find((r) => r.role === 'product')!.status).toBe('ok');
    // ADVERSARY + PRODUCT + JUDGE = 3 calls; SECURITY skipped adds none.
    expect(generateObject).toHaveBeenCalledTimes(3);
  });

  it('runs the SECURITY role when the analysis touches an auth/RLS surface', async () => {
    generateObject.mockResolvedValue({ object: { verdict: 'ACCEPT', findings: [] }, usage: {} });
    const result = await runVerificationEnsemble(
      context,
      healer({ probableCause: 'requireSuperAdmin() guard was removed from the route' }),
    );
    const security = result.roles.find((r) => r.role === 'security')!;
    expect(security.status).toBe('ok');
    expect(generateObject).toHaveBeenCalledTimes(4);
  });

  it('final verdict is ACCEPT when every role and the judge accept and the suggestedFix is structurally valid', async () => {
    generateObject.mockResolvedValue({ object: { verdict: 'ACCEPT', findings: [] }, usage: {} });
    const result = await runVerificationEnsemble(context, healer());
    expect(result.judgeVerdict).toBe('ACCEPT');
    expect(result.structuralCheck.ok).toBe(true);
    expect(result.finalVerdict).toBe('ACCEPT');
  });

  it('final verdict is REJECT when the JUDGE itself rejects', async () => {
    let call = 0;
    generateObject.mockImplementation(async () => {
      call += 1;
      // adversary, security(skipped→n/a), product, judge — with no auth
      // surface this healer only calls adversary/product/judge (3 calls).
      const isJudgeCall = call === 3;
      return {
        object: isJudgeCall ? { verdict: 'REJECT', reasons: ['Suspect file not in evidence.'] } : { verdict: 'ACCEPT', findings: [] },
        usage: {},
      };
    });
    const result = await runVerificationEnsemble(context, healer());
    expect(result.judgeVerdict).toBe('REJECT');
    expect(result.finalVerdict).toBe('REJECT');
  });

  it('THE GOLDEN CASE (J.5): a suggestedFix that does not match RCA_CANONICAL_PREFIX is REJECTED structurally even when the JUDGE model call says ACCEPT', async () => {
    // Every model call, including JUDGE, says ACCEPT — proving the override
    // is code-enforced, not dependent on the model "noticing".
    generateObject.mockResolvedValue({ object: { verdict: 'ACCEPT', findings: [], reasons: [] }, usage: {} });
    // One of the actual production examples rca-category.ts's own header
    // cites from the 2026-08-27 measurement (10 of 15 analyses opened with
    // free prose the canonical-prefix check could not parse).
    const badHealer = healer({ suggestedFix: 'Add `code: "qualifier_closed"` to the return at golf.ts:1770' });
    // Confirm this fixture actually exercises the free-prose failure mode
    // rca-category.ts's own header documents (2026-08-27: 10 of 15 analyses
    // opened with free prose the canonical-prefix check could not parse).
    expect(checkSuggestedFixContract(badHealer).ok).toBe(false);

    const result = await runVerificationEnsemble(context, badHealer);
    expect(result.judgeVerdict).toBe('ACCEPT'); // the model's own (wrong) call
    expect(result.finalVerdict).toBe('REJECT'); // the structural override wins
  });

  it('a canonical suggestedFix passes the structural check', async () => {
    expect(checkSuggestedFixContract(healer({ suggestedFix: 'FIX HERE: add a null guard' })).ok).toBe(true);
    expect(checkSuggestedFixContract(healer({ suggestedFix: 'ALREADY FIXED: see commit abc123' })).ok).toBe(true);
    expect(checkSuggestedFixContract(healer({ suggestedFix: 'NOT A DEFECT: expected behavior' })).ok).toBe(true);
    expect(checkSuggestedFixContract(healer({ suggestedFix: 'NEEDS MORE EVIDENCE: cannot reproduce' })).ok).toBe(true);
  });

  it('a role call that errors is recorded as status error, not treated as ACCEPT', async () => {
    generateObject.mockRejectedValueOnce(new Error('network fail'));
    generateObject.mockResolvedValue({ object: { verdict: 'ACCEPT', findings: [] }, usage: {} });
    const result = await runVerificationEnsemble(context, healer());
    const adversary = result.roles.find((r) => r.role === 'adversary')!;
    expect(adversary.status).toBe('error');
    expect(adversary.verdict).toBeNull();
  });
});

describe('touchesAuthOrRlsSurface', () => {
  it('is false for an ordinary null-check finding', () => {
    expect(touchesAuthOrRlsSurface(healer())).toBe(false);
  });

  it('is true when the probable cause mentions requireSuperAdmin', () => {
    expect(touchesAuthOrRlsSurface(healer({ probableCause: 'requireSuperAdmin() was bypassed' }))).toBe(true);
  });

  it('is true when a suspect file path mentions RLS', () => {
    expect(
      touchesAuthOrRlsSurface(
        healer({ suspectFiles: [{ path: 'supabase/migrations/xyz_rls.sql', reason: 'policy change' }] }),
      ),
    ).toBe(true);
  });
});
