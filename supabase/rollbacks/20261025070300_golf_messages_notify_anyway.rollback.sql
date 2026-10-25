-- ROLLBACK CAPTURE for
-- supabase/migrations/20261025070300_golf_messages_notify_anyway.sql
--
-- Forward change (held, not applied): adds golf_messages.notify_anyway and
-- golf_messages.notify_anyway_pushed_at, the guard function and two triggers.
-- Prior definitions: none; every object is new.
--
-- What rolling back costs: the "Notified anyway" caption and any history of which
-- messages were sent that way are lost with the columns. The app only sends and
-- selects the columns while class_awareness_v1 is on, so turn the flag off first;
-- with the flag on and the columns gone, message sends would be refused.
--
-- Metadata: forward change carried by the PR that adds this file (record its merge SHA
-- in the production rollout ledger); capture date 2026-10-25; approval record:
-- Production rollout ledger row on apply; Sentry watch window: the apply time plus 24
-- hours, surface messages.send.

SET lock_timeout = '3s';

drop trigger if exists golf_messages_notify_anyway_update on public.golf_messages;
drop trigger if exists golf_messages_notify_anyway_insert on public.golf_messages;
drop function if exists public.golf_messages_notify_anyway_guard();
alter table public.golf_messages drop column if exists notify_anyway_pushed_at;
alter table public.golf_messages drop column if exists notify_anyway;
