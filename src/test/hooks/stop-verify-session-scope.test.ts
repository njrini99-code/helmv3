// Stop-gate suppression must belong to a SESSION, not to a tree state.
//
// WHAT THE MARK ACTUALLY IS — correcting a common misreading
//
// `$GITDIR/claude-stop-verify-<hash>` is NOT a record that verification
// passed. There is no PASS concept in this hook. It is written BEFORE the
// block is emitted, and its own message says "this will not fire again for
// this tree state". It means:
//
//     "this tree state has already been nagged once"
//
// That is deliberate and worth keeping: without it the gate would re-block
// every Stop at an unchanged tree, and a session that legitimately cannot
// satisfy a gate could never end its turn.
//
// THE BUG
//
// The key is the tree-state hash ALONE. So when session A is nagged at state
// X, a *different* session B arriving at the same state finds the mark and
// exits silently — B is never told about ITS OWN unverified files, context
// gaps or memory gaps. One session's suppression swallows another's warning.
// Fail-open, and invisible: B sees nothing at all.
//
// The fix keys suppression to SESSION_ID + STATE, which preserves the
// loop-safety property while making it un-shareable.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFixtureRepo, runStopVerify, type FixtureRepo } from './helpers/fixture-repo';

let fixture: FixtureRepo;

/** Give a session a touch so stop-verify reaches its MAIN (blocking) path. */
function recordTouch(sessionId: string, relPath: string) {
  const dir = join(fixture.dir, '.claude/session-state');
  mkdirSync(dir, { recursive: true });
  appendFileSync(
    join(dir, `${sessionId}.jsonl`),
    `${JSON.stringify({
      schema: 1,
      ts: new Date().toISOString(),
      type: 'touch',
      path: relPath,
      feature_ids: [],
    })}\n`,
  );
}

/** Dirty the tree so every session in a test sees the SAME state hash. */
function makeSharedState() {
  writeFileSync(join(fixture.dir, 'src/shared-state.ts'), 'export const v = 1;\n');
}

function marks(): string[] {
  return readdirSync(join(fixture.dir, '.git')).filter((f) =>
    f.startsWith('claude-stop-verify-'),
  );
}

beforeEach(() => {
  fixture = createFixtureRepo();
  mkdirSync(join(fixture.dir, 'src'), { recursive: true });
  makeSharedState();
});

afterEach(() => fixture.cleanup());

describe('Stop suppression — same session', () => {
  it('A: blocks on the first Stop at a given tree state', () => {
    recordTouch('sess-a', 'src/shared-state.ts');
    const r = runStopVerify(fixture, 'sess-a');
    expect(JSON.parse(r.stdout).decision).toBe('block');
  });

  it('B: does NOT block the same session again at the same state (loop safety)', () => {
    recordTouch('sess-a', 'src/shared-state.ts');
    const first = runStopVerify(fixture, 'sess-a');
    expect(JSON.parse(first.stdout).decision).toBe('block');

    // Second Stop, same session, unchanged tree: must fall through silently or
    // the session can never end its turn.
    const second = runStopVerify(fixture, 'sess-a');
    expect(second.stdout.trim()).toBe('');
  });

  it('D: blocks again for the same session once the tree changes', () => {
    recordTouch('sess-a', 'src/shared-state.ts');
    runStopVerify(fixture, 'sess-a');

    writeFileSync(join(fixture.dir, 'src/changed.ts'), 'export const w = 2;\n');
    recordTouch('sess-a', 'src/changed.ts');

    const r = runStopVerify(fixture, 'sess-a');
    expect(JSON.parse(r.stdout).decision).toBe('block');
  });
});

describe('Stop suppression — across sessions (the fail-open bug)', () => {
  it('C: a DIFFERENT session at the same tree state must still be told', () => {
    // Session A gets nagged and leaves a mark.
    recordTouch('sess-a', 'src/shared-state.ts');
    expect(JSON.parse(runStopVerify(fixture, 'sess-a').stdout).decision).toBe('block');

    // Session B has its OWN unverified touch at the same tree state. Under the
    // state-only key it finds A's mark and says nothing — B never learns about
    // its own gaps. This is the regression case.
    recordTouch('sess-b', 'src/shared-state.ts');
    const r = runStopVerify(fixture, 'sess-b');

    expect(r.stdout.trim()).not.toBe('');
    expect(JSON.parse(r.stdout).decision).toBe('block');
  });

  it('a session that has NOT been nagged leaves the other session suppressed', () => {
    // The property that makes suppression safe: it is per-session, so one
    // session's mark cannot silence another's, and B's own second Stop is
    // still suppressed for B.
    recordTouch('sess-a', 'src/shared-state.ts');
    recordTouch('sess-b', 'src/shared-state.ts');

    runStopVerify(fixture, 'sess-a');
    expect(JSON.parse(runStopVerify(fixture, 'sess-b').stdout).decision).toBe('block');
    expect(runStopVerify(fixture, 'sess-b').stdout.trim()).toBe('');
  });
});

describe('Stop suppression — the mark is session-scoped on disk', () => {
  it('two sessions at one tree state produce two distinct marks', () => {
    recordTouch('sess-a', 'src/shared-state.ts');
    recordTouch('sess-b', 'src/shared-state.ts');

    runStopVerify(fixture, 'sess-a');
    const afterA = marks().length;
    runStopVerify(fixture, 'sess-b');
    const afterB = marks().length;

    // Under the state-only key this was 1 and 1: B reused A's file.
    expect(afterA).toBe(1);
    expect(afterB).toBe(2);
  });
});
