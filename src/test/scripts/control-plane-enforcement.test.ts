// What is actually enforced, checked against configuration rather than prose.
//
// 2026-08-29: three rule files claimed protections that did not exist, all in
// the confident direction, all about irreversible operations —
//
//   database.md  destructive SQL "blocked by a PreToolUse hook on both the
//                file-write and MCP paths"        -> no such hook on either
//   CLAUDE.md    "a governed edit is BLOCKED"      -> Stop reports it afterward
//   shipping.md  "the hook is the only thing left" -> that hook was deleted
//
// Each was true when written and none was updated when its mechanism was
// removed. Prose cannot notice that, so the repo now resolves these claims in
// docs/CONTROL_PLANE_ENFORCEMENT.md, regenerated from live configuration.
//
// This suite pins the structure that generator depends on, and pins the three
// corrections against silent reversion. It deliberately does NOT try to prove
// that English is accurate — it proves the configuration is what the generated
// inventory says it is, and that no corrected file has gone back to asserting
// enforcement it does not have.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../..');
const SETTINGS = resolve(REPO, '.claude/settings.json');
const INVENTORY = resolve(REPO, 'docs/CONTROL_PLANE_ENFORCEMENT.md');
const GENERATOR = resolve(REPO, 'scripts/gen-enforcement-inventory.mjs');

type Settings = {
  hooks?: Record<string, Array<{ matcher?: string; hooks?: Array<{ command?: string }> }>>;
  permissions?: { allow?: string[]; ask?: string[]; deny?: string[] };
};

const settings: Settings = JSON.parse(readFileSync(SETTINGS, 'utf-8'));
const deny = settings.permissions?.deny ?? [];

function hookRows() {
  const rows: Array<{ event: string; matcher: string; command: string }> = [];
  for (const [event, entries] of Object.entries(settings.hooks ?? {})) {
    for (const entry of entries ?? []) {
      for (const h of entry.hooks ?? []) {
        rows.push({ event, matcher: entry.matcher ?? '', command: h.command ?? '' });
      }
    }
  }
  return rows;
}

function scriptPath(command: string): string | null {
  const m = command.match(/[^\s"']*\.claude\/hooks\/[A-Za-z0-9._/-]+/);
  return m ? m[0].replace(/^"?\$\{?CLAUDE_PROJECT_DIR\}?"?/, '').replace(/^\/+/, '') : null;
}

describe('hook wiring is real', () => {
  it('every configured hook resolves to a script that exists', () => {
    // A hook pointing at a deleted file is silently inert — the exact way
    // guard-sql.sh stopped protecting anything while the docs still cited it.
    const missing = hookRows()
      .map((r) => scriptPath(r.command))
      .filter((p): p is string => p !== null)
      .filter((p) => !existsSync(resolve(REPO, p)));
    expect(missing, 'configured hooks whose script is not on disk').toEqual([]);
  });

  it('every configured hook entry is enumerable — event, matcher, command', () => {
    const rows = hookRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.event, 'hook with no event').toBeTruthy();
      expect(r.command, `hook under ${r.event} with no command`).toBeTruthy();
    }
  });

  it('exactly one hook can refuse a tool call, and it is the canonical-write guard', () => {
    // If this ever legitimately changes, the inventory changes with it and this
    // assertion is what forces the docs to be regenerated rather than drift.
    const blocking = hookRows().filter((r) => r.event === 'PreToolUse');
    expect(blocking).toHaveLength(1);
    const only = blocking[0];
    expect(only, 'expected exactly one PreToolUse hook').toBeDefined();
    expect(only!.command).toContain('guard-canonical-write.mjs');
    expect(only!.matcher).toBe('Write|Edit|MultiEdit');
  });

  it('no hook claims to cover MCP unless one actually matches mcp__', () => {
    // Permission rules are the entire MCP defence. If a hook is ever added for
    // it, the inventory must stop saying otherwise.
    const mcpHooks = hookRows().filter((r) => /mcp__/.test(r.matcher));
    const inventory = readFileSync(INVENTORY, 'utf-8');
    if (mcpHooks.length === 0) {
      expect(inventory).toMatch(/no hook matcher mentions mcp__/);
    } else {
      expect(inventory).not.toMatch(/no hook matcher mentions mcp__/);
    }
  });
});

describe('project-level Supabase denies are present', () => {
  it('every account-wide mutating tool is denied', () => {
    const mutating = [
      'apply_migration',
      'create_branch',
      'create_project',
      'delete_branch',
      'deploy_edge_function',
      'merge_branch',
      'pause_project',
      'rebase_branch',
      'reset_branch',
      'restore_project',
    ];
    const missing = mutating
      .map((t) => `mcp__claude_ai_Supabase__${t}`)
      .filter((r) => !deny.includes(r));
    expect(missing).toEqual([]);
  });

  it('the uninstalled plugin namespace stays denied at server level', () => {
    // Denied so the standing user-scope grant cannot activate on install.
    expect(deny).toContain('mcp__plugin_supabase_supabase');
  });
});

