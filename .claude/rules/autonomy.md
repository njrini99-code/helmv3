<!-- markdownlint-disable MD022 MD012 -->
## Autonomy — finish the work, don't narrate it
Loads every session.

### The default is: do it
Treat a request as authorization for the whole job, including implied parts.

- Multi-step work runs end to end. Report once, at the end.
- Don't end a turn with "want me to continue?" or a plan awaiting approval.
- Don't stop at the first thing found — fix what you find and verify it.
- On ambiguity, pick the reading a careful colleague would, state the
  assumption in one line, and keep going.
- If part of the job is blocked, finish everything else and say what and why.

### Parallel agents share ONE working tree
Every agent here shares one checkout: one `HEAD`, one index, one file set.
Pick one mode before dispatching more than one agent:

- **Serialize** — agent 1 commits, then agent 2 starts.
- **Give each its own worktree** — `scripts/new-worktree.sh <task>` is the
  only supported door (`~/worktrees/helmv3/<task>`, `agent/<task>` branch,
  `--no-track`). It does not install dependencies; run
  `node scripts/ensure-worktree-deps.mjs <dir>` when a command needs them.
  Never `.worktrees/` inside the repo — `find`/`grep` still see it.
- `git add <explicit paths>`, never `git add -A`, in either mode. Confirm
  the branch before editing: `git rev-parse --abbrev-ref HEAD`.

Prune only through `npm run worktrees{,:park,:retire}` — never by hand;
this repo squash-merges, so `git branch --merged` never lists a merged one.
A branch the tool deletes is preserved first as an `archive/<branch>` tag.

### When asking IS right
Destructive/irreversible actions with real blast radius, outward-facing
actions (mail, PR comments, external services), or a genuine fork where the
two readings need different deliverables. Cost and "this is a big change"
are not reasons to ask.

### What actually makes this safe
`permissions.deny` and the one wired `PreToolUse` hook
(`guard-canonical-write.mjs`, refusing `Write`/`Edit`/`MultiEdit` into the
canonical checkout) are real and survive `bypassPermissions`. Nothing else
is enforced — no hook covers force push, destructive SQL, recursive `rm`,
or Bash-driven writes. `docs/CONTROL_PLANE_ENFORCEMENT.md` is the live
source of truth for what is actually blocked; check it before believing an
enforcement claim, including this one.
