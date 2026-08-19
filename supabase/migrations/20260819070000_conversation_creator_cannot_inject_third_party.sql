-- Conversation creators can no longer inject a third party into an existing thread.
--
-- --- THE DEFECT ------------------------------------------------------------
--
-- The INSERT policy's creator branch authorized a row on the sole basis that
-- the acting user created the conversation. It carried no bound on WHICH row
-- and no bound on WHEN -- so participation in a settled thread was not
-- restricted to the moment the thread was formed, and the SELECT policy grants
-- a participant the conversation's full prior history.
--
-- Confirmed by controlled reproduction inside a rolled-back transaction against
-- a copy of live data, not by reading the catalog alone. The reproduction
-- details, the affected row counts and the impact assessment are deliberately
-- NOT in this repository -- it is public, and this migration may sit unapplied
-- for a while. They live with the 2026-08-19 audit material outside the repo.
--
-- Not reachable through the application: the shared `createConversation`
-- (src/app/actions/messages.ts:392-402) adds participants at creation time and
-- the product has no add-participant-later flow. That bounds who is likely to
-- have exercised it. It does not bound the policy, which is the only control.
--
-- --- WHY THE PREVIOUS HARDENING MISSED IT -----------------------------------
--
-- `20260807080000_golf_dm_join_requires_creator.sql` fixed the SELF-add branch
-- of this same policy after a verified production attack (the Shenandoah
-- dual-squad case: a Men's player self-joining a Women's DM through a misfiled
-- team_id). It hardened the branch where `user_id = auth.uid()` and left the
-- creator branch exactly as it was. The creator branch is the one that lets you
-- add SOMEONE ELSE, which is strictly worse.
--
-- --- THE PREDICATE, AND THE TWO WAYS TO GET IT WRONG ------------------------
--
-- The creator may insert only while NO NON-CREATOR PARTICIPANT EXISTS YET.
--
-- 1. NOT "zero existing participants". `createConversation` inserts the creator
--    FIRST (:392-393) and the others in a SEPARATE statement (:396-402). By the
--    time the batch runs, one participant -- the creator -- already exists. A
--    zero-participants predicate would block every conversation the product
--    creates, including 1:1 DMs.
--
-- 2. The outer reference MUST be table-qualified. Written as
--    `WHERE p.conversation_id = conversation_id`, the bare column binds to
--    `p.conversation_id` (innermost scope wins, and aliasing the table does not
--    hide its column names). The clause degenerates to `p.x = p.x`, true for
--    every row in the table, and the guard blocks everything. Postgres's own
--    deparse of the existing policy qualifies it the same way; that is not
--    stylistic.
--
-- Correctness rests on statement-snapshot semantics: a WITH CHECK subquery runs
-- under the current command's snapshot, and rows inserted by that same command
-- carry the same cmin and are invisible to it. So each row of the others-batch
-- evaluates against {creator} alone and passes, while a later insert into a
-- settled thread sees a non-creator participant and is refused.
--
-- --- BASEBALL GETS THE SAME FIX, PLUS THE ONE GOLF ALREADY HAD --------------
--
-- `baseball_participants_insert_by_creator` carries the identical creator
-- branch. Its FIRST branch is also still the pre-hardening shape golf has since
-- fixed -- `user_id = auth.uid() AND baseball_conversation_on_my_team(...)` --
-- which lets any teammate self-add to a private baseball DM and read it. Both
-- are corrected here.
--
-- Baseball is seed data that nobody uses (owner, 2026-08-19), so these are real
-- defects with no victim. They are fixed in the same migration because the
-- predicate is identical and leaving a known-reproduced hole open in one sport
-- while closing it in the other is how it gets forgotten.
--
-- --- SAFETY -----------------------------------------------------------------
--
-- Strictly reducing on both tables. Every INSERT this permits was already
-- permitted; it removes a subset. No new access path is created, and no
-- existing application flow changes -- creation still works because the
-- predicate was chosen against the actual two-statement insert order rather
-- than against an assumed one.
--
-- --- VALIDATED AGAINST LIVE DATA BEFORE WRITING -----------------------------
--
-- The predicate was checked against every golf conversation that exists, to
-- confirm it could not have blocked one that legitimately does:
--
--   is_team_chat | convs | creator NOT a participant | participants | max non-creator
--   -------------+-------+--------------------------+--------------+----------------
--   false (DMs)  |   5   |            0             |    2 .. 2    |       1
--   true (team)  |   6   |            0             |    2 .. 13   |      12
--
-- The load-bearing column is the third: in 11 of 11 conversations the creator
-- IS among the participants, so branch 1 always covers the creator's own row
-- and branch 2 is only ever asked about other people. A DM is creator + 1, so
-- the others-batch inserts a single row while only the creator exists. The
-- 13-participant team chat is covered by branch 1 for later self-joins and by
-- the pre-statement snapshot for a bulk creation.
--
-- Had any conversation shown creator-not-a-participant, this predicate would
-- have been wrong and the migration would not have been written this way.
--
-- NOT APPLIED BY THE AUTHORING SESSION. Docker was unavailable, so the
-- clean-room local-stack replay could not be exercised. Ships in the PR for
-- deliberate application.

