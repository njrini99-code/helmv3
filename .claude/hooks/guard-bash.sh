#!/usr/bin/env bash
# PreToolUse / Bash — deterministic guards for traps this repo has actually hit.
#
# Contract (docs: code.claude.com/docs/en/hooks):
#   stdin  = JSON with .tool_input.command
#   exit 0 = no objection (normal permission flow still applies)
#   exit 2 = BLOCK; stderr is fed back to Claude as the reason
# Never exit 1 — that is a non-blocking "hook error" notice, not a block.
#
# -f (noglob) is load-bearing, not hygiene: rule 10 word-splits the rm targets,
# and without it a literal `*` argument expands against the hook's own cwd, so
# the catastrophic-glob check never sees the `*` it exists to catch.
set -ufo pipefail

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

block() { printf '%s\n' "$1" >&2; exit 2; }

# 1. git stash — refs/stash is REPO-GLOBAL, shared across every worktree.
#    A stash pushed in one worktree is visible (and poppable) from all of them,
#    so parallel agents silently steal each other's work.
if printf '%s' "$CMD" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+stash([[:space:]]|$)' \
   && ! printf '%s' "$CMD" | grep -Eq 'git[[:space:]]+stash[[:space:]]+(list|show)([[:space:]]|$)'; then
  block "BLOCKED: 'git stash'. refs/stash is repo-global and shared by every worktree, so a stash here is visible and poppable from all of them — that is how parallel work gets silently swapped.
Use instead: a WIP commit on the current branch (git add -A && git commit -m wip), or copy the file aside."
fi

# 2. rm -rf .next — deleting the Turbopack cache mid-session wedges cold compile
#    for the rest of the session and costs minutes per page.
if printf '%s' "$CMD" | grep -Eq 'rm[[:space:]]+(-[a-zA-Z]+[[:space:]]+)*.*\.next([/[:space:]]|$)'; then
  block "BLOCKED: removing .next mid-session. This wedges Turbopack into a cold-compile loop for the rest of the session.
If you genuinely need a clean build, stop the dev server first, then delete it, then restart."
fi

# 3. Exit-code masking — a gate command on the LEFT of a pipe reports the
#    PIPE's exit status, not the gate's. `npm test | tail` exits 0 while the
#    tests fail. This is the single most dangerous shape for a verification
#    step, because it manufactures a green result.
GATE='(npm[[:space:]]+(run[[:space:]]+)?(test|lint|typecheck|build)|npx[[:space:]]+(vitest|tsc|eslint|semgrep)|vitest[[:space:]]+run)'
if printf '%s' "$CMD" | grep -Eq "$GATE" \
   && printf '%s' "$CMD" | grep -q '|' \
   && ! printf '%s' "$CMD" | grep -q 'pipefail'; then
  block "BLOCKED: a gate command is piped, so its exit code is masked — the pipeline reports the LAST command's status, so a failing suite still looks like success.
Fix (keeps your filtering): prefix with 'set -o pipefail;' e.g.
  set -o pipefail; npm test 2>&1 | tail -40
Or capture the code explicitly: npm test > /tmp/out 2>&1; echo \"exit=\$?\"; tail -40 /tmp/out"
fi

# 4. Force push. The ONLY push shape still blocked.
#
#    2026-08-15: rules 4b and 5 used to block EVERY push to main, on the
#    premise "production serves main here, so this is a deploy." That premise
#    died 2026-07-08 — vercel.json has carried
#    "git": {"deploymentEnabled": {"*": false}} since #789/d29deea4, so no
#    branch auto-deploys and production is an on-demand CLI promote. Pushing
#    main ships nothing, and main is now the working branch by owner decision.
#
#    Force push matters MORE now: main has allow_force_pushes ENABLED and
#    enforce_admins off, so this hook is the only guard on shared history.
if printf '%s' "$CMD" | grep -Eq 'git[[:space:]]+push.*(--force|-f)([[:space:]]|$)'; then
  block "BLOCKED: force push. It rewrites remote history that other worktrees and open PRs are built on, and GitHub will NOT stop you — main has allow_force_pushes enabled and enforce_admins off.
If you truly need it, use --force-with-lease and run it yourself."
fi

# 6. `supabase config push` — config.toml carries an explicit warning that this
#    pushes the ENTIRE file, including the dev site_url, and would overwrite
#    production's site URL and break every auth email link. The warning existed
#    but nothing enforced it, and a stale memory file recommended running it.
if printf '%s' "$CMD" | grep -Eq 'supabase[[:space:]]+config[[:space:]]+push'; then
  block "BLOCKED: 'supabase config push'. It pushes ALL of supabase/config.toml — including the dev site_url = http://127.0.0.1:3000 — which would overwrite production's site URL and break every auth email link and redirect.
Apply only the templates, surgically: scripts/apply-auth-email-templates.sh"
fi

# 7. `supabase db reset` — drops and recreates the database from migrations.
if printf '%s' "$CMD" | grep -Eq 'supabase[[:space:]]+db[[:space:]]+reset'; then
  block "BLOCKED: 'supabase db reset' drops and rebuilds the database. This project is linked to production (project_ref in supabase/.temp/project-ref).
If you mean the LOCAL stack, stop and confirm which database is linked first."
fi

