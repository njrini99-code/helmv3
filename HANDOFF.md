# CoachHelm handoff (2026-09-25)

This file is untracked, so don't commit it. AGENTS.md and CLAUDE.md in this repo are the policy.

## Open it

```
cd ~/worktrees/helmv3/coachhelm-surfaces && h
```

`h` is the Helm Claude launcher. `claude` works too. To resume the old conversation instead:

```
cd ~/worktrees/helmv3/ui-ux-audit-fa093f && claude --resume 350a4da1-394c-4043-aae7-1baf142013ec
```

## Branches and PRs

| Worktree | Branch | PR | State |
|---|---|---|---|
| `~/worktrees/helmv3/coachhelm-surfaces` (this one) | `agent/coachhelm-surfaces` | #2073 draft | CoachHelm root map, accuracy fixes, polish. Last pushed commit is `9b77c437c`; about 12 commits after it are local only (see "Local commits"). |
| `~/worktrees/helmv3/ui-ux-audit-fa093f` | `agent/ui-ux-audit-fa093f` | #2069 draft | Golf UI/UX audit. The ledger is `docs/ui-audits/GOLF_UIUX_AUDIT_LEDGER_2026-09-24.md`: 332 findings fixed, about 20 partial or open. Never commit its modified `.claude/launch.json`. |

Standing rules:
- No merge and no deploy without the owner. PRs stay drafts. Production DB is SELECT-only unless the owner approves a specific write.
- Golf only: don't touch Baseball or Lift Lab.
- Stage explicit paths. Use `git commit --only <paths> --no-verify`, because agents may share the index.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Prefer fewer, larger PRs and push rarely.

## Local commits, not yet pushed (#2073)

Run `git log --oneline origin/agent/coachhelm-surfaces..HEAD` to confirm. They include:
- Coach summary cards: Signals, Effectiveness (8c805d334), game fingerprint (7c1a3a428), genome (0ecf6f037, 30c14c39c), genome compare (5e05f35ac).
- Player-side polish: Standing summary plus the strokes fix (e2feb9dff); Development, Profile and Insights summaries and loading (9b2f780e9, e4ef171b4).
- Accuracy fixes: sand attempts are divided by all countable rounds (6682fad4a), and GIR is sized on the player's own GIR chances (0378afdd8, b5ba0e3c4).
- Held migration so the stats cache counts countable rounds only, per 18 holes (f7468a82e). The owner applies it.

Push when ready with `git push origin agent/coachhelm-surfaces`. The pre-push hook runs gates, so it can take a few minutes.

## What was built on #2073

- **Root map.** Where → What → Why. The "What" row is measured from shots and reconciles to stored strokes gained within 0.15. Insights attach as the "Why". Every screen opens on a summary card with detail on tap; the coach view uses a sheet or side panel.
- **Coach drill-in.** URL is `?view=team&player=<id>&cause=<insightId>`.
- **Hidden.** Both course management and `tee_strategy` insights are hidden, via `src/lib/coachhelm/v3/insight-visibility.ts`.
- **Recheck.** A leak that has cleared is archived, with `resolved_by='engine-recheck'` and a Wilson 90% margin. The nightly sweep refreshes up to 6 players whose insights are 14 or more days stale.
- **New insight angles** (lie approach, bad-day floor, three-putt autopsy, tee miss cost, approach miss compass). They are behind flag `coachhelm_insight_angles_v1`, which is OFF. The owner said "seems kind of useless", so keep it off and don't expand it.
- **Fixes.** Holed approaches no longer count as misses. The round-review prompt now reads only visible insights.

## In flight when this was written

Two background agents were running in the old session. Check `git log` and `git status` to see what landed:
1. Polish the coach Players tab (`?view=players`), then the Development tab (`?view=development`).
2. Root-map follow-ups, three jobs:
   - cache the team shot read (about 2 s on each Brief load; use `unstable_cache`, keyed by team plus latest round, 10-minute TTL, access checks before the cache);
   - make a direct link to `?view=team&player=` scroll to the drill;
   - add small visuals to the "See why" sheet: a lie split bar, a concentration breadcrumb, and the compass or par×length grid.

If nothing landed, redo them yourself.

Agents in the old session kept stalling ("stream watchdog"). Do the work inline, or use fresh agents with small scopes that commit after each step.

## Next steps, in order

1. Finish the coach screen polish still missing. The Players tab and Focus areas/Development landed in 8d0fa6525, 880ffd3ec and fe20bbc13. Still to do:
   - the coach player detail page `src/app/golf/(dashboard)/dashboard/players/[playerId]/page.tsx`;
   - qualifying `src/app/golf/(dashboard)/dashboard/coachhelm/qualifying/[id]`.

   Follow the summary-card pattern in 8c805d334 and 7c1a3a428, and reuse `src/components/golf/coachhelm/root-map/Disclosure.tsx`.
