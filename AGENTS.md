<!-- markdownlint-disable MD003 MD007 MD012 MD013 MD022 MD028 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# AGENTS.md

## Repo map

- `docs/REPO_MAP.md` is the structural map of this repo for agents: the
  resolved route atlas for BaseballHelm/GolfHelm/Lift Lab/Admin (route
  groups resolved, per-role rails), the canonical idioms table (action
  wrappers, toast, data access, design tokens per product, nav
  registries, error-boundary pattern — each with a file:line anchor),
  the known traps list, and a before-you-write-code checklist.
- Read it before adding a new route, a new action wrapper/toast/data-access
  call, or a new design-token consumer — it exists so you don't have to
  re-derive these conventions by grepping from scratch.
- It maps *shape and convention*, not feature behavior — for feature
  behavior, use the Feature awareness routing below.

## Feature awareness

- Treat `memory/registry.yml` as the feature routing table for AI work.
- Before changing or reviewing mapped feature code, identify impacted files, map them through `memory/registry.yml`, and read the mapped `memory/features/*.md` current-state docs first.
- Use `npm run knowledge:map -- --files <paths...>` to find impacted features.
- Use `npm run knowledge:context -- --files <paths...> --task "<task>"` to build `/tmp/helmv3-context-pack.md` for larger changes or PR reviews.
- If a feature is missing from `memory/registry.yml`, say so and either add the mapping or explicitly mark the feature-awareness gap.
- Do not silently change business behavior without updating the relevant `memory/features/*` current-state doc or explaining why no doc update is needed.

## GolfHelm Engineering Operating System

All agents working on GolfHelm or GolfHelm-facing CoachHelm code must operate
through `memory/system/golfhelm-engineering-os.md`.

`memory/registry.yml` is the semantic router.
`memory/features/*` is the canonical current-state feature corpus.
Generated/live/code truth outranks prose.

Production monitoring and production deployment are separate workflows.
A daily reliability run MUST NOT deploy production.

## Mobile UI rules

- **Canonical design sources, in authority order:** `src/styles/design-tokens.css`
  (the `--fw-*` tokens) → `src/components/fairway/**` (the shipped components) →
  `.claude/rules/design-system.md` (the binding invariant). Tokens beat prose,
  always. Read these before styling anything under `src/app/golf/(dashboard)/`.
- The `modern-saas-ui` skill is **craft guidance only** — useful for hierarchy,
  density, motion and empty-state judgement. It does **not** encode this repo's
  tokens: it carries zero references to the canonical sources and ~31 uses of
  the glass / `bg-white` / `gray-*` vocabulary that `design-system.md` declares
  RETIRED. Consult it for *how a screen should feel*; take the actual classes
  from the tokens and the Fairway components.
  (Corrected 2026-08-19: this line previously claimed the skill "encodes the
  Fairway tokens and component idioms this repo has actually shipped." It does
  not, and that claim pointed the constitution at a skill the rules contradict.)
- For technical layout bugs (overlays, jitter, breakpoint failures, z-index) use
  `ui-stability-debugger-v2` instead; it targets defects rather than aesthetics.
  (An earlier version of this line pointed at a `mobile-app-consistency-system`
  skill that does not exist anywhere — not in `.claude/skills/`,
  `~/.claude/skills/`, or any plugin cache — which made every rule below it
  unreachable. Verify a skill resolves before citing it here.)
- All mobile screens must use the shared app shell with consistent safe-area handling, page padding, section spacing, and bottom-nav clearance.
- All mobile headers must use either a Standard header or an Action header pattern.
- Standard header: leading nav control, title, optional subtitle or meta, and at most one visible trailing action.
- Action header: leading nav control, title, and one primary CTA on the right.
- Do not stack multiple utility rows in the header unless there is no viable alternative.
- Bottom nav is reserved for primary everyday destinations only.
- Side drawer is reserved for secondary, team, admin, or account destinations.
- Avoid duplicating major destinations across bottom nav and drawer.
- Reuse shared button, chip, tab, card, metric, and empty-state components whenever possible.
- Do not introduce one-off spacing, radius, icon sizes, or control heights.
- Each screen should expose one clear primary action, a small number of secondary actions, and move lower-priority actions into overflow or a bottom sheet.
- Prefer calmer, denser, more scannable mobile layouts over decorative or oversized sections.
- Reduce top-of-screen chrome so users reach content earlier.
- Empty states should stay compact: icon, short title, one sentence, one CTA.
- Every changed mobile screen should feel visually and behaviorally consistent with the rest of the app.

