/**
 * The loop's job is to notice when part of it stops running. These tests are
 * about the noticing, not the running — every case below is a way the panel
 * could quietly report a dead stage as a healthy one.
 */
import { describe, it, expect } from 'vitest';
import {
  SELFHEAL_STAGES,
  SELFHEAL_RUNNER_LABEL,
  classifySelfHealStage,
  summarizeLoop,
  type SelfHealStageRow,
} from '@/lib/admin/selfheal-registry';

const NOW = new Date('2026-08-27T12:00:00.000Z');

function row(over: Partial<SelfHealStageRow>): SelfHealStageRow {
  const stage = SELFHEAL_STAGES[0]!;
  return {
    ...stage,
    status: 'ok',
    lastRunAt: null,
    lastRunStatus: null,
    lastError: null,
    unreadable: false,
    ...over,
  };
}

describe('SELFHEAL_STAGES', () => {
  it('covers the whole circuit — diagnose, repair, close', () => {
    expect(SELFHEAL_STAGES.map((s) => s.id)).toEqual(['triage', 'repair', 'close']);
  });

  it('numbers the steps in order, because the stages are sequential', () => {
    expect(SELFHEAL_STAGES.map((s) => s.step)).toEqual([1, 2, 3]);
  });

  it('gives every stage a distinct job_type — two stages sharing one would make each read as the other', () => {
    const types = SELFHEAL_STAGES.map((s) => s.jobType);
    expect(new Set(types).size).toBe(types.length);
  });

  it('names an in-repo contract for every stage', () => {
    // The whole reason this registry exists is that the routine contracts used
    // to live only in routine configuration, where nothing diffed them.
    for (const stage of SELFHEAL_STAGES) {
      expect(stage.contract).toMatch(/^(docs|src)\//);
    }
  });

  it('labels every runner, so "it is not running" always says WHERE', () => {
    for (const stage of SELFHEAL_STAGES) {
      expect(SELFHEAL_RUNNER_LABEL[stage.runner]).toBeTruthy();
    }
  });
});

describe('classifySelfHealStage', () => {
  const stage = SELFHEAL_STAGES[0]!;

  it('reads a stage with no heartbeat as never-ran, not ok', () => {
    expect(classifySelfHealStage(stage, null, NOW)).toBe('never-ran');
  });

  it('reads a recent successful heartbeat as ok', () => {
    const lastRun = { started_at: '2026-08-27T09:17:00.000Z', status: 'completed' };
    expect(classifySelfHealStage(stage, lastRun, NOW)).toBe('ok');
  });

  it('goes overdue past 1.5x its cadence — a daily stage silent for two days', () => {
    const lastRun = { started_at: '2026-08-25T09:17:00.000Z', status: 'completed' };
    expect(classifySelfHealStage(stage, lastRun, NOW)).toBe('overdue');
  });

  it('a failed heartbeat is failed even when it is fresh', () => {
    const lastRun = { started_at: '2026-08-27T09:17:00.000Z', status: 'failed' };
    expect(classifySelfHealStage(stage, lastRun, NOW)).toBe('failed');
  });
});

describe('summarizeLoop', () => {
  it('is ok only when every stage is ok', () => {
    expect(summarizeLoop([row({ status: 'ok' }), row({ status: 'ok' }), row({ status: 'ok' })])).toBe('ok');
  });

  it('reports the WORST stage, not the majority — two healthy stages do not close a broken circuit', () => {
    expect(summarizeLoop([row({ status: 'ok' }), row({ status: 'ok' }), row({ status: 'overdue' })])).toBe(
      'overdue',
    );
  });

  it('ranks failed above overdue', () => {
    expect(summarizeLoop([row({ status: 'overdue' }), row({ status: 'failed' })])).toBe('failed');
  });

  it('ranks overdue above never-ran — a stage that ran and stopped is worse news than one that has not started', () => {
    expect(summarizeLoop([row({ status: 'never-ran' }), row({ status: 'overdue' })])).toBe('overdue');
  });

  it('returns unknown when ANY stage was unreadable, even if that stage would classify ok', () => {
    // The instrument failed. Reporting the loop's health from the stages that
    // happened to read is the `unknown → healthy` move the engineering OS
    // forbids, and it is the exact shape that let a dead cron look calm.
    expect(summarizeLoop([row({ status: 'ok' }), row({ status: 'ok', unreadable: true })])).toBe('unknown');
  });

  it('returns unknown for an empty set rather than ok', () => {
    expect(summarizeLoop([])).toBe('unknown');
  });
});
