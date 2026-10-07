/**
 * 20ae8f27 "[updateShot] Shot not found" (errorCode shot_not_found) was
 * reopened as REGRESSED 4x (2026-09-19 -> 2026-10-07) although every analysis
 * on file said NOT A DEFECT. golf.ts returns this stable reconciliation code
 * on purpose when a client still holds a locally persisted ID for a shot
 * another tab or an earlier retry already deleted; the round-entry hook drops
 * the stale reference (shot-mutation-recovery.test.tsx). The classifier must
 * recognise it (matched: true) and keep it out of the actionable queue.
 */
import { describe, it, expect } from 'vitest';
import { classifyIncident } from '@/lib/admin/incident-classification';

describe('classifyIncident — shot_not_found reconciliation code', () => {
  it('files the designed stale-shot reconciliation as non-actionable', () => {
    const c = classifyIncident({
      title: '[updateShot] Shot not found',
      message: 'Shot not found',
      severity: 'warning',
      source: 'server_action',
      errorCode: 'shot_not_found',
    });
    expect(c.actionable).toBe(false);
    expect(c.matched).toBe(true);
    expect(c.reason).toMatch(/shot_not_found/);
  });

  it('does not swallow a "Shot not found" that lacks the reconciliation code', () => {
    const c = classifyIncident({
      title: '[updateShot] Shot not found',
      message: 'Shot not found',
      severity: 'error',
      source: 'server_action',
    });
    expect(c.actionable).toBe(true);
  });
});