2. Finish the root-map follow-ups above, if they didn't land.
3. **Visual check of everything** (see below). Send the owner screenshots of each screen: coach Team roots, player drill and sheet, Signals, Players, Effectiveness, Development, player detail, game fingerprint, genome, genome compare, qualifying. Player-side views need a player login; ask the owner to switch accounts.
4. Coach-neutral insight wording. The work in progress is saved as a patch: `/private/tmp/claude-501/-Users-ricknini-worktrees-helmv3-ui-ux-audit-fa093f/350a4da1-394c-4043-aae7-1baf142013ec/scratchpad/coach-voice-wip.patch`. It adds `voice.ts`; generator-base stores coach-voice title/content plus `evidence.player_copy`; only scrambling is converted. It is not safe as-is: the player readers must be switched to `evidence.player_copy` first, or players will see their own insights in third person.
5. Duplicate coach-scoped and coachless insight copies. Investigate the count in production, which readers see both, and a writer fix. Report a cleanup SQL; don't run it.
6. `npm run build`, push #2073, and update the PR body.
7. UI/UX audit leftovers on #2069 (owner approved "finish all I can", excluding the Settings rebuild):
   - DS-12 primitives (Masthead, VerdictLine, Row, TemplateSkeleton, KeyboardDoneBar, Stage variant);
   - DS-13 instruments (TeamField, SignedBars, TargetTrack, SplitStrip);
   - DS-15: migrate the remaining 40 `active:scale` to Pressable;
   - TYPE-03 and DS-R1 sweeps;
   - DASH-07 Stats filters;
   - DASH-12 field sheet;
   - HUB-19 in-place plan editing;
   - MOT-21: run the e2e specs green;
   - CON-12 contrast regrade;
   - a team percentile floor migration (SQL 3 → 5), held.

   The agent for this stalled with no commits.

## Owner decisions pending (ask with AskUserQuestion, recommended option first)

- Apply held migrations. OD-01 goes first, then NUM-24 (see `supabase/migrations/HELD.md` on #2069). Then the new stats-cache migration (f7468a82e).
- Merge and deploy (`scripts/deploy-prod.sh`, run by the owner). The flags only take effect on deploy.
- Whether to turn on `coachhelm_insight_angles_v1` (the owner leans no).
- Issue #2061 (health report):
  - Inngest keys are placeholders in Vercel production.
  - AI Gateway credit.
  - The daily schema-invariants workflow is red (#1897).
  - A Supabase `security_definer_view` warning on 4 views.

  The last two can be prepared as PRs.
- Sign out the leaked coach session.
- Learned personalization stays OFF.

## Known gaps

- `exportInsights` (insight-management.ts) and `readAttributionForPlayer` don't apply `applyInsightVisibility`. Neither is wired to any UI. Adding the filter breaks their test mocks, so do it together with mock updates.
- Admin pages show raw insight titles unfiltered. This is by design (admin only).
- Stored insight text still says "you" in coach views (see step 4).

## Visual check with the dev server

- In the Claude desktop app, preview config `coachhelm-dev` in `~/worktrees/helmv3/ui-ux-audit-fa093f/.claude/launch.json` runs this worktree on port 3218.
- In a terminal: `npm run dev -- --webpack -p 3218` from this worktree.
- The browser pane holds a coach session (Demo University Golf). Never type credentials; ask the owner to log in or switch accounts.
- A good player id: `8091da4b-dbc9-47f3-80f1-be37c96b2c91` (Owen, 12 rounds).
- URLs:
  - `/golf/dashboard/intelligence?view=team` (Team roots)
  - `?view=team&player=<id>` (drill), then tap "See why"
  - `?view=signals`, `?view=players`, `?view=effectiveness`, `?view=development`
  - `/golf/dashboard/players/<id>`, `/golf/dashboard/players/<id>/game` (fingerprint), `/golf/dashboard/players/<id>/genome`
  - `/golf/dashboard/coachhelm/genome/<id>`, `/golf/dashboard/coachhelm/genome/compare`
  - `/golf/dashboard/coachhelm` (player home; needs a player session)
- Check each screen at 375px and about 1280px. Look for:
  - no horizontal scroll;
  - one primary action;
  - 44px tap targets;
  - no raw metric ids;
  - sample sizes and date windows shown;
  - stale-data labels;
  - no "you" in coach views.
- To send screenshots: the pane's screenshot isn't saved to disk. Capture with `screencapture -x <file>` (it works) or Playwright, then send with SendUserFile.

## Commands and gotchas

- Inner loop:
  - `HELM_GATE_NOWAIT=1 npm run typecheck:fast`
  - `npx eslint <files>`
  - `npm run test:file -- <paths>`
  - `npm run docs:check`
- `npm run build` can run out of memory. Use `NODE_OPTIONS=--max-old-space-size=8192 npm run build`, and stop the dev server first because they share `.next`.
- npm gates go through `scripts/serialize.mjs`, a machine-wide queue in `~/.helm-gates`. `HELM_GATE_NOWAIT=1` bypasses it.
- The Supabase MCP (`mcp__supabase__execute_sql`) is fine for SELECTs. The project is `qmnssrrolpinvwjjnufo`.
- Feature docs: `memory/features/coachhelm-ai.md`, `memory/features/player-coachhelm-development.md`, `docs/architecture/coachhelm-evidence-contract.md`.
- Dry-run scripts (read-only):
  - `scripts/coachhelm/recheck-dry-run.ts`
  - `scripts/coachhelm/insight-angles-dry-run.ts`
- Data facts:
  - `club_type` is only driver, non_driver or putter; there are no individual clubs.
  - Par-3 tee shots are recorded as approach.
  - `putt_slope` is present on most putts.
  - The putt band rule is (lo, hi].
