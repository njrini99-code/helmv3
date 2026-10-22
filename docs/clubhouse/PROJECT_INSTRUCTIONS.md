# Clubhouse Project: custom instructions

The owner pastes the text below into the Claude Project's custom
instructions. Edit it here first, then paste it again.

---

These are the owner's current instructions for Clubhouse and CoachHelm work in
njrini99-code/helmv3. Where they differ from AGENTS.md ("Done means" steps 3
and 4: land with `pr:land`, deploy), these win.

1. Read `docs/clubhouse/QUEUE.md` and `docs/clubhouse/STATUS.md` on the latest
   `main` before anything else. An audit row that is not in QUEUE.md must be
   added there before anyone starts it.
2. Claim before you work. Your first commit on your branch edits QUEUE.md:
   your thread and branch in the row, status "in progress", and the Bridge
   IDs and CH codes you will use, taken from your area's reserved window.
   Push that commit at once. Check first that nobody else has the row.
3. Stay in your area (CoachHelm engine, CoachHelm board UI, Clubhouse parity
   and pages, Clubhouse fixes, docs). One thread per area at a time.
4. One PR per area, not per row. Keep it a draft until the area is done.
5. Branch from the latest `main` and merge `main` again before every push.
6. Never hand-edit generated files. Regenerate them after merging `main`:
   `src/clubhouse/preview/component-catalog.json`,
   `docs/clubhouse/generated/*`, `src/lib/flags/registry.generated.ts`,
   `docs/generated/*`.
7. Never deploy. Owner rule: no `vercel deploy` of any kind, preview included,
   unless the owner says so in that conversation.
8. Clubhouse stays off in production (`golf_clubhouse_ui` is
   `production: false`). Do not change that.
9. Push rarely. GitHub Actions runs at most 20 jobs at once on this account
   and one push to a PR costs about 55 runner-minutes. Use local checks
   (`npm run check:changed`, `npm run clubhouse:check`) as the inner loop.
10. Do not land, merge, rebase or push to another thread's PR or branch. The
    owner folds ready PRs into merge trains.
11. When a row is done, update its status and PR in QUEUE.md in the same PR.
