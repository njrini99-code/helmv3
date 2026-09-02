// The board rendered one surface's zero as "production is healthy" while the
// other reported twelve unresolved issues. These tests pin the state that
// could not previously be expressed: two surfaces that disagree without either
// being broken.
import { describe, it, expect } from 'vitest';
import { reconcileErrorSurfaces } from '../reconciliation';

const reading = (count: number | null) => ({ health: 'reading' as const, count });

describe('reconciling the two error surfaces', () => {
  it('REPRODUCES 2026-08-30: admin_events quiet, Sentry loud -> partial, not healthy', () => {
    const r = reconcileErrorSurfaces({ application: reading(0), runtime: reading(12) });
    expect(r.overall).toBe('partial');
    expect(r.application.state).toBe('healthy');
    expect(r.runtime.state).toBe('degraded');
    expect(r.note).toMatch(/quiet while the runtime error surface reports 12/);
  });

  it('is symmetric — a quiet Sentry does not excuse loud application events', () => {
    const r = reconcileErrorSurfaces({ application: reading(5), runtime: reading(0) });
    expect(r.overall).toBe('partial');
    expect(r.note).toMatch(/runtime error surface is quiet while application events reports 5/);
  });

  it('both quiet and agreeing IS healthy — the contract does not forbid good news', () => {
    expect(reconcileErrorSurfaces({ application: reading(0), runtime: reading(0) }).overall).toBe('healthy');
  });

  it('both reporting is degraded, not partial — they agree', () => {
    expect(reconcileErrorSurfaces({ application: reading(3), runtime: reading(9) }).overall).toBe('degraded');
  });

  it('a BLIND surface can never produce healthy, whatever the other one says', () => {
    // The rule canClaimAllClear applies page-wide, applied here: a source that
    // could not be read is not a quiet one.
    for (const other of [reading(0), reading(7)]) {
      const a = reconcileErrorSurfaces({ application: { health: 'blind', count: null }, runtime: other });
      expect(a.overall).toBe('blind');
      const b = reconcileErrorSurfaces({ application: other, runtime: { health: 'blind', count: null } });
      expect(b.overall).toBe('blind');
    }
  });

  it('names WHICH surface is blind — an unattributed warning is unactionable', () => {
    const r = reconcileErrorSurfaces({
      application: { health: 'blind', count: null },
      runtime: { health: 'blind', count: null },
    });
    expect(r.note).toMatch(/application events and the runtime error surface/);
  });

  it('a readable surface with a NULL count is unknown, never zero', () => {
    const r = reconcileErrorSurfaces({ application: reading(null), runtime: reading(0) });
    expect(r.overall).toBe('unknown');
    expect(r.application.state).toBe('unknown');
  });

  it("an 'unknown' health is unknown too — blindness is not the only way to fail", () => {
    const r = reconcileErrorSurfaces({
      application: { health: 'unknown', count: 0 },
      runtime: reading(0),
    });
    expect(r.overall).toBe('unknown');
  });

  it("a 'partial' source still counts — degraded reading is a reading", () => {
    const r = reconcileErrorSurfaces({ application: { health: 'partial', count: 0 }, runtime: reading(4) });
    expect(r.overall).toBe('partial');
    expect(r.application.state).toBe('healthy');
  });

  it('always returns a note a screen can render verbatim', () => {
    const cases = [
      { application: reading(0), runtime: reading(0) },
      { application: reading(0), runtime: reading(1) },
      { application: reading(1), runtime: reading(1) },
      { application: reading(null), runtime: reading(0) },
      { application: { health: 'blind' as const, count: null }, runtime: reading(0) },
    ];
    for (const c of cases) expect(reconcileErrorSurfaces(c).note.length).toBeGreaterThan(20);
  });
});
