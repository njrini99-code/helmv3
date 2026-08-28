// Phase 7B — the Stop gate must verify CURRENT differences, not historical touches.
//
// THE BUG THIS SUITE PINS, measured on the real session ledger before a line
// of the fix was written (session 9920433a, 2026-08-28):
//
//     13 touch events / 9 unique paths
//     9 of 9 byte-identical to origin/main (2 of them absent on both sides)
//     9 of 9 still demanded verification on every Stop
//
// One of them, src/test/hooks/guard-bash-worktree.test.ts, was DELETED in
// #1641 and exists in neither the working tree nor origin/main — and the gate
// still instructed the session to run `npm test` and report exit codes for it.
//
// Root cause: `foldState`'s touchedFiles Map only ever grows (session-state.mjs
// has no delete/clear/expire path of any kind), and stop-check.mjs used that
// historical Map directly as the current verification queue. Those are two
// different questions:
//
//     touchedFiles              "which paths did this session touch?"      history
//     outstandingTouchedFiles   "which of them still differ from origin/main
//                                RIGHT NOW?"                               current
//
// The fix is read-time reconciliation, NOT a durable `touch_retired` event: a
// retirement record encodes "settled at time T", which is false the moment the
// path diverges again — the same staleness bug one layer up. Case F below is
// what proves the derived form is self-correcting and a durable event would
// not be.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createFixtureRepo, runStopVerify, type FixtureRepo } from './helpers/fixture-repo';

const A_ONE = 'src/app/golf/actions/feature-a-one.ts';
const B_ONE = 'src/app/golf/actions/feature-b-one.ts';
// Deliberately contains a `[id]` dynamic route segment, which is REAL in this
// repo's route tree and is a git PATHSPEC CHARACTER CLASS, not a literal
// filename. A classifier that passes touched paths to `git diff -- <path>`
// without `:(literal)` silently matches nothing for this file and settles it
// no matter what its content is. Pinned here because the fixture has carried
// such a file since the stop-gate suite was written.
const A_ID = 'src/app/golf/actions/feature-a-[id].ts';

let fixture: FixtureRepo;

/** Append one touch event to a session's ledger. */
function touch(sessionId: string, path: string, featureIds: string[] = []) {
  const file = join(fixture.dir, '.claude/session-state', `${sessionId}.jsonl`);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(
    file,
    `${JSON.stringify({
      schema: 1,
      ts: new Date().toISOString(),
      type: 'touch',
      path,
      feature_ids: featureIds,
    })}\n`,
  );
}

interface StopCheck {
  touchedFiles: string[];
  outstandingTouchedFiles: string[];
  settledTouchedFiles: { path: string; reason: string }[];
  verifiableFiles: string[];
  delegatedFiles: { path: string }[];
  baseRef: string;
  baseSha: string | null;
}

function stopCheck(sessionId: string): StopCheck {
  const r = spawnSync('node', [join(fixture.dir, '.claude/hooks/lib/stop-check.mjs'), sessionId], {
    cwd: fixture.dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: fixture.dir },
    encoding: 'utf8',
  });
  return JSON.parse(r.stdout);
}

/** The reason recorded for a settled path, or undefined when not settled. */
function settledReason(out: StopCheck, path: string) {
  return out.settledTouchedFiles.find((s) => s.path === path)?.reason;
}

