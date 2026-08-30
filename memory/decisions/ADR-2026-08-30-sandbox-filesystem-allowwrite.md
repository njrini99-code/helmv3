# ADR-2026-08-30 — sandbox.filesystem stays disabled, and the design that would enable it

**Status:** accepted — no change made
**Supersedes:** nothing
**Gap:** `SANDBOX_FILESYSTEM_DISABLED` in `config/control-plane-gaps.json`

## Context

`~/.claude/settings.json` carries `sandbox.filesystem.disabled: true`. Measured
2026-08-29, ten disposable probes were all ALLOWED — including a Bash write
inside the canonical checkout, a write to `.claude/settings.json`, a write
outside the project, a delete, and a read of `.env.local` despite its presence
in `denyRead`. Network sandboxing IS enforced; the filesystem half is not.

The one `PreToolUse` hook that exists, `guard-canonical-write.mjs`, matches the
TOOL NAME `Write|Edit|MultiEdit`. It never runs for `Bash`, and under
`bypassPermissions` Bash is the instructed default for file changes. So the
unguarded route into the canonical checkout is the normal one.

`sandbox.filesystem` is the structural answer: it denies by PATH at the OS
level, which covers Bash-spawned processes without parsing shell.

## The configuration that would implement it

Current value, verbatim:

```json
"filesystem": {
  "allowWrite": ["/private/tmp/helmv3-*", "/tmp/helmv3-*", "~/.npm", "~/Library/Caches/deno"],
  "denyRead": ["~/.ssh", "~/.aws", "~/.config/gh", "~/.npmrc", "~/.netrc",
               "~/Downloads/helmv3/.env", "~/Downloads/helmv3/.env.local",
               "~/Downloads/helmv3/.env.development.local",
               "~/Downloads/helmv3/.env.production.local"],
  "disabled": true
}
```

The intended model adds the worktree home and omits the canonical checkout:

```json
"allowWrite": [
  "~/worktrees/**",
  "/private/tmp/helmv3-*", "/tmp/helmv3-*",
  "~/.npm", "~/Library/Caches/deno"
]
```

## Why it is not enabled

**1. `allowWrite` is an allow-list, and it is user-global.** It applies to every
project on this machine, not to Helm. Making it safe for Helm means enumerating
every other directory the owner ever writes in — an open-ended list whose first
omission looks like a broken tool in an unrelated repository. That is a
different and worse failure than the one being fixed.

**2. It contradicts this repo's own workspace policy.** AGENTS.md states that a
single active session may work in the canonical checkout directly, and that
worktrees are for concurrency. A read-only canonical inverts that: every task,
however small, would need `scripts/new-worktree.sh`. Dependency installs were
decoupled from worktree creation precisely because that coupling cost ~3.8 GiB
per checkout and once took the volume to zero bytes free.

**3. `git` writes to the working tree.** `git checkout`, `git pull`, `git merge`
and `git stash` all write files under the canonical path. A denied canonical
does not merely stop an agent editing source — it stops the checkout being a
checkout. Any real design has to carve out `.git/` and accept that a working-
tree update is indistinguishable from an edit at the filesystem layer.

Point 3 is the one that makes this more than a configuration exercise. The
protection wanted is "an agent may not edit source in canonical"; the mechanism
available is "no process may write under this path". Those are not the same
rule, and the gap between them is where the workflow lives.

## Decision

Leave `disabled: true`. Keep the gap registered with its measurement rather than
closing it by flipping a switch whose blast radius is every project on the
machine.

Do NOT compensate with a Bash command parser. That architecture was deleted for
cause: it refused an `echo`, a `grep` and a commit message for containing the
words of a blocked command, and its read-only exemption was bypassable through
`$(...)`. A regex does not understand shell semantics.

## What whoever enables it must do first

1. A disposable Claude profile (`CLAUDE_CONFIG_DIR` pointed elsewhere), never
   the live one.
2. Prove, in that profile: a Bash write under `~/worktrees/helmv3/**` succeeds;
   a Bash write under the canonical checkout is refused; `git checkout` and
   `git pull` still work in canonical or are explicitly accepted as broken; a
   write in an unrelated project still works.
3. Only then decide whether the residual — the canonical Bash hole this closes
   — is worth the cost the three points above describe.
