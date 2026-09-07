// Fixture-stdin tests for .claude/hooks/guard-sql.mjs
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  evaluateStatement,
  splitStatements,
  targetsLocalStack,
  outsideHeredocBodies,
} from '../../../.claude/hooks/guard-sql.mjs';

const HOOK = resolve(process.cwd(), '.claude/hooks/guard-sql.mjs');

function run(input) {
  try {
    execFileSync('node', [HOOK], {
      input: JSON.stringify(input),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { verdict: 'ALLOW', stderr: '' };
  } catch (err) {
    return { verdict: err.status === 2 ? 'BLOCK' : 'ALLOW', stderr: String(err.stderr ?? '') };
  }
}

describe('guard-sql pure logic', () => {
  it('allows SELECT/EXPLAIN/WITH regardless of content', () => {
    expect(evaluateStatement('SELECT * FROM golf_players')).toBeNull();
    expect(evaluateStatement('EXPLAIN DELETE FROM golf_players')).toBeNull();
    expect(evaluateStatement('WITH x AS (SELECT 1) SELECT * FROM x')).toBeNull();
  });

  it('blocks DROP TABLE|SCHEMA and prints the matched statement', () => {
    expect(evaluateStatement('DROP TABLE golf_players')).toMatch(/DROP TABLE\|SCHEMA is blocked: DROP TABLE golf_players/);
    expect(evaluateStatement('drop schema public cascade')).toMatch(/DROP TABLE\|SCHEMA/);
  });

  it('does not block DROP FUNCTION (out of scope)', () => {
    expect(evaluateStatement('DROP FUNCTION fn()')).toBeNull();
  });

  it('blocks TRUNCATE and prints the matched statement', () => {
    expect(evaluateStatement('TRUNCATE golf_players')).toBe('TRUNCATE is blocked: TRUNCATE golf_players');
  });

  it('blocks DELETE without WHERE, allows DELETE with WHERE', () => {
    expect(evaluateStatement('DELETE FROM golf_players')).toBe('DELETE without WHERE is blocked: DELETE FROM golf_players');
    expect(evaluateStatement('DELETE FROM golf_players WHERE id = 1')).toBeNull();
  });

  it('blocks ALTER ... DROP COLUMN', () => {
    expect(evaluateStatement('ALTER TABLE golf_players DROP COLUMN handicap')).toMatch(
      /ALTER \.\.\. DROP COLUMN is blocked/,
    );
  });

  it('does not block an ALTER TABLE that is not a drop column', () => {
    expect(evaluateStatement('ALTER TABLE golf_players ADD COLUMN foo text')).toBeNull();
  });

  it('does not block ALTER ROLE or GRANT (out of scope)', () => {
    expect(evaluateStatement('ALTER ROLE authenticator WITH LOGIN')).toBeNull();
    expect(evaluateStatement('GRANT EXECUTE ON FUNCTION fn() TO anon')).toBeNull();
  });

  it('does not read cross-sport table names as a signal (out of scope)', () => {
    expect(evaluateStatement('UPDATE golf_players SET x = 1')).toBeNull();
    expect(evaluateStatement('UPDATE baseball_players SET x = 1')).toBeNull();
  });

  it('splitStatements splits on semicolons and trims', () => {
    expect(splitStatements('SELECT 1; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });
});

describe('guard-sql subprocess contract', () => {
  it('allows a SELECT via the Supabase execute_sql tool', () => {
    const result = run({
      tool_name: 'mcp__supabase__execute_sql',
      tool_input: { query: 'SELECT * FROM golf_players LIMIT 1' },
    });
    expect(result.verdict).toBe('ALLOW');
  });

  it('blocks a DROP TABLE via the account-wide execute_sql connector', () => {
    const result = run({
      tool_name: 'mcp__e139bbde-4728-4ed3-977f-7b1b22f4b69c__execute_sql',
      tool_input: { query: 'DROP TABLE golf_players' },
    });
    expect(result.verdict).toBe('BLOCK');
    expect(result.stderr).toMatch(/DROP TABLE golf_players/);
  });

  it('blocks apply_migration carrying a DROP SCHEMA', () => {
    const result = run({
      tool_name: 'mcp__supabase__apply_migration',
      tool_input: { query: 'DROP SCHEMA public CASCADE' },
    });
    expect(result.verdict).toBe('BLOCK');
  });

  it('blocks TRUNCATE via a Bash psql command', () => {
    const result = run({
      tool_name: 'Bash',
      tool_input: { command: 'psql "$DB_URL" -c "TRUNCATE golf_players"' },
    });
    expect(result.verdict).toBe('BLOCK');
    expect(result.stderr).toMatch(/TRUNCATE golf_players/);
  });

  it('ignores a Bash command that does not touch psql or supabase db', () => {
    const result = run({
      tool_name: 'Bash',
      tool_input: { command: 'echo "DROP TABLE golf_players"' },
    });
    expect(result.verdict).toBe('ALLOW');
  });

  it('never throws on malformed stdin', () => {
    expect(() =>
      execFileSync('node', [HOOK], { input: 'not json', encoding: 'utf-8' }),
    ).not.toThrow();
  });
});

describe('guard-sql local stack', () => {
  it('allows a destructive statement against an explicitly local target', () => {
    expect(targetsLocalStack('psql postgresql://p@127.0.0.1:54322/postgres -c "x"')).toBe(true);
    expect(targetsLocalStack('supabase db reset --local')).toBe(true);
    expect(targetsLocalStack('psql "postgresql://p@localhost:54322/postgres" -c "x"')).toBe(true);
    expect(
      run({
        tool_name: 'Bash',
        tool_input: { command: 'psql postgresql://p@127.0.0.1:54322/postgres -c "DROP TABLE tmp"' },
      }).verdict,
    ).toBe('ALLOW');
  });

  it('does not exempt a target it cannot see', () => {
    expect(targetsLocalStack('psql "$DB" -c "DROP TABLE golf_rounds"')).toBe(false);
    expect(run({ tool_name: 'Bash', tool_input: { command: 'psql "$DB" -c "DROP TABLE golf_rounds"' } }).verdict).toBe('BLOCK');
  });

  it('re-arms when any remote marker is present, even beside a local one', () => {
    expect(targetsLocalStack('psql --local --linked -c "DROP TABLE t"')).toBe(false);
    expect(targetsLocalStack('psql "postgresql://x@db.qmnssrrolpinvwjjnufo.supabase.co:5432/p"')).toBe(false);
    expect(targetsLocalStack('supabase db push --project-ref abc --local')).toBe(false);
  });
});

describe('guard-sql heredoc scoping', () => {
  it('does not treat a heredoc body as an invocation', () => {
    const cmd = 'cat > /tmp/notes.md <<EOF\nrun psql then DROP TABLE golf_rounds\nEOF';
    expect(outsideHeredocBodies(cmd)).not.toMatch(/psql/);
    expect(run({ tool_name: 'Bash', tool_input: { command: cmd } }).verdict).toBe('ALLOW');
  });

  it('still refuses a heredoc that IS the statement fed to psql', () => {
    const cmd = 'psql "$DB" <<EOF\nDROP TABLE golf_rounds;\nEOF';
    expect(outsideHeredocBodies(cmd)).toMatch(/psql/);
    expect(run({ tool_name: 'Bash', tool_input: { command: cmd } }).verdict).toBe('BLOCK');
  });
});
