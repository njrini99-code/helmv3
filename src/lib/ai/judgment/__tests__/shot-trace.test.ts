import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => true }));
vi.mock('@/lib/typesafe/client', () => ({ askJev: vi.fn(async () => null), isTypeSafeConfigured: () => false, TYPESAFE_MODEL: 'jev-latest' }));

import { compileShotTraceEvidence, shouldJudgeTrace, validateShotLedger, type TraceStepRow } from '../evidence/shot-ledger';
import { applyShotTracePolicy, judgeShotTrace } from '../use-cases/shot-trace';
import type { NormalizedAnswers } from '../types';

const step = (key: string, status = 'success', over: Partial<TraceStepRow> = {}): TraceStepRow => ({ step_key: key, status, ...over });
const cleanAddShot = [
  step('server.validation'), step('server.auth'), step('server.player'), step('db.shot_mutation'),
  step('verify.shots', 'success', { observed: { expected: 5, actual: 5 } }), step('post.stats'),
];

describe('validateShotLedger', () => {
  it('accepts a contiguous, holed-last ledger', () => {
    expect(validateShotLedger([
      { hole_number: 1, shot_number: 1, distance_unit_before: 'yards', distance_to_hole_before: 380 },
      { hole_number: 1, shot_number: 2, distance_unit_after: 'feet', distance_to_hole_after: 12 },
      { hole_number: 1, shot_number: 3, result: 'hole', distance_to_hole_after: 0 },
    ])).toEqual([]);
  });

  it('names each contract violation', () => {
    expect(validateShotLedger([
      { hole_number: 1, shot_number: 1, result: 'hole' },
      { hole_number: 1, shot_number: 3, distance_unit_after: 'cubits', distance_to_hole_after: -4 },
      { hole_number: 1, shot_number: 3 },
    ]).sort()).toEqual(['duplicate_shot_number', 'illegal_distance_unit', 'negative_distance', 'non_contiguous_shot_numbers', 'shot_after_holed']);
  });
});

describe('compileShotTraceEvidence', () => {
  it('recomputes required-step facts from the rows, not the counters', () => {
    const e = compileShotTraceEvidence({
      run: { workflow: 'golf.shot.add_or_edit', status: 'success', missing_required_step_count: 3 },
      steps: cleanAddShot,
    });
    expect(e.steps.required_declared).toEqual(['server.validation', 'server.auth', 'server.player', 'db.shot_mutation']);
    expect(e.steps.required_missing).toEqual([]);
    expect(e.hard_invariants).toEqual([]);
    expect(e.verification[0]).toEqual({ step: 'verify.shots', expected: 5, actual: 5, matched: true });
  });

  it('a success claiming a failed required step is a hard invariant', () => {
    const e = compileShotTraceEvidence({
      run: { workflow: 'golf.shot.delete', status: 'success' },
      steps: [step('server.validation'), step('server.auth'), step('server.player'), step('db.delete_shot', 'failure', { error_code: '23503' })],
    });
    expect(e.hard_invariants).toEqual(['success_with_failed_required_step']);
    expect(e.steps.required_failed).toEqual(['db.delete_shot']);
  });

  it('a verify.shots mismatch is a hard invariant; a missing conditional step is not', () => {
    const e = compileShotTraceEvidence({
      run: { workflow: 'golf.round.autosave', status: 'success' },
      steps: [step('server.validation'), step('server.auth'), step('server.player'), step('db.save_partial_round_atomic'),
        step('verify.shots', 'success', { observed: { expected: 9, actual: 8 } })],
    });
    expect(e.hard_invariants).toEqual(['persisted_shot_count_mismatch']);
    expect(e.steps.conditional_missing).toEqual(['db.create_or_update_draft']);
  });

  it('detects recovery paths from step keys and error text', () => {
    const e = compileShotTraceEvidence({
      run: { workflow: 'golf.round.submit', status: 'success', failure_code: null },
      steps: [step('db.submit_round_atomic', 'failure', { error_summary: 'fetch failed' }), step('db.direct_submit_fallback')],
    });
    expect(e.recovery).toEqual({ fallback_used: true, conflict_seen: false, retry_seen: true });
  });
});

