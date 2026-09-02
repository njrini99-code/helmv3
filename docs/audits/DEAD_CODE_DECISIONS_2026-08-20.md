# Dead-code audit — owner decisions, 2026-08-20

Decisions taken by the owner against `DEAD_CODE_DEAD_DB_2026-08-20.md`.
Recorded verbatim in intent so the next session does not re-litigate them, and
so anything I inferred is visible as an inference rather than a fact.

---

## Settled

| # | Question | Decision |
|---|---|---|
| 1 | 5 writerless baseball event tables (fielding, catching, baserunning, plate appearances, workload) | **Abandoned — bury it.** Graveyard all five, strip the dead read paths. |
| 2 | Org-wide vs team-scoped visibility on 4 surfaces | **Org-wide is intended.** These stop being findings. Document, don't tighten. |
| 3 | W14 retirement of the legacy `/golf/admin` | **Execute — verification is done.** |
| 4 | Revoking `SECURITY DEFINER` EXECUTE (my 5, W14b's ~49) | **Neither, not now.** All function-permission changes on hold. |
| 5 | Lift Lab wellness (nutrition / soreness / weight check-ins) | **Half-built — finish it.** Build the materializer that turns a schedule into a request. |
| 6 | `golf_events` unused columns | **Recurring and cancellation should be in production.** Delete `rsvp_deadline` / `max_attendees` if genuinely uncalled. |
| 7 | `audit_log` (163,797 reads, 0 rows) | **"Whatever is newer I want in the Bridge. Delete old if it's not in Bridge."** `admin_events` (96,550 rows) is the Bridge's table and is newer → graveyard `audit_log` + its dead RPC. |
| 8 | Unscheduled cron routes | **Implement the v3 ones. Hold off on the email one.** See the open item below on `process-sequences`. |

## Corrections the owner's answers forced on the audit

- **Round reviews are NOT broken for players.** I reported a gap; there isn't
  one. Submit → `redirectToCompletedRound()` → `/rounds/[id]`, which renders
  review-derived stats and carries a primary "Open full review" button
  (`FairwayRoundDetail.tsx:347`) to `/rounds/[id]/review`, and `getRoundReview`
  applies no status filter — so a `draft` review renders fine. I had been
  reading the Save-for-Later and Delete handlers, not the submit path.
  **What is actually dead is the coach→player publish gate**
  (`publishReview`, `shareReviewWithPlayer`, 15 NULL workflow columns): a
  superseded model, not a missing button. Reviews already reach the player;
  there is no gate left to open.
- **The golf admin dashboard is not "mostly components with no page".** It is
  live, and W14 is a *planned* retirement that has been explicitly HELD three
  times in `helm-bridge/EXECUTION_LOG.md`. My audit independently
  rediscovered W14's scope rather than finding something new.
- **`admin-data.ts` must never be deleted** (W14's own cardinal rule — the
  Bridge's rollup modules depend on it). My report was too aggressive.
- **Three `loading.tsx` files were false positives** — I under-seeded Next.js
  convention files in the reachability graph.

## New, that W14 did not anticipate

Four files are orphaned *inside* the live CRM subtree, which W14's cardinal
rule protects wholesale: `PipelineKanban.tsx`, `ContactLogModal.tsx` and
`TasksDueWidget.tsx` have zero importers, and `PipelineCard` / `PipelineColumn`
are imported only by the orphaned Kanban. Part of `crm/**` is already dead.

## W14a — computed manifest

Gates run per the plan, nothing deleted by name:

- **142 files kept** because `crm/**` reaches them transitively — including the
  four the CRM imports from outside its own tree (`components/coach/CoachPageHeader`,
  `CoachInfoBlock`, `CoachAttachmentsBlock`, `components/timeline/CoachTimeline`).
- **85 files safe to delete**, **0 blocked** — every candidate proved to have no
  importer surviving the wave.
- **Task 4 is BLOCKED.** It edits `src/app/golf/actions/auth.ts` (the admin
  login redirect) and that file is uncommitted in this shared tree — another
  session owns it. Splitting is safe: the new `/golf/admin` redirect absorbs a
  stale login target, costing one hop.

Coupling the plan did not list, which must move in the same commit:
`src/lib/admin/feature-registry.ts` and
`src/app/golf/actions/__tests__/coverage-contract.b0.test.ts` both reference
the doomed action files **by path string**, and `feature-registry.ts` drives
the Bridge's own Feature Health board.

## Settled — second round

| # | Question | Decision |
|---|---|---|
| 9 | The coach→player publish gate on reviews | **Delete it — vestigial.** Remove `publishReview` / `shareReviewWithPlayer`; the 15 workflow columns go in a migration. |
| 10 | Decision Room + daily contracts ("that's seed data but fix it") | **Make them reachable and usable.** Find what blocks the write and fix it. |
| 11 | How to handle database changes | **Write migrations, do not apply.** Nothing touches production from here. |
| 12 | The other 16 writerless tables | **Case-by-case — show me first,** with cost-to-keep per table. |
| 13 | Message attachments / video events / saved lineups | **All three should work.** Investigate what blocks each write and fix. |
| 14 | `process-sequences` | **Investigate and report** which runner actually sends CRM sequences today. |
| 15 | Which v3 crons to schedule | **`v3/ingest-sync` only.** The two backfills stay manual — that is what backfills are for. |

## Work order

**Code — authorised, reversible, doing now**

1. **W14a** — 85 files deleted, `golf/admin/page.tsx` → redirect, plus the two
   coupled files the plan missed (`feature-registry.ts`,
   `coverage-contract.b0.test.ts`). Task 4 (`auth.ts`) deferred: another
   session holds that file.
2. **Delete the review publish half** — `publishReview`,
   `shareReviewWithPlayer` and their callers-of-none.
3. **Delete the 9 files** all three tools agree are dead, under
   `src/components/ui/`.
4. **Schedule `v3/ingest-sync`** in `vercel.json`. Nothing else.

**Investigations — report before changing anything**

5. `process-sequences` — script or route, which one is live.
6. Decision Room + daily contracts — what blocks a real write.
7. Message attachments, video events, saved lineups — same, per cluster.
8. The 16 writerless tables — a cost-to-keep table for the owner to decide from.

**Migrations — written, NOT applied**

9. Graveyard the 5 baseball event tables and `audit_log`.
10. Drop `golf_events.rsvp_deadline` / `max_attendees`, once proven uncalled.
11. Drop the 15 dead `golf_round_reviews` workflow columns.
12. Drop the 290 never-scanned, non-unique, non-constraint indexes.

**Build — larger, after the above**

13. Lift Lab wellness materializer (schedule → request).
14. Recurring events and cancellation, to production.
