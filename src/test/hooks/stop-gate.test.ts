import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFixtureRepo, runStopVerify, type FixtureRepo } from './helpers/fixture-repo';

/**
 * `.claude/hooks/stop-verify.sh` (+ `lib/stop-check.mjs`) — the rebuilt Stop
 * gate, spec §12/§35.
 *
 * Tests run SEQUENTIALLY against one shared fixture repo, each dirtying the
 * tree differently so the loop-safety state hash (HEAD + git status +
 * git diff --stat) never collides between unrelated tests — a collision
 * would silently allow a test that should have blocked, the same failure
 * mode the audit warned about ("a guard that cannot fire is worse than no
 * guard, because it is believed").
 */
function appendEventRaw(fixture: FixtureRepo, sessionId: string, event: Record<string, unknown>) {
  const dir = join(fixture.dir, '.claude/session-state');
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `${sessionId}.jsonl`), `${JSON.stringify({ schema: 1, ts: new Date().toISOString(), ...event })}\n`);
}

function dirtyFile(fixture: FixtureRepo, relPath: string, content: string) {
  writeFileSync(join(fixture.dir, relPath), content);
}

describe('stop-verify.sh — rebuilt Stop gate', () => {
  let fixture: FixtureRepo;

  beforeAll(() => {
    fixture = createFixtureRepo();
  });

  afterAll(() => {
    fixture.cleanup();
  });

  it('ALLOWS silently on a clean tree with zero session touches (first stop — baseline write)', () => {
    const result = runStopVerify(fixture, 'sess-clean-1');
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  it('stays ADVISORY (non-blocking) when git shows unattributed dirt but this session touched nothing', () => {
    // Dirty a file WITHOUT recording any session-state touch — simulates
    // either a peer session's change or a hook-wiring gap. Same session id
    // as the previous test, so its baseline already exists.
    dirtyFile(fixture, 'src/app/golf/actions/feature-a-one.ts', 'export const one = 999;\n');
    const result = runStopVerify(fixture, 'sess-clean-1');
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(''); // never blocks — advisory only
    expect(result.stderr).toContain('zero touches');
    // Revert so later tests start from a known state.
    fixture.git('checkout', '--', 'src/app/golf/actions/feature-a-one.ts');
  });

  it('BLOCKS once on the base verification reminder when a session touched a mapped, context-loaded, memory-updated feature — with NO gap sections', () => {
    dirtyFile(fixture, 'src/app/golf/actions/feature-a-one.ts', 'export const one = 2;\n');
    appendEventRaw(fixture, 'sess-clean-touch', {
      type: 'context_load',
      source: 'read',
      path: 'memory/features/feature-a.md',
      feature_ids: ['feature_a'],
    });
    appendEventRaw(fixture, 'sess-clean-touch', {
      type: 'touch',
      path: 'src/app/golf/actions/feature-a-one.ts',
      feature_ids: ['feature_a'],
    });
    appendEventRaw(fixture, 'sess-clean-touch', {
      type: 'touch',
      path: 'memory/features/feature-a.md',
      feature_ids: [],
    });

    const result = runStopVerify(fixture, 'sess-clean-touch');
    expect(result.code).toBe(0);
    const decision = JSON.parse(result.stdout);
    expect(decision.decision).toBe('block');
    expect(decision.reason).toContain('npm run typecheck');
    expect(decision.reason).not.toContain('MAPPING GAP');
    expect(decision.reason).not.toContain('CONTEXT GAP');
    expect(decision.reason).not.toContain('MEMORY GAP');
  });

  it('BLOCKS again on the SAME session for the SAME tree state — loop safety allows it silently instead', () => {
    // Identical state to the previous test (nothing changed since): the
    // marker file from that block must suppress a second block.
    const result = runStopVerify(fixture, 'sess-clean-touch');
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('');
    // Reset to clean before the next test establishes its own dirty state —
    // see the mapping-gap test's comment on why HEAD must advance.
    fixture.commitAll('advance past loop-safety test');
  });

  it('BLOCKS with a MAPPING GAP when a touched file under a governed root maps to no feature', () => {
    dirtyFile(fixture, 'src/app/golf/actions/mapping-gap-case.ts', 'export const x = 1;\n');
    appendEventRaw(fixture, 'sess-mapping-gap', {
      type: 'touch',
      path: 'src/app/golf/actions/mapping-gap-case.ts',
      feature_ids: [],
    });

    const result = runStopVerify(fixture, 'sess-mapping-gap');
    const decision = JSON.parse(result.stdout);
    expect(decision.decision).toBe('block');
    expect(decision.reason).toContain('MAPPING GAP');
    expect(decision.reason).toContain('mapping-gap-case.ts');
    // Advance HEAD so the next test's dirty state cannot collide with this
    // one's loop-safety marker (HEAD + status + diff --stat) — two edits
    // that happen to produce the same insertion/deletion SHAPE on a
    // similarly-named file can hash identically otherwise.
    fixture.commitAll('advance past mapping-gap test');
  });

  it('BLOCKS with a CONTEXT GAP when a touched feature had no prior context_load', () => {
    dirtyFile(fixture, 'src/app/golf/actions/feature-b-one.ts', 'export const one = 2;\n');
    appendEventRaw(fixture, 'sess-context-gap', {
      type: 'touch',
      path: 'src/app/golf/actions/feature-b-one.ts',
      feature_ids: ['feature_b'],
    });

    const result = runStopVerify(fixture, 'sess-context-gap');
    const decision = JSON.parse(result.stdout);
    expect(decision.decision).toBe('block');
    expect(decision.reason).toContain('CONTEXT GAP');
    expect(decision.reason).toContain('feature_b');
    fixture.commitAll('advance past context-gap test'); // see mapping-gap test's comment
  });

  it('BLOCKS with a MEMORY GAP when a touched feature has no memory-doc update and no recorded reason', () => {
    dirtyFile(fixture, 'src/app/golf/actions/feature-b-one.ts', 'export const one = 3;\n');
    appendEventRaw(fixture, 'sess-memory-gap', {
      type: 'context_load',
      source: 'read',
      path: 'memory/features/feature-b.md',
      feature_ids: ['feature_b'],
    });
    appendEventRaw(fixture, 'sess-memory-gap', {
      type: 'touch',
      path: 'src/app/golf/actions/feature-b-one.ts',
      feature_ids: ['feature_b'],
    });

    const result = runStopVerify(fixture, 'sess-memory-gap');
    const decision = JSON.parse(result.stdout);
    expect(decision.decision).toBe('block');
    expect(decision.reason).toContain('MEMORY GAP');
    expect(decision.reason).toContain('feature_b');
    fixture.commitAll('advance past memory-gap test'); // see mapping-gap test's comment
  });

  it('a valid no_memory_change_reason event CLEARS the memory gap even though the memory doc was never touched', () => {
    dirtyFile(fixture, 'src/app/golf/actions/feature-b-one.ts', 'export const one = 4;\n');
    appendEventRaw(fixture, 'sess-valid-reason', {
      type: 'context_load',
      source: 'read',
      path: 'memory/features/feature-b.md',
      feature_ids: ['feature_b'],
    });
    appendEventRaw(fixture, 'sess-valid-reason', {
      type: 'touch',
      path: 'src/app/golf/actions/feature-b-one.ts',
      feature_ids: ['feature_b'],
    });
    // Record the reason via the REAL CLI helper, not a hand-built event —
    // this also exercises record-event.mjs's own write path.
    execFileSync('node', [join(fixture.dir, '.claude/hooks/lib/record-event.mjs'), 'no-memory-change', '--reason', 'format-only'], {
      cwd: fixture.dir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: fixture.dir, CLAUDE_CODE_SESSION_ID: 'sess-valid-reason' },
      encoding: 'utf8',
    });

    const result = runStopVerify(fixture, 'sess-valid-reason');
    const decision = JSON.parse(result.stdout);
    expect(decision.decision).toBe('block'); // still blocks once for the base verification reminder
    expect(decision.reason).not.toContain('MEMORY GAP'); // but the memory dimension is satisfied
  });
});

describe('record-event.mjs — no_memory_change_reason CLI helper', () => {
  let fixture: FixtureRepo;

  beforeAll(() => {
    fixture = createFixtureRepo();
  });

  afterAll(() => {
    fixture.cleanup();
  });

  function run(args: string[], sessionId?: string) {
    // Explicitly DELETE CLAUDE_CODE_SESSION_ID rather than merely omitting
    // it from an override object — this test process's own real Claude Code
    // session already has that variable set (verified live: that is in fact
    // how record-event.mjs's session-id resolution was designed in the
    // first place), and `{ ...process.env }` would otherwise silently leak
    // it through, defeating the "unset" test case.
    const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_PROJECT_DIR: fixture.dir };
    if (sessionId) env.CLAUDE_CODE_SESSION_ID = sessionId;
    else delete env.CLAUDE_CODE_SESSION_ID;

    const result = spawnSync('node', [join(fixture.dir, '.claude/hooks/lib/record-event.mjs'), ...args], {
      cwd: fixture.dir,
      env,
      encoding: 'utf8',
    });
    return { code: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  }

  it('accepts a valid reason', () => {
    const result = run(['no-memory-change', '--reason', 'test-only-no-contract-change'], 'sess-valid');
    expect(result.code).toBe(0);
  });

  it('REJECTS an invalid reason (e.g. "not needed") with a non-zero, non-2 exit', () => {
    const result = run(['no-memory-change', '--reason', 'not needed'], 'sess-invalid');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Invalid or missing --reason');
  });

  it('REJECTS when CLAUDE_CODE_SESSION_ID is unset — never silently mis-attributes', () => {
    const result = run(['no-memory-change', '--reason', 'format-only']); // no sessionId
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('CLAUDE_CODE_SESSION_ID');
  });
});
