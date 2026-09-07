// The Stop gate's suppression mark is keyed on a tree-state hash, and the
// message it prints promises "this will not fire again". That promise was
// false, in a way that made the gate cost real money.
//
// THE LOOP
//
// The hash was HEAD + full `git status --porcelain` + `git diff --stat`.
// `git status --porcelain` includes untracked files, and the gates the hook
// demands append a timing row to memory/ledgers/gates.jsonl via
// scripts/serialize.mjs. So:
//
//     block -> agent runs the gates -> ledger row appended -> new hash ->
//     block again -> agent runs the gates -> ...
//
// The act the gate demands was the act that re-armed it. A measured session
// hit this seven times for roughly four wasted full gate passes (8-12 min
// each). Every obvious escape made it worse: committing the ledger moved
// HEAD, which is also in the hash; reverting it after later commits produced
// a third state nobody had seen.
//
// Untracked files were the same defect wearing different clothes — an audit
// worktree writing screenshots re-armed the gate per file.
//
// THE FIX AND ITS LIMIT
//
// Ledger paths and untracked files are excluded from the STATE IDENTITY only.
// They are not excluded from the verification demands, which still come from
// stop-check.mjs, nor from the untracked-source advisory. A tracked source
// change must still re-arm the gate — the last test here is the guard against
// fixing the loop by making the gate unable to fire.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appendFileSync, mkdirSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFixtureRepo, runStopVerify, type FixtureRepo } from './helpers/fixture-repo';

let fixture: FixtureRepo;

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

function marks(): string[] {
  return readdirSync(join(fixture.dir, '.git')).filter((f) => f.startsWith('claude-stop-verify-'));
}

/** Age every mark past the hook's 240-minute housekeeping window. */
function ageMarks(minutes: number) {
  const when = new Date(Date.now() - minutes * 60_000);
  for (const m of marks()) {
    const p = join(fixture.dir, '.git', m);
    utimesSync(p, when, when);
  }
}

beforeEach(() => {
  fixture = createFixtureRepo();
  mkdirSync(join(fixture.dir, 'src'), { recursive: true });
  mkdirSync(join(fixture.dir, 'memory/ledgers'), { recursive: true });
  // Tracked, exactly as in the real repo — the churn only bites because the
  // ledger is a committed file that a gate run modifies.
  writeFileSync(join(fixture.dir, 'memory/ledgers/gates.jsonl'), '');
  fixture.commitAll('add gates ledger');

  writeFileSync(join(fixture.dir, 'src/shared-state.ts'), 'export const v = 1;\n');
  fixture.commitAll('add shared state');
  // Dirty it: the gate's MAIN path needs an outstanding, unsettled touch.
  writeFileSync(join(fixture.dir, 'src/shared-state.ts'), 'export const v = 1; // wip\n');
  recordTouch('sess-a', 'src/shared-state.ts');
});

afterEach(() => fixture.cleanup());

/** First Stop always blocks; every test here is about the SECOND one. */
function firstStopBlocks() {
  expect(JSON.parse(runStopVerify(fixture, 'sess-a').stdout).decision).toBe('block');
}

describe('Stop suppression — churn that must NOT re-arm the gate', () => {
  it('a gates-ledger append does not re-arm it (the self-perpetuating loop)', () => {
    firstStopBlocks();

    // Exactly what `npm run typecheck` leaves behind via serialize.mjs.
    appendFileSync(
      join(fixture.dir, 'memory/ledgers/gates.jsonl'),
      `${JSON.stringify({ ts: Date.now(), gate: 'typecheck', waitMs: 0, runMs: 91_000, slots: 2 })}\n`,
    );

    expect(runStopVerify(fixture, 'sess-a').stdout.trim()).toBe('');
  });

  it('COMMITTING the ledger does not re-arm it either', () => {
    firstStopBlocks();
    appendFileSync(
      join(fixture.dir, 'memory/ledgers/gates.jsonl'),
      `${JSON.stringify({ ts: Date.now(), gate: 'lint', waitMs: 0, runMs: 40_000, slots: 2 })}\n`,
    );
    fixture.git('add', 'memory/ledgers/gates.jsonl');

    // Staged but not committed: HEAD is unmoved, so the hash must hold.
    expect(runStopVerify(fixture, 'sess-a').stdout.trim()).toBe('');
  });

  it('untracked NON-SOURCE scratch output does not re-arm it', () => {
    firstStopBlocks();

    mkdirSync(join(fixture.dir, 'premium-audit'), { recursive: true });
    writeFileSync(join(fixture.dir, 'premium-audit/G-61.png'), 'not really a png');
    writeFileSync(join(fixture.dir, 'premium-audit/report.md'), '# findings\n');

    expect(runStopVerify(fixture, 'sess-a').stdout.trim()).toBe('');
  });

  it('housekeeping does not delete the LIVE session’s own marks', () => {
    firstStopBlocks();
    const firstMark = marks();
    expect(firstMark).toHaveLength(1);

    // A session that has been running longer than the 240-minute window.
    ageMarks(300);

    // Reaching a genuinely new state runs the purge before writing mark #2.
    writeFileSync(join(fixture.dir, 'src/changed.ts'), 'export const w = 2;\n');
    recordTouch('sess-a', 'src/changed.ts');
    expect(JSON.parse(runStopVerify(fixture, 'sess-a').stdout).decision).toBe('block');

    // The aged mark must survive: deleting it re-arms the gate at a state
    // this session has already been nagged at, which is the exact thing the
    // block message promises will not happen.
    expect(marks()).toHaveLength(2);
    expect(marks()).toContain(firstMark[0]);
    expect(statSync(join(fixture.dir, '.git', firstMark[0]))).toBeTruthy();
  });
});

describe('Stop suppression — churn that MUST re-arm the gate', () => {
  // Granularity note, inherited and left alone: the hash reads `git diff
  // --stat`, so an edit that changes a tracked file's CONTENT without changing
  // its line counts produces the same state and does not re-arm. Widening that
  // to the full diff would make the gate fire more often, not less, which is
  // the opposite of what this change is for. Hence a line is added here.
  it('a tracked source edit still re-arms it', () => {
    firstStopBlocks();

    writeFileSync(
      join(fixture.dir, 'src/shared-state.ts'),
      'export const v = 2;\nexport const alsoNew = true;\n',
    );

    expect(JSON.parse(runStopVerify(fixture, 'sess-a').stdout).decision).toBe('block');
  });

  // The narrow reading of the fix, pinned: a NEW source file is untracked and
  // must still re-arm the gate. Excluding untracked paths wholesale — the
  // obvious one-line version of this fix — silently loses exactly this case.
  it('a brand-new untracked SOURCE file still re-arms it', () => {
    firstStopBlocks();

    writeFileSync(join(fixture.dir, 'src/brand-new.ts'), 'export const n = 4;\n');

    expect(JSON.parse(runStopVerify(fixture, 'sess-a').stdout).decision).toBe('block');
  });

  it('a new commit still re-arms it', () => {
    firstStopBlocks();

    writeFileSync(join(fixture.dir, 'src/committed.ts'), 'export const c = 3;\n');
    fixture.commitAll('a real change');
    recordTouch('sess-a', 'src/committed.ts');

    expect(JSON.parse(runStopVerify(fixture, 'sess-a').stdout).decision).toBe('block');
  });
});
