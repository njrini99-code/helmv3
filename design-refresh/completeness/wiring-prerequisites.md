# Wiring report: prerequisites (N-00, N-10), 4 Nov 2026

Scope per the owner: only what the practice-plan, Ask and Quick chat lanes call. Every other N-00 and N-10 screen is marked "not in this build: minimum prerequisites only". I appended a `## Wiring, 4 Nov 2026` section to the end of each plan file.

## Where the SQL is
N-00 `20261026010000` to `010800` and N-10 `20261026090000` to `090300` exist **only as fenced SQL inside the plan text** (N-00 8.2 to 8.10, N-10 8.2 to 8.5). They are not `.sql` files in the package or in the repo; the repo's migrations end at `20261028140800`, and `HELD.md` has no rows for them. Slice 0 copies each block verbatim into `supabase/migrations/` and adds the plan's HELD rows. This build needs only one N-10 file: 090300, narrowed.

## 1. Gaps found and closed (7)
- Data (1): `public_body` (N-00 8.8) now also strips `why` and `coach_why`, so CoachHelm Why lines never reach a version that players can read.
- Actions (2): drafts in Documents are filed through the practice-plan lane's `golf_practice_plan_file_draft`, because 010400 forbids coach plan-row inserts. N-10 090300 is narrowed in place to `practice_plan_id IS NOT NULL OR folder <> 'practice plans'` (Nick's call, DECISIONS "Folders"). N-10 8.9's update rule now allows `folder` (Move) on plan rows and refuses only a file moving into "Practice plans".
- Notifications (2): `practice_plan` needs a `pushDeliveryKeyFor` case (`push_events`) and a payload case in `push.ts`. Without them it ignores the Events switch and opens the app root. The fan-out batches by distinct body.
- Flags (1): neither `golf_practice_plans` nor `golf_documents_library` is in `feature-flags.yml`. Both read false, so today's path stands.
- Handoffs (1): event first goes through `createGolfEvent` (`calendar-events.ts:537`); `golf_practice_plan_save` refuses all-day and non-practice events.

## 2. Citations that moved (f30a6d5 to 03d9087), listed in each Wiring section
- N-00: `functions/public.sql` 6964/7000 → 7345/7381, `10_tables.sql` 664-681/670 → 683-701/689 and 1131-1132 → 1152-1153, `HELD.md` register 153 → 155.
- N-10: `documents.ts` 193/200/204-208 → 202/209/203-216, 534-590/556-558 → 536-598/564 (fixed in place), 1597 → 1605 (fixed in place), 1123-1128/1153-1218 → 1134-1135/1141-1222; `public.sql` 6964-6976 → 7345-7358; `golf.sql` 1096 → 1122; `hub.ts` 310-316 → 317-330; `database.ts` 13129 → 13258.
- PR 2361 and PR 2362 are merged on main.

## 3. New held migrations
None in the prerequisites block. The one file that extends N-00's tables belongs to the practice-plan lane: `20261104090000`, see wiring-practice-plan.md.

## 4. Product calls for Nick
None.

## 5. For shared files
None beyond the START_HERE line in wiring-practice-plan.md.
