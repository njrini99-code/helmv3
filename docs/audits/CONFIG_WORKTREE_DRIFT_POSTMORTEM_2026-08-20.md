# Post-mortem — "Claude keeps writing in a different folder," stale prod, and config that wouldn't land on main

**Date:** 2026-08-20 · **Scope:** git worktrees, repo config, branch protection, deploy pipeline, config drift · **Author:** Claude (Opus) session, working with the owner

This explains, in one place, *why* the repo felt broken on 2026-08-20 — agents editing
folders nobody ships, production running stale code, config changes that never reached
`main` — and what was actually wrong underneath each symptom. Every claim here was
verified live during the session (git, the GitHub API, the Vercel API, or the file
tree), not inferred.

---

## TL;DR

Three separate problems wore the same disguise ("things aren't landing / aren't where
they should be"):

1. **Duplicate checkouts.** Sessions were told to `git worktree add`, which makes a
   *second full copy of the repo*. Agents' file-search then returned every file twice
   and they edited the copy that never ships. 13 worktrees had accumulated, plus 26,519
   gitignored scratch files *inside* the repo poisoning every search.
2. **Config lived off-`main`.** The commands the branch→PR workflow needs (`git push`,
   `gh pr create`, …) were allowed only in an **un-committed local file**, and a doc that
   described branch protection had silently drifted from the real GitHub setting. So the
   repo's committed state didn't match how it actually worked.
3. **Merges were gridlocked, and deploys were manual.** Branch protection required every
   PR to be perfectly up-to-date with `main`; with several sessions committing, every open
   PR got invalidated and restarted its 20-minute check suite forever. Separately,
   production only updates on a manual CLI promote, so `main` was **73 commits ahead of
   prod** while everyone assumed merging shipped it.

None of these was a mysterious bug. Each was a **process or config default that made the
wrong thing easy** — and each is now fixed at the level that stops it recurring, not just
cleaned up once.

---

## 1. "Why is Claude writing in a different folder?"

### What you saw
Sessions reporting success while editing files that never showed up in the app — because
they were editing a *different copy of the repo*.

### What was actually wrong
Two mechanisms, stacked:

**(a) `git worktree add` makes a whole second checkout.** The earlier working agreement
was "one worktree per task." `git worktree add /somewhere -b branch` creates a complete
second copy of the source tree at `/somewhere`. There were **13** of them at peak:

```
/Users/ricknini/Downloads/helmv3                     ← the real one
/Users/ricknini/worktrees/helmv3/deploy-prod
/Users/ricknini/worktrees/helmv3/wf_509b1144-d87-13 … -20   (8 of these)
/private/tmp/claude/opus-single-flight
/Users/ricknini/Downloads/helmv3-push-teardown
…
```

The harm isn't disk. It's that `grep`, `find`, and `rg` (without ignore rules) **do not
know which copy is real** — they return a hit in every checkout. An agent picks one at
random and edits a branch nobody is shipping, then honestly reports it did the work. That
is the entire "writing in a different folder" phenomenon.

**(b) Gitignored scratch directories *inside* the repo.** Independent of worktrees, four
directories sat inside `Downloads/helmv3` itself:

| dir | files | what it was |
|---|---:|---|
| `.deepsec/` | 26,425 | a security tool's scratch workspace (its own `node_modules`) |
| `src/.helmdev/` | 93 | a UX-audit tool's output, written to the wrong place |
| `.worktrees/` | 1 | a stray macOS index marker |
| `.claude/worktrees/` | 0 | empty leftover |

All four are gitignored — so **git can't see them, but file-search can.** A single search
from the repo root returned 26k phantom hits, burying the real files. This is the exact
trap the repo's own `autonomy.md` warns about; it had simply regrown.

### Why it kept coming back after you cleaned it yesterday
Because yesterday removed the *worktrees* (the symptom) while the *instruction that
creates them* ("one worktree per task") was still in force. Every new session dutifully
made a fresh worktree overnight, and the pile rebuilt itself. **Cleaning the mess without
changing the rule guarantees the mess returns.**

### The fix
- Removed all 13 worktrees. The 7 that were clean came out immediately; the ones holding
  uncommitted work had that work **committed to their own branches first** (nothing
  destroyed — `wf_…-17/19/20` → commits `784f42f19`, `78d7d53ab`, `cb0a308c0`), then the
  checkouts were removed. Result: **one checkout, `Downloads/helmv3`.**
- Deleted the 26,519 phantom scratch files. Verified after: one copy of each source file,
  zero nested `.git`.
- **Changed the rule** (this is the durable part): no `git worktree add`. All work happens
  in `Downloads/helmv3` directly, on a short-lived branch that exists only as a PR vehicle.
  All four live sessions adopted it.

---

## 2. "Why isn't anything landing on `main`?" — three unrelated causes

This one question had three different answers, which is why it was confusing.

### 2a. Production was 73 commits stale — because pushing doesn't deploy
`vercel.json` carries `"git": { "deploymentEnabled": { "*": false } }`. **No branch
auto-deploys.** Production only changes on a manual `vercel deploy --prod` promote. So
`main` had moved 73 commits ahead of the live site while everyone assumed "merged =
shipped." The first attempted promote also silently failed — the CLI printed a URL, but it
had uploaded a *Preview* build that then cancelled, and the production alias never moved.
Verified by `vercel inspect helmsportslabs.com` showing the alias still on the old build.

**Lesson:** "the CLI printed a URL" is not proof of a deploy. The only proof is the alias
moving, checked independently of whoever ran the deploy.

### 2b. PRs couldn't even be *created* — the workflow's commands weren't allowed on `main`
The branch→PR flow needs `git push`, `git checkout -b`, `git worktree`… and `gh pr
create`. Those were in the checked-in allow-list? **No.** They existed only in an
**un-committed `.claude/settings.local.json`** on one machine. Any session without that
private file hit a permission wall on the exact commands the workflow requires. The
committed config didn't describe how the repo actually had to be used. (Fixed → PR #1518.)

### 2c. PRs couldn't *merge* — `strict: true` gridlock
Branch protection had **"require branches to be up to date before merging"** on
(`strict: true`). That means the instant `main` moves, every open PR becomes "out of
date" and must re-sync and **re-run its entire ~20-minute check suite**. With four
sessions landing commits every few minutes, small PRs got lapped repeatedly and could
never catch up. We caught one PR live in the `BEHIND` state, restarting its 49 checks.

Nothing was *failing* — the config was set to be **slow and self-invalidating**. With
squash-merge already linearizing history, `strict` bought almost nothing and cost the
gridlock. (Fixed → `strict:false`, owner-authorized; the compensating control is
`git pull main` before branching.)

---

## 3. The config drift itself — the thing you actually pointed at

"It shouldn't be in a working tree, it should be on `main`." Exactly. Two drifts:

**(a) Behavior lived in an untracked file.** `.claude/settings.local.json` is gitignored
by design (it holds per-machine MCP auth). But the *git/PR workflow permissions* had been
put there too — so the repo's ability to be worked on at all depended on a file that never
travels to `main`, to a fresh clone, or to CI. That's drift by construction: the committed
repo and the working reality disagree, invisibly.

**(b) A committed doc lied about a live setting.** `.github/branch-protection.md`
documented `strict: true`, "1 approval required," and "no admin bypass." The live GitHub
API said `strict: false`, **0** reviews required, and `enforce_admins: false`. The doc had
drifted from reality in four lines — some from today's change, some pre-existing. A doc
that confidently states the wrong current state is worse than no doc.

**The fix pattern for both:** the *authoritative* setting is the platform (GitHub /
Vercel); the *committed* repo must describe it truthfully so drift is visible and
reviewable. Verified every config surface against its live source:

| surface | committed on `main`? | matched reality? | action |
|---|---|---|---|
| `supabase/config.toml` | yes | yes (dev-only values, no secrets leaked) | none |
| `vercel.json` | yes | yes | none |
| `.claude/settings.json` (git/PR allows) | **was missing them** | no | → PR #1518 |
| GitHub branch protection | (platform) | doc was **wrong** | → PR #1521 |

---

## 4. What was wrong, in one list

1. The working agreement told every session to create a duplicate checkout.
2. Nothing changed that agreement when the mess was cleaned, so it regrew nightly.
3. 26k gitignored scratch files sat inside the repo, poisoning file-search.
4. The commands needed to ship work were allowed only in an untracked local file.
5. Branch protection was configured to invalidate and restart every PR whenever `main`
   moved, gridlocking merges under multi-session load.
6. Production only updates on a manual promote, and a "successful"-looking promote had
   actually failed — so prod ran 73-commit-stale code.
7. A committed doc described branch protection as it *used to be*, not as it *is*.

Note the shape: **not one of these is a code bug.** Every one is a default, a stale
instruction, or a config that made the wrong outcome the easy one.

---

## 5. What now prevents recurrence

- **One checkout, enforced by rule.** No `git worktree add`; work in `Downloads/helmv3`.
  Because the shared checkout has one `HEAD`, the rule is: one session on a non-main branch
  at a time, announce on checkout and on return, `git pull main` before branching,
  `git diff --cached --name-only` before every commit, explicit paths (never `git add -A`).
- **Deterministic guards remain, and they are committed** (`.claude/hooks/guard-bash.sh`,
  tracked, wired in `.claude/settings.json`). They still block force-push, in-repo
  worktrees, `git stash`, `supabase config push`/`db reset`, and destructive SQL —
  **allow-rules do not suspend hooks**, which is what makes fast work safe. Verified live:
  force-push and in-repo `worktree add` still BLOCK; normal push, external worktree, and
  `gh pr create` are allowed.
- **The workflow commands are now in the *committed* allow-list** (PR #1518), so every
  session — including a fresh clone — can branch→PR without a private file.
- **Branch protection is documented truthfully** (PR #1521), verified against the live API,
  so the next drift is a visible diff instead of a silent lie.
- **Deploys are verified by the alias, independently.** The promote is confirmed by
  `vercel inspect helmsportslabs.com` moving to the new build — never by the CLI's output,
  and never by the person who ran it.

---

## 6. Honest notes — mistakes made *during* this cleanup

Recorded because a post-mortem that hides its own errors teaches nothing:

- **A verification watcher gave a false "alias never moved."** A background poll compared
  a failed `vercel inspect` (empty output) against the current URL and read "empty ≠ URL"
  as "the alias changed," then later as "never moved." Both readings were wrong — the probe
  simply couldn't run. A check that treats *no answer* as a *result* is worse than no check;
  it was rebuilt to require a well-formed URL before comparing. The real verification was a
  manual `inspect` that confirmed the promote landed.
- **I deleted 3 tracked files while clearing scratch.** `src/.helmdev/memory/*.json` is
  *un-ignored* by a `.gitignore` negation (`!**/.helmdev/memory/`), so those three were
  tracked, not scratch. Caught on the next `git status` and restored immediately; tree
  clean. That negation — tracked files inside an otherwise-ignored dir — is itself a
  landmine worth removing.
- **Two of my "removal" commands were blocked by the guards and the sandbox**, correctly —
  a recursive `rm` mixed with `cd`, and writes outside the project. Both were the safety
  layer doing its job; I adjusted rather than routed around them.

---

## 7. Still open (owner decisions, not blockers)

- **PR #1518** (git/PR allow-list) and **PR #1521** (branch-protection doc) are armed with
  auto-merge, waiting on the shared CI ratchet to clear. Once both land, `main` fully
  reflects reality.
- **Deploys need a clean tree** but the single shared checkout is rarely clean with several
  sessions active. Resolving "one folder" vs. "a promote needs a pristine tree" is a real
  tension owned by whoever runs deploys.
- **CI runs the full 52-check suite on trivial changes** (a 12-line config edit ran the
  whole unit-test matrix + Next build). Path-filtering the heavy jobs for docs/config-only
  PRs would cut the "20 minutes to merge one line" tax — deferred, not urgent.
- **Leftover branch refs** (`preserve/*`, a few `feat/`/`overnight/` names) are harmless
  (refs don't create folders or poison search) and were left for the owner to prune.

---

*Companion cleanup evidence is in this session's transcript; every number above was read
from git, the GitHub API, the Vercel API, or the file tree at the time of writing.*
