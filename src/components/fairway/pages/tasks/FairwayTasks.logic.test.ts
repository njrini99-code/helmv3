import { describe, it, expect } from 'vitest';
import { completionFeedback } from './FairwayTasks';
import { assignGuardMessage } from './FairwayCreateTaskModal';

/* ---------------------------------------------------------------------------
 * Deterministic unit tests for the Tasks page decision logic.
 *  - P284: player "Mark complete" feedback — completeTask resolves an
 *    ActionResult { success, error } WITHOUT throwing on a soft failure, so the
 *    card must inspect the result (success → confirm toast; failure → error
 *    toast + rollback). A void/undefined resolution is treated as success.
 *  - P292: assignee error-prevention — block a create that would assign to
 *    nobody, distinguishing a failed roster fetch from a genuinely empty roster.
 * No time, no I/O — pure functions only.
 * ------------------------------------------------------------------------- */

describe('completionFeedback (P284)', () => {
  it('treats an explicit success as success (confirmation toast, no rollback)', () => {
    const out = completionFeedback({ success: true });
    expect(out).toEqual({ kind: 'success', message: 'Marked complete.' });
    expect(out).not.toHaveProperty('rollback');
  });

  it('treats a bare void/undefined resolution as success', () => {
    expect(completionFeedback(undefined)).toEqual({
      kind: 'success',
      message: 'Marked complete.',
    });
    expect(completionFeedback(void 0)).toEqual({
      kind: 'success',
      message: 'Marked complete.',
    });
  });

  it('surfaces the action error message on a soft failure (and rolls back)', () => {
    expect(completionFeedback({ success: false, error: 'You are not assigned to this task' }))
      .toEqual({
        kind: 'error',
        message: 'You are not assigned to this task',
        rollback: true,
      });
  });

  it('falls back to a generic message when a failure carries no error string', () => {
    expect(completionFeedback({ success: false })).toEqual({
      kind: 'error',
      message: 'Could not mark the task complete.',
      rollback: true,
    });
  });

  it('never reports failure as a silent success (the P284 regression)', () => {
    const out = completionFeedback({ success: false, error: 'RLS denied' });
    expect(out.kind).toBe('error');
  });
});

describe('assignGuardMessage (P292)', () => {
  it('blocks an empty "specific" selection', () => {
    expect(
      assignGuardMessage({ assignMode: 'specific', playerCount: 5, selectedCount: 0, playersError: false }),
    ).toBe('Select at least one player, or assign to everyone.');
  });

  it('allows a non-empty "specific" selection', () => {
    expect(
      assignGuardMessage({ assignMode: 'specific', playerCount: 5, selectedCount: 2, playersError: false }),
    ).toBeNull();
  });

  it('blocks an "all" create on a genuinely empty roster with the add-players message', () => {
    const msg = assignGuardMessage({ assignMode: 'all', playerCount: 0, selectedCount: 0, playersError: false });
    expect(msg).toContain('no players on the roster yet');
    expect(msg).toContain('Add players first');
  });

  it('blocks an "all" create when the roster FETCH FAILED with a distinct message', () => {
    const msg = assignGuardMessage({ assignMode: 'all', playerCount: 0, selectedCount: 0, playersError: true });
    expect(msg).toContain("couldn't load your roster");
    // Must NOT misattribute an outage to an empty team.
    expect(msg).not.toContain('no players on the roster yet');
  });

  it('allows an "all" create when the roster has players', () => {
    expect(
      assignGuardMessage({ assignMode: 'all', playerCount: 12, selectedCount: 0, playersError: false }),
    ).toBeNull();
  });
});
