#!/usr/bin/env bash
# PreToolUse — block RLS-bypass and destructive SQL shapes.
#
# Covers BOTH routes SQL reaches this database:
#   1. Write/Edit of a *.sql migration file
#   2. MCP calls (apply_migration / execute_sql), whose payload is
#      .tool_input.query — these hit PRODUCTION directly with service_role
#      and never touch a file, so a file-only guard misses them entirely.
#
# exit 2 = block, stderr becomes Claude's feedback.
set -uo pipefail

INPUT=$(cat)
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')
FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')

# File route: only inspect .sql. MCP route: no file_path, always inspect.
case "$TOOL" in
  Write|Edit|MultiEdit)
    case "$FILE" in *.sql) ;; *) exit 0 ;; esac
    ;;
esac

BODY=$(printf '%s' "$INPUT" | jq -r '
  .tool_input.content // .tool_input.new_string // .tool_input.query // empty')
[ -z "$BODY" ] && exit 0

block() { printf '%s\n' "$1" >&2; exit 2; }
has()   { printf '%s' "$BODY" | grep -Eiq "$1"; }

# ── Privilege escalation ────────────────────────────────────────────────────
if has 'grant[[:space:]]+.*[[:space:]]to[[:space:]]+(anon|public)([[:space:]]|;|$)'; then
  block "BLOCKED: GRANT to anon/PUBLIC.
anon is the UNAUTHENTICATED role — anyone holding the publishable key gets this. This exact shape has reached this production database before.
Grant to 'authenticated' or 'service_role' instead. If anon access is genuinely intended, justify it in a comment and say so explicitly."
fi

if has 'security[[:space:]]+definer' && ! has 'revoke[[:space:]]+.*execute.*(anon|public)'; then
  block "BLOCKED: SECURITY DEFINER with no matching REVOKE.
It runs with the owner's rights and bypasses RLS, and Postgres grants EXECUTE to PUBLIC by default — so as written this is callable by anon.
Add to the same statement:
  REVOKE EXECUTE ON FUNCTION <name>(<args>) FROM PUBLIC, anon;
  GRANT  EXECUTE ON FUNCTION <name>(<args>) TO authenticated;"
fi

# ── Destructive shapes (production is a SHARED database) ────────────────────
if has '(^|;|[[:space:]])drop[[:space:]]+table' || has '(^|;|[[:space:]])truncate[[:space:]]'; then
  block "BLOCKED: DROP TABLE / TRUNCATE.
This database is shared by Golf, Baseball and Lift Lab, and the standing rule here is additive migrations only — no destructive writes.
If a table genuinely must go, do it yourself in the dashboard where you can see the row count and blast radius first."
fi

# DELETE with no WHERE deletes the entire table. Nearly always a mistake.
if printf '%s' "$BODY" | grep -Eiq 'delete[[:space:]]+from[[:space:]]+[a-z_."]+[[:space:]]*(;|$)'; then
  block "BLOCKED: DELETE FROM with no WHERE clause — this empties the whole table.
Add a WHERE clause. If you really mean every row, say so explicitly and do it yourself."
fi

exit 0