describe('shouldJudgeTrace', () => {
  const clean = compileShotTraceEvidence({ run: { workflow: 'golf.shot.add_or_edit', status: 'success' }, steps: cleanAddShot });
  it('skips a clean success unless sampled', () => {
    expect(shouldJudgeTrace(clean, '00000000-0000-4000-8000-0000000000a1').judge).toBe(false);
    expect(shouldJudgeTrace(clean, '00000000-0000-4000-8000-000000000000')).toEqual({ judge: true, why: 'sample' });
  });
  it('judges failures, warnings, missing required steps', () => {
    expect(shouldJudgeTrace({ ...clean, run_status: 'failure' }, 'x1').why).toBe('failure');
    expect(shouldJudgeTrace({ ...clean, status_downgraded_from: 'success' }, 'x1').why).toBe('warning');
    expect(shouldJudgeTrace({ ...clean, steps: { ...clean.steps, required_missing: ['db.shot_mutation'] } }, 'x1').why).toBe('required_missing');
  });
});

describe('applyShotTracePolicy', () => {
  const answers = (over: Record<string, number>, domain = 'none', confidence = 0.9): NormalizedAnswers => ({
    player_intent_preserved: { kind: 'noul', p: over.intent ?? 0.9 },
    workflow_semantically_complete: { kind: 'noul', p: 0.9 },
    persisted_state_matches_acknowledged: { kind: 'noul', p: 0.9 },
    silent_failure_likely: { kind: 'noul', p: over.silent ?? 0.05 },
    instrumentation_only: { kind: 'noul', p: over.instr ?? 0.1 },
    more_evidence_required: { kind: 'noul', p: over.more ?? 0.1 },
    requires_replay: { kind: 'noul', p: over.replay ?? 0.1 },
    failure_domain: { kind: 'choice', choice: domain, confidence, probabilities: { [domain]: confidence } },
  });
  const facts = { hardInvariantFailed: false };

  it('clean answers pass', () => expect(applyShotTracePolicy(answers({}), facts).disposition).toBe('pass'));
  it('silent failure escalates', () => {
    const r = applyShotTracePolicy(answers({ silent: 0.8 }, 'persisted_ledger'), facts);
    expect(r).toEqual({ disposition: 'escalate', reasonCodes: ['domain:persisted_ledger', 'silent_failure_likely'] });
  });
  it('lost intent escalates when the failure is not demonstrably loud', () => {
    expect(applyShotTracePolicy(answers({ intent: 0.2, silent: 0.55 }), facts).reasonCodes).toContain('intent_not_preserved');
  });
  it('lost intent with a loud failure and matching persisted state only observes', () => {
    const r = applyShotTracePolicy(answers({ intent: 0.05, silent: 0.07 }, 'conflict_detection'), facts);
    expect(r).toEqual({ disposition: 'observe', reasonCodes: ['domain:conflict_detection', 'intent_not_preserved_loud'] });
  });
  it('thin evidence collects more (domain not none, so the clean gate stays shut)', () => {
    expect(applyShotTracePolicy(answers({ more: 0.7 }, 'unknown'), facts).disposition).toBe('collect_more_evidence');
  });
  it('a required step missing can never pass, whatever Jev says', () => {
    const r = applyShotTracePolicy(answers({}), { hardInvariantFailed: false, softFindings: ['required_missing'] });
    expect(r.disposition).toBe('observe');
    expect(r.reasonCodes).toContain('required_missing_unsettled');
    expect(applyShotTracePolicy(answers({ more: 0.8 }), { hardInvariantFailed: false, softFindings: ['required_missing'] }).disposition).toBe('collect_more_evidence');
  });
  it('any soft finding blocks pass', () => {
    expect(applyShotTracePolicy(answers({}), { hardInvariantFailed: false, softFindings: ['warned'] }).disposition).toBe('observe');
  });
  it('instrumentation-only observes', () => expect(applyShotTracePolicy(answers({ instr: 0.8 }, 'observability_only'), facts).disposition).toBe('observe'));
  it('a confidently named domain observes even when nothing else fires', () => {
    expect(applyShotTracePolicy(answers({}, 'conflict_recovery', 0.7), facts).disposition).toBe('observe');
    expect(applyShotTracePolicy(answers({}, 'conflict_recovery', 0.3), facts).disposition).toBe('pass');
  });
});

describe('judgeShotTrace', () => {
  it('a ledger violation escalates even with the provider unavailable', async () => {
    const { evidence, result } = await judgeShotTrace({
      traceId: '11111111-1111-4111-8111-111111111111',
      run: { workflow: 'golf.shot.add_or_edit', status: 'success' },
      steps: cleanAddShot,
      shots: [{ hole_number: 1, shot_number: 2 }],
    }, { dryRun: true });
    expect(evidence.hard_invariants).toEqual(['ledger:non_contiguous_shot_numbers']);
    expect(result.disposition).toBe('escalate');
    expect(result.providerErrorCode).toBe('not_configured');
    expect(result.shadow).toBe(true);
  });
});
