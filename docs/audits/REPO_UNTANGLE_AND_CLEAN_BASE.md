# REPO UNTANGLE & CLEAN BASE PLAN

**Date:** 2026-07-01
**Repo:** helmv3 (Helm Sports Labs monorepo — active push: BaseballHelm)
**Verified live at time of writing:** branch `batch/baseball-fixes` checked out in the main worktree; 222 local branches (220 excl. `main` + `batch/baseball-fixes`); 37 worktrees; 57 open PRs; 49 open issues; main tip `53697b35` CI workflow = **failure**; PR #650 = MERGEABLE but mergeStateStatus **BLOCKED**.

> **RULE OF THIS DOCUMENT:** every step that deletes, closes, or merges anything is **OWNER-GATED** — marked `[OWNER-GATED]`. Nothing destructive runs without an explicit green light. Anything that *could* hold unshipped work goes to the REVIEW list, never an auto-delete list.

---

## 1. STATE-OF-THE-REPO VERDICT (honest)

**The repo is very tangled, but the tangle is almost entirely *debris*, not *ambiguity* — and it is fully recoverable.**

How it got here: months of agent-fleet workflows (Group C, the `fix/baseball-*-auto` fleet, Lane B Fairway, QA sweeps) each spawned a worktree + branch per fix. Nearly all of that work **shipped via squash-merge**, which rewrites history — so ~85 local branches look "unmerged" to git even though their content is live on `main` under a specific merged PR number. Nobody pruned after merging, and auto-generated `worktree-wf_*` placeholder branches piled up alongside. Meanwhile the PR surface accumulated three layers: 22 open PRs whose content was *re-batched* into #650, 21 uniformly-red dependabot PRs (a systemic base-staleness signature, not real per-dependency failures), and ~10 genuinely ambiguous older PRs.

The one genuinely dangerous zone: **8 loose `fix/qa-*` branches carrying 46 unpushed commits each with zero PR coverage** (last commits ~3h old), plus ~12 other unmerged no-PR branches. Those are quarantined to REVIEW below.

The check topology itself is **well designed and documented** (docs/CI_RUNBOOK.md matches live branch protection exactly). The red checks trace to exactly four concrete, fixable defects — three inherited from main's own red tip, plus two PR-specific defects on #650 — not CI flake or config drift.

