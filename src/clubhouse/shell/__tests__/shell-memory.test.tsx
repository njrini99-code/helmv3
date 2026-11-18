import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ChRoundInProgress, ChShellData } from '../../data/shell';
import { rememberShell, useLastKnownShell, withLastKnown } from '../shell-memory';

/**
 * GAP-S-14: a failed round-in-progress read must not silently drop Resume, and a failed staff read must not silently
 * demote a head coach. The shell keeps the last known answer across the layout's renders; with none, the fallback shows
 * but is not remembered.
 */

const round: ChRoundInProgress = { id: 'r1', course: 'Pinehurst No. 2', hole: 12, toPar: -2, playerId: 'p1' };
const answered = (over: Partial<ChShellData> = {}): ChShellData => ({ pendingJoinRequests: 0, roundInProgress: round, viewerIsHeadCoach: true, ...over });
const failed = (over: Partial<ChShellData> = {}): ChShellData => ({ pendingJoinRequests: 0, roundInProgress: null, viewerIsHeadCoach: false, unknown: ['roundInProgress', 'viewerIsHeadCoach'], ...over });

describe('Shell memory (GAP-S-14)', () => {
  it('a failed read on a later render keeps Resume and the head coach’s title', () => {
    const { result, rerender } = renderHook(({ shell }) => useLastKnownShell(shell, 'u1\u0000t1'), { initialProps: { shell: answered() } });
    expect(result.current.roundInProgress).toEqual(round);
    expect(result.current.viewerIsHeadCoach).toBe(true);
    // The layout renders again (a refresh, a navigation) and both reads fail.
    rerender({ shell: failed() });
    expect(result.current.roundInProgress).toEqual(round);
    expect(result.current.viewerIsHeadCoach).toBe(true);
    // And again: still kept, the failure did not overwrite what was known.
    rerender({ shell: failed({ pendingJoinRequests: 3 }) });
    expect(result.current.roundInProgress).toEqual(round);
    expect(result.current.viewerIsHeadCoach).toBe(true);
    expect(result.current.pendingJoinRequests).toBe(3);
  });

  it('a read that answers decides: the round finished and the title changed are drawn, and remembered', () => {
    const { result, rerender } = renderHook(({ shell }) => useLastKnownShell(shell, 'u2\u0000t1'), { initialProps: { shell: answered() } });
    rerender({ shell: answered({ roundInProgress: null, viewerIsHeadCoach: false }) });
    expect(result.current.roundInProgress).toBeNull();
    expect(result.current.viewerIsHeadCoach).toBe(false);
    rerender({ shell: failed() });
    expect(result.current.roundInProgress).toBeNull();
    expect(result.current.viewerIsHeadCoach).toBe(false);
  });

  it('only the read that failed is kept; the other one’s answer is drawn', () => {
    const { result, rerender } = renderHook(({ shell }) => useLastKnownShell(shell, 'u3\u0000t1'), { initialProps: { shell: answered() } });
    rerender({ shell: answered({ viewerIsHeadCoach: false, roundInProgress: null, unknown: ['roundInProgress'] }) });
    expect(result.current.roundInProgress).toEqual(round);
    expect(result.current.viewerIsHeadCoach).toBe(false);
  });

  it('with nothing known, the fallback shows but is not taken as the answer', () => {
    const { result, rerender } = renderHook(({ shell }) => useLastKnownShell(shell, 'u4\u0000t1'), { initialProps: { shell: failed() } });
    // Hidden, not revoked: no Resume and plain "Coach" for now.
    expect(result.current.roundInProgress).toBeNull();
    expect(result.current.viewerIsHeadCoach).toBe(false);
    rerender({ shell: answered() });
    expect(result.current.viewerIsHeadCoach).toBe(true);
    rerender({ shell: failed() });
    expect(result.current.roundInProgress).toEqual(round);
    expect(result.current.viewerIsHeadCoach).toBe(true);
  });

  it('another team or user never inherits the answer', () => {
    const { result, rerender } = renderHook(({ shell, k }) => useLastKnownShell(shell, k), { initialProps: { shell: answered(), k: 'u5\u0000t1' } });
    rerender({ shell: failed(), k: 'u5\u0000t2' });
    expect(result.current.roundInProgress).toBeNull();
    expect(result.current.viewerIsHeadCoach).toBe(false);
  });

  it('the pure parts: what is drawn and what is remembered', () => {
    expect(withLastKnown(answered(), undefined)).toEqual(answered());
    expect(withLastKnown(failed(), { roundInProgress: round, viewerIsHeadCoach: true })).toMatchObject({ roundInProgress: round, viewerIsHeadCoach: true });
    expect(rememberShell(failed(), undefined)).toEqual({ roundInProgress: undefined, viewerIsHeadCoach: undefined });
    expect(rememberShell(failed({ unknown: ['viewerIsHeadCoach'] }), { roundInProgress: round, viewerIsHeadCoach: true })).toEqual({ roundInProgress: null, viewerIsHeadCoach: true });
  });
});
