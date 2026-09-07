import { describe, it, expect } from 'vitest';
import {
  categorise,
  lifecycle,
  splitPathspec,
  LIVING_CATEGORIES,
  DONE_STATUSES,
  STATUS_HEADER_RE,
  REV_LIST_CMD_RE,
  ANCHOR_SHA_RE,
  STALENESS_THRESHOLD,
} from '../document-inventory.mjs';

// Pure-logic coverage for the three flags added to document-inventory.mjs
// (--dead-refs, --lifecycle, --staleness). No git, no filesystem — these
// exercise exactly the regexes and helpers the CLI modes are built on, the
// same shape as world-model-core.test.mjs's fixture tests. buildRows() and
// the CLI runner functions (runDeadRefs/runLifecycle/runStaleness) are
// intentionally NOT imported here: they shell out to `git` and read the
// live tree, so they are exercised end to end instead via
// `npm run docs:dead-refs`/`docs:lifecycle`/`docs:staleness` as CI gates,
// not as unit fixtures that would either need a fake repo or assert on
// this repo's current (moving) document count.

describe('LIVING_CATEGORIES', () => {
  it('matches exactly the nine categories the plan names for the ratchet', () => {
    expect(new Set(LIVING_CATEGORIES)).toEqual(
      new Set([
        'REFERENCE', 'GENERATED_TRUTH', 'CURRENT_FEATURE', 'PROCESS_CONTRACT',
        'RUNBOOK', 'POLICY', 'DESIGN_SPEC', 'STATE_SNAPSHOT', 'AGENT_SKILL',
      ]),
    );
  });

  it('excludes the historical/dated categories the ratchet must not punish', () => {
    for (const excluded of ['ARCHIVE', 'HISTORY_LEDGER', 'PLAN', 'AUDIT_SNAPSHOT', 'ADR', 'INCIDENT', 'INDEX', 'UNKNOWN']) {
      expect(LIVING_CATEGORIES).not.toContain(excluded);
    }
  });
});

describe('STATUS_HEADER_RE (the --lifecycle status parser)', () => {
  function statusOf(body) {
    const m = STATUS_HEADER_RE.exec(body);
    return m ? m[1].toUpperCase() : null;
  }

  it('reads a plain "Status:" line', () => {
    expect(statusOf('Status: CURRENT\n\nSome content.')).toBe('CURRENT');
  });

  it('reads a bold "**Status:**" line', () => {
    expect(statusOf('**Status:** SUPERSEDED\n')).toBe('SUPERSEDED');
  });

  it('reads the all-caps "STATUS:" convention used by the existing lifecycle() classifier', () => {
    expect(statusOf('<!--\nSTATUS: DONE\nDATE: 2026-07-10\n-->')).toBe('DONE');
  });

  it('is case-insensitive on the value too', () => {
    expect(statusOf('Status: complete')).toBe('COMPLETE');
  });

  it('returns null when there is no Status header at all', () => {
    expect(statusOf('# A normal doc\n\nNo header here.')).toBeNull();
  });
});

describe('DONE_STATUSES (the --lifecycle failure set)', () => {
  it('flags exactly SUPERSEDED, DONE and COMPLETE', () => {
    expect(DONE_STATUSES.has('SUPERSEDED')).toBe(true);
    expect(DONE_STATUSES.has('DONE')).toBe(true);
    expect(DONE_STATUSES.has('COMPLETE')).toBe(true);
  });

  it('does not flag CURRENT, ACTIVE, STALE or HISTORICAL', () => {
    for (const other of ['CURRENT', 'ACTIVE', 'STALE', 'HISTORICAL']) {
      expect(DONE_STATUSES.has(other)).toBe(false);
    }
  });
});

describe('categorise() (reused, unmodified, by the new flags)', () => {
  it('still classifies memory/features/* as CURRENT_FEATURE', () => {
    expect(categorise('memory/features/golf-round-lifecycle.md', '')).toBe('CURRENT_FEATURE');
  });

  it('still classifies .claude/rules/* as POLICY', () => {
    expect(categorise('.claude/rules/shipping.md', '')).toBe('POLICY');
  });

  it('still classifies docs/archive/* as ARCHIVE regardless of body content', () => {
    expect(categorise('docs/archive/2026-08/whatever.md', 'STATUS: DONE')).toBe('ARCHIVE');
  });
});

describe('lifecycle() (the pre-existing heuristic classifier, unchanged)', () => {
  it('reads an explicit SUPERSEDED header', () => {
    expect(lifecycle('docs/x.md', 'STATUS: SUPERSEDED\n')).toBe('superseded');
  });

  it('falls back to current with no marker', () => {
    expect(lifecycle('docs/x.md', '# Just a doc')).toBe('current');
  });
});

describe('REV_LIST_CMD_RE / ANCHOR_SHA_RE (the --staleness anchor parser)', () => {
  it('extracts the sha and pathspec from a fenced rev-list command with a single glob', () => {
    const body = 'Anchor SHA for the "current" claims below: run\n' +
      "`git rev-list --count 0aa66e5bd..HEAD -- 'src/**'` to see how far the code has moved.";
    const m = REV_LIST_CMD_RE.exec(body);
    expect(m[1]).toBe('0aa66e5bd');
    expect(splitPathspec(m[2])).toEqual(['src/**']);
  });

  it('extracts multiple quoted globs from the pathspec', () => {
    const body = "`git rev-list --count fea6a6035..HEAD -- 'src/**' 'scripts/**'` to see how far";
    const m = REV_LIST_CMD_RE.exec(body);
    expect(m[1]).toBe('fea6a6035');
    expect(splitPathspec(m[2])).toEqual(['src/**', 'scripts/**']);
  });

  it('falls back to ANCHOR_SHA_RE for a bare "Anchor SHA `<sha>`." with no rev-list command', () => {
    const body = 'Anchor SHA `3d7d1b1ef`. Staleness check: run the command below.';
    expect(REV_LIST_CMD_RE.exec(body)).toBeNull();
    const m = ANCHOR_SHA_RE.exec(body);
    expect(m[1]).toBe('3d7d1b1ef');
  });

  it('does not match a doc with no Anchor SHA language at all', () => {
    const body = '# A doc\n\nNo anchor here, just prose about `src/lib/foo.ts`.';
    expect(REV_LIST_CMD_RE.exec(body)).toBeNull();
    expect(ANCHOR_SHA_RE.exec(body)).toBeNull();
  });
});

describe('splitPathspec()', () => {
  it('splits unquoted single tokens', () => {
    expect(splitPathspec('src')).toEqual(['src']);
  });

  it('preserves single- and double-quoted globs as one token each', () => {
    expect(splitPathspec(`'src/**' "scripts/**"`)).toEqual(['src/**', 'scripts/**']);
  });
});

describe('STALENESS_THRESHOLD', () => {
  it('is the 200-commit figure the plan specifies', () => {
    expect(STALENESS_THRESHOLD).toBe(200);
  });
});
