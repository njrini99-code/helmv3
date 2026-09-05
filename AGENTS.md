<!-- markdownlint-disable MD003 MD007 MD012 MD013 MD022 MD028 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# AGENTS.md
## Repo map
`docs/REPO_MAP.md` is the structural map: resolved route atlas per product,
canonical idioms (action wrappers, toast, data access, design tokens, nav
registries, error boundaries) each with a file:line anchor, known traps,
and a before-you-write-code checklist. Read it before adding a route, an
action wrapper/toast/data-access call, or a design-token consumer.

## Feature awareness
- `memory/registry.yml` is the feature routing table. Map impacted files
  through it before changing or reviewing mapped feature code, and read
  the mapped `memory/features/*.md` doc first. `npm run knowledge:map --
  --files <paths...>` finds impacted features; `npm run knowledge:context
  -- --files <paths...> --task "<task>"` builds a context pack for larger
  changes or PR reviews.
- If a feature is missing from the registry, say so and add the mapping or
  mark the gap explicitly. Don't silently change business behavior without
  updating the relevant `memory/features/*` doc, or explaining why not.

## GolfHelm Engineering OS
GolfHelm and GolfHelm-facing CoachHelm work operates through
`memory/system/golfhelm-engineering-os.md`. `memory/registry.yml` is the
router; `memory/features/*` is the canonical corpus; generated/live/code
truth outranks prose. Daily reliability work never deploys, promotes, rolls
back, or mutates production. No AI reviewers run on PRs — Review Gate +
CodeQL cover the same hard rules deterministically; `.claude/rules/
code-review-tooling.md` is the authority on what actually runs.

## Mobile UI rules
Canonical sources, in authority order: `src/styles/design-tokens.css`
(`--fw-*` tokens) → `src/components/fairway/**` (shipped components) →
`.claude/rules/design-system.md`. Tokens beat prose. `modern-saas-ui` is
craft guidance only — it does not encode this repo's tokens; take classes
from the tokens and Fairway components. For layout/overlay/z-index defects
use `ui-stability-debugger-v2`.

- Every mobile screen uses the shared app shell (safe-area, page padding,
  section spacing, bottom-nav clearance). Headers are Standard (nav, title,
  at most one trailing action) or Action (nav, title, one primary CTA) —
  never stack multiple utility rows. Bottom nav: primary destinations only;
  side drawer: secondary/team/admin/account — don't duplicate across both.
- Reuse shared button/chip/tab/card/metric/empty-state components; no
  one-off spacing, radius, icon sizes, or control heights. Empty states:
  icon, short title, one sentence, one CTA. One clear primary action per
  screen; push the rest to overflow or a bottom sheet.

## Cursor Cloud
Services are not running after a fresh VM boot — only disk state persists.
Point `.env.local` at the `supabase start` API URL
(`http://127.0.0.1:54321`, or a remote `https://*.supabase.co` project) —
the CSP admits loopback Supabase origins directly; the Caddy TLS proxy is
legacy. Start with `sudo dockerd &` → `npx supabase start` (migrations +
seed; API 54321, DB 54322, Studio 54323, Mailpit 54324) → set
`NEXT_PUBLIC_SUPABASE_URL` + the printed anon key → `npm run dev`. `SIGNUP_ACCESS_CODE` must be set or shared-code signup is disabled; local
email confirmation is off so signup logs you in immediately, and the seed
does not create `auth.users` rows — sign up through the app. `npm run
lint`/`test` need no backend; `test:rls`/`test:integration` need it running.

## Helm agent canonicality
Canonical working repo: `/Users/ricknini/Downloads/helmv3`. **Agent teams
work through one door**: `scripts/new-worktree.sh` — never a raw
`git worktree add`/`remove`, `git checkout -b`, or `git switch -c`. The
door supplies `--no-track`, the mutation-budget check, and the
`.helm/workspace.json` stamp the lifecycle tool and `WorktreeCreate` rely on.

- **Resting state**: `main` is home. Task branches are temporary. Retire a
  branch/worktree once merged and verified; never assume `main` is what's
  checked out — confirm with `git rev-parse --abbrev-ref HEAD`.
- **Concurrency**: one active session may work in canonical directly.
  Additional concurrent sessions each take their own worktree via
  `scripts/new-worktree.sh <task>` (`~/worktrees/helmv3/<task>`,
  `agent/<task>` branch, `--no-track`, OUTSIDE the repo). It does not
  install dependencies — run `node scripts/ensure-worktree-deps.mjs <dir>`
  when a command needs them. `--no-track` matters: branching from a
  remote-tracking ref without it lets `agent/foo` auto-track
  `origin/main`, so a bare push from it targets main.
- **Lifecycle**: `scripts/worktree-lifecycle.mjs`
  (`npm run worktrees{,:park,:retire}`) is the sole lifecycle authority —
  never hand-roll removal. PARK removes a disposable checkout and keeps
  the branch; RETIRE parks and additionally deletes a branch proven merged
  by exact PR-head OID, preserved first as an `archive/<branch>` tag. It
  reports on remote branches too, and never presents a PR-lookup outage as
  a clean `0`. An OPEN-PR worktree is parkable only if
  `config/open-pr-dispositions.json` records `PARK_IF_REPRODUCIBLE`; a
  worktree is disposable only if its own `.helm/workspace.json` says the
  same (`new-worktree.sh` always writes `KEEP`) — every other verdict
  needs a human. `--remove`/`--retire` carry STANDING OWNER AUTHORIZATION
  only for a tool-verdicted PARKABLE checkout, and for branch deletion
  only under `DELETE_MERGED_EXACT` (PR merged, local tip === PR head OID
  exactly, not protected, not checked out).
  `HELM_MAX_MUTATION_WORKTREES` (default 3) caps concurrent mutation
  workspaces. Retire a branch in the same step that merges its PR:
  `gh pr merge <n> --squash && node scripts/worktree-lifecycle.mjs --retire`.
- **Git hygiene**: `git add <explicit paths>`, never `-A` — the tree is
  shared. Confirm the branch before editing. Check a branch's upstream
  before pushing (`git for-each-ref --format='%(refname:short) -> %(upstream:short)' refs/heads`)
  — an accidental `merge = refs/heads/main` makes a plain push target main.
- **Archives**: `archive/**`/`docs/archive/**` are historical evidence
  only. Use repo-local CLIs (`./node_modules/.bin/{supabase,vercel}`),
  never a global binary.
- **Supabase MCP**: one sanctioned path, `mcp__supabase__*`, declared in
  this repo's `.mcp.json` (production project, `read_only=true`); its
  `apply_migration` is owner-authorized, migrations reviewed before apply.
  The account-wide connector is the connected query path today; its
  migration/branch/project mutators are denied by UUID in
  `permissions.deny` and its read tools are kept. Check
  `docs/TOOL_AUTHORITY_MATRIX.md` / `docs/CONTROL_PLANE_ENFORCEMENT.md`
  rather than assuming.
- Never treat an agent memory store or cache as more authoritative than
  the current repo/database, and never deploy/promote/rollback Vercel
  production unless explicitly asked.
