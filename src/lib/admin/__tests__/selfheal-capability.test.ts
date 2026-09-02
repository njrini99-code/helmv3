/**
 * These tests are about the distinction the module exists to draw: a
 * heartbeat proves a stage RAN, never that it WORKED. Every case below is a
 * way the board could quietly collapse "ran" and "worked" into one chip, or
 * collapse "we could not check" into either "it never worked" or "it works
 * fine" — the three specific manufactured claims `selfheal-capability.ts`
 * forbids.
 */
import { describe, it, expect } from 'vitest';
import { SELFHEAL_STAGES, type SelfHealStage } from '@/lib/admin/selfheal-registry';
import {
  deriveStageCapability,
  deriveLoopCapability,
  summarizeLoopVerdict,
  type CapabilityEvidence,
  type StageCapability,
} from '@/lib/admin/selfheal-capability';

const EMPTY_EVIDENCE: CapabilityEvidence = {
  signalsCollected: null,
  analysesWritten: null,
  repairPrsOpened: null,
  autoResolutionsRecorded: null,
  lastProvenAt: {},
};

const triageStage = SELFHEAL_STAGES.find((s) => s.id === 'triage')!;
const repairStage = SELFHEAL_STAGES.find((s) => s.id === 'repair')!;
const closeStage = SELFHEAL_STAGES.find((s) => s.id === 'close')!;

function capability(over: Partial<StageCapability>): StageCapability {
  return { stageId: 'triage', state: 'proven', evidence: 'test', provenAt: null, ...over };
}

describe('deriveStageCapability', () => {
  it('reads a null evidence field as unknown, never as unproven or as proven', () => {
    const result = deriveStageCapability(triageStage, { ...EMPTY_EVIDENCE, analysesWritten: null });
    expect(result.state).toBe('unknown');
    // The read failing and "it has never worked" are different facts — the
    // evidence string must say so, not just report a bare "unknown".
    expect(result.evidence.toLowerCase()).toMatch(/could not|failed|read/);
    expect(result.provenAt).toBeNull();
  });

  it('reads a 0 count as unproven, with a plain-language reason', () => {
    const result = deriveStageCapability(repairStage, { ...EMPTY_EVIDENCE, repairPrsOpened: 0 });
    expect(result.state).toBe('unproven');
    expect(result.evidence).toBe('Repair has never opened a pull request.');
    expect(result.provenAt).toBeNull();
  });

  it('reads a positive count as proven, with provenAt from lastProvenAt', () => {
    const result = deriveStageCapability(triageStage, {
      ...EMPTY_EVIDENCE,
      analysesWritten: 12,
      lastProvenAt: { triage: '2026-08-27T09:00:00.000Z' },
    });
    expect(result.state).toBe('proven');
    expect(result.evidence).toBe('12 analyses written in the last 7 days.');
    expect(result.provenAt).toBe('2026-08-27T09:00:00.000Z');
  });

  it('reads close (auto-resolutions) the same way as the other two stages', () => {
    const zero = deriveStageCapability(closeStage, { ...EMPTY_EVIDENCE, autoResolutionsRecorded: 0 });
    expect(zero.state).toBe('unproven');
    const one = deriveStageCapability(closeStage, {
      ...EMPTY_EVIDENCE,
      autoResolutionsRecorded: 1,
      lastProvenAt: { close: '2026-08-20T00:00:00.000Z' },
    });
    expect(one.state).toBe('proven');
    expect(one.evidence).toBe('1 automatic resolution recorded in admin_error_resolutions.');
    expect(one.provenAt).toBe('2026-08-20T00:00:00.000Z');
  });

  it('reads an unrecognised stage id as unknown, NOT unproven — a missing probe is this file being behind the registry, not the stage having failed', () => {
    const madeUpStage: SelfHealStage = {
      id: 'collect',
      jobType: 'selfheal-collect',
      step: 0,
      title: 'Collect',
      runner: 'cloud-routine',
      cadenceMinutes: 60,
      what: 'A stage the registry does not carry yet.',
      contract: 'docs/ai-system/selfheal/does-not-exist.md',
    };
    const result = deriveStageCapability(madeUpStage, EMPTY_EVIDENCE);
    expect(result.state).toBe('unknown');
    expect(result.state).not.toBe('unproven');
    expect(result.evidence).toContain('no capability probe defined');
  });
});