begin;

-- --- GOLF -------------------------------------------------------------------
drop policy if exists golf_participants_insert_v2 on public.golf_conversation_participants;

create policy golf_participants_insert_v2 on public.golf_conversation_participants
  for insert
  with check (
    -- Branch 1 -- adding YOURSELF. Unchanged from the 2026-08-07 hardening.
    (
      user_id = (select auth.uid())
      and (
        golf_conversation_created_by_me(conversation_id)
        or exists (
          select 1
            from public.golf_conversations c
           where c.id = golf_conversation_participants.conversation_id
             and c.is_team_chat = true
             and c.team_id is not null
             and golf_conversation_on_my_team(golf_conversation_participants.conversation_id)
        )
      )
    )
    -- Branch 2 -- the creator adding OTHERS, now bounded to creation time.
    or (
      exists (
        select 1
          from public.golf_conversations gc
         where gc.id = golf_conversation_participants.conversation_id
           and gc.created_by = (select auth.uid())
      )
      and not exists (
        select 1
          from public.golf_conversation_participants p
         where p.conversation_id = golf_conversation_participants.conversation_id
           and p.user_id <> (select auth.uid())
      )
    )
  );

-- --- BASEBALL ---------------------------------------------------------------
drop policy if exists baseball_participants_insert_by_creator on public.baseball_conversation_participants;

create policy baseball_participants_insert_by_creator on public.baseball_conversation_participants
  for insert
  with check (
    -- Branch 1 -- adding YOURSELF. Previously team-membership-only, which let a
    -- teammate self-add to a private DM. Now mirrors golf: your own thread, or a
    -- genuine team chat.
    (
      user_id = (select auth.uid())
      and (
        exists (
          select 1
            from public.baseball_conversations c
           where c.id = baseball_conversation_participants.conversation_id
             and c.created_by = (select auth.uid())
        )
        or exists (
          select 1
            from public.baseball_conversations c
           where c.id = baseball_conversation_participants.conversation_id
             and c.is_team_chat = true
             and c.team_id is not null
             and baseball_conversation_on_my_team(baseball_conversation_participants.conversation_id)
        )
      )
    )
    -- Branch 2 -- the creator adding OTHERS, bounded to creation time.
    or (
      exists (
        select 1
          from public.baseball_conversations gc
         where gc.id = baseball_conversation_participants.conversation_id
           and gc.created_by = (select auth.uid())
      )
      and not exists (
        select 1
          from public.baseball_conversation_participants p
         where p.conversation_id = baseball_conversation_participants.conversation_id
           and p.user_id <> (select auth.uid())
      )
    )
  );

commit;

-- --- VERIFICATION (run after applying) --------------------------------------
--
-- Two checks, and BOTH are required. Testing only the refusal would pass
-- against a predicate that blocks all conversation creation.
--
--   1. REFUSAL. As a conversation's creator, in a rolled-back transaction,
--      attempt to add a user to a thread that already holds a participant other
--      than the creator. Expect 42501.
--
--   2. CREATION STILL WORKS. Create a conversation, insert self, then insert
--      two other participants in a SECOND statement. Both statements must
--      succeed -- this is the exact two-statement order the application uses,
--      and it is what a naive "zero existing participants" predicate breaks.
