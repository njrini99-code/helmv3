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

  it('ALLOWS silently for a session that touched ONLY a non-source file (e.g. a memory doc) — regression for TOUCHED_COUNT vs TOUCHED_SRC_COUNT', () => {
    // This is exactly the shape the MEMORY GAP remedy instructs: "update the
    // doc." A session whose only touch this turn is memory/features/*.md
    // must not itself trip the "unverified source" gate — the OLD script
    // never fired for doc-only changes (SRC_RE excludes .md), and the
    // rebuild must preserve that or every governed edit becomes a
    // double-block loop (block for the code touch, update memory, block
    // AGAIN for the memory touch).
    appendEventRaw(fixture, 'sess-doc-only-touch', {
      type: 'touch',
      path: 'memory/features/feature-a.md',
      feature_ids: [],
    });
    const result = runStopVerify(fixture, 'sess-doc-only-touch');
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
    fixture.commitAll('advance past valid-reason test');
  });

  it("detects a 'use server' change in a file whose path contains a dynamic route segment like [id]", () => {
    // This repo's routes use `[id]`-style segments. An UNQUOTED shell
    // expansion of a touched-files list hands bash a literal `[id]` as a
    // glob CHARACTER CLASS, not a path component — guard-bash.sh's own `-f`
    // (noglob) flag exists specifically because of this trap. stop-verify.sh
    // does not set `-f` script-wide, so this path is built as a bash ARRAY
    // instead; this test is the regression guard for that fix actually
    // detecting the 'use server' directive rather than silently no-op'ing.
    dirtyFile(
      fixture,
      'src/app/golf/actions/feature-a-[id].ts',
      "'use server';\nexport const byId = 5;\n",
    );
    appendEventRaw(fixture, 'sess-dynamic-route', {
      type: 'context_load',
      source: 'read',
      path: 'memory/features/feature-a.md',
      feature_ids: ['feature_a'],
    });
    appendEventRaw(fixture, 'sess-dynamic-route', {
      type: 'touch',
      path: 'src/app/golf/actions/feature-a-[id].ts',
      feature_ids: ['feature_a'],
    });
    appendEventRaw(fixture, 'sess-dynamic-route', {
      type: 'touch',
      path: 'memory/features/feature-a.md',
      feature_ids: [],
    });

    const result = runStopVerify(fixture, 'sess-dynamic-route');
    const decision = JSON.parse(result.stdout);
    expect(decision.decision).toBe('block');
    expect(decision.reason).toContain('npm run build');
    expect(decision.reason).toContain('REQUIRED');
    fixture.commitAll('advance past dynamic-route test'); // see mapping-gap test's comment
  });

  it('a delegated_verification event satisfies verification for that path — no gaps, reason notes it as delegated', () => {
    // Addendum, 2026-08-21: an orchestrating session whose subagent/worker
    // did the actual branch+PR work must not be flagged for files it never
    // verified locally — those files ARE verified, by the worker's own
    // pre-commit gates + CI on the worker's PR.
    dirtyFile(fixture, 'src/app/golf/actions/feature-a-one.ts', 'export const one = 6;\n');
    appendEventRaw(fixture, 'sess-delegated', {
      type: 'touch',
      path: 'src/app/golf/actions/feature-a-one.ts',
      feature_ids: ['feature_a'],
    });
    execFileSync(
      'node',
      [join(fixture.dir, '.claude/hooks/lib/record-event.mjs'), 'delegated-verification', '--path', 'src/app/golf/actions/feature-a-one.ts', '--pr', '4242'],
      { cwd: fixture.dir, env: { ...process.env, CLAUDE_PROJECT_DIR: fixture.dir, CLAUDE_CODE_SESSION_ID: 'sess-delegated' }, encoding: 'utf8' },
    );

    const result = runStopVerify(fixture, 'sess-delegated');
    // No context_load, no memory-doc touch were ever recorded for feature_a
    // in THIS session — if delegation didn't work, this would MAPPING/CONTEXT/
    // MEMORY gap. It must not, because the file is fully delegated.
    expect(result.stdout.trim()).toBe('');
    fixture.commitAll('advance past delegated-verification test');
  });

  it('a foreign file dirty in the tree (never in this session\'s touch events) is never attributed, even when this session has its own touches', () => {
    // Simulates another agent's in-flight branch leaving a file dirty in
    // this shared working tree. Session-owned state must be the ONLY source
    // for what gets reported — git's whole-tree view must never leak a file
    // this session never touched into the block reason.
    dirtyFile(fixture, 'src/app/golf/actions/feature-a-one.ts', 'export const one = 7;\n');
    dirtyFile(fixture, 'src/app/golf/actions/feature-b-one.ts', 'export const one = 999;\n'); // NOT touched by sess-foreign-check
    appendEventRaw(fixture, 'sess-foreign-check', {
      type: 'context_load',
      source: 'read',
      path: 'memory/features/feature-a.md',
      feature_ids: ['feature_a'],
    });
    appendEventRaw(fixture, 'sess-foreign-check', {
      type: 'touch',
      path: 'src/app/golf/actions/feature-a-one.ts',
      feature_ids: ['feature_a'],
    });
    appendEventRaw(fixture, 'sess-foreign-check', {
      type: 'touch',
      path: 'memory/features/feature-a.md',
      feature_ids: [],
    });

    const result = runStopVerify(fixture, 'sess-foreign-check');
    const decision = JSON.parse(result.stdout);
    expect(decision.decision).toBe('block');
    expect(decision.reason).toContain('feature-a-one.ts');
    expect(decision.reason).not.toContain('feature-b-one.ts'); // the foreign file
    fixture.git('checkout', '--', 'src/app/golf/actions/feature-b-one.ts'); // leave the foreign edit un-committed by us
    fixture.commitAll('advance past foreign-file test (feature-a-one.ts only)');
  });

  it('BLOCKS with a DATE GAP when a touched ledger entry has no explicit YYYY-MM-DD date, and clears once one is added', () => {
    // Owner directive, 2026-08-21: explicit dates on everything.
    const ledgerDir = join(fixture.dir, 'memory/ledgers/changes');
    mkdirSync(ledgerDir, { recursive: true });
    const ledgerRel = 'memory/ledgers/changes/feature-a.md';
    writeFileSync(join(fixture.dir, ledgerRel), '## Change entry\nDid a thing, no date here.\n');
    appendEventRaw(fixture, 'sess-date-gap', { type: 'touch', path: ledgerRel, feature_ids: [] });

    const undated = runStopVerify(fixture, 'sess-date-gap');
    const undatedDecision = JSON.parse(undated.stdout);
    expect(undatedDecision.decision).toBe('block');
    expect(undatedDecision.reason).toContain('DATE GAP');
    expect(undatedDecision.reason).toContain(ledgerRel);

    // Commit the undated version so HEAD advances before the second edit —
    // otherwise this file's two near-identical single-line diffs can hash to
    // the SAME loop-safety state (HEAD + status + diff --stat), and the
    // second stop-verify call would silently allow instead of re-evaluating.
    // Same reasoning as the mapping-gap test's comment above.
    fixture.commitAll('undated ledger entry (fixture)');

    // Same session, dirty the SAME file again — this time with a date.
    writeFileSync(join(fixture.dir, ledgerRel), '## Change entry — 2026-08-21\nDid a thing, dated this time.\n');

    // A dated ledger .md file alone has NO outstanding gap of any kind — it
    // is not a SRC_RE file (no code-verification reminder applies to it by
    // itself), and mapping/context/memory/date all clear. Unlike the other
    // gap tests, there is nothing left to demand, so this correctly ALLOWS
    // SILENTLY rather than still blocking once — the same "doc-only touch
    // must not trip the source-verification gate" principle this rebuild's
    // first fix round established, now applied to the date dimension too.
    const dated = runStopVerify(fixture, 'sess-date-gap');
    expect(dated.stdout.trim()).toBe('');
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