describe('deriveLoopCapability', () => {
  it('is proven only when every row is proven', () => {
    expect(
      deriveLoopCapability([
        capability({ state: 'proven' }),
        capability({ state: 'proven' }),
        capability({ state: 'proven' }),
      ]),
    ).toBe('proven');
  });

  it('one unknown among proven rows makes the whole loop unknown', () => {
    // A mean or a majority would report this loop as mostly-proven and mostly
    // healthy. It is not: one link in the circuit could not even be
    // inspected, which is `summarizeLoop`'s own rule for an unreadable stage —
    // a read that failed is not evidence of anything, so it cannot be
    // outvoted by two reads that succeeded.
    expect(
      deriveLoopCapability([
        capability({ state: 'proven' }),
        capability({ state: 'proven' }),
        capability({ state: 'unknown' }),
      ]),
    ).toBe('unknown');
  });

  it('one unproven among proven rows (no unknowns) makes the whole loop unproven', () => {
    // Same discipline, one severity down: two stages doing their job does not
    // close a circuit with one dead link in it.
    expect(
      deriveLoopCapability([
        capability({ state: 'proven' }),
        capability({ state: 'proven' }),
        capability({ state: 'unproven' }),
      ]),
    ).toBe('unproven');
  });

  it('returns unknown for an empty set rather than defaulting to proven', () => {
    expect(deriveLoopCapability([])).toBe('unknown');
  });
});

describe('summarizeLoopVerdict', () => {
  it('runtime ok + capability unproven is NOT tone ok — "the process ran" is not "the system works"', () => {
    // This is the headline test. A loop where every stage is on schedule but
    // at least one has never produced its output is the exact shape that hid
    // the Repair stage's silent failure on 2026-08-28: healthy heartbeats,
    // zero pull requests, ever. If this collapses to tone 'ok' the whole
    // reason this module exists is gone.
    const verdict = summarizeLoopVerdict({ runtime: 'ok', capability: 'unproven' });
    expect(verdict.tone).not.toBe('ok');
    expect(verdict.tone).toBe('warning');
    expect(verdict.label.toLowerCase()).not.toBe('healthy');
  });

  it('runtime ok + capability proven is the only combination that is tone ok', () => {
    const verdict = summarizeLoopVerdict({ runtime: 'ok', capability: 'proven' });
    expect(verdict.tone).toBe('ok');
  });

  it('unknown on either axis wins outright, even over a failing runtime', () => {
    expect(summarizeLoopVerdict({ runtime: 'unknown', capability: 'proven' }).tone).toBe('unknown');
    expect(summarizeLoopVerdict({ runtime: 'failed', capability: 'unknown' }).tone).toBe('unknown');
  });

  it('a failed or overdue runtime is danger regardless of capability', () => {
    expect(summarizeLoopVerdict({ runtime: 'failed', capability: 'proven' }).tone).toBe('danger');
    expect(summarizeLoopVerdict({ runtime: 'overdue', capability: 'unproven' }).tone).toBe('danger');
  });

  it('never-ran runtime with unproven capability is still not ok', () => {
    expect(summarizeLoopVerdict({ runtime: 'never-ran', capability: 'unproven' }).tone).not.toBe('ok');
  });
});

describe('every current stage has a capability probe', () => {
  // Iterates the REGISTRY's own const, not a hand-copied list of ids — so a
  // stage added later without a matching probe in selfheal-capability.ts
  // fails this test with a clear cause, instead of silently reading
  // 'unknown' forever on a live board with nobody noticing why.
  it.each(SELFHEAL_STAGES)('stage "$id" ($title) resolves to a non-unknown state when its evidence field is populated', (stage) => {
    const populated: CapabilityEvidence = {
      ...EMPTY_EVIDENCE,
      analysesWritten: stage.id === 'triage' ? 3 : null,
      repairPrsOpened: stage.id === 'repair' ? 3 : null,
      autoResolutionsRecorded: stage.id === 'close' ? 3 : null,
      lastProvenAt: { [stage.id]: '2026-08-27T00:00:00.000Z' },
    };
    const result = deriveStageCapability(stage, populated);
    expect(result.state).not.toBe('unknown');
    expect(result.state).toBe('proven');
  });
});
