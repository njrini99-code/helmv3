import { describe, it, expect } from 'vitest';
import { buildCircuitSummary, type BuildCircuitSummaryInput } from '../selfheal-circuit';
import { summarizeFlow } from '@/lib/admin/selfheal-flow';
import type { LoopVerdict } from '@/lib/admin/selfheal-capability';
import { NOW, incident, stage } from './fixtures';

function okVerdict(): LoopVerdict {
  return { tone: 'ok', label: 'Healthy', detail: 'On schedule, capability proven.' };
}

function baseInput(overrides: Partial<BuildCircuitSummaryInput> = {}): BuildCircuitSummaryInput {
  const incidents = overrides.incidents ?? [];
  return {
    incidents,
    flow: summarizeFlow(incidents, NOW),
    stageDetails: [stage('triage'), stage('repair'), stage('close')],
    verdict: okVerdict(),
    now: NOW,
    ...overrides,
  };
}

describe('buildCircuitSummary', () => {
  it('healthy: nothing waiting anywhere -> every stage idle, no active stage, capability proven', () => {
    const summary = buildCircuitSummary(baseInput());
    expect(summary.activeStageId).toBeNull();
    expect(summary.stages.map((s) => s.state)).toEqual(['idle', 'idle', 'idle']);
    expect(summary.stages.every((s) => s.capabilityState === 'proven')).toBe(true);
    expect(summary.verdict?.tone).toBe('ok');
  });

  it('blind source (board unreadable): stageDetails null -> every stage still gets a row, capability unknown, not silently proven', () => {
    const summary = buildCircuitSummary(baseInput({ stageDetails: null, verdict: null }));
    expect(summary.stages).toHaveLength(3);
    expect(summary.stages.every((s) => s.capabilityState === 'unknown')).toBe(true);
    expect(summary.verdict).toBeNull();
  });

  it('regression: an incident waiting at repair with a long wait -> repair reads flowing/stalled and carries the active incident', () => {
    const stuck = incident('stuck-1', {
      title: 'Round autosave permissions',
      lifecycle: { state: 'repairable', headline: 'Repairable', because: [] },
      analysis: {
        category: 'fix-here',
        probableCause: 'x',
        suggestedFix: 'y',
        confidence: 'high',
        suspectFiles: [],
        relatedFingerprints: [],
        model: 'm',
        generatedAt: new Date(NOW - 10 * 24 * 3600_000).toISOString(),
        repairVerdict: 'not-reviewed',
      },
    });
    const summary = buildCircuitSummary(baseInput({ incidents: [stuck] }));
    const repairStage = summary.stages.find((s) => s.stageId === 'repair')!;
    expect(repairStage.waiting).toBeGreaterThan(0);
    expect(repairStage.activeIncident?.id).toBe('stuck-1');
    expect(repairStage.activeIncident?.title).toBe('Round autosave permissions');
  });

  it('decision waiting: a stalled stage never reports itself as the active (traveling-dot) stage', () => {
    const stuck = incident('stalled-1', {
      lifecycle: { state: 'repairable', headline: 'Repairable', because: [] },
      analysis: {
        category: 'fix-here',
        probableCause: 'x',
        suggestedFix: 'y',
        confidence: 'high',
        suspectFiles: [],
        relatedFingerprints: [],
        model: 'm',
        generatedAt: new Date(NOW - 30 * 24 * 3600_000).toISOString(),
        repairVerdict: 'not-reviewed',
      },
    });
    const summary = buildCircuitSummary(baseInput({ incidents: [stuck] }));
    const repairStage = summary.stages.find((s) => s.stageId === 'repair')!;
    if (repairStage.state === 'stalled') {
      expect(summary.activeStageId).not.toBe('repair');
    }
  });

  it('all-unknown: no incidents, no stage details, no verdict -> three honest unknown rows, never proven', () => {
    const summary = buildCircuitSummary(baseInput({ incidents: [], stageDetails: null, verdict: null }));
    expect(summary.stages).toHaveLength(3);
    for (const s of summary.stages) {
      expect(s.capabilityState).toBe('unknown');
      expect(s.capabilityState).not.toBe('proven');
      expect(s.activeIncident).toBeNull();
    }
    expect(summary.verdict).toBeNull();
    expect(summary.activeStageId).toBeNull();
  });
});
