import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * `.claude/hooks/guard-sql.sh` — the SQL guard had NO tests at all until
 * 2026-08-27, which is how both bugs below survived: a guard nobody executes is
 * believed rather than checked, and this repo's quality-gates rule already names
 * that failure mode ("a gate that cannot fail is not a gate").
 *
 * The two findings, from security scan CLAUDE-SECURITY-20260826-224016:
 *
 *   F2 — the SECURITY DEFINER rule blocks only when it CANNOT find a matching
 *   REVOKE. grep does not know SQL, so an inert line COMMENT mentioning
 *   "revoke ... execute ... anon" satisfied the negative check and suppressed
 *   the block on a genuinely anon-callable definer function.
 *
 *   F10 — the DELETE-without-WHERE rule required DELETE, FROM, the table and
 *   the terminator to share one grep record. Postgres treats a newline as
 *   ordinary whitespace, so a DELETE split across two lines was a full table
 *   wipe that matched nothing.
 *
 * Both are fixed by normalising the payload (strip comments, collapse
 * whitespace) before any rule runs, so the guard sees the statement Postgres
 * will actually execute. These tests pin both directions: the evasions must
 * block, and ordinary correct SQL must still pass — the guard becoming
 * unusably aggressive would be its own kind of failure.
 */

const REPO = resolve(__dirname, '../../..');
const HOOK = resolve(REPO, '.claude/hooks/guard-sql.sh');

/** Exit 2 = blocked; anything else = allowed. */
function runSqlGuard(
  body: string,
  opts: { tool?: string; file?: string } = {},
): 'BLOCK' | 'ALLOW' {
  const tool = opts.tool ?? 'Write';
  const payload =
    tool === 'Write'
      ? { tool_name: tool, tool_input: { file_path: opts.file ?? 'supabase/migrations/x.sql', content: body } }
      : { tool_name: tool, tool_input: { query: body } };
  try {
    execFileSync('bash', [HOOK], {
      input: JSON.stringify(payload),
      env: { ...process.env, CLAUDE_PROJECT_DIR: REPO },
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return 'ALLOW';
  } catch (err) {
    const code = (err as { status?: number }).status;
    return code === 2 ? 'BLOCK' : 'ALLOW';
  }
}

describe('guard-sql — SECURITY DEFINER without a real REVOKE (F2)', () => {
  it('blocks a definer function whose only "REVOKE" is a line comment', () => {
    // The exploit: this reads to grep exactly like a real REVOKE, and to
    // Postgres like nothing at all.
    const sql = `
      CREATE OR REPLACE FUNCTION public.f() RETURNS void
      LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      -- revoke execute on function public.f() from anon;
    `;
    expect(runSqlGuard(sql)).toBe('BLOCK');
  });

  it('blocks when the fake REVOKE hides in a block comment', () => {
    const sql = `
      CREATE FUNCTION public.g() RETURNS void
      LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      /* revoke execute on function public.g() from public, anon; */
    `;
    expect(runSqlGuard(sql)).toBe('BLOCK');
  });

  it('still ALLOWS a definer function with a genuine REVOKE', () => {
    // The guard must not become unusable: this is the shape the block message
    // itself tells you to write, so it has to pass.
    const sql = `
      CREATE FUNCTION public.h() RETURNS void
      LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      REVOKE EXECUTE ON FUNCTION public.h() FROM PUBLIC, anon;
      GRANT EXECUTE ON FUNCTION public.h() TO authenticated;
    `;
    expect(runSqlGuard(sql)).toBe('ALLOW');
  });

  it('allows a genuine REVOKE that is split across lines', () => {
    // Normalisation has to help the LEGITIMATE case too, not only the evasion.
    const sql = `
      CREATE FUNCTION public.i() RETURNS void
      LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      REVOKE EXECUTE
        ON FUNCTION public.i()
        FROM PUBLIC, anon;
    `;
    expect(runSqlGuard(sql)).toBe('ALLOW');
  });
});

describe('guard-sql — DELETE without WHERE (F10)', () => {
  it('blocks a single-line unqualified DELETE', () => {
    expect(runSqlGuard('DELETE FROM golf_rounds;')).toBe('BLOCK');
  });

  it('blocks a DELETE split across lines', () => {
    // Postgres reads a newline as plain whitespace; the old single-record grep
    // did not, so this full table wipe matched nothing.
    expect(runSqlGuard('DELETE\n  FROM golf_rounds;')).toBe('BLOCK');
  });

  it('blocks a DELETE hidden behind a trailing comment', () => {
    expect(runSqlGuard('DELETE FROM golf_rounds -- cleanup\n;')).toBe('BLOCK');
  });

  it('blocks through the MCP route as well as the file route', () => {
    // execute_sql hits production directly with service_role and never touches
    // a file, so a file-only guard would miss it entirely.
    expect(
      runSqlGuard('DELETE\n FROM golf_rounds;', { tool: 'mcp__supabase__execute_sql' }),
    ).toBe('BLOCK');
  });

  it('still ALLOWS a DELETE that has a WHERE clause', () => {
    expect(runSqlGuard('DELETE FROM golf_rounds WHERE id = $1;')).toBe('ALLOW');
  });

  it('allows a WHERE clause split across lines', () => {
    expect(runSqlGuard('DELETE FROM golf_rounds\n  WHERE created_at < now();')).toBe('ALLOW');
  });
});

describe('guard-sql — the pre-existing rules still hold after normalisation', () => {
  it('blocks GRANT to anon', () => {
    expect(runSqlGuard('GRANT SELECT ON golf_rounds TO anon;')).toBe('BLOCK');
  });

  it('blocks GRANT to anon split across lines', () => {
    expect(runSqlGuard('GRANT SELECT\n  ON golf_rounds\n  TO anon;')).toBe('BLOCK');
  });

  it('blocks DROP TABLE and TRUNCATE', () => {
    expect(runSqlGuard('DROP TABLE golf_rounds;')).toBe('BLOCK');
    expect(runSqlGuard('TRUNCATE golf_rounds;')).toBe('BLOCK');
  });

  it('allows an ordinary additive migration', () => {
    const sql = `
      ALTER TABLE public.golf_rounds
        ADD COLUMN IF NOT EXISTS note text;
      CREATE INDEX IF NOT EXISTS idx_golf_rounds_note
        ON public.golf_rounds (note);
    `;
    expect(runSqlGuard(sql)).toBe('ALLOW');
  });

  it('ignores non-SQL files on the Write route', () => {
    expect(runSqlGuard('DELETE FROM x;', { file: 'notes.md' })).toBe('ALLOW');
  });
});
