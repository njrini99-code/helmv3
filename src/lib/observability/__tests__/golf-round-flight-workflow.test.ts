import { describe, expect, it } from 'vitest';
import {
  createGolfRoundWorkflowTrace,
  getMissingRequiredSteps,
} from '../golf-round-flight-workflow';

describe('Golf round flight-recorder workflow', () => {
  it('marks every required verification step missing when a failed submit never reaches it', () => {
    const trace = createGolfRoundWorkflowTrace({
      workflow: 'golf.round.submit',
      traceId: '0e7df784-4c35-4ff0-85ac-b89fae22b8ee',
    });

    trace.complete('server.validation');
    trace.complete('server.auth');
    trace.complete('server.player');
    trace.fail('db.submit_round_atomic', { errorCode: '23503' });

    expect(getMissingRequiredSteps(trace)).toEqual([
      'verify.round',
      'verify.holes',
      'verify.shots',
    ]);
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
});
