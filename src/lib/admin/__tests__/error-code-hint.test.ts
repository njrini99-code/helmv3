import { describe, it, expect } from 'vitest';
import { describeErrorCode } from '@/lib/admin/error-code-hint';

describe('describeErrorCode', () => {
  it('explains the codes this platform actually produces', () => {
    expect(describeErrorCode('42501')).toMatch(/permission denied/);
    expect(describeErrorCode('57014')).toMatch(/timeout/);
    expect(describeErrorCode('PGRST116')).toMatch(/exactly one row/);
    expect(describeErrorCode('pgrst116')).toMatch(/exactly one row/);
  });

  it('gives every provider fault the same operator-gated hint', () => {
    expect(describeErrorCode('provider_inngest_invalid_credential')).toMatch(/silence is not recovery/);
    expect(describeErrorCode('provider_ai_credit_exhausted')).toMatch(/provider fault/);
  });

  it('never invents a gloss for a code it does not know', () => {
    expect(describeErrorCode('XX999')).toBeNull();
    expect(describeErrorCode(null)).toBeNull();
    expect(describeErrorCode('')).toBeNull();
  });
});
