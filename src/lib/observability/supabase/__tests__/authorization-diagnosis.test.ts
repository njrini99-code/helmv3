import { describe, expect, it } from 'vitest';

import {
  diagnoseAuthorization,
  isAuthorizationFailure,
  resolveAuthorizationSurface,
  type DiagnoseAuthorizationInput,
} from '../authorization-diagnosis';
import type { SupabaseErrorEnvelope } from '../envelope';

type AuthEnvelope = DiagnoseAuthorizationInput['envelope'];

function envelope(overrides: Partial<AuthEnvelope> = {}): AuthEnvelope {
  return {
    code: '42501',
    sqlstate: '42501',
    feature: 'round_tracking',
    action: 'save_partial_round',
    operation: 'rpc' as SupabaseErrorEnvelope['operation'],
    relation: null,
    rpc: 'save_partial_round_atomic',
    ...overrides,
  };
}

describe('isAuthorizationFailure', () => {
  it('matches 42501 and the message-fallback code the classifier emits', () => {
    expect(isAuthorizationFailure({ code: '42501', sqlstate: '42501' })).toBe(true);
    expect(isAuthorizationFailure({ code: 'unknown_authorization', sqlstate: null })).toBe(true);
  });

  it('does not match any other mechanism', () => {
    expect(isAuthorizationFailure({ code: '23505', sqlstate: '23505' })).toBe(false);
    expect(isAuthorizationFailure({ code: '42P01', sqlstate: '42P01' })).toBe(false);
    expect(isAuthorizationFailure({ code: null, sqlstate: null })).toBe(false);
  });
});

describe('resolveAuthorizationSurface', () => {
  it('prefers a named rpc, then the rpc operation, then a named relation', () => {
    expect(resolveAuthorizationSurface({ operation: 'select', relation: 'golf_rounds', rpc: 'foo' })).toBe('rpc');
    expect(resolveAuthorizationSurface({ operation: 'rpc', relation: null, rpc: null })).toBe('rpc');
    expect(resolveAuthorizationSurface({ operation: 'update', relation: 'golf_rounds', rpc: null })).toBe('table');
  });

  it('is unknown when nothing names a surface', () => {
    expect(resolveAuthorizationSurface({ operation: 'select', relation: null, rpc: null })).toBe('unknown');
  });
});

describe('diagnoseAuthorization — the discriminating cases', () => {
  it('is not-applicable for a non-authorization mechanism', () => {
    const result = diagnoseAuthorization({
      envelope: envelope({ code: '23505', sqlstate: '23505' }),
      expectation: 'must-be-authorized',
    });
    expect(result.verdict).toBe('NOT_AN_AUTHORIZATION_FAILURE');
    expect(result.applies).toBe(false);
    expect(result.runbook).toHaveLength(0);
  });

  it('EXPECTED_SECURITY_DENIAL when the call site says a denial is possible, and it is not actionable', () => {
    const result = diagnoseAuthorization({ envelope: envelope(), expectation: 'denial-is-possible' });
    expect(result.verdict).toBe('EXPECTED_SECURITY_DENIAL');
    expect(result.actionable).toBe(false);
    expect(result.explanation).toContain('security boundary working');
  });

  it('UNEXPECTED_PRODUCT_FAILURE when the call site says it should always be authorized', () => {
    const result = diagnoseAuthorization({ envelope: envelope(), expectation: 'must-be-authorized' });
    expect(result.verdict).toBe('UNEXPECTED_PRODUCT_FAILURE');
    expect(result.actionable).toBe(true);
  });

  it('the SAME envelope produces opposite verdicts from the expectation alone', () => {
    const shared = envelope();
    const expected = diagnoseAuthorization({ envelope: shared, expectation: 'denial-is-possible' });
    const unexpected = diagnoseAuthorization({ envelope: shared, expectation: 'must-be-authorized' });
    expect(expected.verdict).not.toBe(unexpected.verdict);
  });

  it('UNKNOWN when the call site stated nothing — never silently defaulted to either verdict', () => {
    const result = diagnoseAuthorization({ envelope: envelope(), expectation: 'unknown' });
    expect(result.verdict).toBe('UNKNOWN');
    // Unknown is not healthy: it still needs a human to decide which it is.
    expect(result.actionable).toBe(true);
    expect(result.runbook.length).toBeGreaterThan(0);
  });
});

