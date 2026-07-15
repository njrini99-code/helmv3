# BaseballHelm — Production Verdict

> This file is reissued, not rewritten. The 2026-06-25 verdict below is kept
> verbatim as history. Read the 2026-07-15 section first — it is the current
> status.

---

## 2026-07-15 — Verdict: BATCH BRANCH PENDING INTEGRATION MERGE + CI

**Commit:** `origin/batch/bbh-finish-0714` @ `0056bc0e` (`fix(baseball):
CoachHelm engine loaders/registry — #379 Phase 4a source-table + event-derived
wiring (#851)`). **Not deployed. Not on `main`.**

### Honest status

BaseballHelm is **substantially more done** than the 2026-06-25 verdict below
describes, and the work landing tonight is real (file-cited, gate-evidenced,
independently re-verified for this doc rather than taken on faith) — but it
is sitting on an integration branch, not in production, and that branch is
**not green end-to-end right now**:

- **30 PRs merged onto `batch/bbh-finish-0714` tonight** (#812–#841), plus one
  more on top (#851). Every individual PR carries its own `tsc`/`eslint`/
  targeted-`vitest` gate evidence in its own PR body, verified real by spot
  re-running several of them for this doc (see below).
- **The branch HEAD is not clean CI.** `gh pr checks 851` (the PR that
  produced the current HEAD) shows 3 failing checks on GitHub right now:
  `Business contracts`, `Unit tests`, `Import-cycle ratchet`. Reproduced two
  of the three locally on this worktree:
  - `Business contracts` — `src/lib/baseball/__tests__/stat-layer-contract.test.ts`
    fails 2 of 3 assertions: `practice-effectiveness.test.ts`,
    `player-today-self-scope.test.ts`, and `player-today-honest-loop.test.ts`
    (all three landed tonight, in the #377 test-coverage wave) reference a
    deprecated stat table without a manifest entry, and `insights.ts`'s
    manifest entry is now stale (it migrated off the deprecated table in
    PR #819 without the manifest being updated in the same commit). This is
    a **known, disclosed** state — #851's own PR body calls it out explicitly
    as pre-existing and out of scope for that PR's file list — but it is
    real and it is red right now, not a documentation artifact.
  - `Import-cycle ratchet` — `check-cycles.mjs` flags `@supabase/supabase-js`
    and `dotenv/config` as "never seen before." This reads as an external-
    package false positive (the ratchet's own error message names this exact
    case as the benign one to `--update` past), not a real new import cycle.
  - `Unit tests` — a `ResizeObserver` mock `TypeError` thrown from
    `src/lib/fairway/use-scroll-fade.ts` in the CI job's test environment.
    Did not reproduce this one locally in the time available for this pass;
    flagging as unverified rather than asserting a cause.
  - None of these three look like product regressions introduced by
    tonight's own diffs on inspection, but "30 PRs merged, each individually
    gated" is a different claim than "the branch is green," and this doc
    will not conflate the two.
- **Merge to `main` has not happened.** No PR from `batch/bbh-finish-0714`
  into `main` exists yet (checked via `gh pr list`). Nine more PRs
  (#842–#850) are open against the batch branch itself and not yet merged.
- **No production deploy has happened for tonight's work.** The last
  BaseballHelm-specific production deploy on record is the 2026-06-25 one
  below; subsequent mission work (#792–#811, all confirmed merged to `main`)
  implies additional deploys since, but this doc does not assert a specific
  deploy id for tonight's batch because none exists — there is nothing to
  point at until the batch branch merges and ships.

### What's real and code-verified as of tonight (independently checked for this doc, not copied from PR claims)

- **Baseball Living-Annual UI migration: all 29 tracked surfaces done.**
  Zero `isRedesignEnabled()` conditional forks remain under
  `src/app/baseball/**`/`src/components/baseball/**` (verified by grep,
  comments excluded); `PlayerPassportCard.tsx` and the dead
  `layout/header.tsx`/`mobile-menu-button.tsx` are deleted (PR #820, Batch H).
- **Discover-privacy P0 (the mission's headline finding) is fixed and
  regression-tested**: `discover.ts` excludes `profile_visibility='private'`
  players at 4 call sites; `discover-privacy.test.ts` pins it.
- **Six real test-coverage PRs landed** (#822–#826, gated individually):
  pgTAP staff-scope isolation (closes #406's own acceptance criteria),
  travel-action identity/denial paths (18 assertions), practice save/publish/
  attendance (13 assertions) + practice-effectiveness (15 assertions),
  documents write-capability (24 assertions), and #377 product-truth
  contracts for Player Today/Signal Inbox/Video Library.
- **Mobile UI/UX wave**: 13 PRs (#829–#841) across messages, roster/team-ops,
  recruiting hub, Lift Lab, import-center/stats-upload, onboarding-auth, and
  settings/coach-command — each with its own tap-target/chrome-drift/
  skeleton-honesty fixes and gate evidence.
- **#379 stat-layer reconciliation is genuinely mid-flight**, not just
  planned: seed/demo reconciliation (#827) and a shared
  `legacy-stat-adapters.ts` module (#828) landed, then CoachHelm engine
  "Phase 4a" (#851) added per-row source-table citation and optional
  event-derived velocity metrics to the loaders — all four existing callers
  verified byte-identical output on the old 3-arg signature. Phases 2/3
  (migrating `player-today.ts`/`insights.ts`/`practice-effectiveness.ts` off
  the legacy tables) are not started.
- **Feature readiness matrix moved 10 → 14 of 22 rows to `ready`** on the
  strength of tonight's test-coverage PRs (Documents, Travel, Practice,
  Staff/Roles), with Practice Effectiveness moving `route-only` → `partial`.
  `npx tsx scripts/baseball/check-readiness-matrix.ts` passes clean
  (route resolution + owner-issue open/closed state, both checked with a
  live token) after tonight's edits.

### What remains (real, currently open — not resolved by this doc)

1. **Deferred minors** (small, named, not yet actioned):
   - `src/components/ui/status-dot.tsx`'s `PipelineStatusDot` carries a 5th
     duplicate copy of the pipeline-stage label map (same drift class PR
     #821 just fixed elsewhere); frozen file, left untouched, flagged for a
     follow-up. Appears to have zero live importers (likely dead code).
   - `JUCOModeToggle` (`src/components/baseball/coach/ModeToggle.tsx`) is now
     orphaned after PR #820 deleted its only caller (`header.tsx`); not
     acted on, flagged for a future cleanup pass.
   - `ConversationClient.tsx` (`/messages/[id]`) and `MessagesClient`
     (`?conversation=`) render two unrelated designs for the same
     conversation — PR #831 explicitly deferred retiring the former (3
     deep-link call sites + nav-manifest/test-registry touch points; too
     large a blast radius for that PR's scope).
   - `PlayerNotesSection.tsx` and `PlayerPerformanceTab.tsx` still carry raw
     `warm-*`/`amber-*` Tailwind swatches (unconverted to the ink system);
     unchanged as of tonight, still explicitly flagged in-code as deferred.
   - `stat-layer-contract.test.ts` is red on the batch branch (2 unlisted
     offender files + 1 stale manifest entry) — see CI reality-check above.

2. **Journey-vs-Pipeline vocabulary decision** — real, owner-gated, not this
   doc's call. PR #821 shipped the two decision-independent chunks of the
   memo (fixed the dead Dream Schools query; collapsed 4 duplicated
   pipeline-stage label/enum sources into one `PIPELINE_STAGES` source of
   truth). It explicitly left 3 chunks undone pending sign-off: an additive
   crosswalk table between the player-facing Journey and coach-facing
   Pipeline vocabularies (blocked on whether the mapping is fixed-global or
   per-org-type), a side-by-side journey/pipeline display (blocked on
   whether a player's recruiting status should be visible to coaches at
   all), and an optional divergence notice. Needs Nick's read on the two
   open questions before any of the three chunks 3–5 can start.

3. **#379 legacy-backfill / reconciliation scope** — Phase 4a (loaders +
   registry) landed tonight; Phases 2/3 (the actual migration of
   `player-today.ts`, `insights.ts`, `practice-effectiveness.ts` off
   `baseball_player_stats`/`baseball_player_aggregates`) are not started, and
   the reconciliation's own drift-detection test is currently failing (see
   CI reality-check). This is a real, multi-PR body of work still ahead, not
   a decision — flagging it here as "remains," not "needs a call."

4. **Marketing-root decision** — `src/app/page.tsx` (the deployed
   `helmsportslabs.com` root) renders the existing `@/components/landing/
   {Hero,Footer}` dual-sport marketing page (native apps get redirected to
   `/golf/login` via `<NativeRedirect>`). A separate, fully independent
   Next.js project — `helm-website-ui/` (`"name": "my-v0-project"`, its own
   `package.json`/`app`/`components.json`) — lives at the repo root,
   explicitly excluded from the Vercel build (`.vercelignore`: "Each has its
   own deploy pipeline (or none yet)"). No decision has been made about
   whether that v0-generated site is meant to eventually replace
   `src/app/page.tsx` as the real marketing root, ship as a separate
   property, or stay parked. (Separately, the more elaborate "Entry World /
   First Light" landing redesign was explicitly REJECTED and parked in favor
   of #650's flush-diamond login — see `docs/LANDING_ENTRY_WORLD_DESIGN.md`'s
   own status banner — so that alternative is already resolved; the
   `helm-website-ui/` question is not.)

5. **Dual-wizard decision** — `src/components/baseball/import-center/
   ImportCenterShell.tsx` composes two full import wizards side by side as a
   mode switcher: the legacy box-score `ImportWizardClient.tsx` (1,968 lines)
   and the newer event-grain `EventImportWizard.tsx` (664 lines, feeding the
   elite-stat-event tables the #379 reconciliation is trying to make
   canonical). The shell's own header comment documents this as intentional
   for now ("legacy... kept intact" / "the new EventImportWizard"), but no
   decision has been recorded on whether both modes are permanent product
   surface or whether the legacy wizard sunsets once #379's reconciliation
   finishes. Worth an explicit call once Phase 2/3 lands, not before.

### Bottom line

Tonight's 30-PR batch is real, individually gated work — not a rubber-stamp
merge train. It measurably moves BaseballHelm forward (14/22 readiness-matrix
rows now `ready`, up from 10; the full 29-surface UI migration finished; six
dedicated test-coverage PRs closed real gaps this matrix had been citing for
weeks). But it is **not shipped**: the integration branch has 3 known-red CI
checks, has not been merged to `main`, and has not been deployed. The next
honest milestone is "batch branch green end-to-end + merged to `main` + one
intentional production deploy" — none of which is true yet as of this
commit.

---

## 2026-06-25 — Verdict: SHIPPED ✅ (kept as history — do not treat as current)

**Date:** 2026-06-25 (overnight autonomous run, completed on owner approval)
**Status:** **LIVE IN PRODUCTION** — `helmsportslabs.com`, commit `2a822052` on `main`, Vercel deploy `dpl_2aAoSBpmBTUhtWBgXfaez2Faq2AK` READY.

### Result
BaseballHelm (Lifting Lab + Staff Room + full Phase-1 surface) is built, green, secured, seeded, deployed, and smoke-verified. Golf production is unaffected.

### What shipped
- **Build:** `tsc` clean + `next build` (177 pages) green. Deployed to prod (~8.5 min build).
- **Features:** Lifting Lab + Staff Room finished/reworked (WF1), conformance to the V1–V12 canonical spec + 7/8 P0 bugs fixed + premium polish (WF2).
- **DB reconciliation (shared golf-prod, applied on approval):** 5 migrations — anon-revoke wave1+wave2, additive staff/import columns, performance indexes, defense-in-depth anon revoke. Caught + fixed a real bug in `000070` (`UNIQUE ... NOT VALID` is illegal Postgres) that would have broken `db push`.
- **Security:** anon-readable baseball tables **55 → 6** (only the 6 intentionally-public policy tables remain; 0 tables have RLS disabled).
- **Golf regression:** canary unchanged through every step — coaches 15 / players 60 / teams 13 / rounds 281; `handle_new_user` intact; `/golf`, `/golf/login`, `/golf/dashboard` all 200.
- **Demo:** "Demo University Baseball" seeded (idempotent) — `demo-coach@baseballhelmdemo.com` / `demo-player@baseballhelmdemo.com` (pwd `BaseballDemo2026`), 8 players + lift/readiness/practice/insight data.
- **Smoke:** all baseball + golf routes 200, zero 500s.

### Key discovery (out-of-band)
The orphaned 25h archived-session workflow had **already applied ~51 baseball/lifting migrations to the shared golf-prod DB** (apply-time version keys, some duplicated) before this run. Prod already had 118 baseball + 26 lifting tables. This run reconciled the remaining gap (the 5 above) rather than re-applying everything. Supabase branching was unavailable (`list_branches` errored), so the branch-validate gate couldn't run — prod writes proceeded only after explicit owner approval.

### Known follow-ups (non-blocking)
1. **`/baseball` bare path 404s** — add a redirect to `/baseball/login` (the role dashboards + login serve fine).
2. **Lifting Lab empty for the demo** — the seed populates `baseball_lift_*`; the Lab reads `helm_lifting_*`. Run the `000080` backfill after a richer seed, or extend the seed to write `helm_lifting_*`. Honest empty state renders correctly meanwhile.
3. **Lifting-coach demo login** not created (seed makes coach + player only).
4. **Type regen skipped** — build is green via the loose-client pattern for the new columns; regen `database.ts` at leisure for strict typing.
5. **33 Dependabot vulns** on the repo (6 high) — triage separately.
6. **Optional holistic premium pass** (cross-surface cohesion) not run this window — deferred to conserve tokens; product is already WF1/WF2-polished.

### Rollback
Vercel instant rollback to `dpl_DRmDR3wyqGxLJzS2BsmvT2BVteD2` (prior production, `133e1459`) if needed. DB changes were additive/idempotent and baseball-scoped — no schema rollback required; golf is untouched.
