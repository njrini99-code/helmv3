# Wiring report: practice-plan, 4 Nov 2026

Checked against helmv3 03d9087, read only. Written: `practice-plan/06-SCREEN-SPECS.md` and `08-ACCEPTANCE.md` (`## Wiring, 4 Nov 2026`, W-PP-1 to 17, pointers under each H1), in-place fixes in `02-PLAN.md` (marked "fixed 4 Nov wiring"), two held files in `practice-plan/held-migrations/`.

## 1. Gaps found and closed (13)
- Data (3): CoachHelm Why lines had nowhere to live on a saved plan (they reopen in Documents, on the plan page and in print). Fix: coach-only `golf_practice_plans.coach_why`. Wrong save signature in §6.2 (`p_team_id, p_plan_id, p_body`), now `(p_event_id, p_plan_id, p_expected_version, p_title, p_step, p_body)`. PM1 existed only as a table row; the file is now written.
- Actions (3): N-00 010400 blocks a coach inserting a plan row in Documents, so a draft could not be filed (settled call 3). Fix: definer `golf_practice_plan_file_draft`. Publish `notify: 'defer'` and take down `revertToDraft` need no SQL: 010600 notifies nobody, and take_down already goes back to draft with `is_public false`. The stream route has no `after()` import today.
- Privacy (1): every team player can read the live version body under RLS. Why stays out of the body, and `public_body` now strips `why` and `coach_why` (N-00 8.8).
- Notifications (3): `practice_plan` is not a push type, and the `default` branch would ignore the Events switch and link to the app root. Fix: two additive cases in `push.ts` (43, 100), made in N-00 slice 3. The bulk push and bell take one payload, so recipients are grouped by body. The chat post's double push: there is no skip list, so the post uses `sendMessage({..., createNotifications: false})` (`messages.ts:334`) to the `is_team_channel` conversation.
- Flags (1): neither flag is in `feature-flags.yml`. Unknown flags read false, so flag off is today's path.
- Handoffs (2): one drill bank (`createTeamDrill` / `copyLibraryDrill`) and one folder model (by name, `file_draft`, Move through `updateDocument`). Both now named in each row. Event first goes through `createGolfEvent` (`calendar-events.ts:537`).

## 2. Citations that moved
None of 02's cited lines moved between 75b4956 and 03d9087. I re-checked about 45 of them: documents.ts, agent-tools.ts, route.ts, action-runs.ts, push.ts, in-app.ts, Toast, motion, FormSheet, Proposals, hub.ts, CI files and the baseline. Lines added this pass: `push.ts:43/100`, `messages.ts:334/786`, `calendar-events.ts:3/537`, `ActionCard.tsx:42`.

## 3. New held migrations
- `practice-plan/held-migrations/20261102090000_golf_practice_plan_formats.sql`: PM1, as 02 §14 described it. HELD row: `| \`20261102090000_golf_practice_plan_formats.sql\` | **HOLD** | Practice-plan lane PP7. New table golf_practice_plan_formats (one layout per team, coaches only, four policies, anon revoked). No trigger, no round path. Apply with N-00's 20261026010000 to 010800. Pending owner. | 2026-11-04 |`
- `practice-plan/held-migrations/20261104090000_golf_practice_plan_coach_why_and_draft_row.sql`: `golf_practice_plans.coach_why jsonb` (coach-only table) and `golf_practice_plan_file_draft(uuid, integer, text, jsonb)` (definer, coach-checked, files the draft row with `is_public false` in the chosen folder and never sets it true). No N-00 file covers either: 010400 forbids coach plan-row inserts, and the body is copied into player-readable versions. HELD row: `| \`20261104090000_golf_practice_plan_coach_why_and_draft_row.sql\` | **HOLD** | Practice-plan lane PP4. Adds coach-only golf_practice_plans.coach_why and golf_practice_plan_file_draft (definer; files a draft plan as a coach-only Documents row). Needs N-00 20261026010000, 010400, 010600 first. No trigger, no round path. Pending owner. | 2026-11-04 |`

## 4. Product calls for Nick
None. The 090300 narrowing was already confirmed (DECISIONS "Folders", 4 Nov). Engineering calls I made:
- Undo of a publish uses take_down. The frozen v1 stays (not live), so the next publish is v2.
- The bell row has no per-user switch, the same as every `event_reminder` row today.

## 5. For shared files (lead to apply)
- DECISIONS.md, Ask row "Drill flow" (line 26) still says "until a held `golf_drills.team_id` migration runs". Proposed text: "Default: drills built but off until N-00's held `golf_team_drills` (`20261026010100`) runs; Ask's HM5 is superseded".
- START_HERE.md section 4 row 11b, add: "Held SQL for N-00 and N-10 is inside their plan files (8.x blocks); slice 0 copies it to files. The practice-plan lane's two held files are in `practice-plan/held-migrations/`."