describe('diagnoseAuthorization — the §68 runbook', () => {
  it('an RPC denial gets the rights-model, search_path and EXECUTE steps', () => {
    const result = diagnoseAuthorization({ envelope: envelope(), expectation: 'must-be-authorized' });
    const ids = result.runbook.map((s) => s.id);
    expect(ids).toContain('invoker-or-definer-rights');
    expect(ids).toContain('search-path');
    expect(ids).toContain('execute-grant');
    expect(ids).not.toContain('table-privilege');
  });

  it('a table denial gets the column/table privilege step and not the function-only ones', () => {
    const result = diagnoseAuthorization({
      envelope: envelope({ operation: 'update', relation: 'golf_rounds', rpc: null }),
      expectation: 'must-be-authorized',
    });
    const ids = result.runbook.map((s) => s.id);
    expect(ids).toContain('table-privilege');
    expect(ids).not.toContain('execute-grant');
    expect(ids).not.toContain('invoker-or-definer-rights');
  });

  it('an unknown surface gets both branches rather than guessing one', () => {
    const result = diagnoseAuthorization({
      envelope: envelope({ operation: 'select', relation: null, rpc: null }),
      expectation: 'must-be-authorized',
    });
    const ids = result.runbook.map((s) => s.id);
    expect(ids).toContain('execute-grant');
    expect(ids).toContain('table-privilege');
  });

  it('covers every question the brief §68 runbook names, in order, for the unknown surface', () => {
    const result = diagnoseAuthorization({
      envelope: envelope({ operation: 'select', relation: null, rpc: null }),
      expectation: 'must-be-authorized',
    });
    expect(result.runbook.map((s) => s.id)).toEqual([
      'is-it-expected',
      'rpc-or-table',
      'invoker-or-definer-rights',
      'search-path',
      'schema-usage',
      'execute-grant',
      'table-privilege',
      'rls-policy',
      'recent-release-or-migration',
      'reproduce-as-the-role',
    ]);
  });

  it('an expected denial still offers the re-check steps, not the full chain', () => {
    const result = diagnoseAuthorization({ envelope: envelope(), expectation: 'denial-is-possible' });
    expect(result.runbook.map((s) => s.id)).toEqual(['is-it-expected', 'recent-release-or-migration']);
  });

  it('never proposes granting a privilege or running SQL as a remediation', () => {
    const result = diagnoseAuthorization({ envelope: envelope(), expectation: 'must-be-authorized' });
    const text = result.runbook.map((s) => `${s.question} ${s.why}`).join(' ').toLowerCase();
    expect(text).not.toContain('grant execute');
    expect(text).not.toContain('create policy');
    expect(text).not.toContain('alter table');
  });
});

describe('diagnoseAuthorization — privacy is structural (§6)', () => {
  it('has no field a policy predicate could travel in: the message is never an input', () => {
    // The input type does not accept a message/details/hint at all. This test
    // pins that by passing one through a widened cast and proving nothing in
    // the output carries it.
    const withMessage = {
      ...envelope(),
      normalizedMessage: 'new row violates row-level security policy PREDICATE-SENTINEL-9999 for table golf_rounds',
      safeDetails: 'PREDICATE-SENTINEL-9999',
      safeHint: 'PREDICATE-SENTINEL-9999',
    } as DiagnoseAuthorizationInput['envelope'];

    const result = diagnoseAuthorization({ envelope: withMessage, expectation: 'must-be-authorized' });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('PREDICATE-SENTINEL-9999');
    expect(serialized).not.toContain('row-level security policy');
  });

  it('the explanation is assembled from enumerated dimensions only', () => {
    const result = diagnoseAuthorization({
      envelope: envelope({ feature: 'lineup', action: 'publish', rpc: 'publish_lineup' }),
      expectation: 'must-be-authorized',
    });
    expect(result.explanation).toContain('lineup/publish');
    expect(result.explanation).toContain('publish_lineup');
  });
});