## Automated review

There are **no AI reviewers on PRs.** The external review bots were dropped
2026-07-20 by founder decision — their quota had become the slowest step in
shipping, and the Review Gate + CodeQL cover the same hard rules
deterministically. Do not wait for a review comment that is never coming, and
do not treat its absence as a check still pending.

What that leaves:

- `.coderabbit.yaml` is a **disable stub** (`auto_review.enabled: false`),
  not live path-instruction config.
- The custom rule packs under `.coderabbit/ast-grep/` and
  `.coderabbit/semgrep/helmv3.yml` **remain and are load-bearing** — CI
  consumes them directly from `review-gate.yml`. Treat that directory name
  as historical; they are CI assets now, not CodeRabbit assets.

`.claude/rules/code-review-tooling.md` is the authority here; keep the two
in step.

CI runs across two platforms:

- **GitHub Actions** (`.github/workflows/ci.yml`, `review-gate.yml`)
  — every-PR fast path (typecheck, lint, vitest, build, RLS tests,
  Review Gate static analyzers).
- **CircleCI** (`.circleci/config.yml`, see `.circleci/README.md`)
  — weekly heavy jobs (Knip, Stryker, sqlfluff, npm audit, Squawk,
  Promptfoo evals, Janitor entropy report) scheduled Mondays 06:00 UTC, plus two native compile
  checks gated by BRANCH NAME: iOS Capacitor compile on M-series macOS
  runners (push to `main`, `release/*`, `ios/*`, `capacitor/*`) and Android
  `assembleDebug` on a Linux Android image (push to `main`, `release/*`,
  `android/*`, `capacitor/*`, `ci/android-*`).

Pre-merge gate blocks (must be `error`-clean before merge):
- Service-role key in a client bundle
- New table without RLS + policy in the same migration
- Server action without `supabase.auth.getUser()` before any DB call
- Bare table names without `golf_` / `baseball_` prefix
- DELETE-then-INSERT in any save/submit/sync write path

Static analyzers that actually run, one job each in `review-gate.yml`:
ast-grep, semgrep, gitleaks, actionlint, yamllint, shellcheck, markdownlint,
ruff + pylint, sqlfluff, hadolint, and an env-secrets check. ESLint runs in
`ci.yml` (`lint`, `lint-ratchet`). Nothing else: this list named Biome, oxc,
swiftlint, languagetool and checkov until 2026-09-01, none of which has a job
anywhere (`.editorconfig` says in its first line that this repo has no Biome).
When a job is added or removed there, change this list in the same PR.

## Cursor Cloud specific instructions

The startup script only runs `npm install`. Everything below is baked into
the VM snapshot (Docker, Supabase CLI, Caddy, a trusted local CA, the
`/etc/hosts` entry, and a gitignored `.env.local`) but the **services are not
running after a fresh boot** — only disk state persists. Start them in order.

### Backend model (important, non-obvious)

The app needs Supabase. **A plain local stack works directly**: when
`NEXT_PUBLIC_SUPABASE_URL` is a loopback origin (`http://127.0.0.1:54321`,
`http://localhost:54321`, `http://[::1]:54321`), `next.config.mjs` appends
that origin and its `ws://` twin to the CSP `connect-src` via
`src/lib/security/local-supabase-csp.mjs`, and a production URL adds nothing.
So point `.env.local` at the `supabase start` API URL and skip the proxy.

