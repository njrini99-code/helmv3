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
  selectStageHeartbeat,
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
    lastNote: null,
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

  it('runs Diagnose as the selfheal-triage Vercel cron, four times a day, unchanged contract path', () => {
    // Moved off the Anthropic-hosted cloud routine (src/app/api/cron/
    // selfheal-triage/route.ts) — see docs/ai-system/selfheal/README.md. The
    // contract itself did not move: the automated runner still follows
    // triage-contract.md, just with a narrower SHA-ancestry capability noted
    // there.
    const triage = SELFHEAL_STAGES.find((s) => s.id === 'triage')!;
    expect(triage.runner).toBe('vercel-cron');
    expect(triage.cadenceMinutes).toBe(6 * 60);
    expect(triage.contract).toBe('docs/ai-system/selfheal/triage-contract.md');
  });

  it('runs Repair as the desktop health routine every 6h, not the retired GitHub Actions workflow', () => {
    // The GHA workflow was disabled 2026-09-23. A Bridge that still named it
    // would send an operator to check a runner that no longer exists — the
    // same failure as the 2026-09-05..09 launchd label.
    const repair = SELFHEAL_STAGES.find((s) => s.id === 'repair')!;
    expect(repair.runner).toBe('local-agent');
    expect(repair.cadenceMinutes).toBe(6 * 60);
    expect(repair.contract).toBe('docs/ai-system/selfheal/repair-contract.md');
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

describe('ET-3 — the Close stage reads its own job type', () => {
  it('Close is keyed on selfheal-close, not log-retention', () => {
    // Borrowing log-retention's heartbeat meant retention succeeding counted
    // as evidence about auto-resolution. They are different work with
    // different failure modes; only one of them is Close.
    const close = SELFHEAL_STAGES.find((s) => s.id === 'close');
    expect(close).toBeDefined();
    expect(close!.jobType).toBe('selfheal-close');
  });

  it('no two stages share a job type', () => {
    const types = SELFHEAL_STAGES.map((s) => s.jobType);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe('selectStageHeartbeat — a retired runner cannot speak for the stage', () => {
  // Measured 2026-09-25..27: a retired Anthropic-hosted cloud task still fires
  // once a day (~09:05-09:20 UTC) and writes a `failed` `selfheal-triage` row
  // (`metadata.method = 'claude-code-cloud-session'`, no credentials, no
  // node_modules) minutes after the real Vercel-cron Diagnose run completed.
  // The board read the newest row, so Diagnose — and therefore the whole loop —
  // read FAILED for ~6h a day while the stage itself was healthy.
  const triage = SELFHEAL_STAGES.find((s) => s.id === 'triage')!;
  const repair = SELFHEAL_STAGES.find((s) => s.id === 'repair')!;
  const cloud = {
    started_at: '2026-09-27T09:20:00.000Z',
    status: 'failed',
    metadata: { method: 'claude-code-cloud-session', blocked_reason: 'missing_credentials_and_deps' },
  };
  const cron = {
    started_at: '2026-09-27T09:17:41.220Z',
    status: 'completed',
    metadata: { method: 'vercel-cron', analysed: 2 },
  };

  it('skips a retired-runner row and classifies the stage from its real runner', () => {
    const picked = selectStageHeartbeat(triage, [cloud, cron]);
    expect(picked).toBe(cron);
    expect(classifySelfHealStage(triage, picked, new Date('2026-09-27T10:00:00.000Z'))).toBe('ok');
  });

  it('still counts an operator-run row (manual method) — only retired runners are skipped', () => {
    const manual = { started_at: '2026-09-27T09:30:00.000Z', status: 'failed', metadata: { method: 'manual-cli' } };
    expect(selectStageHeartbeat(triage, [manual, cron])).toBe(manual);
  });

  it('never hides the evidence: when only retired rows exist, the newest row is returned', () => {
    expect(selectStageHeartbeat(triage, [cloud])).toBe(cloud);
  });

  it('recognises a retired runner that names itself in metadata.runner instead of metadata.method', () => {
    // Production 2026-09-30 09:18Z: the same retired cloud task wrote its
    // failed row as `metadata.runner = 'claude-code-cloud-session'` with no
    // `method` key, so the method-only match let it decide Diagnose's status
    // again, painting the loop red, 20s after a completed vercel-cron run.
    const cloudByRunner = {
      started_at: '2026-09-30T09:18:00.000Z',
      status: 'failed',
      metadata: { runner: 'claude-code-cloud-session', blocked_reason: 'missing_credentials' },
    };
    const picked = selectStageHeartbeat(triage, [cloudByRunner, cron]);
    expect(picked).toBe(cron);
    expect(selectStageHeartbeat(triage, [cloudByRunner])).toBe(cloudByRunner);
  });

  it('recognises the retired task under a new spelling (claude-code-scheduled-session, 2026-10-01)', () => {
    // Production 2026-10-01 09:18Z: the same retired task wrote its failed row
    // as `metadata.method = 'claude-code-scheduled-session'`, a third spelling
    // in six days. An exact-match list let it decide Diagnose's status again
    // (red from 09:18Z until the 15:17Z cron run) and slipped past STEP 0b.
    const scheduled = {
      started_at: '2026-10-01T09:18:00.000Z',
      status: 'failed',
      metadata: { method: 'claude-code-scheduled-session' },
    };
    expect(selectStageHeartbeat(triage, [scheduled, cron])).toBe(cron);
    // A prefix entry matches the family only, never a live runner.
    const vercel = { ...cron, started_at: '2026-10-01T09:30:00.000Z', status: 'failed' };
    expect(selectStageHeartbeat(triage, [vercel, cron])).toBe(vercel);
  });

  it('still counts a row whose runner is a live one (e.g. the desktop routine)', () => {
    const desktop = { started_at: '2026-09-30T09:30:00.000Z', status: 'failed', metadata: { runner: 'desktop-routine' } };
    expect(selectStageHeartbeat(triage, [desktop, cron])).toBe(desktop);
  });

  it('is a no-op for a stage with no retired runners, and null for no rows', () => {
    expect(selectStageHeartbeat(repair, [cloud, cron])).toBe(cloud);
    expect(selectStageHeartbeat(triage, [])).toBeNull();
  });
});
