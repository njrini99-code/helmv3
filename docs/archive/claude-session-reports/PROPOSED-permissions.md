# Proposed permission model — apply by hand

I could not write this myself: Claude Code's auto-mode classifier blocks an
agent from widening its own permission grants, which is correct. Review it and
paste the block into `.claude/settings.json` yourself if you agree.

## Why the current setup prompts constantly

The model is inverted. You have a **strong, tested deny layer** —
`guard-bash.sh` (5 guards) and `guard-sql.sh` (4 guards), both verified working
— but `settings.json` only allows two commands (`git add`, `git commit`). So
every routine `ls`, `grep`, `npm run typecheck` needs a prompt, while the thing
that actually protects you is the hook, not the prompt.

Flipping it: allow the routine surface, deny the destructive explicitly, and let
the hooks enforce. The hooks already block what matters — `git stash`,
`rm .next`, gate-command-on-left-of-pipe, force push, push to `main`, and
RLS-bypass / `DROP TABLE` / `TRUNCATE` / unqualified `DELETE`.

## The block

Replace the `"permissions"` object in `.claude/settings.json` with:

```json
  "permissions": {
    "deny": [
      "Bash(sudo:*)",
      "Bash(rm -rf /*)",
      "Bash(rm -rf ~*)",
      "Bash(curl * | sh)",
      "Bash(curl * | bash)",
      "Bash(wget * | sh)",
      "Bash(wget * | bash)",
      "Bash(git push --force*)",
      "Bash(git push -f*)",
      "Bash(npm publish*)",
      "Bash(vercel --prod*)",
      "Bash(supabase db reset*)",
      "Read(.env)",
      "Read(.env.local)",
      "Read(.vercel/.env*)"
    ],
    "allow": [
      "Bash(ls:*)", "Bash(cat:*)", "Bash(head:*)", "Bash(tail:*)",
      "Bash(wc:*)", "Bash(file:*)", "Bash(stat:*)", "Bash(du:*)", "Bash(df:*)",
      "Bash(grep:*)", "Bash(rg:*)", "Bash(find:*)", "Bash(jq:*)", "Bash(sed:*)",
      "Bash(awk:*)", "Bash(sort:*)", "Bash(uniq:*)", "Bash(diff:*)",
      "Bash(mkdir:*)", "Bash(cp:*)", "Bash(mv:*)", "Bash(touch:*)",
      "Bash(echo:*)", "Bash(printf:*)", "Bash(which:*)",
      "Bash(basename:*)", "Bash(dirname:*)", "Bash(timeout:*)",
      "Bash(git:*)",
      "Bash(gh:*)",
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(node:*)",
      "Bash(pnpm:*)",
      "Bash(python3:*)",
      "Bash(pip3:*)",
      "Bash(supabase:*)",
      "Bash(vercel:*)",
      "Bash(psql:*)",
      "Bash(curl:*)",
      "WebFetch(domain:code.claude.com)",
      "WebFetch(domain:docs.anthropic.com)",
      "WebFetch(domain:supabase.com)",
      "WebFetch(domain:vercel.com)",
      "WebFetch(domain:nextjs.org)"
    ]
  },
```

## Notes on specific choices

* **`Read(.env*)` denied** even though those files are git-ignored. Push
  protection never inspects ignored files — that is exactly how
  `.vercel/.env.production.local` sat in the tree with 71 live production values
  for two weeks. Denying the read means an agent cannot echo a secret into a
  transcript.
* **`vercel --prod` denied.** Production has not auto-deployed from `main` since
  2026-07-08; deploys are on-demand. That should stay a human action.
* **`git:*` allowed broadly** because `guard-bash.sh` is the real gate — it
  blocks push-to-main and force-push regardless of what the allow list says.
  Verified: stash → exit 2, push origin main → exit 2, `ls` → exit 0.
* **`curl:*` allowed but piping to a shell denied.** Fetching is routine;
  executing what you fetched is not.
* Three patterns I wanted were rejected by the settings schema and are covered
  by the hooks instead: a fork-bomb literal, and `:*` inside a piped pattern
  (`:*` must be terminal).

## What this does not change

`defaultMode` stays unset. Setting it to `acceptEdits` or `bypassPermissions`
would skip the classifier entirely — a much bigger step than widening an allow
list, and not something to do from a config file without deciding deliberately.
