import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * `.claude/hooks/guard-sql.sh` — payload routing and statement normalization.
 *
 * This hook is the only thing standing between an agent and a production write,
 * because the MCP route (`apply_migration` / `execute_sql`) reaches the SHARED
 * production database directly with `service_role`, with no file, no review and
 * no RLS. There is no staging copy.
 *
 * Two independent defects, measured 2026-08-26 against the hook as it stood:
 *
 * 1. PAYLOAD ROUTING. `BODY` is `.tool_input.content // .new_string // .query`
 *    — the first non-empty field wins, and only those three are consulted. The
 *    `case` statement at the top explicitly covers `MultiEdit`, but a MultiEdit
 *    carries its text in `.tool_input.edits[].new_string`, so `BODY` comes back
 *    empty, line 26 exits 0, and the payload is never inspected at all. The
 *    extension gate is also a case-SENSITIVE glob (`*.sql`), so a file named
 *    `migration.SQL` skips inspection for the same reason.
 *
 * 2. STATEMENT NORMALIZATION. Every rule is a line-oriented `grep`, but Postgres
 *    treats a newline as ordinary whitespace and ignores `--` comments entirely.
 *    So `DROP\nTABLE`, `GRANT ...\n  TO anon`, `TRUNCATE\n<table>` and
 *    `DELETE\nFROM` all execute exactly as their single-line forms while
 *    matching no rule — and an inert `-- revoke ... from anon` COMMENT satisfies
 *    the SECURITY DEFINER guard's negative check, letting a definer function
 *    ship still EXECUTE-able by PUBLIC.
 *
 * THESE ASSERT THE DESIRED VERDICT, NOT TODAY'S. Every statement below is valid
 * SQL that really does perform the destructive act in its split form.
 */

const REPO = resolve(__dirname, '../../..');
// See the note in guard-bash-normalization.test.ts — same override, same reason.
const HOOK = process.env.GUARD_SQL_HOOK ?? resolve(REPO, '.claude/hooks/guard-sql.sh');