# 8. Destructive SQL through the CLI. guard-sql.sh only sees Write/Edit of .sql
#    files and the MCP apply_migration/execute_sql payloads — a raw psql or
#    `supabase db execute` call bypasses it entirely.
if printf '%s' "$CMD" | grep -Eiq '(psql|supabase[[:space:]]+db[[:space:]]+(execute|query))' \
   && printf '%s' "$CMD" | grep -Eiq '(drop[[:space:]]+table|truncate[[:space:]]|delete[[:space:]]+from|grant[[:space:]]+.*[[:space:]]to[[:space:]]+(anon|public))'; then
  block "BLOCKED: destructive SQL via the CLI. guard-sql.sh covers migration files and MCP calls, but not psql — so this shape reaches the database unchecked.
This database is shared by Golf, Baseball and Lift Lab and the standing rule is additive migrations only."
fi

# 9. `git clean -fd` deletes UNTRACKED files — i.e. work that was never committed
#    and exists nowhere else. This repo carried 137 uncommitted files for 8 days.
# git clean only DELETES with -f/--force; -n/--dry-run just lists. Block the
# former, never the latter (the remedy below depends on -n working).
if printf '%s' "$CMD" | grep -Eq 'git[[:space:]]+clean([[:space:]]|$)' \
   && printf '%s' "$CMD" | grep -Eq '(-[a-zA-Z]*f|--force)' \
   && ! printf '%s' "$CMD" | grep -Eq '(-[a-zA-Z]*n|--dry-run)'; then
  block "BLOCKED: 'git clean' deletes untracked files, which by definition exist nowhere else — no commit, no stash, no remote.
Run 'git clean -nd' first to see exactly what would go, then do it yourself if that list is right."
fi

# 10. Recursive rm outside this project. ~/.claude/settings.local.json allows
#     Bash(rm:*) for every project, and an allow rule suspends BOTH the prompt
#     and the auto-mode classifier — so under auto mode a recursive delete
#     anywhere on disk runs unattended and unreviewed. PreToolUse hooks are not
#     suspended by allow rules, which is what makes this the right layer.
#     Scope recursive deletes to paths that belong to the work: the project
#     itself and the OS temp dirs (where the scratchpad lives).
if printf '%s' "$CMD" | grep -Eq '(^|[;&|[:space:]])rm[[:space:]]'; then
  PROJ=$(cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null && pwd -P) || PROJ=""

  # Isolate the rm invocation BEFORE looking at flags. Reading flags from the
  # whole command line was a real false-positive: any `-r` belonging to another
  # command on the same line (`jq -r`, `sort -r`, `grep -R`, `head -r`) made a
  # harmless `rm -f` look recursive, and the target parser then blamed whatever
  # token it found first. A guard that cries wolf is a guard you learn to
  # ignore, so this must stay scoped to rm's own segment.
  RM_SEG=$(printf '%s' "$CMD" \
    | sed -E 's/.*(^|[;&|[:space:]])rm[[:space:]]+//' \
    | sed -E 's/[[:space:]]*(\||;|&&|>>?).*$//')

  IS_RECURSIVE=0
  printf '%s' "$RM_SEG" \
    | grep -Eq '(^|[[:space:]])(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)([[:space:]]|$)' \
    && IS_RECURSIVE=1

  # Targets = every token in that segment that is not a flag. Quotes stripped
  # so a quoted path is inspected rather than treated as opaque.
  TARGETS=$(printf '%s' "$RM_SEG" \
    | tr ' ' '\n' \
    | sed -E 's/^["'"'"']//; s/["'"'"']$//' \
    | grep -vE '^-' | grep -v '^$')

  [ "$IS_RECURSIVE" -eq 1 ] || TARGETS=""

  for T in $TARGETS; do
    # Catastrophic literals — never legitimate from an agent, at any depth.
    case "$T" in
      /|/'*'|'*'|.|./|..|../|'~'|'~/'|'$HOME'|'${HOME}'|"$HOME"|"$HOME"/)
        block "BLOCKED: recursive rm of '$T'. That target is the filesystem root, your home directory, or an unbounded glob — there is no version of this that is a scoped cleanup.
Name the exact directory you mean, as a path inside the project or under /tmp." ;;
    esac

    # Expand a leading ~ so the containment check below sees a real path.
    case "$T" in "~/"*) T="$HOME/${T#\~/}" ;; esac

    case "$T" in
      /*)
        # Absolute: must live strictly INSIDE the project or the OS temp dirs.
        # The project root itself is excluded — that is the whole checkout.
        case "$T" in
          "$PROJ"/?*|/tmp/?*|/private/tmp/?*|/var/folders/?*|/private/var/folders/?*) ;;
          *)
            block "BLOCKED: recursive rm of '$T'. That is either outside this project or the project root itself.
Recursive deletes are scoped to paths INSIDE ${PROJ:-the project}, or under /tmp. If this path really must go, delete it yourself where you can see what is in it first." ;;
        esac ;;
      *..*)
        # Relative paths are project-relative and fine — unless they climb out.
        block "BLOCKED: recursive rm of '$T'. The '..' escapes the project directory, so what this actually deletes depends on the current working directory.
Use an absolute path inside the project instead." ;;
      *)
        # A relative target is only project-relative if the cwd is still the
        # project. A `cd` earlier in the same command silently moves the target.
        if printf '%s' "$CMD" | grep -Eq '(^|[;&|[:space:]])cd[[:space:]]'; then
          block "BLOCKED: recursive rm of the relative path '$T' in a command that also runs 'cd'. What this deletes depends on where the cd landed, which is not reviewable from the command alone.
Use an absolute path inside the project instead."
        fi ;;
    esac
  done
fi

exit 0
