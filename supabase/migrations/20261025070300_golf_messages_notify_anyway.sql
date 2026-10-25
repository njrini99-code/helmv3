-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner
-- (supabase/migrations/HELD.md).
-- Apply: npm run db:apply -- <this file>
--
-- Clubhouse P-10 "Notify anyway": a coach can send one message that skips the
-- class hold. The flag lives on the message so both sides can show "Notified
-- anyway" and the fan-out can read it. With the 2026-10-25 review fixes (Must
-- 3,
-- Should 14).
--
-- golf_messages.notify_anyway        default false; never changes after insert
-- golf_messages.notify_anyway_pushed_at  set by the fan-out (service role)
-- after a
--                                    real delivery; the "Notified anyway"
-- caption
--                                    shows only once it is set, because a
-- player
--                                    with message pushes off receives nothing
-- and
--                                    the app must not claim otherwise
--
-- Only a coach OF THE CONVERSATION'S TEAM sending as themselves can set the
-- flag:
-- auth.uid() = sender_id, the conversation's team_id is not null, and
-- is_golf_team_coach(team_id). A bare golf_coaches row is not enough, because
-- golf_coaches_insert_own lets anyone create one. A conversation with no team
-- (team_id is nullable, ON DELETE SET NULL) can never carry the flag. A BEFORE
-- INSERT trigger resets it otherwise.
--
-- Table locked while this runs: golf_messages (ADD COLUMN x2 and two triggers;
-- the
-- boolean default is a metadata-only change on PG 11+). The lock_timeout gives
-- up
-- instead of queueing behind a long transaction on a busy table.
-- Risk: LOW. Two additive columns, two narrow triggers that fire only when a
-- flag
-- is set or changes. Independent of the other P-10 files.
-- pgTAP: supabase/tests/rls/golf_messages_notify_anyway.sql
--
-- ROLLBACK:
-- supabase/rollbacks/20261025070300_golf_messages_notify_anyway.rollback.sql
-- ROLLBACK: order: independent of 070000 to 070200; ship the app without the
-- column first (it only sends the key when class_awareness_v1 is on).
-- VERIFY: select 1 where exists (select 1 from information_schema.columns where
-- VERIFY: table_schema = 'public' and table_name = 'golf_messages' and
-- VERIFY: column_name = 'notify_anyway' and is_nullable = 'NO') and exists
-- VERIFY: (select 1 from information_schema.columns where table_schema =
-- VERIFY: 'public' and table_name = 'golf_messages' and column_name =
-- VERIFY: 'notify_anyway_pushed_at');
-- VERIFY: select 1 where exists (select 1 from pg_trigger where tgname =
-- VERIFY: 'golf_messages_notify_anyway_insert' and not tgisinternal) and exists
-- VERIFY: (select 1 from pg_trigger where tgname =
-- VERIFY: 'golf_messages_notify_anyway_update' and not tgisinternal) and not
-- VERIFY: has_function_privilege('anon',
-- VERIFY: 'public.golf_messages_notify_anyway_guard()', 'execute') and not
-- VERIFY: has_function_privilege('authenticated',
-- VERIFY: 'public.golf_messages_notify_anyway_guard()', 'execute');

SET lock_timeout = '3s';

ALTER TABLE public.golf_messages
ADD COLUMN IF NOT EXISTS notify_anyway boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS notify_anyway_pushed_at timestamptz;

CREATE OR REPLACE FUNCTION public.golf_messages_notify_anyway_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_service boolean := coalesce(auth.role(), '') = 'service_role';
begin
  if tg_op = 'INSERT' then
    if new.notify_anyway and not (
      auth.uid() is not null
      and new.sender_id = auth.uid()
      and exists (
        select 1 from public.golf_conversations c
        where c.id = new.conversation_id
          and c.team_id is not null
          and public.is_golf_team_coach(c.team_id)
      )
    ) then
      new.notify_anyway := false;
    end if;
    -- The delivery stamp is the fan-out's alone, and means nothing without the flag.
    if new.notify_anyway_pushed_at is not null and not (v_service and new.notify_anyway) then
      new.notify_anyway_pushed_at := null;
    end if;
  else
    new.notify_anyway := old.notify_anyway;
    if old.notify_anyway_pushed_at is not null          -- set once
       or not old.notify_anyway                         -- only a flagged message gets a stamp
       or not v_service then                            -- only the service role stamps
      new.notify_anyway_pushed_at := old.notify_anyway_pushed_at;
    end if;
  end if;
  return new;
end $$;

DROP TRIGGER IF EXISTS golf_messages_notify_anyway_insert
ON public.golf_messages;
CREATE TRIGGER golf_messages_notify_anyway_insert
BEFORE INSERT ON public.golf_messages
FOR EACH ROW
WHEN (new.notify_anyway OR new.notify_anyway_pushed_at IS NOT null)
EXECUTE FUNCTION public.golf_messages_notify_anyway_guard();

DROP TRIGGER IF EXISTS golf_messages_notify_anyway_update
ON public.golf_messages;
CREATE TRIGGER golf_messages_notify_anyway_update
BEFORE UPDATE OF notify_anyway, notify_anyway_pushed_at ON public.golf_messages
FOR EACH ROW
WHEN (
    new.notify_anyway IS DISTINCT FROM old.notify_anyway
    OR new.notify_anyway_pushed_at IS DISTINCT FROM old.notify_anyway_pushed_at
)
EXECUTE FUNCTION public.golf_messages_notify_anyway_guard();

REVOKE ALL ON FUNCTION public.golf_messages_notify_anyway_guard() FROM public,
anon,
authenticated;
