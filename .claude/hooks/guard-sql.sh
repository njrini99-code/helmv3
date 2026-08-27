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
    # Case-INSENSITIVE: the glob was `*.sql`, so a file named `migration.SQL`
    # skipped inspection entirely.
    FILE_LC=$(printf '%s' "$FILE" | tr '[:upper:]' '[:lower:]')
    case "$FILE_LC" in *.sql) ;; *) exit 0 ;; esac
    ;;
esac

# Collect EVERY field that can carry SQL, not just the first non-empty one.
# The previous `content // new_string // query` chain missed
# `.tool_input.edits[].new_string`, so a MultiEdit of a .sql file — a tool this
# very case statement claims to cover — reached production uninspected.
BODY=$(printf '%s' "$INPUT" | jq -r '
  [ .tool_input.content?,
    .tool_input.new_string?,
    .tool_input.old_string?,
    .tool_input.query?,
    (.tool_input.edits? // [] | .[]? | .new_string?),
    (.tool_input.edits? // [] | .[]? | .old_string?)
  ] | map(select(type == "string" and . != "")) | join("\n")')
[ -z "$BODY" ] && exit 0

# Postgres treats a newline as ordinary whitespace and ignores comments, but
# every rule below is a line-oriented grep. Normalize to one comment-free line
# so `DROP\nTABLE`, `GRANT ...\n TO anon` and `DELETE FROM x -- c\n;` are seen
# as the single statements Postgres will actually execute, and so an inert
# `-- revoke ... from anon` COMMENT can no longer satisfy the SECURITY DEFINER
# check. Flattening also removes a false-positive class: a scoped
# `DELETE FROM x\n WHERE ...` used to hit the no-WHERE rule, because the rule's
# `$` matched end-of-LINE rather than end-of-statement.
# QUOTE-AWARE. A blind `s{--[^\n]*}{ }g` treats `--` INSIDE a single-quoted
# literal as a comment and erases the rest of the line, so
# `SELECT '--' as marker; DELETE FROM golf_players;` normalized to `SELECT '`
# and the unscoped DELETE vanished before the no-WHERE check ran — a block
# turned into an allow. (Caught in review 2026-08-26.) This scanner copies
# single-quoted literals verbatim (handling the '' escape) and only treats
# `--` / `/* */` as comments outside one.
NORM=$(printf '%s' "$BODY" | perl -0777 -e '
local $/; my $s=<STDIN>; $s="" unless defined $s;
my $q=chr(39); my ($o,$i,$n)=("",0,length $s);
while($i<$n){
  my $c=substr($s,$i,1); my $c2=substr($s,$i,2);
  if($c eq $q){ $o.=$c; $i++;
    while($i<$n){ my $d=substr($s,$i,1); $o.=$d; $i++;
      if($d eq $q){ if($i<$n && substr($s,$i,1) eq $q){ $o.=$q; $i++; next; } last; } }
    next; }
  if($c2 eq "--"){ $i++ while $i<$n && substr($s,$i,1) ne "\n"; $o.=" "; next; }
  if($c2 eq "/*"){ $i+=2; $i++ while $i<$n && substr($s,$i,2) ne "*/"; $i+=2; $o.=" "; next; }
  $o.=$c; $i++; }
$o =~ s/\s+/ /g; print $o;')

block() { printf '%s\n' "$1" >&2; exit 2; }
has()   { printf '%s' "$NORM" | grep -Eiq "$1"; }

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
if printf '%s' "$NORM" | grep -Eiq 'delete[[:space:]]+from[[:space:]]+[a-z_."]+[[:space:]]*(;|$)'; then
  block "BLOCKED: DELETE FROM with no WHERE clause — this empties the whole table.
Add a WHERE clause. If you really mean every row, say so explicitly and do it yourself."
fi

exit 0