describe('the generated inventory matches live configuration', () => {
  it('regenerating produces no diff (run the generator and commit it)', () => {
    // Same shape as docs:diff-check — the artifact is the source of truth and
    // a stale one fails here rather than misleading a reader.
    const r = execFileSync('node', [GENERATOR, '--check'], {
      cwd: REPO,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(r).toMatch(/matches live configuration/);
  });

  it('separates CONFIGURED / WIRED / EXERCISED / UNENFORCED rather than conflating them', () => {
    const inv = readFileSync(INVENTORY, 'utf-8');
    for (const word of ['CONFIGURED', 'WIRED', 'EXERCISED', 'UNENFORCED']) {
      expect(inv, `inventory must define and use ${word}`).toContain(word);
    }
  });
});

describe('the generated table cannot lie about its own columns', () => {
  it('escapes backslashes before delimiters', async () => {
    // CodeQL js/incomplete-sanitization, first run of the generator: esc()
    // escaped `|` but not `\`, so a value containing a backslash before a pipe
    // produced an escaped backslash followed by an UNescaped pipe — silently
    // ending the cell and shifting every column after it. The input is
    // repo-controlled config, so the risk was a mangled table rather than an
    // injection. A table that misreports its own columns is still exactly what
    // this file exists not to produce.
    const { esc } = await import('../../../scripts/gen-enforcement-inventory.mjs');
    expect(esc('Write|Edit')).toBe('Write\\|Edit');
    expect(esc('a\\b')).toBe('a\\\\b');
    expect(esc('a\\|b')).toBe('a\\\\\\|b');
  });
});

describe('the three corrected claims stay corrected', () => {
  const read = (p: string) => readFileSync(resolve(REPO, p), 'utf-8');

  /**
   * A correction that records what the old text said will CONTAIN the false
   * sentence — as a quotation. That is the point of the correction, not a
   * regression. So assertions are checked against the prose with quoted spans
   * removed: what matters is whether the file still ASSERTS enforcement in its
   * own voice, not whether the words appear anywhere in it.
   *
   * Caught by this suite failing on its own fix, which is the correct order of
   * events.
   */
  const asserted = (p: string) =>
    read(p)
      .replace(/[\u201c\u201d"][^\u201c\u201d"]*[\u201c\u201d"]/g, ' ');

  it('database.md does not claim destructive SQL is blocked by a hook', () => {
    expect(asserted('.claude/rules/database.md')).not.toMatch(/are blocked by a PreToolUse hook/);
    const db = read('.claude/rules/database.md');
    expect(db).toMatch(/UNENFORCED/);
    // and it records that the false version escaped into user scope
    expect(db).toMatch(/autoMode/);
  });

  it('CLAUDE.md distinguishes detection from prevention', () => {
    expect(asserted('CLAUDE.md')).not.toMatch(/A governed edit is blocked until/);
    expect(read('CLAUDE.md')).toMatch(/DETECTED, not prevented/);
  });

  it('shipping.md does not claim an rm guard that does not exist', () => {
    const s = asserted('.claude/rules/shipping.md');
    expect(s).not.toMatch(/\*\*`rm -rf \.next` is blocked\.\*\*/);
    expect(s).not.toMatch(/the hook is\s+the only thing left/);
    expect(read('.claude/rules/shipping.md')).toMatch(/Recursive `rm` is UNENFORCED/);
  });

  it('autonomy.md does not justify autonomy with hooks that do not exist', () => {
    // The most consequential of the four. This paragraph told the reader it was
    // safe to proceed without asking, and named three shapes — force push,
    // destructive SQL, unscoped recursive rm — as deterministically blocked.
    // None of the three is covered by any hook or deny rule.
    const a = asserted('.claude/rules/autonomy.md');
    expect(a).not.toMatch(/they block the shapes\s+that actually matter/);
    expect(read('.claude/rules/autonomy.md')).toMatch(/All three examples were false/);
  });

  it('all four point readers at the generated inventory', () => {
    for (const p of [
      '.claude/rules/database.md',
      'CLAUDE.md',
      '.claude/rules/shipping.md',
      '.claude/rules/autonomy.md',
    ]) {
      expect(read(p), `${p} should cite the inventory`).toContain('CONTROL_PLANE_ENFORCEMENT.md');
    }
  });
});
