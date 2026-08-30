// The doc schema-drift gate, and the namespace collision it could not see.
//
// The gate greps `memory/**` and `.claude/rules/**` for `golf_*` / `baseball_*`
// tokens and fails on any that is not a table, view, function or enum. That
// works because the repo's hard rule is that every table carries a sport
// prefix — which is also true of several `memory/registry.yml` FEATURE IDS.
//
// `golf_round_lifecycle` is a feature id. It is not a database object and never
// will be. Until 2026-08-30 the first `.md` under `memory/` to name one in prose
// failed this gate as a phantom table, which is the "a substring is not a
// mechanism" error this repo has now made three times.
//
// The exclusion is DECLARED, not pattern-matched: only keys actually present
// under `features:` are exempt, so a misspelled table is still caught. These
// tests pin both halves.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(__dirname, '../../../scripts/check-doc-schema-drift.mjs');

// The script reads ROOT from process.cwd(), so a fixture root is enough to
// exercise it end to end without touching the live checkout.
const DATABASE_TS = `export type Database = {
  graphql_public: {
    Tables: {
    }
  }
  public: {
    Tables: {
      golf_rounds: { Row: { id: string } }
    }
    Views: {
    }
    Functions: {
    }
    Enums: {
    }
  }
}
`;

describe('doc schema drift — feature ids are a different namespace', () => {
  let root: string;

  function write(rel: string, body: string) {
    const p = join(root, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, body);
  }

  function run() {
    return spawnSync(process.execPath, [SCRIPT], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'helm-drift-')));
    write('src/lib/types/database.ts', DATABASE_TS);
    write('.doc-schema-baseline.json', JSON.stringify({ total: 0, identifiers: [] }));
    write(
      'memory/registry.yml',
      ['version: 1', '', 'features:', '  golf_round_lifecycle:', '    name: Round Lifecycle', ''].join('\n'),
    );
    mkdirSync(join(root, '.claude/rules'), { recursive: true });
    write('CLAUDE.md', '# c\n');
    write('AGENTS.md', '# a\n');
  });

  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it('does NOT flag a declared registry feature id', () => {
    write('memory/doc.md', 'The feature is `golf_round_lifecycle` and its table is `golf_rounds`.\n');
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/excluded as declared memory\/registry\.yml feature id/);
    expect(r.stdout).toContain('golf_round_lifecycle');
  });

  it('says so out loud — an invisible exemption is how a real phantom hides', () => {
    write('memory/doc.md', 'See `golf_round_lifecycle`.\n');
    expect(run().stdout).toMatch(/1 excluded as declared/);
  });

  it('STILL flags a golf_* name that is neither schema nor a declared feature', () => {
    write('memory/doc.md', 'Rows live in `golf_recurring_events`.\n');
    const r = run();
    expect(r.status).not.toBe(0);
    // the failure detail goes to stderr; the counts go to stdout
    expect(r.stderr).toMatch(/golf_recurring_events/);
  });

  it('flags a MISSPELLED feature id — the exemption is by declaration, not shape', () => {
    // `golf_round_lifecycl` is snake_case, sport-prefixed, and absent from the
    // registry. Shape-based exemption would let it through.
    write('memory/doc.md', 'See `golf_round_lifecycl`.\n');
    expect(run().status).not.toBe(0);
  });

  it('an unreadable registry exempts nothing — it fails toward reporting', () => {
    rmSync(join(root, 'memory/registry.yml'));
    write('memory/doc.md', 'See `golf_round_lifecycle`.\n');
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toMatch(/excluded as declared/);
  });
});
