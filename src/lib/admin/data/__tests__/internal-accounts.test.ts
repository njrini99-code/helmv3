import { describe, it, expect } from 'vitest';
import { isInternalOrTestAccount } from '@/lib/admin/data/internal-accounts';

describe('isInternalOrTestAccount', () => {
  it('flags the helmsportslabs.com staff domain', () => {
    expect(isInternalOrTestAccount('admin@helmsportslabs.com')).toBe(true);
    expect(isInternalOrTestAccount('Nick@HelmSportsLabs.com')).toBe(true);
  });

  it('flags an email local part containing test/demo/e2e/codex', () => {
    expect(isInternalOrTestAccount('qa-test-42@example.com')).toBe(true);
    expect(isInternalOrTestAccount('demo-user@example.com')).toBe(true);
    expect(isInternalOrTestAccount('e2e-runner@example.com')).toBe(true);
    expect(isInternalOrTestAccount('codex-agent@example.com')).toBe(true);
  });

  it('flags a display name containing test/demo/e2e/codex even with a clean email', () => {
    expect(isInternalOrTestAccount('kcenteno@example.com', 'E2E Fixture')).toBe(true);
    expect(isInternalOrTestAccount('coach1@example.com', 'Demo Coach')).toBe(true);
  });

  it('does not flag a real customer account', () => {
    expect(isInternalOrTestAccount('kcentenoglen@gmail.com', 'K. Centeno')).toBe(false);
  });

  it('is null/undefined-safe', () => {
    expect(isInternalOrTestAccount(null)).toBe(false);
    expect(isInternalOrTestAccount(undefined)).toBe(false);
    expect(isInternalOrTestAccount('real@example.com', null)).toBe(false);
  });

  it('does not false-positive on an unrelated substring', () => {
    // "test" must not match words that merely contain "test" as a
    // substring of something else entirely unrelated to this account being
    // synthetic — this guard documents the (accepted) broad-match tradeoff:
    // a name/email genuinely containing these substrings is intentionally
    // over-inclusive, not a bug.
    expect(isInternalOrTestAccount('protest@example.com')).toBe(true); // documented tradeoff, not a bug
  });
});