The **Caddy TLS reverse proxy** described below is legacy, from when the CSP
allowed only `https://*.supabase.co` and the browser could not reach a plain
loopback stack. It still works — a VM snapshot that already has Caddy, the
trusted local CA and the `/etc/hosts` entry (`https://helmlocaldev.supabase.co`
→ `127.0.0.1`) can keep using them — but it is no longer required, and a
fresh setup should not build it. (This section said the CSP "cannot" admit the
loopback stack until 2026-09-01; the loopback allowance had shipped before
that and the section was not updated.)

Alternative in either case: point `.env.local` at a real remote Supabase
project (`https://*.supabase.co`), which satisfies the CSP natively — then
Docker and Caddy are both unnecessary.

### Start the local stack (fresh VM)

1. Docker daemon (systemd is not running here):
   `sudo dockerd &` — wait until `docker info` succeeds. The daemon is
   configured for `fuse-overlayfs` + iptables-legacy (required in this VM).
2. Local Supabase (from repo root): `npx supabase start` — applies all
   `supabase/migrations/` + `supabase/seed/v3-seed.sql`. Exposes API 54321,
   DB 54322, Studio 54323, Mailpit 54324. Reset with `npx supabase db reset`.
3. Set `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` (and the local anon
   key `supabase status` prints) in `.env.local`, then `npm run dev`
   → http://localhost:3000. The CSP admits the loopback origin on its own.

   **Legacy alternative** (only if the snapshot's `.env.local` still points at
   `https://helmlocaldev.supabase.co`): start the Caddy TLS proxy,
   `caddy run --config /home/ubuntu/dev-proxy/Caddyfile &` (proxies that
   hostname → `127.0.0.1:54321`), then run the dev server with the CA so
   server-side/middleware Supabase calls are trusted:
   `NODE_EXTRA_CA_CERTS=/home/ubuntu/.local/share/caddy/pki/authorities/local/root.crt npm run dev`

### Auth / using the app

- Signup access-code gate has **no committed default** — `SIGNUP_ACCESS_CODE`
  must be set (locally and in Vercel) or shared-code signup is disabled and
  only a coach's team join_code will get someone through the gate.
- Local auth email confirmation is **disabled**, so signup logs you in
  immediately. The seed does NOT create `auth.users` — sign up via the app
  (coach = 3-step onboarding → `/golf/dashboard`; creates `golf_coaches` +
  `golf_teams` rows).

### Chrome + local HTTPS (only if launching Chrome manually)

Chrome must run with `HOME=/home/ubuntu` (so it reads the trusted CA from
`~/.pki/nssdb`) AND a **non-default** `--user-data-dir` (Chrome refuses
`--remote-debugging-port` on the default profile dir). After adding/refreshing
a CA, Chrome must be restarted to pick it up.

### Tests

`npm run lint` (fast) and `npm test` (unit; ~7 min, 818 files) need no backend.
`npm run test:rls` / `npm run test:integration` require the local Supabase
stack running (steps 1–2 above). See `README.md` / `CLAUDE.md` "Commands" for
the full list.

<!-- HELM_AGENT_CANONICALITY_START -->
## Helm agent canonicality

The canonical working repository is `/Users/ricknini/Downloads/helmv3`.

- **Git resting-state policy:** `main` is home — the normal clean resting
  branch. Task branches are temporary active work. Never silently switch away
  from a dirty task branch or from work not yet represented on `main`. Once a
  task is merged and verified, retire its branch/worktree and return the
  canonical checkout to clean `main`. Never assume `main` is what is currently
  checked out.
