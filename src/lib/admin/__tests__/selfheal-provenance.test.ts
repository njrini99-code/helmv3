import { describe, it, expect } from 'vitest';
import {
  classifyRunProvenance,
  deriveRunOutcome,
} from '@/lib/admin/selfheal-provenance';

/**
 * The metadata literals below are COPIED from production rows read on
 * 2026-09-01, not invented. That is the point of the file: the classifier
 * exists to tell three real recorded shapes apart, and a test built from
 * imagined shapes would pass while the real ones fell through.
 */
describe('classifyRunProvenance', () => {
  it('reads a hand-written probe row as an instrument probe, not a stage run', () => {
    const meta = {
      note: 'MANUAL INSTRUMENT PROBE, not a stage run. Written by hand 2026-08-28 to verify the board renders a heartbeat.',
    };
    const p = classifyRunProvenance(meta);
    expect(p.kind).toBe('instrument-probe');
    expect(p.basis).toContain('MANUAL INSTRUMENT PROBE');
  });

  it('reads a manual-* method as operator-assisted', () => {
    const p = classifyRunProvenance({
      capped: false,
      groups: 15,
      method: 'manual-mcp-substitute-for-missing-service-role-key',
    });
    expect(p.kind).toBe('operator-assisted');
    expect(p.basis).toBe('method: manual-mcp-substitute-for-missing-service-role-key');
  });

  it('reads an operator-supervised note as operator-assisted', () => {
    expect(
      classifyRunProvenance({ prs: [1658], note: 'First end-to-end Repair proof run, operator-supervised.' }).kind,
    ).toBe('operator-assisted');
  });

  it('prefers instrument-probe when a row carries both markers', () => {
    // A probe row that also names a manual method is still not a stage run;
    // the stronger claim ("this did not happen at all") has to win.
    expect(
      classifyRunProvenance({
        note: 'MANUAL INSTRUMENT PROBE, not a stage run.',
        method: 'manual-something',
      }).kind,
    ).toBe('instrument-probe');
  });

  it('defaults to autonomous with a null basis — absence of evidence, not evidence of absence', () => {
    const p = classifyRunProvenance({ run_id: 'c00f19a8', skipped: 1, confirmed: 0 });
    expect(p).toEqual({ kind: 'autonomous', basis: null });
  });

  it('is total across every non-object metadata shape', () => {
    for (const bad of [null, undefined, 'a string', 42, true, [1, 2, 3], NaN]) {
      expect(classifyRunProvenance(bad)).toEqual({ kind: 'autonomous', basis: null });
    }
  });
});

describe('deriveRunOutcome', () => {
  it('extracts the recorded work facts in a fixed order', () => {
    const out = deriveRunOutcome({
      run_id: 'c00f19a8-c159-47d6-970e-112f7b903ec3',
      skipped: 1,
      confirmed: 0,
      corrected: 0,
    });
    expect(out.facts).toEqual([
      { label: 'skipped', value: '1' },
      { label: 'confirmed', value: '0' },
      { label: 'corrected', value: '0' },
    ]);
  });

  it('never renders run_id, method or note as a work fact', () => {
    const out = deriveRunOutcome({
      run_id: 'c00f19a8',
      method: 'manual-mcp-substitute-for-missing-service-role-key',
      note: 'some prose',
      degraded: true,
      groups: 15,
    });
    expect(out.facts).toEqual([{ label: 'groups', value: '15' }]);
  });

  it('renders a PR array as issue references and an empty one as none', () => {
    expect(deriveRunOutcome({ prs: [1658] }).facts).toEqual([{ label: 'PRs', value: '#1658' }]);
    expect(deriveRunOutcome({ prs: [] }).facts).toEqual([{ label: 'PRs', value: 'none' }]);
  });

  it('renders booleans as yes/no rather than dropping them', () => {
    // `capped: false` is a real answer to "did this run hit its cap" — it must
    // not vanish the way a falsy-filtered value would.
    expect(deriveRunOutcome({ capped: false }).facts).toEqual([{ label: 'capped', value: 'no' }]);
  });

  it('carries a blocked reason separately from the note', () => {
    const out = deriveRunOutcome({
      analysed: 0,
      blocked_reason: 'missing_supabase_service_role_key',
      note: 'context about the block',
    });
    expect(out.blockedReason).toBe('missing_supabase_service_role_key');
    expect(out.note).toBe('context about the block');
    expect(out.facts).toEqual([{ label: 'analysed', value: '0' }]);
  });

  it('treats blank strings as absent rather than as an empty reason', () => {
    const out = deriveRunOutcome({ blocked_reason: '   ', note: '' });
    expect(out.blockedReason).toBeNull();
    expect(out.note).toBeNull();
  });

  it('returns a valid empty outcome for unusable metadata', () => {
    expect(deriveRunOutcome(null)).toEqual({
      provenance: { kind: 'autonomous', basis: null },
      facts: [],
      blockedReason: null,
      note: null,
    });
  });
});
