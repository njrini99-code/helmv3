#!/usr/bin/env node
// .claude/hooks/guard-sql.mjs — PreToolUse guard for destructive raw SQL.
//
// Fires on: Supabase MCP tools ending in __execute_sql / __apply_migration
// (covers both the sanctioned mcp__supabase__* namespace and the
// account-wide connector mcp__e139bbde-4728-4ed3-977f-7b1b22f4b69c__*), and
// on Bash commands that shell out to `psql` or `supabase db`.
//
// Blocks exactly: DROP TABLE, DROP SCHEMA, TRUNCATE, a WHERE-less
// DELETE FROM, and ALTER ... DROP COLUMN. SELECT / EXPLAIN / WITH
// statements always pass — this never blocks reads, and everything else
// (GRANT, ALTER ROLE, DROP FUNCTION, cross-sport table access, ...) is
// deliberately left alone: this hook reads SQL syntax, not intent, and the
// keyword-matching Bash guards this repo already deleted (see
// guard-canonical-write.mjs's header) are the cautionary tale for reading
// more into a command than its literal shape supports.
//
// The refusal message includes the exact statement that matched, so the
// caller can see precisely what tripped it rather than a bare category name.
//
// Contract: reads hook JSON on stdin, exit 0 to allow, exit 2 with a
// one-line reason on stderr to block. Never throws — a crash must exit 0.

function readStdinJson() {
  return new Promise((resolvePromise) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      try {
        resolvePromise(JSON.parse(data || '{}'));
      } catch {
        resolvePromise({});
      }
    });
    process.stdin.on('error', () => resolvePromise({}));
  });
}

/** Split a SQL blob into naive statements on top-level semicolons. */
export function splitStatements(sql) {
  return String(sql || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

const READ_ONLY_RE = /^(SELECT|EXPLAIN|WITH)\b/i;
const DROP_TABLE_SCHEMA_RE = /\bDROP\s+(TABLE|SCHEMA)\b/i;
const TRUNCATE_RE = /\bTRUNCATE\b/i;
const DELETE_NO_WHERE_RE = /\bDELETE\s+FROM\b/i;
const ALTER_DROP_COLUMN_RE = /\bALTER\s+TABLE\b[\s\S]*\bDROP\s+COLUMN\b/i;

/**
 * Evaluate one SQL statement. Returns a block reason (including the
 * offending statement text) or null to allow.
 */
export function evaluateStatement(statement) {
  if (!statement) return null;
  if (READ_ONLY_RE.test(statement)) return null;

  if (DROP_TABLE_SCHEMA_RE.test(statement)) {
    return `DROP TABLE|SCHEMA is blocked: ${statement}`;
  }
  if (TRUNCATE_RE.test(statement)) {
    return `TRUNCATE is blocked: ${statement}`;
  }
  if (DELETE_NO_WHERE_RE.test(statement) && !/\bWHERE\b/i.test(statement)) {
    return `DELETE without WHERE is blocked: ${statement}`;
  }
  if (ALTER_DROP_COLUMN_RE.test(statement)) {
    return `ALTER ... DROP COLUMN is blocked: ${statement}`;
  }
  return null;
}

/** Extract the SQL text a tool call carries, under whichever field it uses. */
function sqlFromToolInput(toolInput) {
  if (!toolInput) return '';
  return (
    toolInput.query ||
    toolInput.sql ||
    toolInput.statement ||
    toolInput.command ||
    ''
  );
}

const SQL_TOOL_RE = /__(execute_sql|apply_migration)$/;

/**
 * True when a Bash command names the LOCAL Supabase stack and nothing remote.
 *
 * The local stack is a throwaway container an agent recreates with
 * `supabase start`; a DROP against 127.0.0.1:54322 is ordinary local
 * verification, not the shared production database this hook exists for. The
 * rule that matters is "not production", not "never".
 *
 * Deliberately literal and fail-closed: a target arriving through a shell
 * variable (`psql "$DB" ...`) is NOT exempt, because this cannot see what the
 * variable holds, and any remote marker anywhere in the command re-arms the
 * guard even when a local one is also present.
 */
/**
 * The command with every heredoc BODY removed, leaving the commands themselves.
 *
 * Whether this is a database command is decided out here, because a heredoc
 * body is content, not an invocation: writing a file, a test fixture or a note
 * that happens to contain `psql` and `drop table` is not running one, and
 * refusing it is the keyword-matching failure this repo has paid for twice.
 *
 * The SCAN for destructive SQL still runs over the whole command, so
 * `psql "$DB" <<EOF ... drop table ... EOF` — where the heredoc really is the
 * statement — is still refused. Only the "is this a database command at all"
 * question is asked outside the body.
 */
export function outsideHeredocBodies(command) {
  return String(command || '').replace(
    /<<-?\s*'?"?([A-Za-z_][A-Za-z0-9_]*)'?"?[\s\S]*?\n\s*\1\b/g,
    '<<HEREDOC',
  );
}

export function targetsLocalStack(command) {
  const cmd = String(command || '');
  const remote = /--linked\b|\.supabase\.co\b|db\.[a-z0-9]{20}\b|--project-ref\b/i.test(cmd);
  if (remote) return false;
  return /\b127\.0\.0\.1\b|\blocalhost\b|--local\b|:54322\b/.test(cmd);
}

export function main(input) {
  const toolName = input?.tool_name || '';
  const toolInput = input?.tool_input || {};

  let sqlText = null;

  if (SQL_TOOL_RE.test(toolName)) {
    sqlText = sqlFromToolInput(toolInput);
  } else if (toolName === 'Bash') {
    const command = String(toolInput.command || '');
    if (targetsLocalStack(command)) return { block: false };
    const invocation = outsideHeredocBodies(command);
    if (/\bpsql\b/.test(invocation) || /\bsupabase\s+db\b/.test(invocation)) {
      sqlText = command;
    }
  }

  if (!sqlText) return { block: false };

  for (const statement of splitStatements(sqlText)) {
    const reason = evaluateStatement(statement);
    if (reason) return { block: true, reason };
  }

  return { block: false };
}

async function run() {
  const input = await readStdinJson();
  const { block, reason } = main(input);
  if (block) {
    process.stderr.write(`BLOCKED by guard-sql: ${reason}\n`);
    process.exit(2);
  }
  process.exit(0);
}

// Only run when executed directly, so this file stays importable for tests.
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
if (process.argv[1] && (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})()) {
  run().catch(() => process.exit(0));
}
