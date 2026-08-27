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

# ── Normalize before matching ───────────────────────────────────────────────
# Every check below is a grep over SQL, and grep has no idea what SQL is. Two
# consequences were exploitable (security scan 2026-08-26, F2 and F10):
#
#   F2 — the SECURITY DEFINER rule is satisfied by a NEGATIVE match on
#   "revoke ... execute ... anon". A SQL line COMMENT saying exactly that is
#   inert to Postgres but indistinguishable to grep, so
#       -- revoke execute on function f from anon;
#   convinced the guard a REVOKE existed when none did, and the block was
#   skipped on a genuinely anon-callable SECURITY DEFINER function.
#
#   F10 — the DELETE-without-WHERE rule needed DELETE, FROM, the table and the
#   terminator on ONE grep record. Postgres treats a newline as ordinary
#   whitespace, so
#       DELETE
#         FROM golf_rounds;
#   is a full table wipe that never matched. A trailing `-- note` defeated the
#   tail anchor the same way.
#
# Stripping comments and collapsing whitespace fixes both at the source rather
# than complicating each regex, and it makes every rule — including ones added
# later — see the statement Postgres will actually run.
#
# Note the direction of the change: normalisation only ever removes hiding
# places, so each rule becomes strictly HARDER to slip past. A false block here
# costs a reworded migration; a false allow costs production.
BODY=$(printf '%s' "$BODY" | perl -0pe '
  s{/\*.*?\*/}{ }gs;   # block comments
  s{--[^\n]*}{ }g;     # line comments
  s{\s+}{ }g;          # newlines and runs of space -> one space
')

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
