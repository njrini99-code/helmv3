import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createFixtureRepo, runHook, type FixtureRepo } from './helpers/fixture-repo';

/**
 * `.claude/hooks/record-session-touch.mjs` — session-owned attribution.
 *
 * Spec §35's literal test case: Session A touches calendar.ts, Session B
 * touches rounds.ts -> each session's own state contains only its own file.
 * This is the direct regression test for the exact failure stop-verify.sh's
 * OLD git-based approach had: `git status --porcelain` reports what's dirty,
 * never who dirtied it, so two sessions writing in the same working tree got
 * blamed for each other's changes.
 */
describe('record-session-touch.mjs — session-owned attribution', () => {
  let fixture: FixtureRepo;

  beforeAll(() => {
    fixture = createFixtureRepo();
  });

  afterAll(() => {
    fixture.cleanup();
  });

  it('two sessions touching different files each own only their own', () => {
    const resultA = runHook(fixture, 'record-session-touch.mjs', {
      session_id: 'session-a',
      cwd: fixture.dir,
      tool_input: { file_path: join(fixture.dir, 'src/app/golf/actions/feature-a-one.ts') },
    });
    const resultB = runHook(fixture, 'record-session-touch.mjs', {
      session_id: 'session-b',
      cwd: fixture.dir,
      tool_input: { file_path: join(fixture.dir, 'src/app/golf/actions/feature-b-one.ts') },
    });

    expect(resultA.code).toBe(0);
    expect(resultB.code).toBe(0);

    const stateA = readFileSync(join(fixture.dir, '.claude/session-state/session-a.jsonl'), 'utf8');
    const stateB = readFileSync(join(fixture.dir, '.claude/session-state/session-b.jsonl'), 'utf8');

    expect(stateA).toContain('feature-a-one.ts');
    expect(stateA).not.toContain('feature-b-one.ts');
    expect(stateB).toContain('feature-b-one.ts');
    expect(stateB).not.toContain('feature-a-one.ts');

    // Each touch was also correctly mapped to its own feature — not merely
    // recorded, but recorded with the RIGHT attribution on both axes
    // (session AND feature).
    expect(stateA).toContain('feature_a');
    expect(stateA).not.toContain('feature_b');
    expect(stateB).toContain('feature_b');
    expect(stateB).not.toContain('feature_a');
  });

  it('strips an absolute file_path to repo-relative before recording (the audit\'s blocker case)', () => {
    const result = runHook(fixture, 'record-session-touch.mjs', {
      session_id: 'session-abs-path',
      cwd: fixture.dir,
      tool_input: { file_path: join(fixture.dir, 'src/app/golf/actions/feature-a-one.ts') },
    });
    expect(result.code).toBe(0);
    const state = readFileSync(join(fixture.dir, '.claude/session-state/session-abs-path.jsonl'), 'utf8');
    // Recorded path must be repo-RELATIVE, not the absolute path the tool
    // actually sends — this is exactly the class of bug that shipped
    // invisibly before (mapFilesToFeatures silently matching nothing).
    expect(state).toContain('"path":"src/app/golf/actions/feature-a-one.ts"');
    expect(state).not.toContain(fixture.dir);
    expect(state).toContain('"feature_ids":["feature_a"]');
  });

  it('records NO touch event at all for a path outside the repo root (e.g. a session scratchpad file)', () => {
    // Live incident, 2026-08-21: the pre-rebuild stop-verify.sh counted
    // scratchpad `.ts`/`.mjs` files an orchestrating session wrote as
    // "touched, unverified" and demanded gates be run against them — there
    // is nothing there to gate, they are not repo state. A genuinely
    // OUTSIDE-the-repo temp directory (not just a subdirectory of the
    // fixture) is used here so this can't accidentally pass because the
    // path happened to still resolve inside the fixture.
    const outsideDir = mkdtempSync(join(tmpdir(), 'golfhelm-os-scratchpad-test-'));
    const scratchFile = join(outsideDir, 'some-script.ts');
    const result = runHook(fixture, 'record-session-touch.mjs', {
      session_id: 'session-scratchpad',
      cwd: fixture.dir,
      tool_input: { file_path: scratchFile },
    });
    expect(result.code).toBe(0);
    const statePath = join(fixture.dir, '.claude/session-state/session-scratchpad.jsonl');
    // No ledger file at all — not merely "no touch event in it". The path
    // was rejected before any write happened.
    expect(existsSync(statePath)).toBe(false);
  });
});
