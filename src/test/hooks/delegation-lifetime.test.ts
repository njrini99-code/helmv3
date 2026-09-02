// Phase 7C — a delegation covers the work that existed when it was recorded,
// and nothing after it.
//
// THE PROVEN BUG, reproduced on real session events during the Phase 7B review
// (2026-08-28) and pinned here:
//
//     10:00  touch P
//     10:05  delegated_verification P   (a peer session's PR verified it)
//     18:00  touch P again, new content that nobody has verified
//
//     outstandingTouchedFiles : [P]     correct — it differs from origin/main
//     verifiableFiles         : []      WRONG — the 10:05 delegation is still
//                                       suppressing work created at 18:00
//
// An eight-hour-old delegation was suppressing verification for work it never
// saw. This is the same shape Phase 7B refused to build: `delegated_verification`
// is a DURABLE record of "verified at time T", and it goes stale the moment the
// path changes again. Phase 7B chose read-time reconciliation precisely to avoid
// creating a second one of these; this closes the one that already existed.
//
// The fix needs no new event and no new clock. `foldState` already keeps
// last-write-wins timestamps for BOTH sides — `touchedFiles.get(p).ts` is the
// LATEST touch and `delegatedVerifications.get(p).ts` is the LATEST delegation —
// so validity is derivable from event order alone:
//
//     latestTouchAt(p) <= delegatedAt(p)   the delegation still covers it
//     latestTouchAt(p) >  delegatedAt(p)   stale; the path stays verifiable
//
// Unparseable or missing timestamps do NOT suppress. A delegation that cannot
// prove it is newer than the work has not earned the right to silence the gate.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createFixtureRepo, type FixtureRepo } from './helpers/fixture-repo';

const P = 'src/app/golf/actions/feature-a-one.ts';
const OTHER = 'src/app/golf/actions/feature-b-one.ts';

let fixture: FixtureRepo;

