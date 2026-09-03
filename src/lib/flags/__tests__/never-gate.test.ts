import { describe, it, expect } from 'vitest';
import { neverGateHits, NEVER_GATE_KEYWORDS } from '../never-gate';

describe('neverGateHits', () => {
  it('is clean for a flag whose id/purpose name none of the banned concepts', () => {
    expect(
      neverGateHits({
        feature_id: 'flight_recorder',
        purpose: 'Arms per-request golf round mutation tracing so /admin/traces has data.',
      }),
    ).toEqual([]);
  });

  it('flags a purpose that mentions auth', () => {
    const hits = neverGateHits({
      feature_id: 'login_flow_v2',
      purpose: 'Gates the new auth flow behind a rollout percentage.',
    });
    expect(hits).toEqual([{ keyword: 'auth', field: 'purpose' }]);
  });

  it('flags a feature_id that mentions rls', () => {
    const hits = neverGateHits({
      feature_id: 'rls_bypass_toggle',
      purpose: 'Nothing suspicious here.',
    });
    expect(hits).toEqual([{ keyword: 'rls', field: 'feature_id' }]);
  });

  it('flags tenancy/tenant language', () => {
    const hits = neverGateHits({
      feature_id: 'multi_tenant_switch',
      purpose: 'Controls a cosmetic banner.',
    });
    expect(hits.some((h) => h.keyword === 'tenan')).toBe(true);
  });

  it('flags membership language', () => {
    const hits = neverGateHits({
      feature_id: 'team_feature',
      purpose: 'Whether team membership grants this optional widget.',
    });
    expect(hits.some((h) => h.keyword === 'member')).toBe(true);
  });

  it('flags required-persistence language', () => {
    const hits = neverGateHits({
      feature_id: 'save_flow',
      purpose: 'Whether round data persistence runs synchronously or async.',
    });
    expect(hits.some((h) => h.keyword === 'persist')).toBe(true);
  });

  it('can report a hit in both fields at once', () => {
    const hits = neverGateHits({
      feature_id: 'auth_experiment',
      purpose: 'A second auth check for experimentation.',
    });
    expect(hits).toEqual([
      { keyword: 'auth', field: 'feature_id' },
      { keyword: 'auth', field: 'purpose' },
    ]);
  });

  it('is case-insensitive', () => {
    const hits = neverGateHits({ feature_id: 'AUTH_TOGGLE', purpose: 'x' });
    expect(hits.length).toBeGreaterThan(0);
  });

  it('NEVER_GATE_KEYWORDS matches the owner-approved list (ADR 2026-09-03)', () => {
    expect([...NEVER_GATE_KEYWORDS].sort()).toEqual(['auth', 'member', 'persist', 'rls', 'tenan'].sort());
  });
});
