import { describe, it, expect } from 'vitest';
import {
  classifyWorktree,
  PARKABLE,
  UNKNOWN_REMOTE,
  KEEP_WORKSPACE_INTENT_REQUIRED,
  ACTIVE,
} from '../../../scripts/lib/worktree-lifecycle.mjs';

/**
 * Why this file exists.
 *
 * `delete_branch_on_merge` is TRUE on this repo, so GitHub removes a branch's
 * remote the moment its PR merges — i.e. exactly when the checkout becomes
 * safe to reclaim. The park path required a remote tip to prove the commits
 * survive, so merging DESTROYED the evidence parking depended on and no merged
 * worktree could ever be reclaimed.
 *
 * Measured 2026-09-04 before the fix: 0 of 25 worktrees parkable, and three of
 * them (PRs #1793, #1797, #1819) reported `UNKNOWN_REMOTE` — "commits here may
 * exist nowhere else" — in the same row whose branch column read
 * `DELETE_MERGED_EXACT`. One report calling the same commits both
 * provably-in-main and possibly-nowhere.
 *
 * AGENTS.md already records this trap for BRANCH deletion (#1654). That fix
 * never reached the park path. These tests pin that it has now.
 */

const CLEAN_MERGED = {
  path: '/w/x',
  isCanonical: false,
  isCurrentExecution: false,
  branch: 'agent/x',
  dirtyCount: 0,
  hasLiveProcess: false,
  localSha: 'a'.repeat(40),
  prLookup: 'OK',
  prState: 'MERGED',
  prNumber: 1793,
  prHeadSha: 'a'.repeat(40),
  parkPolicy: 'KEEP',
  workspaceMarker: 'present',
  upstream: null,
  remoteSha: null,
  disposition: null,
  worktreePolicy: null,
};

describe('a merged-at-this-tip checkout is reclaimable without a remote', () => {
  it('parks when the upstream is GONE (delete_branch_on_merge removed it)', () => {
    const v = classifyWorktree({ ...CLEAN_MERGED });
    expect(v.verdict).toBe(PARKABLE);
    expect(v.reason).toContain('MERGED at this exact tip');
  });

  it('parks when the upstream is configured but the remote ref is unreadable', () => {
    const v = classifyWorktree({ ...CLEAN_MERGED, upstream: 'origin/agent/x', remoteSha: null });
    expect(v.verdict).toBe(PARKABLE);
  });

  it('overrides a workspace parkPolicy of KEEP — merging IS the owner saying done', () => {
    const v = classifyWorktree({ ...CLEAN_MERGED, parkPolicy: 'KEEP' });
    expect(v.verdict).toBe(PARKABLE);
  });
});

describe('the exception is narrow — every other guard still vetoes', () => {
  // The workspace gate runs BEFORE the reproducibility checks, so with
  // parkPolicy KEEP these stop there. Asserted explicitly rather than just
  // "not PARKABLE", because the ORDER is the safety property: intent is
  // consulted before durability, never after.
  it('a DIFFERENT tip than the PR head is not covered (work continued after merge)', () => {
    const v = classifyWorktree({ ...CLEAN_MERGED, localSha: 'b'.repeat(40) });
    expect(v.verdict).toBe(KEEP_WORKSPACE_INTENT_REQUIRED);
  });

  // ...and with the marker released, the SAME facts fall through to the
  // durability check and are still refused. This is the case that proves the
  // exception is keyed on the exact OID and not merely on state === MERGED.
  it('a DIFFERENT tip is refused on durability too, once the workspace is released', () => {
    const v = classifyWorktree({
      ...CLEAN_MERGED,
      localSha: 'b'.repeat(40),
      parkPolicy: 'PARK_IF_REPRODUCIBLE',
    });
    expect(v.verdict).toBe(UNKNOWN_REMOTE);
  });

  it('an OPEN PR still requires the workspace marker — #1681 stays fixed', () => {
    const v = classifyWorktree({ ...CLEAN_MERGED, prState: 'OPEN', prHeadSha: 'a'.repeat(40) });
    expect(v.verdict).toBe(KEEP_WORKSPACE_INTENT_REQUIRED);
  });

  it('uncommitted work still wins over everything', () => {
    const v = classifyWorktree({ ...CLEAN_MERGED, dirtyCount: 3 });
    expect(v.verdict).toBe(ACTIVE);
  });

  it('a live process still wins over everything', () => {
    const v = classifyWorktree({ ...CLEAN_MERGED, hasLiveProcess: true });
    expect(v.verdict).toBe(ACTIVE);
  });

  it('a FAILED PR lookup is never read as merged — evidence absent is not evidence', () => {
    const v = classifyWorktree({ ...CLEAN_MERGED, prLookup: 'FAILED', prState: null });
    expect(v.verdict).not.toBe(PARKABLE);
  });

  // prHeadSha was simply never passed into the worktree facts, so the
  // exception evaluated false for every checkout and shipped dead. Pinned at
  // both gates so a future refactor cannot quietly drop the field again.
  it('a missing prHeadSha cannot satisfy the exception (the bug that made it dead on arrival)', () => {
    expect(classifyWorktree({ ...CLEAN_MERGED, prHeadSha: null }).verdict)
      .toBe(KEEP_WORKSPACE_INTENT_REQUIRED);
    expect(
      classifyWorktree({ ...CLEAN_MERGED, prHeadSha: null, parkPolicy: 'PARK_IF_REPRODUCIBLE' }).verdict,
    ).toBe(UNKNOWN_REMOTE);
  });
});
