// A guard that did not finish must never render as a guard that found a violation.
//
// 2026-08-29: a green PR went red on a check named "no imports of GlassCard /
// GlassStatCard / PremiumGlassCard remain in src". No such import existed — the
// guard had timed out at 5000ms sweeping 4,066 files, and vitest reports a
// timeout using the same shape as a failed assertion. CI printed a specific,
// false claim about the codebase.
//
// #1672 raised the bound and its own PR says that makes the unknown RARER, not
// DISTINGUISHABLE. This is the distinguishable part.

import { describe, it, expect } from 'vitest';
import {
  classifyFailure,
  summarise,
  PASS,
  POLICY_FAILURE,
  INFRASTRUCTURE_FAILURE,
} from '../../../scripts/repo-guards.mjs';

describe('why a guard failed is not the same as whether the policy holds', () => {
  it('a timeout is INFRASTRUCTURE_FAILURE, not a violation', () => {
    // The exact string vitest emits, verbatim from the run that caused this.
    const v = classifyFailure('Error: Test timed out in 5000ms.', 'no imports of GlassCard remain in src');
    expect(v.outcome).toBe(INFRASTRUCTURE_FAILURE);
    expect(v.why).toMatch(/did not finish/);
  });

  it('a filesystem error is INFRASTRUCTURE_FAILURE', () => {
    for (const code of ['ENOENT', 'EACCES', 'EMFILE', 'ENOSPC']) {
      expect(classifyFailure(`Error: ${code}: something`).outcome, code).toBe(INFRASTRUCTURE_FAILURE);
    }
  });

  it('an assertion failure is the ONLY thing that means the policy is violated', () => {
    const v = classifyFailure('AssertionError: expected 2 banned imports to equal 0');
    expect(v.outcome).toBe(POLICY_FAILURE);
  });

  it('an unrecognised failure fails toward UNKNOWN, never toward violation', () => {
    // The rule that keeps this honest as vitest's messages change.
    const v = classifyFailure('TypeError: cannot read properties of undefined');
    expect(v.outcome).toBe(INFRASTRUCTURE_FAILURE);
    expect(v.why).toMatch(/does not recognise/);
  });
});

describe('summarise never converts unknown into pass', () => {
  const pass = { outcome: PASS };
  const policy = { outcome: POLICY_FAILURE };
  const infra = { outcome: INFRASTRUCTURE_FAILURE };

  it('all pass -> 0', () => {
    expect(summarise([pass, pass]).code).toBe(0);
  });

  it('a policy failure -> 1', () => {
    expect(summarise([pass, policy]).code).toBe(1);
  });

  it('an infrastructure failure -> 2, even alongside passes', () => {
    expect(summarise([pass, pass, infra]).code).toBe(2);
  });

  it('infrastructure outranks policy — unknown is not downgraded to a known failure', () => {
    // If some guards could not run, the run's real state is UNKNOWN. Reporting
    // it as a plain policy failure would imply the others were checked.
    const s = summarise([policy, infra]);
    expect(s.code).toBe(2);
    expect(s.outcome).toBe(INFRASTRUCTURE_FAILURE);
  });
});