function runGuard(payload: Record<string, unknown>): 'BLOCK' | 'ALLOW' {
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

/** The MCP envelope — the route that hits production directly. */
const viaMcp = (query: string) => ({
  tool_name: 'mcp__supabase__execute_sql',
  tool_input: { query },
});

const DROP = 'DROP TABLE golf_rounds;';

describe('guard-sql — every tool envelope carrying SQL must be inspected', () => {
  it.each([
    ['MCP execute_sql', { tool_name: 'mcp__supabase__execute_sql', tool_input: { query: DROP } }],
    [
      'MCP apply_migration',
      { tool_name: 'mcp__supabase__apply_migration', tool_input: { name: 'm', query: DROP } },
    ],
    [
      'Write of a .sql file',
      { tool_name: 'Write', tool_input: { file_path: '/x/m.sql', content: DROP } },
    ],
    [
      'Edit of a .sql file',
      { tool_name: 'Edit', tool_input: { file_path: '/x/m.sql', old_string: 'a', new_string: DROP } },
    ],
    [
      'MultiEdit of a .sql file (payload lives in .edits[])',
      {
        tool_name: 'MultiEdit',
        tool_input: { file_path: '/x/m.sql', edits: [{ old_string: 'a', new_string: DROP }] },
      },
    ],
    [
      'MultiEdit with the payload in a later edit',
      {
        tool_name: 'MultiEdit',
        tool_input: {
          file_path: '/x/m.sql',
          edits: [
            { old_string: 'a', new_string: 'SELECT 1;' },
            { old_string: 'b', new_string: DROP },
          ],
        },
      },
    ],
    [
      'a .SQL file (the extension glob is case-sensitive)',
      { tool_name: 'Write', tool_input: { file_path: '/x/m.SQL', content: DROP } },
    ],
  ])('BLOCKS a DROP TABLE arriving via %s', (_label, payload) => {
    expect(runGuard(payload)).toBe('BLOCK');
  });
});

describe('guard-sql — a newline is whitespace to Postgres, so it must be to the guard', () => {
  it.each([
    ['DROP / TABLE split', 'DROP\nTABLE golf_rounds;'],
    ['TRUNCATE / table split', 'TRUNCATE\ngolf_rounds;'],
    ['DELETE / FROM split, no WHERE', 'DELETE\nFROM golf_rounds;'],
    ['GRANT with TO anon on the next line', 'GRANT EXECUTE ON FUNCTION f() TO\n  anon;'],
    ['GRANT split before TO', 'GRANT EXECUTE ON FUNCTION f()\n  TO anon;'],
    ['DROP TABLE indented after a leading newline', '\n  DROP TABLE golf_rounds;'],
  ])('BLOCKS %s', (_label, sql) => {
    expect(runGuard(viaMcp(sql))).toBe('BLOCK');
  });
});

describe('guard-sql — SQL comments must not satisfy or defeat a rule', () => {
  it('BLOCKS a DELETE with no WHERE that carries a trailing comment', () => {
    expect(runGuard(viaMcp('DELETE FROM golf_rounds -- cleanup\n;'))).toBe('BLOCK');
  });

  it('BLOCKS a SECURITY DEFINER whose only "REVOKE" is an inert comment', () => {
    // The comment is never sent to the planner. Without a real REVOKE the
    // function ships callable by anon, which is the exact outcome the rule exists
    // to prevent.
    const sql = [
      'CREATE FUNCTION admin_bypass() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;',
      '-- revoke execute on function admin_bypass() from anon',
    ].join('\n');
    expect(runGuard(viaMcp(sql))).toBe('BLOCK');
  });

  it('BLOCKS a SECURITY DEFINER whose "REVOKE" is inside a block comment', () => {
    const sql = [
      'CREATE FUNCTION admin_bypass() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;',
      '/* revoke execute on function admin_bypass() from anon */',
    ].join('\n');
    expect(runGuard(viaMcp(sql))).toBe('BLOCK');
  });

  // Regression, found in review 2026-08-26. The first version of the
  // normalization stripped `--` blindly, so a `--` inside a STRING LITERAL was
  // read as a comment and erased the rest of the line — including any statement
  // after it. `SELECT '--' as marker; DELETE FROM golf_players;` normalized to
  // `SELECT '`, the unscoped DELETE disappeared before the no-WHERE rule ran,
  // and a shape that blocked BEFORE the fix started being allowed after it.
  it('BLOCKS an unscoped DELETE hidden behind a "--" inside a string literal', () => {
    expect(runGuard(viaMcp("SELECT '--' as marker; DELETE FROM golf_players;"))).toBe('BLOCK');
  });

  it('BLOCKS a DROP TABLE following a string literal containing "--"', () => {
    expect(runGuard(viaMcp("SELECT '-- not a comment' AS s; DROP TABLE golf_rounds;"))).toBe(
      'BLOCK',
    );
  });

  it('ALLOWS a harmless query whose string literal contains "--"', () => {
    expect(runGuard(viaMcp("SELECT '--' AS dashes FROM golf_rounds WHERE id = $1;"))).toBe('ALLOW');
  });

  it('ALLOWS a SECURITY DEFINER with a real REVOKE statement', () => {
    const sql = [
      'CREATE FUNCTION f() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;',
      'REVOKE EXECUTE ON FUNCTION f() FROM PUBLIC, anon;',
      'GRANT EXECUTE ON FUNCTION f() TO authenticated;',
    ].join('\n');
    expect(runGuard(viaMcp(sql))).toBe('ALLOW');
  });
});

/**
 * Both directions. Stripping comments and flattening newlines must not turn
 * ordinary migrations into false blocks — a guard that blocks everything gets
 * disabled, which is the same outcome as a guard that blocks nothing.
 */
describe('guard-sql — normalization must not manufacture false blocks', () => {
  it.each([
    ['a scoped DELETE with a WHERE clause', 'DELETE FROM golf_rounds WHERE id = $1;'],
    [
      'a DELETE whose WHERE is on the next line',
      'DELETE FROM golf_rounds\n  WHERE team_id = $1;',
    ],
    ['a GRANT to authenticated', 'GRANT EXECUTE ON FUNCTION f() TO authenticated;'],
    ['a GRANT to service_role', 'GRANT SELECT ON golf_rounds TO service_role;'],
    ['an ordinary CREATE TABLE', 'CREATE TABLE golf_x (id uuid PRIMARY KEY);'],
    [
      'a comment that merely mentions dropping a table',
      '-- we used to DROP TABLE golf_rounds here; now we do not\nSELECT 1;',
    ],
    [
      'a comment mentioning granting to anon',
      '-- never GRANT SELECT ON x TO anon\nGRANT SELECT ON x TO authenticated;',
    ],
  ])('ALLOWS %s', (_label, sql) => {
    expect(runGuard(viaMcp(sql))).toBe('ALLOW');
  });

  it('ALLOWS a non-SQL file carrying SQL-shaped text', () => {
    expect(
      runGuard({ tool_name: 'Write', tool_input: { file_path: '/x/notes.md', content: DROP } }),
    ).toBe('ALLOW');
  });
});
