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
#    Force-push reality, verified live 2026-08-20: main's branch protection has
#    allow_force_pushes = FALSE and enforce_admins = false, so GitHub itself now
#    rejects a force push to main. This hook is NOT redundant: it also covers
#    force pushes to OTHER branches, to any remote, and the local repo — none of
#    which that GitHub setting touches. (An earlier version of this comment said
#    allow_force_pushes was ENABLED; that was stale — corrected here.)
#
#    The regex was ALSO wrong until 2026-08-20. `push.*(--force|-f)([space]|$)`
#    matched only a STANDALONE `-f`/`--force`; combined short flags carry force
#    intent with no `-f` token, so `git push -vf` and `-fv` sailed straight
#    through. Harmless while every push prompted — load-bearing the moment
#    `Bash(git push:*)` was allow-listed. Now: a push AND any force spelling
#    blocks. Both directions are pinned in src/test/hooks/guard-bash-worktree.test.ts.
if printf '%s' "$CMD" | grep -Eq '(^|[;&|[:space:]])git([[:space:]]+(-[^[:space:]]+)([[:space:]]+[^[:space:]=-][^[:space:]]*)?)*[[:space:]]+push([[:space:]]|$)' \
   && printf '%s' "$CMD" | grep -Eq '(--force|(^|[[:space:]])-[a-zA-Z]*f[a-zA-Z]*([[:space:]]|$))'; then
  block "BLOCKED: force push (any spelling — --force, --force-with-lease, -f, or a combined short flag like -vf/-fv). It rewrites shared history that other branches and open PRs build on. With Bash(git push:*) allow-listed, this hook is the last line — run any force push yourself, outside the agent."
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

# 11. `git worktree add` INSIDE the repo. .claude/rules/autonomy.md has said not
#     to do this for a while; on 2026-08-19 there were nine of them, and prose
#     had not prevented a single one.
#
#     The harm is not disk. .gitignore hides `.claude/worktrees/` from git but
#     NOT from find, grep, ripgrep-without-ignore-rules, or agent file search, so
#     every nested tree puts a second copy of every source file in front of every
#     search. Worse, each carries its own .claude/ — its own CLAUDE.md, its own
#     skills — so which copy an agent was launched from decides what it was told.
#     Two of those nine had a CLAUDE.md that genuinely differed from root.
#
#     External worktrees are the supported shape and are proven not to drift: the
#     three sibling checkouts all had byte-identical CLAUDE.md/AGENTS.md/.mcp.json.
if printf '%s' "$CMD" | grep -Eq '(^|[;&|[:space:]])git([[:space:]]+-[^[:space:]]+)*[[:space:]]+worktree[[:space:]]+add'; then
  PROJ_ROOT=$(cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null && pwd -P) || PROJ_ROOT=""

  # Everything after `worktree add`.
  # NOTE: [[:space:]][[:space:]]* and not \+ — BSD sed (macOS, where this hook
  # actually runs) does not support \+ in a basic regex. With \+ this returns
  # EMPTY, the loop never runs, and the guard silently allows everything. That
  # exact bug shipped once and was caught only by the discrimination test.
  WT_REST=$(printf '%s' "$CMD" | sed -n 's/.*worktree[[:space:]][[:space:]]*add[[:space:]][[:space:]]*//p')

  # The destination is the first NON-FLAG token — but -b/-B take a branch name
  # as their value, and that value is not a path. Treating it as one made the
  # first version of this rule block legitimate external worktrees.
  WT_DEST=""
  WT_SKIP=0
  for WT_TOK in $WT_REST; do
    if [ "$WT_SKIP" -eq 1 ]; then WT_SKIP=0; continue; fi
    case "$WT_TOK" in
      -b|-B) WT_SKIP=1; continue ;;
      --) continue ;;
      -*) continue ;;
      *) WT_DEST="$WT_TOK"; break ;;
    esac
  done

  if [ -n "$WT_DEST" ] && [ -n "$PROJ_ROOT" ]; then
    case "$WT_DEST" in
      /*) WT_ABS="$WT_DEST" ;;
      *)  WT_ABS="${PROJ_ROOT}/${WT_DEST}" ;;
    esac
    # Collapse . and .. textually. The path does not exist yet, so realpath is
    # not available; a naive prefix match without this treats ../foo as inside.
    WT_ABS=$(printf '%s' "$WT_ABS" | awk -F/ '{
      n = 0
      for (i = 1; i <= NF; i++) {
        if ($i == "" || $i == ".") continue
        if ($i == "..") { if (n > 0) n--; continue }
        n++; parts[n] = $i
      }
      out = ""
      for (i = 1; i <= n; i++) out = out "/" parts[i]
      print (out == "" ? "/" : out)
    }')
    case "$WT_ABS" in
      "$PROJ_ROOT"/?*)
        block "BLOCKED: 'git worktree add' targeting '$WT_DEST', which resolves inside this repository ($WT_ABS).

A nested worktree is invisible to git but fully visible to find, grep and agent file search, so it puts a duplicate of every source file in front of every search. Each one also carries its own .claude/ — its own CLAUDE.md and skills — so which copy a session starts in decides which instructions it gets.

Put it outside the repo instead:
  git worktree add ~/worktrees/helmv3/<task> -b <branch>" ;;
    esac
  fi
fi

# 12. `vercel` production deploy/promote/rollback/alias-mutation shapes.
#     Belt-and-braces alongside settings.json's permission `deny` rules — a
#     permission `deny` matches a literal command-PREFIX string, and
#     `vercel --cwd . deploy --prod` is a different prefix from
#     `vercel deploy --prod`, so a reordered/prefixed invocation dodges the
#     permission layer alone. Mirrors rule 6/7's supabase config push / db
#     reset treatment. Vercel automatic git deployment stays disabled
#     (vercel.json's deploymentEnabled: {"*": false}) — production is an
#     on-demand, owner-run CLI action, and the GolfHelm Engineering OS's
#     daily-reliability workflow may read Vercel (inspect/ls/logs/env ls)
#     but must never deploy, promote, roll back, or mutate production
#     aliasing. Read shapes are deliberately NOT touched by any of the three
#     checks below.
if printf '%s' "$CMD" | grep -Eq '(^|[;&|[:space:]])vercel([[:space:]]|$)'; then
  if printf '%s' "$CMD" | grep -Eq -- '--prod([[:space:]]|=|$)'; then
    block "BLOCKED: 'vercel ... --prod'. Production deploy is an on-demand, owner-run CLI action outside the agent — this repo's Vercel automatic git deployment stays disabled on purpose.
If a release is genuinely ready, prepare it (release candidate, verification, ledger update) and hand off; the owner runs the deploy."
  fi
  if printf '%s' "$CMD" | grep -Eq '(^|[;&|[:space:]])vercel[[:space:]]+(promote|rollback)([[:space:]]|$)'; then
    block "BLOCKED: 'vercel promote/rollback'. Both mutate what production serves, and are owner-run CLI actions outside the agent — same reasoning as the --prod block above."
  fi
  if printf '%s' "$CMD" | grep -Eq '(^|[;&|[:space:]])vercel[[:space:]]+alias[[:space:]]+set([[:space:]]|$)'; then
    block "BLOCKED: 'vercel alias set'. This mutates production domain routing and is an owner-run CLI action outside the agent, same reasoning as the --prod block above."
  fi
fi

exit 0