function event(sessionId: string, o: Record<string, unknown>) {
  const file = join(fixture.dir, '.claude/session-state', `${sessionId}.jsonl`);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ schema: 1, ...o })}\n`);
}

const touch = (s: string, path: string, ts: string) =>
  event(s, { ts, type: 'touch', path, feature_ids: [] });

const delegate = (s: string, path: string, ts: string | undefined, pr = 1111) =>
  event(s, { ts, type: 'delegated_verification', path, pr, evidence: 'peer PR CI green' });

interface StopCheck {
  touchedFiles: string[];
  outstandingTouchedFiles: string[];
  settledTouchedFiles: { path: string; reason: string }[];
  verifiableFiles: string[];
  delegatedFiles: { path: string; pr?: number }[];
}

function stopCheck(sessionId: string): StopCheck {
  const r = spawnSync('node', [join(fixture.dir, '.claude/hooks/lib/stop-check.mjs'), sessionId], {
    cwd: fixture.dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: fixture.dir },
    encoding: 'utf8',
  });
  return JSON.parse(r.stdout);
}

/** Publish integration truth, then make `path` genuinely differ from it, so the
 *  path is OUTSTANDING and delegation is the only thing that could suppress it. */
function diverge(path: string, content: string) {
  fixture.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  writeFileSync(join(fixture.dir, path), content);
}

beforeEach(() => {
  fixture = createFixtureRepo();
});
afterEach(() => {
  fixture.cleanup();
});

describe('delegated_verification lifetime', () => {
  it('A — a delegation AFTER the touch it covers suppresses verification', () => {
    diverge(P, 'export const one = "work a peer verified";\n');
    touch('a', P, '2026-08-28T10:00:00.000Z');
    delegate('a', P, '2026-08-28T10:05:00.000Z');

    const out = stopCheck('a');
    expect(out.outstandingTouchedFiles).toContain(P);
    expect(out.delegatedFiles.map((d) => d.path)).toContain(P);
    expect(out.verifiableFiles).not.toContain(P);
  });

  it('B — a LATER touch is NOT suppressed by the earlier delegation', () => {
    // The proven bug. Pre-fix this returns verifiableFiles: [].
    diverge(P, 'export const one = "brand new, nobody verified this";\n');
    touch('b', P, '2026-08-28T10:00:00.000Z');
    delegate('b', P, '2026-08-28T10:05:00.000Z');
    touch('b', P, '2026-08-28T18:00:00.000Z');

    const out = stopCheck('b');
    expect(out.outstandingTouchedFiles).toContain(P);
    expect(out.verifiableFiles).toContain(P);
    expect(out.delegatedFiles.map((d) => d.path)).not.toContain(P);
  });

  it('C — re-delegating after the later touch suppresses it again', () => {
    // Self-correcting, with no invalidation protocol: the new delegation is
    // simply newer than the work, so the same comparison returns the new answer.
    diverge(P, 'export const one = "re-verified by a second PR";\n');
    touch('c', P, '2026-08-28T10:00:00.000Z');
    delegate('c', P, '2026-08-28T10:05:00.000Z');
    touch('c', P, '2026-08-28T18:00:00.000Z');
    delegate('c', P, '2026-08-28T18:05:00.000Z', 2222);

    const out = stopCheck('c');
    expect(out.verifiableFiles).not.toContain(P);
    expect(out.delegatedFiles.find((d) => d.path === P)?.pr).toBe(2222);
  });

  it('D — a delegation on one path does not suppress another', () => {
    fixture.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    writeFileSync(join(fixture.dir, P), 'export const one = "delegated";\n');
    writeFileSync(join(fixture.dir, OTHER), 'export const one = "NOT delegated";\n');
    touch('d', P, '2026-08-28T10:00:00.000Z');
    touch('d', OTHER, '2026-08-28T10:00:00.000Z');
    delegate('d', P, '2026-08-28T10:05:00.000Z');

    const out = stopCheck('d');
    expect(out.verifiableFiles).not.toContain(P);
    expect(out.verifiableFiles).toContain(OTHER);
  });

  it('E — a delegation with no timestamp does NOT suppress', () => {
    // Fail safe. A delegation that cannot prove it is newer than the work has
    // not earned the right to silence the gate.
    diverge(P, 'export const one = "unverified";\n');
    touch('e', P, '2026-08-28T10:00:00.000Z');
    delegate('e', P, undefined);

    const out = stopCheck('e');
    expect(out.verifiableFiles).toContain(P);
  });

  it('E2 — a delegation with an unparseable timestamp does NOT suppress', () => {
    diverge(P, 'export const one = "unverified";\n');
    touch('e2', P, '2026-08-28T10:00:00.000Z');
    delegate('e2', P, 'not-a-date');

    const out = stopCheck('e2');
    expect(out.verifiableFiles).toContain(P);
  });

  it('E3 — a touch with no timestamp does NOT let a delegation suppress it', () => {
    diverge(P, 'export const one = "unverified";\n');
    event('e3', { type: 'touch', path: P, feature_ids: [] }); // no ts at all
    delegate('e3', P, '2026-08-28T18:00:00.000Z');

    const out = stopCheck('e3');
    expect(out.verifiableFiles).toContain(P);
  });

  it('F — a SETTLED path stays settled; delegation validity cannot re-queue it', () => {
    // Phase 7B's guarantee must survive this change: delegation logic operates
    // on OUTSTANDING paths only, so a path matching origin/main is out of the
    // queue no matter how stale its delegation is.
    fixture.git('update-ref', 'refs/remotes/origin/main', 'HEAD'); // P unmodified
    touch('f', P, '2026-08-28T10:00:00.000Z');
    delegate('f', P, '2026-08-28T09:00:00.000Z'); // STALE: older than the touch
    touch('f', P, '2026-08-28T18:00:00.000Z');

    const out = stopCheck('f');
    expect(out.outstandingTouchedFiles).not.toContain(P);
    expect(out.verifiableFiles).not.toContain(P);
    expect(out.settledTouchedFiles.map((s) => s.path)).toContain(P);
  });
});
