import { describe, expect, it } from 'vitest';
import {
  createGolfRoundWorkflowTrace,
  getMissingRequiredSteps,
} from '../golf-round-flight-workflow';

describe('Golf round flight-recorder workflow', () => {
  it('does not report a failed submit\'s never-reached verification reads as missing required steps (2026-09-02: verify.* is best_effort, not required)', () => {
    // Verification is observability, not a gate — a trace that never reaches
    // the read-back steps because the write itself failed must not ALSO be
    // flagged "required steps missing" for them; that combined signal is
    // what made 032a38e8 misleading (autosave was correctly treated as
    // non-gating, but the trace's own missing-required-steps count implied
    // otherwise). db.submit_round_atomic is still required, so the real
    // failure is still visible.
    const trace = createGolfRoundWorkflowTrace({
      workflow: 'golf.round.submit',
      traceId: '0e7df784-4c35-4ff0-85ac-b89fae22b8ee',
    });

    trace.complete('server.validation');
    trace.complete('server.auth');
    trace.complete('server.player');
    trace.fail('db.submit_round_atomic', { errorCode: '23503' });

    expect(getMissingRequiredSteps(trace)).toEqual([]);
    expect(trace.step('verify.round')?.status).toBe('pending');
    expect(trace.step('verify.holes')?.status).toBe('pending');
    expect(trace.step('verify.shots')?.status).toBe('pending');
  });

  it('does not report an unneeded qualifier transition as a failure for a practice round', () => {
    const trace = createGolfRoundWorkflowTrace({
      workflow: 'golf.round.submit',
      traceId: '3da2fc50-4f70-49ec-95fc-c852c27d90a2',
      qualifierId: null,
    });

    for (const step of [
      'server.validation',
      'server.auth',
      'server.player',
      'db.submit_round_atomic',
      'verify.round',
      'verify.holes',
      'verify.shots',
    ]) {
      trace.complete(step);
    }

    expect(getMissingRequiredSteps(trace)).toEqual([]);
    expect(trace.step('post.qualifier_transition')?.status).toBe('skipped');
  });

  it('declares db.shot_details and db.orphan_trim as best_effort, new_round-only steps on autosave, with real start/complete timing', () => {
    // The no-id/new-round autosave path is a sequence of separate round
    // trips (parent upsert, hole upsert, shot upsert, these two detail/trim
    // steps) rather than the single atomic RPC the existing-round path uses
    // — see the comment on golf.round.autosave in golf-round-flight-workflow.ts.
    const existingRoundTrace = createGolfRoundWorkflowTrace({
      workflow: 'golf.round.autosave',
      traceId: '5b1f2b3a-1111-4111-8111-111111111111',
      existingRoundId: 'round-1',
    });
    expect(existingRoundTrace.step('db.shot_details')?.status).toBe('skipped');
    expect(existingRoundTrace.step('db.orphan_trim')?.status).toBe('skipped');

    const newRoundTrace = createGolfRoundWorkflowTrace({
      workflow: 'golf.round.autosave',
      traceId: '5b1f2b3a-2222-4111-8111-111111111111',
      existingRoundId: null,
    });
    expect(newRoundTrace.step('db.shot_details')?.requiredness).toBe('best_effort');
    expect(newRoundTrace.step('db.orphan_trim')?.requiredness).toBe('best_effort');

    newRoundTrace.start('db.shot_details');
    newRoundTrace.complete('db.shot_details');
    const detailStep = newRoundTrace.step('db.shot_details');
    expect(detailStep?.status).toBe('success');
    expect(detailStep?.startedAt).toBeDefined();
    expect(detailStep?.finishedAt).toBeDefined();

    // best_effort steps never count toward missing-required, whether they
    // ran or stayed pending.
    expect(getMissingRequiredSteps(newRoundTrace)).not.toContain('db.shot_details');
    expect(getMissingRequiredSteps(newRoundTrace)).not.toContain('db.orphan_trim');
  });
});