- **Concurrent sessions: one checkout cannot serialize them.** The
  resting-state policy governs the canonical checkout; it cannot stop two
  live sessions from moving one HEAD under each other. When more than one
  agent session works in this repo at once, each session doing task work
  takes its own worktree via `scripts/new-worktree.sh <task>` — the one
  supported path, which places it at `~/worktrees/helmv3/<task>` OUTSIDE the
  repo — and leaves the canonical checkout alone. **It does not install
  dependencies** — run `node scripts/ensure-worktree-deps.mjs <dir>` when a
  command actually needs them, so a docs or config task never pays for a
  ~3.8 GiB node_modules it will not use. Use it because it guarantees
  `--no-track`: creating a task branch from a REMOTE-TRACKING ref such as
  `origin/main` without disabling tracking lets git's `autoSetupMerge` default
  configure `agent/foo -> origin/main`, and a bare push then targets main.
  Branching from a local ref does not do this. Deploys promote
  from a worktree pinned at the exact merged `main` SHA, never from a
  checkout another session may be mutating.

  **`scripts/worktree-lifecycle.mjs` is the lifecycle authority** (
  `retire-worktrees.sh` forwards to it). It separates two things the old tool
  conflated:

  ```text
  PARK    remove the disposable checkout, KEEP the branch
  RETIRE  park, AND delete a branch proven merged by exact PR head OID
  ```

  **It reports on REMOTE branches as well as local ones, and the distinction
  is the whole point.** Until 2026-08-31 it enumerated `refs/heads` only, so a
  branch whose local copy had been pruned — which is every branch merged with
  `--delete-branch`, plus anything pushed from another machine — was invisible
  to it. Measured that day: three such branches, one a PR MERGED for days,
  while the report said `0 branches to delete` and GitHub's branch list still
  showed it. A cleanup tool that cannot see the residue it exists to remove
  reports success at having looked at the wrong place. Remote deletion carries
  its own verdict (`DELETE_REMOTE`, a `git push origin --delete`) and is never
  rendered as `DELETE_BRANCH`: one is recoverable from the reflog, the other
  is not.

  **A DOMINANT evidence blackout exits 2, and is never a clean report.** When
  at least half of the PR lookups fail, the tool prints
  `INFRASTRUCTURE_FAILURE` and refuses to present the result as a finding; any
  failures at all are counted on their own line, because a row whose lookup
  failed proves nothing about that branch. Same convention as
  `npm run guards`: PASS / POLICY_FAILURE / INFRASTRUCTURE_FAILURE, where the
  third exits non-zero and never presents as the first.

  **This paragraph required unanimity until 2026-09-04, and that is exactly why
  the guard stayed silent for the failure it was written for.** It said "if
  every PR lookup fails". Instrumented at the guard's own line, inside the
  sandbox:

  ```text
  total rows 72   ->   { FAILED: 69, OK: 3 }
  ```

  96% of lookups failed, `failed === all` was false, the guard did not fire,
  the tool exited 0, and the summary read `0 branches deletable` —
  indistinguishable from a genuinely clean repository. The three survivors were
  not health: macOS caches TLS trust decisions, so the first few `gh` calls
  succeed from that cache before it is exhausted. **A partial blackout is the
  NORMAL shape of this failure; a total one is the special case**, and a
  threshold set at the special case is a gate that cannot fire.

  The cause is narrower than "`gh` is broken in the sandbox" — a single `gh`
  call usually SUCCEEDS there, which is what makes this so easy to
  misdiagnose. Verify with a burst, never one call:

  ```bash
  for i in $(seq 1 25); do gh api "repos/{owner}/{repo}/pulls?per_page=1" >/dev/null || echo FAIL; done
  ```

  Sandboxed, that fails 25/25 with
  `tls: failed to verify certificate: x509: OSStatus -26276` — Go's TLS cannot
  reach `com.apple.trustd.agent` to verify a certificate chain. (This read
  "cannot read the macOS keychain" until 2026-09-04; `gh` authenticates fine
  from the keychain, and it is certificate verification that fails.) The fix is
  configuration, not avoidance:

  ```jsonc
  // ~/.claude/settings.json  ->  sandbox.network
  "enableWeakerNetworkIsolation": true   // allows com.apple.trustd.agent
  ```

  It is read at session start, so it takes effect on the NEXT session, not the
  one that sets it. Until then, re-run outside the sandbox.

  Parking is what lets an open PR waiting on a human stop costing ~3.8 GiB.
  Branch deletion is proven by `PR MERGED` + `local tip === PR head OID`, never
  by a remote tip — `delete_branch_on_merge` removes that exactly when the
  branch becomes safe, which is #1654's shipped defect.

  **An OPEN PR's checkout is parked only with its owner's recorded consent.**
  That line above used to end "(no PR needed)", and on 2026-08-30 `--retire`
  removed a concurrent session's worktree (`agent/round-type-reclassify`, PR
  #1681, OPEN) on exactly that basis: clean, tip identical to its pushed remote,
  and no process whose cwd `lsof` could see. Nothing was lost — parking keeps
  the branch — but the checkout had an owner and the tool had no way to know.

  The unsound step is reading silence as absence. `lsof +D` samples one instant,
  and an agent session between two tool calls has no visible cwd:

  ```text
  hasLiveProcess == true    proof of activity          — a sound veto
  hasLiveProcess == false   NOT proof of inactivity    — proves nothing
  ```

  So a worktree whose branch has an OPEN PR is PARKABLE only when
  `config/open-pr-dispositions.json` records that PR with a `worktree_policy`:

  ```text
  PARK_IF_REPRODUCIBLE    may be parked once clean and pushed; the branch stays
  KEEP                    never parked automatically
  ```

  A missing row, an unrecognised policy, or a disposition of `ACTIVE`/`UNKNOWN`
  all yield `KEEP_PR_OWNER_INTENT_REQUIRED` — a verdict deliberately distinct
  from both ACTIVE (nothing proved anyone is using it) and UNKNOWN (the PR read
  fine; what is missing is a decision). #1659 is the case this preserves: an
  open PR waiting on a physical-device test, released explicitly by its owner.

  **A checkout is disposable only if it says so itself.** That rule above is
  keyed on a PR, and a session starts working before one exists — so it left the
  window where the failure actually happens. Since 2026-08-30 the answer comes
  from the workspace's own identity instead:

  ```text
  .helm/workspace.json  ->  { "parkPolicy": "KEEP" }   written at creation
                            "PARK_IF_REPRODUCIBLE"     only if a human sets it
  ```

  `new-worktree.sh` always writes `KEEP`. Releasing a checkout is a positive
  act, and everything else keeps it: no marker, no key, an unknown value, a file
  that will not parse. The gate runs before the reproducibility checks and
  independently of any PR, so both must permit — an OPEN PR its owner released
  still cannot override a workspace `KEEP`. Verdict:
  `KEEP_WORKSPACE_INTENT_REQUIRED`, outside the standing authorization.

  The two remain different questions, and conflating them is what caused this:

  ```text
  workspace identity   may this CHECKOUT go?
  PR state             may this BRANCH be deleted?
  ```

  `WORKTREE_PARK_NO_PR_OWNERSHIP` is closed by this, but **not** the way its
  closing condition asked. That asked for a session id checked for LIVENESS,
  which is the same unsound negative-evidence inference in a new costume: a
  session between two tool calls looks dead. Declared intent needs no probe.

  **Retire the worktree in the SAME step that merges its PR** — not at the end
  of a session, and not by reporting it to the owner. `--remove` carries a
  STANDING OWNER AUTHORIZATION (granted 2026-08-29, narrowed 2026-08-30 by the
  paragraph above) for any worktree the tool itself verdicts PARKABLE/RETIRABLE,
  and for branch deletion ONLY when the classifier returns
  `DELETE_MERGED_EXACT`:

  ```text
  PR state           === MERGED
  local tip          === PR head OID      (exact, never ancestry)
  protected          === false
  checked out        === false
  ```

  Every other verdict requires a human, and the exclusion list is explicit:
  `UNKNOWN_PR`, `KEEP_OPEN`, `KEEP_DIVERGED_AFTER_PR`, `KEEP_PROTECTED`,
  `KEEP_WORKTREE_ACTIVE`, `KEEP_DIRTY`, `NO_UPSTREAM_UNIQUE_WORK`,
  `UNKNOWN_REMOTE`, `UNKNOWN_IDENTITY`, `KEEP_PR_OWNER_INTENT_REQUIRED`.
  `NO_UPSTREAM_UNIQUE_WORK` is the
  sharpest of those: measured 2026-08-29, ten branches hold up to 19 commits
  that exist nowhere else. A branch count is not a health metric; unexplained
  branches are.

  The authorization is also stated in the tool's own output, so a reader never
  has to remember this paragraph.

  **One mutation workspace at a time.** `HELM_MAX_MUTATION_WORKTREES` defaults
  to 1 and `new-worktree.sh` refuses BEFORE `git worktree add` and before any
  dependency install. Classification fails TOWARD mutation: an unreadable or
  undeclared workspace counts against the budget.

  For the worktree half:

  ```bash
  gh pr merge <n> --squash && node scripts/worktree-lifecycle.mjs --retire
  ```

  That grant exists because the old rule caused the failure it was meant to
  prevent. Retirement shipped in #1654 as report-only with owner approval
  required, and nothing ever invoked it. On 2026-08-29 one session created six
  worktrees, ran the tool six times, printed "retirable" six times, and asked
  instead of acting — until the volume hit **zero bytes free**, at which point
  no command could run at all, because even writing a command's output needs
  disk. The approval step was the seventh check on top of six the tool had
  already passed, and it was the one that never fired in time.
  The seven that DO fire — canonical checkout, uncommitted changes, live process
  cwd, no PR, PR not MERGED, tip past its remote, and since 2026-08-30 an OPEN
  PR without recorded owner consent — are what the grant relies on.
  Anything the tool declines still needs a human. (Added 2026-08-26 after three concurrent
  sessions — iOS, bridge, hotfix — contended over one HEAD; the hotfix
  session's worktree dodge is now the rule.)
- A single active session may work in the canonical checkout directly; do
  not create a worktree without a reason (concurrency above, or an explicit
  user request), and remove any temporary worktree when its task completes.
- `archive/**` and `docs/archive/**` are historical evidence only. Never use them as the source of truth for current architecture, schema, routes, configuration, features, or implementation.
- Current source code, current migrations, current tests, `AGENTS.md`, `CLAUDE.md`, and active non-archive documentation outrank archived material.
- Use repo-local platform CLIs: `./node_modules/.bin/supabase` and `./node_modules/.bin/vercel`. Do not assume global Supabase or Vercel binaries.
- **One sanctioned Supabase MCP path: `mcp__supabase__*`**, declared in this
  repo's `.mcp.json`, project-scoped to the single production project and
  carrying `read_only=true`. Schema changes belong in the local development
  stack and reviewed migrations.
  - `mcp__supabase__apply_migration` is **owner-authorized** — stated three
    times in `~/.claude/settings.json` autoMode, "owner's own infrastructure;
    migrations are reviewed before apply". That authorization is deliberate.
    Note it targets exactly the combination `shipping.md` records as
    UNVERIFIED (`apply_migration` under `read_only=true`); do not resolve that
    by trying it against production.
  - **Other Supabase MCP namespaces are NOT sanctioned.** An account-level
    connector (`mcp__claude_ai_Supabase__*`) reaches the whole account, not one
    project — `list_organizations` succeeds through it. Its project-mutating
    tools are denied in `.claude/settings.json`; its read tools are kept,
    because measured 2026-08-29 it is the ONLY Supabase MCP that is actually
    connected, and removing a working read path to satisfy a sentence is the
    #1671 mistake.
  - This line previously read "Production Supabase MCP access must remain
    project-scoped and read-only", full stop. That was in force at the same
    time as the owner's migration authorization, and the two contradicted.
    A rule that contradicts a live grant does not get enforced — it gets
    ignored, and six unreviewed MCP grants sat unnoticed underneath it.
- Never treat an agent memory store, code index, or cache as more authoritative than the current repository and current database evidence.
- Never deploy/promote/rollback Vercel production unless the user explicitly requests that production action.
<!-- HELM_AGENT_CANONICALITY_END -->