function write(rel: string, content: string) {
  const abs = join(fixture.dir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

beforeEach(() => {
  fixture = createFixtureRepo();
});

afterEach(() => {
  fixture.cleanup();
});

describe('stop-check reconciliation — integration truth is origin/main', () => {
  // The fixture ships no remote at all, so every test that wants a real
  // comparison must publish one. `update-ref` is enough: origin/main is a ref
  // like any other, and Stop must never fetch.
  const publishIntegrationRef = () => fixture.git('update-ref', 'refs/remotes/origin/main', 'HEAD');

  it('A — a touched file whose worktree content differs from origin/main is OUTSTANDING', () => {
    publishIntegrationRef();
    write(A_ONE, 'export const one = 999;\n');
    touch('sess-a', A_ONE, ['feature_a']);

    const out = stopCheck('sess-a');
    expect(out.outstandingTouchedFiles).toContain(A_ONE);
    expect(out.verifiableFiles).toContain(A_ONE);
    expect(settledReason(out, A_ONE)).toBeUndefined();
  });

  it('A2 — work COMMITTED locally but not yet on origin/main stays OUTSTANDING', () => {
    // The property a naive "compare against HEAD" implementation destroys:
    // committing is not landing. origin/main is pinned BEFORE the commit.
    publishIntegrationRef();
    write(A_ONE, 'export const one = 2;\n');
    fixture.commitAll('local work, not yet merged');
    touch('sess-a2', A_ONE, ['feature_a']);

    const out = stopCheck('sess-a2');
    expect(out.outstandingTouchedFiles).toContain(A_ONE);
  });

  it('B — a touched file now identical to origin/main is SETTLED and not verifiable', () => {
    publishIntegrationRef();
    touch('sess-b', B_ONE, ['feature_b']);

    const out = stopCheck('sess-b');
    // History is preserved: the touch still happened.
    expect(out.touchedFiles).toContain(B_ONE);
    // But it is no longer a verification demand.
    expect(out.outstandingTouchedFiles).not.toContain(B_ONE);
    expect(out.verifiableFiles).not.toContain(B_ONE);
    expect(settledReason(out, B_ONE)).toBe('matches_integration_ref');
  });

  it('C — a path deleted from BOTH the workspace and origin/main is SETTLED', () => {
    // The real guard-bash-worktree.test.ts shape: touched, then deleted by a
    // merged PR, so it exists nowhere — and the old gate still demanded
    // `npm test` for it.
    const gone = 'src/app/golf/actions/feature-a-gone.ts';
    write(gone, 'export const gone = 1;\n');
    fixture.commitAll('add the file that will be deleted');
    rmSync(join(fixture.dir, gone));
    fixture.commitAll('delete it, as a merged PR would');
    publishIntegrationRef();
    touch('sess-c', gone, ['feature_a']);

    const out = stopCheck('sess-c');
    expect(out.touchedFiles).toContain(gone);
    expect(out.outstandingTouchedFiles).not.toContain(gone);
    expect(out.verifiableFiles).not.toContain(gone);
    expect(settledReason(out, gone)).toBe('absent_in_workspace_and_integration_ref');
  });

  it('D — a deletion that exists only locally is OUTSTANDING', () => {
    publishIntegrationRef();
    rmSync(join(fixture.dir, A_ONE));
    touch('sess-d', A_ONE, ['feature_a']);

    const out = stopCheck('sess-d');
    expect(out.outstandingTouchedFiles).toContain(A_ONE);
    expect(out.verifiableFiles).toContain(A_ONE);
  });

  it('E — a NEW untracked file is OUTSTANDING (git diff alone cannot see it)', () => {
    // Task 5's trap, made mechanical. `git diff <ref> -- <path>` reports
    // nothing for an untracked file, so a classifier built only on git diff
    // settles brand-new work — the most dangerous possible false negative,
    // because unverified new code is exactly what the gate exists for.
    publishIntegrationRef();
    const brandNew = 'src/app/golf/actions/feature-a-new.ts';
    write(brandNew, 'export const brandNew = 1;\n');
    touch('sess-e', brandNew, ['feature_a']);

    const out = stopCheck('sess-e');
    expect(out.outstandingTouchedFiles).toContain(brandNew);
    expect(out.verifiableFiles).toContain(brandNew);
  });

  it('E2 — a STAGED change is OUTSTANDING even when the worktree matches origin/main', () => {
    // base->worktree comparison alone misses this: the index carries the
    // change while the file on disk reads identical to the ref.
    publishIntegrationRef();
    write(A_ONE, 'export const one = 42;\n');
    fixture.git('add', A_ONE);
    write(A_ONE, 'export const one = 1;\n'); // restore worktree to the ref's content

    touch('sess-e2', A_ONE, ['feature_a']);
    const out = stopCheck('sess-e2');
    expect(out.outstandingTouchedFiles).toContain(A_ONE);
  });

  it('F — a settled path that diverges AGAIN re-enters OUTSTANDING', () => {
    // This is why the fix is derived rather than a durable `touch_retired`
    // event. A recorded retirement would have to be invalidated here by some
    // second protocol; a read-time comparison just returns the new answer.
    publishIntegrationRef();
    touch('sess-f', B_ONE, ['feature_b']);

    const first = stopCheck('sess-f');
    expect(settledReason(first, B_ONE)).toBe('matches_integration_ref');
    expect(first.verifiableFiles).not.toContain(B_ONE);

    write(B_ONE, 'export const one = "diverged again";\n');

    const second = stopCheck('sess-f');
    expect(second.outstandingTouchedFiles).toContain(B_ONE);
    expect(second.verifiableFiles).toContain(B_ONE);
    expect(settledReason(second, B_ONE)).toBeUndefined();
  });

  it('G — when origin/main cannot be resolved, every touch stays OUTSTANDING', () => {
    // No publishIntegrationRef() — the comparison is impossible, so the gate
    // must fail toward demanding verification. Silently settling on a failed
    // comparison would turn every misconfigured checkout into a green gate.
    touch('sess-g', B_ONE, ['feature_b']);

    const out = stopCheck('sess-g');
    expect(out.baseSha).toBeNull();
    expect(out.outstandingTouchedFiles).toContain(B_ONE);
    expect(out.verifiableFiles).toContain(B_ONE);
    expect(out.settledTouchedFiles).toHaveLength(0);
  });

  it('H — classification follows origin/main even when local main has moved on', () => {
    // origin/main is pinned at the fixture commit; local main then advances
    // with a change to A_ONE. Against LOCAL main the file looks clean; against
    // integration truth it is unmerged work.
    publishIntegrationRef();
    write(A_ONE, 'export const one = 3;\n');
    fixture.commitAll('local main advances past origin/main');
    touch('sess-h', A_ONE, ['feature_a']);

    const out = stopCheck('sess-h');
    expect(out.baseRef).toBe('origin/main');
    expect(out.baseSha).not.toBeNull();
    expect(out.outstandingTouchedFiles).toContain(A_ONE);
  });

  it('I — an in-repo gitignored path is SETTLED as ignored, not as a content match', () => {
    // record-session-touch.mjs filters only on isWithinRepo, so a gitignored
    // in-repo path CAN reach the ledger. It can never appear in a PR, so it is
    // not a verification demand — but reporting it as `matches_integration_ref`
    // would be a lie, since it is in no ref at all.
    publishIntegrationRef();
    const ignored = 'src/app/golf/actions/feature-a-scratch.local.ts';
    appendFileSync(join(fixture.dir, '.gitignore'), '*.local.ts\n');
    write(ignored, 'export const scratch = 1;\n');
    touch('sess-i', ignored, ['feature_a']);

    const out = stopCheck('sess-i');
    expect(out.verifiableFiles).not.toContain(ignored);
    expect(settledReason(out, ignored)).toBe('ignored_by_git');
  });

  it('J — a touched path containing [id] classifies correctly in BOTH directions', () => {
    // `[id]` is a git pathspec character class, and these filenames are real
    // in this repo's route tree. Measured on git 2.55: a bare `[id]` pathspec
    // does not miss the literal file, it OVER-matches — `feature-a-[id].ts`
    // also selects `feature-a-i*.ts`-shaped siblings. Since every probe is
    // read as "is this path among the names git printed", that extra name is
    // never queried and cannot flip a verdict; an injection removing
    // :(literal) leaves this green, which is the honest result.
    //
    // So this pins the guarantee that IS observable and does matter: a
    // bracketed filename is judged on its own content, not on a sibling's.
    publishIntegrationRef();
    write(A_ID, 'export const byId = "modified";\n');
    touch('sess-j', A_ID, ['feature_a']);

    const outstanding = stopCheck('sess-j');
    expect(outstanding.outstandingTouchedFiles).toContain(A_ID);
    expect(outstanding.verifiableFiles).toContain(A_ID);
  });

  it('J2 — a clean [id] path stays SETTLED even when a glob-sibling is dirty', () => {
    // The over-match's blast radius, pinned. `feature-a-[id].ts` is untouched
    // and identical to origin/main; `feature-a-i.ts` is filthy and IS selected
    // by the bracketed path when it is read as a glob. The bracketed file must
    // still settle on its own merits.
    //
    // The sibling has to be TRACKED and MODIFIED, not merely present: `git
    // diff` never reports untracked files, so an untracked sibling makes this
    // pass for the wrong reason. It did, until an injection that removed
    // :(literal) failed to turn this red and exposed the hole.
    const sibling = 'src/app/golf/actions/feature-a-i.ts';
    write(sibling, 'export const sibling = 1;\n');
    fixture.commitAll('add the glob-sibling to integration truth');
    publishIntegrationRef();
    write(sibling, 'export const sibling = "dirty";\n');
    touch('sess-j2', A_ID, ['feature_a']);

    const out = stopCheck('sess-j2');
    expect(out.outstandingTouchedFiles).not.toContain(A_ID);
    expect(settledReason(out, A_ID)).toBe('matches_integration_ref');
  });

  it('mixed session — settled and outstanding paths are separated, history kept whole', () => {
    // Plan case D: an earlier landed change plus current work in one session.
    publishIntegrationRef();
    write(A_ONE, 'export const one = 7;\n');
    touch('sess-mix', A_ONE, ['feature_a']); // outstanding
    touch('sess-mix', B_ONE, ['feature_b']); // settled

    const out = stopCheck('sess-mix');
    expect(out.touchedFiles.sort()).toEqual([A_ONE, B_ONE].sort());
    expect(out.outstandingTouchedFiles).toEqual([A_ONE]);
    expect(out.settledTouchedFiles.map((s) => s.path)).toEqual([B_ONE]);
    expect(out.verifiableFiles).toEqual([A_ONE]);
  });

  it('a delegated_verification on a SETTLED path does not appear as a delegated row', () => {
    // delegatedFiles is derived from OUTSTANDING, not from history: once a
    // path is settled it is nobody's verification problem, delegated or not,
    // and stop-verify.sh's "N file(s) are DELEGATED" note must not list it.
    publishIntegrationRef();
    touch('sess-del', B_ONE, ['feature_b']);
    const file = join(fixture.dir, '.claude/session-state', 'sess-del.jsonl');
    appendFileSync(
      file,
      `${JSON.stringify({
        schema: 1,
        ts: new Date().toISOString(),
        type: 'delegated_verification',
        path: B_ONE,
        pr: 1234,
      })}\n`,
    );

    const out = stopCheck('sess-del');
    expect(out.delegatedFiles.map((d) => d.path)).not.toContain(B_ONE);
    expect(settledReason(out, B_ONE)).toBe('matches_integration_ref');
  });
});

describe('stop-verify.sh advisory — "nothing to verify" has two different causes', () => {
  // Before Phase 7B, reaching the advisory branch implied the ledger was
  // empty, so its one message ("the recording hook may not be firing") was
  // always true. Now the counts are derived from what still DIFFERS from
  // origin/main, so a session whose work has all merged also lands here with a
  // FULL ledger. Telling that reader their hook is broken would be a wrong
  // diagnosis introduced by the change that made the gate accurate — these two
  // tests are what stop that regression from being invisible.
  const dirtyAPeerFile = () =>
    writeFileSync(join(fixture.dir, A_ONE), 'export const one = "a peer session wrote this";\n');

  it('a session with a genuinely EMPTY ledger is still told the hook may not be firing', () => {
    runStopVerify(fixture, 'sess-empty'); // first call only writes the baseline
    dirtyAPeerFile();

    const result = runStopVerify(fixture, 'sess-empty');
    expect(result.stderr).toContain('recorded zero touches');
    expect(result.stderr).toContain('record-session-touch.mjs hook is not wired/firing');
  });

  it('a session whose touches are all SETTLED is NOT told its hook is broken', () => {
    fixture.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    touch('sess-settled', B_ONE, ['feature_b']); // identical to origin/main

    runStopVerify(fixture, 'sess-settled'); // baseline
    dirtyAPeerFile();

    const result = runStopVerify(fixture, 'sess-settled');
    expect(result.stdout).toBe(''); // still advisory, never a block
    expect(result.stderr).toContain('DID record 1 touch(es)');
    expect(result.stderr).toContain('settled against origin/main');
    expect(result.stderr).not.toContain('recorded zero touches');
    expect(result.stderr).not.toContain('not wired/firing');
  });
});