**Bottom line:** one integration lane already exists and is healthy in shape (`batch/baseball-fixes` → #650 → `main`). Reaching a clean base is a mechanical sequence: fix 4 defects → merge #650 → close 43 superseded/stale PRs → prune ~127 confirmed-dead branches + 16 dead worktrees → triage a ~25-item REVIEW pile. Estimated end state: ~13 worktrees, ~55 branches, ~4–7 open PRs, green main.

---

## 2. ISSUE ↔ PR ↔ BRANCH ↔ WORKTREE ↔ CHECK RELATIONSHIP MAP

### 2.1 The integration lane (the only lane that matters)

```
issues (24) ──> Group-C PRs #550–#571 (13) ──┐
issues (9+) ──> auto-fleet PRs #641–#649 (9) ─┼──> batch/baseball-fixes ──> PR #650 ──> main ──> Vercel prod
                                              │        (main checkout,
                     9 new adversarial fixes ─┘         /Users/ricknini/Downloads/helmv3)
```

**PR #650** ("22 fixes — single-deploy batch") folds in, verbatim:

| Superseded PR | Branch | Worktree | Fixes issue(s) |
|---|---|---|---|
| #550 | fix/baseball-427-pipeline-stages | — | #426, #427, #428 |
| #552 | fix/baseball-425-recruit-public-profile | — | #425 |
| #553 | fix/baseball-432-message-nav | — | #432 |
| #554 | fix/baseball-462-juco-profile-editor | — | #462 |
| #557 | fix/baseball-429-discover-revert | — | #429 |
| #559 | fix/baseball-505-staff-invite-capability | — | #505 |
| #560 | fix/baseball-470-privacy-field-mapping | — | #470 |
| #566 | fix/baseball-459-activate-exposure | — | #459 |
| #567 | fix/baseball-490-lineup-swap | — | #489, #490 |
| #568 | fix/baseball-500-scout-packet-viewcount | — | #500 |
| #569 | fix/baseball-477-postgame-disposition | — | #477 |
| #570 | fix/baseball-467-dead-demo-link | — | #467 |
| #571 | fix/baseball-511-coach-note-scope | .claude/worktrees/groupC | #511 |
| #641 | fix/baseball-444-auto | wf_c33ce7f9-858-3 | #444 |
| #642 | fix/baseball-478-auto | wf_c33ce7f9-858-6 | #478 |
| #643 | fix/baseball-498-auto | wf_c33ce7f9-858-8 | #498 |
| #644 | fix/baseball-474-auto | wf_c33ce7f9-858-5 | #474 |
| #645 | fix/baseball-491-auto | wf_c33ce7f9-858-7 | #491 |
| #646 | fix/baseball-436-auto | wf_c33ce7f9-858-2 | #436 (incl. migration 20260701020000) |
| #647 | fix/baseball-509-auto | wf_c33ce7f9-858-10 | #509 |
| #648 | fix/baseball-445-auto | wf_c33ce7f9-858-4 | #445 |
| #649 | fix/baseball-434-auto | wf_c33ce7f9-858-1 | #434 |

**When #650 merges, ~24 issues close** (425–428, 429, 432, 434, 436, 444, 445, 459, 462, 467, 470, 477, 478, 489, 490, 491, 498, 500, 505, 509, 511) and all 22 PRs above become pure clutter → CLOSE with supersession comment. **Nothing here is double-tracked once the closes cite #650.**

### 2.2 Remaining open issues (49 total) mapped to workstreams

| Issue cluster | Issues | Maps to | Status |
|---|---|---|---|
| Closed-by-#650 | the 24 listed above | PR #650 | Close on merge |
| **Prod DB integrity (P0)** | #651 (schema drift, 12 missing columns), #652 (announcements RLS infinite recursion 42P17) | New workstream — #651 partially addressed by #650's migration; verify post-merge | OPEN, top priority after #650 |
| Mobile chrome/UX QA | #479, #480, #481, #482, #483, #484, #485 | Almost certainly the **8 `fix/qa-*` branches** (shell-chrome-dup↔#479/#483, nav-deadends↔#480, player-today↔#484, calendar↔#485, misc-visual/capability-redirects/stats-charts/practice-coachname↔rest) | Needs PRs opened — see REVIEW §3.4 |
| RLS follow-ups | #519, #520 (follow-ups to merged #517) | Backlog workstream | Open, mapped |
| Module toggles | #503 (deferred per Group-C notes: needs locked stats.ts/teams.ts), #504 | Backlog workstream | Open, mapped |
| Discover follow-ups | #430, #431 (deferred until after #394) | Backlog workstream | Open, mapped |
| Capability-guard migration | #394 | Backlog workstream; REVIEW branch fix/baseball-394-stats-guard already shipped via squash | Open, mapped |
| Test-hardening cluster | #372, #373, #377, #379, #382 | Stacked PR chain #356→#357→#358→#366 + REVIEW branch fix/baseball-373-route-crawler-authed | Blocked on #356 conflict — owner triage |
| Leaked credentials | #516 (service_role key — **owner previously DECLINED rotation, accepted risk; do not re-raise**), #391 | Owner-accepted risk / backlog | Open, mapped |
| Golf partner | #632 (GolfHelm Calendar) | Golf workstream (off baseball critical path) | Open, mapped |

**No orphaned issues found** — every open issue maps to either #650, a REVIEW branch, a stacked chain, or a named backlog workstream.

### 2.3 Branch & worktree census (220 branches / 37 worktrees)

| Bucket | Count | Disposition |
|---|---|---|
| Branches backing an OPEN PR (incl. batch/baseball-fixes + auto fleet + #550–#572, #585, #356–#366 chain) | 28 | **KEEP** — untouchable |
| Merged-ancestry branches (`git branch --merged origin/main`), incl. ~39 zero-ahead `worktree-wf_*` placeholders | 42 | PRUNE (`-d`, self-verifying) |
| Squash-orphan branches (headRef matches a MERGED PR; content shipped) | 85 | PRUNE (`-D`, each labeled with its PR#) |
| No-PR, unmerged branches | 65 | **REVIEW** (8 fix/qa-* + ~12 genuine uniques + ~13 one-commit wf placeholders + misc) |
| Worktrees backing open PRs + main checkout | 13 | KEEP |
| Dead worktrees (merged branch / detached-at-main / scratchpad / redundant main checkout) | 16 | PRUNE |
| fix/qa-* worktrees (wf_79d8c04f-ee4-1..8) | 8 | REVIEW — do not touch until PRs opened |

### 2.4 Check topology (what actually gates a merge)

Required contexts on `main` (verified = docs/CI_RUNBOOK.md, no drift): **CodeRabbit, CodeQL, `all` (ci.yml), `all` (review-gate.yml), Smoke checks** + 1 approving review + conversation resolution + linear history. Advisory-by-design (never chase as blockers): full Playwright E2E, Course-picker screenshots, BaseballHelm seeded smoke (advisory), CircleCI lighthouse-preview (red only because Vercel previews are paused via Ignored Build Step), CircleCI ios-compile, Greptile.

**The four real defects making things red:**

1. **main is red** (`53697b35`, CI run = failure — verified): (a) Unit tests + Business contracts fail on `revalidatePath` static-generation-store invariant in `src/app/golf/actions/__tests__/round-recap.test.ts`; (b) Supabase lint + RLS tests fail 10/16 pgTAP subtests — missing SELECT policy on `baseball_event_acknowledgements`. Every open PR inherits these.
2. **#650: CSS self-closing comment** — `src/app/globals.css` lines 2–4: the comment text `--pursuit-*/` contains a literal `*/` that terminates the comment early → postcss syntax error at 3:42 → Next build + Smoke checks fail.
3. **#650: 22 semgrep `helmv3-server-action-missing-auth-check` findings** (server actions calling Supabase before `supabase.auth.getUser()`, starting with `src/app/baseball/actions/insights.ts`) → Review Gate `all` fails.
4. **Stale CodeRabbit statuses** from today's ~16:45–16:58 UTC prepaid-credit outage (account now topped up — #650's 20:56 UTC review succeeded) — at least #641 and #649 sit on stale failures; needs re-request/retrigger, not code changes.

---

## 3. THE ORDERED CLEANUP SEQUENCE

Run phases strictly in order. `[OWNER-GATED]` = requires explicit approval before running.

### PHASE 0 — Make the gates honest (no destructive ops)

0.1. **Fix main** with one small direct PR (≤15 files): fix/guard the `revalidatePath` invariant in golf round-recap (action guard or mocked static-generation store in the test) + add the missing SELECT RLS policy on `baseball_event_acknowledgements` (16/16 pgTAP).
   Verify: `gh run list --branch main --workflow=ci.yml --limit 1 --json conclusion` → `success`.

0.2. **Fix #650's CSS bug** on `batch/baseball-fixes`: rewrite the `globals.css` comment so `pursuit-*/` can't terminate it (e.g. `pursuit-* /`). Confirm locally: `npm run build`.

0.3. **Fix #650's 22 auth-check findings**: add `const { data: { user } } = await supabase.auth.getUser()` + early throw on `!user` before the first `.from()/.rpc()` in each flagged server action (start `src/app/baseball/actions/insights.ts`). True false-positives get a reviewed inline `// nosemgrep` — never disable the rule.

0.4. **Clear stale CodeRabbit statuses** on the #641–#649 fleet (empty retrigger commit or dashboard re-request per docs/operations/coderabbit-review-workflow.md) — only matters for any fleet PR you intend to keep open past #650; skip if closing them all in Phase 2.

0.5. **Rebase/merge fixed main into `batch/baseball-fixes`**, re-check: `gh pr checks 650` → all 5 required contexts green, mergeStateStatus leaves BLOCKED.

### PHASE 1 — Land what should ship (`[OWNER-GATED]` — merges)

1.1. Pre-merge gates (owner/Nick actions, per #650's own PR body "Do not merge until instructed"):
   - Flip Vercel **Ignored Build Step** back to production-builds-on.
   - Confirm migration `supabase/migrations/20260701020000_baseball_player_aggregates_slash_line.sql` lands with/before the merge (else #436 upserts error) — and per standing schema-drift rule, **verify applied via `information_schema`, not the migration history table**.
1.2. `[OWNER-GATED]` **Merge the deploy vehicle:**
   ```
   gh pr merge 650 --squash
   ```
   (Do NOT `--delete-branch` — branch/worktree cleanup happens in Phase 3 under its own gate.)
1.3. Post-merge verify: prod deploy healthy; issues #651 (12 missing columns) and #652 (RLS recursion) re-checked against prod — these are the immediate next workstream.
1.4. `[OWNER-GATED]` Merge the 3 independent green PRs on their own schedule (not blocked by, nor superseding, anything):
   ```
   gh pr merge 620 --squash   # docs inventory regen
   gh pr merge 585 --squash   # Mission Control context pack
   gh pr merge 514 --squash   # coderabbit enrichment chore (known-flaky Playwright is advisory)
   ```

### PHASE 2 — Close superseded / stale PRs (`[OWNER-GATED]` — closes; only AFTER #650 is merged)

2.1. `[OWNER-GATED]` Close the 22 PRs folded into #650 (13 Group-C + 9 auto-fleet):
   ```
   for n in 550 552 553 554 557 559 560 566 567 568 569 570 571 641 642 643 644 645 646 647 648 649; do
     gh pr close "$n" --comment "Superseded — content shipped via #650 (batch/baseball-fixes)."
   done
   ```
2.2. `[OWNER-GATED]` Close the 21 stale/red dependabot PRs (identical systemic failure fingerprint regardless of bump size — even the trivial postcss patch #607 fails the same way; #529 tailwind-v4 additionally hard-breaks the Next build; #204 is also CONFLICTING). Dependabot regenerates against clean main:
   ```
   for n in 204 230 231 235 236 348 522 524 525 526 527 528 529 531 532 535 537 538 539 540 607; do
     gh pr close "$n" --comment "Stale/red across systemic checks (base staleness, not per-dependency risk). Dependabot will regenerate against clean post-#650 main."
   done
   ```
2.3. Do **NOT** close (these go to REVIEW, §3.4-PRs): #243, #262, #333, #334, #356, #357, #358, #366, #515, #572.

### PHASE 3 — Prune dead worktrees + branches (`[OWNER-GATED]` — deletes; only AFTER Phase 2)

3.1. `[OWNER-GATED]` Remove the 16 dead worktrees (each individually confirmed: branch squash-merged under the cited PR, or detached at origin/main with 0 unique commits, or redundant main checkout):
   ```
   git worktree remove --force /private/tmp/claude-501/-Users-ricknini/9f04a131-1791-4984-95fc-97d80f029a61/scratchpad/test356
   git worktree remove --force /private/tmp/claude-501/-Users-ricknini/9f04a131-1791-4984-95fc-97d80f029a61/scratchpad/wt-a3c        # PR#640 merged
   git worktree remove --force /private/tmp/claude-501/-Users-ricknini/9f04a131-1791-4984-95fc-97d80f029a61/scratchpad/wt-main
   git worktree remove --force /private/tmp/claude-501/-Users-ricknini/9f04a131-1791-4984-95fc-97d80f029a61/scratchpad/wt436         # dup of PR#646 content
   git worktree remove --force /private/tmp/helmv3-pr420-fix                                                                          # PR#420 merged
   git worktree remove --force /Users/ricknini/Downloads/helmv3-mc-wt                                                                 # PR#581 merged
   git worktree remove --force /Users/ricknini/Downloads/helmv3-nn1nn2-wt                                                             # PR#561 merged
   git worktree remove --force /Users/ricknini/Downloads/helmv3-oauth-wt                                                              # PR#621 merged
   git worktree remove --force /Users/ricknini/Downloads/helmv3/.claude/worktrees/laneB-fairway                                       # detached, PR#637 in main
   git worktree remove --force /Users/ricknini/Downloads/helmv3/.claude/worktrees/wf_b70f2371-f12-1                                   # PR#615 merged
   git worktree remove --force /Users/ricknini/Downloads/helmv3/.claude/worktrees/wf_b70f2371-f12-2                                   # PR#616 merged
   git worktree remove --force /Users/ricknini/Downloads/helmv3/.claude/worktrees/wf_b70f2371-f12-3                                   # PR#617 merged
   git worktree remove --force /Users/ricknini/Downloads/helmv3/.claude/worktrees/wf_b70f2371-f12-4                                   # PR#618 merged
   git worktree remove --force /Users/ricknini/Downloads/helmv3/.claude/worktrees/wf_b70f2371-f12-5                                   # PR#619 merged
   git worktree remove --force /Users/ricknini/Downloads/helmv3/.claude/worktrees/wf_c33ce7f9-858-9                                   # fix/baseball-504-auto, ahead=0
   git worktree remove --force /Users/ricknini/Downloads/helmv3/.claude/worktrees/wf_c6eda388-9af-1                                   # redundant main checkout
   git worktree prune
   ```
   Note: once Phase 2 closes PRs #641–#649 and #571, their 9 fleet worktrees (wf_c33ce7f9-858-1..8,10) and the groupC worktree ALSO become prunable — add them to this list **only after** the owner confirms the Phase-2 closes and the groupC divergence review (§3.4 item R1) is resolved.

3.2. `[OWNER-GATED]` Delete the 42 merged-ancestry branches (self-verifying — `git branch -d` refuses anything not truly merged):
   ```
   git branch --merged origin/main | grep -vE '^\*|^\+|  main$|  batch/baseball-fixes$' | xargs -n1 git branch -d
   ```
3.3. `[OWNER-GATED]` Delete the 85 squash-orphan branches (content shipped under the cited merged PR; `-D` required because squash rewrites history):
   ```
   for b in fix/baseball-coaches-rls-narrow fix/baseball-fairway-documents fix/baseball-fairway-messages fix/baseball-messaging-coaches-public fix/baseball-fairway-announcements fix/baseball-fairway-tasks fix/baseball-fairway-calendar chore/lint-baseline-relock fix/baseball-fairway-roster fix/baseball-fairway-command-center fix/baseball-ai-audit-governance fix/baseball-coaches-public-view fix/baseball-signals-writepath fix/baseball-tasks-created-at fix/baseball-join-code-residual docs/item2-two-session-plan fix/baseball-scope-player-ids-live-schema ci/claude-action-subscription-auth fix/baseball-roles-permissions-team-type fix/baseball-coach-notes-columns fix/baseball-travel-addexpense-idor fix/baseball-watchlist-integrity fix/baseball-discover-pagination fix/baseball-netnew-boxscore-rpc-season fix/baseball-netnew-import-run-id fix/baseball-netnew-calendar-tz fix/baseball-netnew-coach-rls-security fix/baseball-netnew-scout-packet-video fix/baseball-netnew-command-center-cols fix/baseball-435-game-log-season fix/baseball-463-teamless-timeline-passport fix/baseball-438-count-ties fix/baseball-499-compare-column-order fix/baseball-439-season-year-selector fix/baseball-433-box-score-preload fix/baseball-465-reset-redirect-msgkey fix/baseball-460-player-today-practice-cta fix/baseball-454-notification-prefs fix/baseball-506-staff-docs-matrix fix/baseball-508-academics-access fix/baseball-449-announcements fix/baseball-487-video-uploads fix/baseball-458-calendar-team-tz fix/baseball-441-showcase-invite-link fix/baseball-448-dev-plan-goals fairway/baseball-shell-phase-a fix/baseball-468-coach-onboarding fix/baseball-461-daily-contract-revert fix/baseball-457-practice-events fix/baseball-507-player-today-notes fix/baseball-512-coach-profile-timeline-ack fix/baseball-476-practice-effectiveness-disposition fix/baseball-497-decision-room-disposition-filter fix/baseball-475-practice-intel-visibility mission-control-phase-1 fix/baseball-decision-room-readmodels fix/baseball-394-stats-guard docs/baseballhelm-v1-spec fix/baseball-450-messages-integrity fix/baseball-453-documents-upload fix/baseball-472-insight-lifecycle fix/baseball-464-player-onboarding-upsert fix/baseball-486-lift-publish fix/baseball-442-camps-correctness chore/greptile-exclude-bots chore/greptile-conserve-credits fix/baseball-lineups-rls-capability fix/baseball-boxscore-rls-capability chore/greptile-ultra-aware fix/baseball-446-travel-classification fix/baseball-501-capability-caps fix/baseball-502-join-policy fix/baseball-513-academics-guard fix/baseball-440-join-code docs/greptile-business-context fix/baseball-510-ai-visible-approve docs/reconcile-gate-tables fix/baseball-405-staff-status-rls fix/ci-secretless-build-env chore/workflow-hardening chore/repo-governance-scaffolding fix/baseball-rls-phase1-dedup fix/coderabbit-planned-issues chore/unify-pr-checks-and-coderabbit chore/coderabbit-issue-enrichment-main; do git branch -D "$b"; done
   ```
   After Phase 2 closes, the 22 branches behind the closed PRs (fix/baseball-427-pipeline-stages, …-425-recruit-public-profile, …-432-message-nav, …-462-juco-profile-editor, …-429-discover-revert, …-505-staff-invite-capability, …-470-privacy-field-mapping, …-459-activate-exposure, …-490-lineup-swap, …-500-scout-packet-viewcount, …-477-postgame-disposition, …-467-dead-demo-link, …-511-coach-note-scope, fix/baseball-{444,478,498,474,491,436,509,445,434}-auto) join this bucket too — `[OWNER-GATED]`, delete only after confirming #650 truly contains each.
3.4. Verify: `git worktree list | wc -l` (~13) and `git branch | wc -l` (~55).

### PHASE 4 — REVIEW list (NEVER auto-deleted; owner triages one by one)

**Branches (unshipped-work risk):**

| # | Item | State | Recommended action |
|---|---|---|---|
| R1 | `worktree-groupC` | ahead=31, no PR, **diverges** from fix/baseball-511-coach-note-scope (#571) | `git diff worktree-groupC fix/baseball-511-coach-note-scope` → keep-and-PR or abandon |
| R2 | `pr-420` | ahead=12, no PR, diverges from merged #420 branch | diff vs merged tip → keep-and-PR or abandon |
| R3–R10 | **8× `fix/qa-*`** (calendar, capability-redirects, misc-visual, nav-deadends, player-today, practice-coachname, shell-chrome-dup, stats-charts) | ahead=46 each, no PR, live worktrees wf_79d8c04f-ee4-1..8, commits ~3h old | **Open PRs first** (after main green): `gh pr create --draft --base main --head fix/qa-<name>`; likely fix issues #479–#485. Do not touch worktrees until PR'd |
| R11 | `cursor/baseballhelm-bug-audit-issues-8ec5` | ahead=20 | inspect; may duplicate the issue ledger |
| R12 | `chore/disable-vercel-auto-deploy` | ahead=4 | infra-affecting; owner decides (relates to Vercel auto-deploy-still-ON note) |
| R13 | `chore/coderabbit-pro-plus-supercharge` | ahead=2 | inspect |
| R14 | `fix/baseball-442-camps-correctness-v2` | ahead=3 (v2 of shipped #564) | diff vs main; PR or drop |
| R15 | `fix/baseball-444-events` | ahead=2 | diff vs #641/#650 content (same issue #444) |
| R16 | `fix/baseball-373-route-crawler-authed` | ahead=1 | maps to issue #373 (test-hardening cluster) |
| R17 | `fix/baseball-427-pipeline-drag` | ahead=1 | diff vs #550/#650 content (issue #427) |
| R18–R20 | `fix/baseball-netnew-signal-unack`, `-stat-visual-idempotent`, `-team-season-settings-errors` | ahead=1–2 | inspect; PR or drop |
| R21 | ~13 one-commit-ahead `worktree-wf_*` placeholders (17eb4ebe, 197c71e9, 1cbcde8b, 3f9e25a7, 6e7a3661, a0c024e1 families) | ahead=1, no PR, almost certainly superseded snapshots | spot-check `git log -1 <b>` + diff vs superseding branch, then `[OWNER-GATED]` delete |

**PRs (hold, individual triage — never auto-close):**

| PR | Why held | Action |
|---|---|---|
| #356→#357→#358→#366 | 3-deep stacked test-hardening chain; root #356 CONFLICTS with main; maps to issues #372/#377/#379/#382 | Decide if the infra work is still wanted before any rebase investment |
| #334 | CoachHelm P0 engine-trust criticals, CONFLICTING, 10d stale | Real fix — rebase decision |
| #333 | Golf premium P1 error-masking, CONFLICTING | Real fix — rebase decision |
| #262 | Email redesign — standing rule: **never merge without explicit approval** (dry-run, not wired) | HOLD |
| #243 | Old push/RLS fix, CONFLICTING | Check superseded-by-#542 before rebasing |
| #515 | Qodo issue-wiring, CONFLICTING | Confirm still wanted |
| #572 | Fairway/Greptile UI review (worktree helmv3-fix-wt), CONFLICTING; may overlap Lane B Fairway migration | `gh pr diff 572` vs Lane B before deciding |

### PHASE 5 — Reconcile CI so green = trustworthy

5.1. Confirm main green post-Phase-0/1 (`gh run list --branch main --workflow=ci.yml --limit 1`).
5.2. Any REVIEW-list PR kept alive: merge main in / rebase — their observed failures are overwhelmingly the 3 inherited-from-main ones and should clear automatically.
5.3. Leave the advisory set advisory (Playwright full E2E, lighthouse-preview, ios-compile, seeded smoke, Greptile) — the runbook is correct; lighthouse-preview self-resolves once Vercel previews deploy again.
5.4. Confirm fresh dependabot PRs against clean main come up green; if the same fingerprint reappears on a clean base, THEN investigate CI infra (it will not — the signature was base staleness).
5.5. Close the loop on prod-DB issues #651/#652 (schema drift + RLS recursion) as the first post-clean-base workstream — verify columns via `information_schema` (schema_migrations is unreliable in this repo).

---

## 4. CLEAN-BASE DEFINITION (the target state)

The repo is CLEAN when ALL of the following hold:

1. **One integration lane:** `batch/baseball-fixes` → PR #650 → `main` → Vercel prod. #650 merged; main tip green on all 5 required contexts (CodeRabbit, CodeQL, all/CI, all/Review-Gate, Smoke checks).
2. **Minimal open-PR set:** ≤ ~7 open PRs, each individually justified: the REVIEW holds (#262, #333, #334, #356-chain, #243, #515, #572 — shrinking as triaged) + any new fix/qa-* draft PRs + fresh dependabot regens. Zero superseded PRs open.
3. **Issues honest:** the ~24 #650-fixed issues closed; every remaining open issue mapped to a named workstream (prod-DB P0 #651/#652; mobile-QA #479–#485 ↔ fix/qa-* PRs; RLS follow-ups #519/#520; toggles #503/#504; Discover #430/#431; guards #394; test-hardening #372–#382; owner-accepted-risk #516/#391; golf #632). No orphans, no double-tracking.
4. **Branches/worktrees pruned:** ~13 worktrees (main checkout + open-PR backers + qa worktrees until PR'd); ~55 local branches (main, batch/baseball-fixes, open-PR branches, shrinking REVIEW pile). Zero squash-orphans, zero wf_* placeholders, zero /private/tmp worktrees.
5. **Checks trustworthy:** required = green means shippable; advisory clearly advisory; no stale bot statuses; Vercel builds un-paused and deploying main.

---

## 5. GO-FORWARD GOVERNANCE

1. **One lane only.** All BaseballHelm work lands as PRs into `main` via short-lived branches (or a single rebuilt `batch/*` branch if batching again) — never parallel long-lived integration branches.
2. **≤15-file PRs.** Hard cap (standing rule). Mega-PRs are the documented root cause of this tangle. #650 (~100 files) is the last of its kind — a one-time consolidation, not a precedent.
3. **Hard gates that must pass, every PR:** CodeRabbit, CodeQL, `all` (CI: TypeScript, ESLint+lint-ratchet, Unit tests, Business contracts, Supabase lint + RLS pgTAP, DB-types drift, Route Hygiene, Schema invariants), `all` (Review Gate incl. semgrep auth-check rule — never weakened, only inline-exempted with review), Smoke checks, 1 approval, conversations resolved.
4. **Never merge onto red main.** If main goes red, the only allowed PR is the one that fixes it.
5. **Worktree/branch hygiene:** any agent workflow that spawns a worktree must remove it (and its branch, once its PR merges) at workflow end. Weekly sweep: `git branch --merged origin/main | ... | xargs git branch -d` + `git worktree prune`. Squash-merged branches get deleted at merge time (`--delete-branch`) going forward.
6. **No work without a PR.** Branches with >0 commits ahead get a draft PR within the same session that created them (the fix/qa-* near-miss is the cautionary tale).
7. **Migrations:** additive-only to the shared prod DB; add columns BEFORE bulk-ingest; verify application via `information_schema`, never the migrations history table.
8. **Standing owner rules honored:** no email sends without approval (#262); #516 key rotation is owner-declined accepted risk — do not re-raise; never grant anon EXECUTE/ALL on standing RPCs; BCBS detection never disabled (CRM side).

---

## APPENDIX — Quick verification commands (non-destructive, run anytime)

```
git worktree list | wc -l                                  # target ~13
git branch | wc -l                                          # target ~55
gh pr list --state open --json number --jq length           # target ≤7
gh run list --branch main --workflow=ci.yml --limit 1 --json conclusion
gh pr checks 650                                            # pre-merge: 5 required green
gh issue list --state open --json number --jq length        # target ~25 post-#650
```

---

## Issues Reconciliation (backfill)

**Method (read-only):** pulled all 49 open issues (`gh issue list`), all 345 merged PRs and 57 open PRs (`gh pr list`), cross-referenced by exact `#N` citation in title/body via regex, then by GraphQL `closedByPullRequestsReferences` per issue, then by topical/file-path keyword matching against PR titles+bodies for the remainder, then spot-verified suspicious cases (title mismatches, non-cited fixes) with `gh issue view` / `gh pr view` timestamps. No issue or PR was closed, edited, or commented on — analysis only.

**49 open → 1 closeable-as-fixed, 25 shipping-via-#650, 23 real-open.**

### Corrections to the original mapping

1. **§2.1's "~24 issues close" undercounts by one.** The line-63 list omits **#474** (render CoachHelm insight body on player profile), even though the PR-mapping table two rows above it correctly lists PR #644 → #474, and #650's own body explicitly includes "**#474** render insight body on player profile." The correct count folded into #650 is **25 issues**, not 24.
2. **New finding — #430 is silently already-fixed.** Issue #430 ("Fix Discover Teams pagination and total counts," filed 2026-06-30T22:22Z) is fixed by **merged PR #615** (`fix/baseball-discover-pagination`, merged 2026-07-01T11:53:35Z) — the PR rewrites `getDiscoverTeams` to compute `count`/`pages` from the DB row count instead of the post-filter page slice, exactly matching #430's evidence and acceptance criteria. PR #615 does **not** cite `#430` anywhere in its title or body (confirmed via GraphQL `closedByPullRequestsReferences` returning empty), so GitHub never linked them and #430 is still open. This is exactly the kind of gap the original ISSUES-dimension pass would have caught before its connection dropped. **Recommend closing #430 with a comment citing #615** (owner action — not done here, read-only).
3. **#379 has a stale/incorrect "Closes" reference.** Merged PR #421 (`fix/coderabbit-planned-issues`) lists "Closes #107, #108, ... #379, ..." with a bullet describing #379 as "Document baseball stats source-of-truth layers." But the *current* issue #379 (created 2026-06-30T14:04:15Z, before PR #421 was even opened at 16:48:44Z) is titled "reconcile seeded stats with the canonical Stats Center read model" with broader acceptance criteria (reconciler decision, seeded-data smoke test, drift check) that #421 did not implement. GitHub's own `closedByPullRequestsReferences` for #379 is empty and `state` is `OPEN` — the auto-close never fired, correctly, because the referenced content doesn't match. Net effect: no actual double-tracking, but the #421 PR body is misleading. #379 stays REAL-OPEN, test-hardening workstream (unchanged from original doc).
4. **#394 is a partial-fix-but-still-open case worth calling out explicitly.** Merged PR #579 (`fix/baseball-394-stats-guard`) closed the `stats.ts` slice of the #394 epic (9 server actions guarded), and its own body says "completing the stats-action slice of #394" — but issue #394's scope ("finish migrating **legacy** server actions to shared active-team/capability guards") explicitly tracks the remaining ~14 legacy action files. Correctly REAL-OPEN, not ALREADY-FIXED — flagging so it isn't mistaken for closeable.
5. **No orphaned issues** — confirmed. Every one of the 49 open issues maps to #650, PR #615 (already-fixed), or a named workstream below.
6. **No genuinely double-tracked issues** — the only overlaps are issues covered by both an already-known superseded PR *and* #650 (e.g. #474 by both open PR #644 and #650), which is the expected, already-documented Phase-2 supersession pattern, not a new conflict.

### Disposition table

| Issue# | Title | Disposition | Maps to (PR#/branch/workstream) |
|---|---|---|---|
| 430 | Fix Discover Teams pagination and total counts | **ALREADY-FIXED** | PR #615 (`fix/baseball-discover-pagination`, merged) — **not cross-referenced by GitHub**, recommend closing with explicit citation |
| 425 | Route pipeline recruits to public profile, not roster-only dashboard player page | SHIPPING-VIA-#650 | PR #552 → #650 |
| 426 | Align pipeline stage UI with the 5-stage server contract | SHIPPING-VIA-#650 | PR #550 → #650 |
| 427 | Fix pipeline drag-and-drop stage resolution | SHIPPING-VIA-#650 | PR #550 → #650 |
| 428 | Stop showing pipeline drag success when stage update fails | SHIPPING-VIA-#650 | PR #550 → #650 |
| 429 | Revert Discover watchlist UI when server actions fail | SHIPPING-VIA-#650 | PR #557 → #650 |
| 432 | Fix PlayerDetailModal message navigation path | SHIPPING-VIA-#650 | PR #553 → #650 |
| 434 | Sum innings pitched in outs, not as base-10 decimals | SHIPPING-VIA-#650 | PR #649 (`fix/baseball-434-auto`) → #650 |
| 436 | Compute OBP/SLG/OPS in legacy aggregate recalculation | SHIPPING-VIA-#650 | PR #646 (`fix/baseball-436-auto`) → #650 (incl. migration `20260701020000`) |
| 444 | Stop infinite loading on Events when coach has zero teams | SHIPPING-VIA-#650 | PR #641 (`fix/baseball-444-auto`) → #650 |
| 445 | Persist and surface requires_rsvp for baseball calendar events | SHIPPING-VIA-#650 | PR #648 (`fix/baseball-445-auto`) → #650 |
| 459 | Wire activate page to activateRecruitingExposure server action | SHIPPING-VIA-#650 | PR #566 → #650 |
| 462 | Use recruiting ProfileEditor for JUCO on dashboard/profile | SHIPPING-VIA-#650 | PR #554 → #650 |
| 467 | Repair or remove dead demo-mode settings deep link | SHIPPING-VIA-#650 | PR #570 → #650 |
| 470 | Fix privacy settings field mapping so saves match baseball_player_settings schema | SHIPPING-VIA-#650 | PR #560 → #650 |
| 474 | Render CoachHelm insight body on player profile (body vs description) | SHIPPING-VIA-#650 | PR #644 (`fix/baseball-474-auto`) → #650 (player-profile surface only, per PR body caveat) |
| 477 | Preserve postgame item disposition on regenerate upsert | SHIPPING-VIA-#650 | PR #569 → #650 |
| 478 | Collapse competing development_milestone insights to one per player | SHIPPING-VIA-#650 | PR #642 (`fix/baseball-478-auto`) → #650 |
| 489 | Check saveLineup result before showing roster success toast | SHIPPING-VIA-#650 | PR #567 → #650 |
| 490 | Swap or return displaced player when dropping into an occupied lineup slot | SHIPPING-VIA-#650 | PR #567 → #650 |
| 491 | Treat empty Lift Builder player selection as "assign to none," not whole team | SHIPPING-VIA-#650 | PR #645 (`fix/baseball-491-auto`) → #650 |
| 498 | Stop labeling stable practice-effectiveness reviews as "Moved the wrong way" | SHIPPING-VIA-#650 | PR #643 (`fix/baseball-498-auto`) → #650 |
| 500 | Do not increment scout-packet view_count on CSV downloads | SHIPPING-VIA-#650 | PR #568 → #650 |
| 505 | Align Staff Settings edit affordance with can_invite_staff server gate | SHIPPING-VIA-#650 | PR #559 → #650 |
| 509 | Scope academics eligibility reads and defaults to the active team | SHIPPING-VIA-#650 | PR #647 (`fix/baseball-509-auto`) → #650 |
| 511 | Add player-visible scope control when coaches author notes | SHIPPING-VIA-#650 | PR #571 → #650 |
| 651 | [Supabase] Baseball schema drift — 12 columns queried by code are missing in prod DB | REAL-OPEN | Workstream: **DB-P0** — filed by Mission Control sweep 2026-07-01T17:46Z; no PR |
| 652 | [Supabase] baseball_announcements RLS policy — infinite recursion (42P17) in production | REAL-OPEN | Workstream: **DB-P0** — filed by Mission Control sweep 2026-07-01T18:15Z; explicitly "not a duplicate of #651"; no PR |
| 391 | Remove hardcoded real/demo credentials from scripts and rotate exposed accounts | REAL-OPEN | Workstream: **security** — companion to #516; no PR |
| 394 | Finish migrating legacy server actions to shared active-team/capability guards | REAL-OPEN | Workstream: **security** — PR #579 merged (stats.ts slice only); ~14 legacy action files remain per issue scope |
| 516 | P0 SECURITY: production Supabase service_role key hardcoded in 9 tracked scripts | REAL-OPEN | Workstream: **security** — owner previously DECLINED rotation (public repo, accepted risk); do not re-raise; no PR |
| 519 | Harden authenticated-role grants on phase-1 RLS tables (follow-up to #517) | REAL-OPEN | Workstream: **security** — prerequisite PR #517 merged; this follow-up has no PR |
| 520 | Enforce team-match in practice block/attendance RLS policies (follow-up to #517) | REAL-OPEN | Workstream: **security** — prerequisite PR #517 merged; this follow-up has no PR |
| 431 | Apply Discover player sort on the server across all pages | REAL-OPEN | Workstream: **data-correctness** — sibling of #430 (fixed by #615) but sort was not addressed in that PR; deferred until after #394 per original mapping; no PR |
| 479 | Eliminate stacked mobile top chrome (shell bar + legacy Header) | REAL-OPEN | Workstream: **mobile** — likely `fix/qa-shell-chrome-dup` branch (no PR opened yet) |
| 480 | Show hub sub-navigation on mobile for Team/Stats routes | REAL-OPEN | Workstream: **mobile** — likely `fix/qa-nav-deadends` branch (no PR opened yet) |
| 481 | Fix message surfaces' viewport math and loading chrome drift | REAL-OPEN | Workstream: **mobile** — likely `fix/qa-stats-charts` or `fix/qa-misc-visual` branch (no PR opened yet) |
| 482 | Compact the public player profile mobile hero and fix shared-link navigation | REAL-OPEN | Workstream: **mobile** — likely `fix/qa-misc-visual` branch (no PR opened yet) |
| 483 | Add safe-area-top padding to the baseball shell sticky bar | REAL-OPEN | Workstream: **mobile** — likely `fix/qa-shell-chrome-dup` branch (no PR opened yet) |
| 484 | Reduce Player Today to one contextual primary CTA on mobile | REAL-OPEN | Workstream: **mobile** — likely `fix/qa-player-today` branch (no PR opened yet) |
| 485 | Align calendar full-height layout with shell chrome offsets | REAL-OPEN | Workstream: **mobile** — likely `fix/qa-calendar` branch (no PR opened yet) |
| 503 | Enforce season module toggles at runtime, not just in settings storage | REAL-OPEN | Workstream: **features** — module toggles; no PR |
| 504 | Enforce program module toggles (academics/travel) beyond settings storage | REAL-OPEN | Workstream: **features** — explicitly excluded from #650 ("broadest/riskiest; deliberately deferred" per PR body); no PR |
| 372 | Make authenticated coach/player smoke tests mandatory in CI | REAL-OPEN | Workstream: **test-hardening** — stacked chain #356→#357→#358→#366 (blocked, #356 CONFLICTS with main); no direct-citing PR |
| 373 | Extend route crawler to authenticated Baseball coach and player sessions | REAL-OPEN | Workstream: **test-hardening** — same stacked chain; no direct-citing PR |
| 377 | Add business/product-truth contracts for stats, CoachHelm, and source trust | REAL-OPEN | Workstream: **test-hardening** — open PR #357 (`test-hardening/golf-stats-coachhelm-contracts`) is directly on-topic but does not cite #377; blocked behind #356 |
| 379 | Reconcile seeded stats with the canonical Stats Center read model | REAL-OPEN | Workstream: **test-hardening** — see correction #3 above (PR #421's "Closes #379" did not fire / content mismatch); no PR actually addresses current scope |
| 382 | Create seeded production smoke for Rini/demo stats surfaces | REAL-OPEN | Workstream: **test-hardening** — open PR #358 (`test-hardening/free-production-readiness-stack`) is directly on-topic but does not cite #382; blocked behind #356 |
| 632 | [Partner] GolfHelm: Calendar (events show wrong day for Pacific-time users) | REAL-OPEN | Workstream: **golf** — partner-reported 2026-07-01T14:34Z, `agent:needs-triage`, not yet triaged; no PR |

### Real-open issues, grouped by workstream (post-clean-base backlog)

- **DB-P0** (2): #651, #652
- **Security** (5): #391, #394, #516, #519, #520
- **Data-correctness** (1): #431
- **Mobile** (7): #479, #480, #481, #482, #483, #484, #485
- **Features** (2): #503, #504
- **Test-hardening** (5): #372, #373, #377, #379, #382
- **Golf** (1): #632

