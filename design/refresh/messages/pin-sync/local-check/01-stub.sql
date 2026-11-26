-- Stand-ins for the Supabase objects the draft needs (auth.uid, realtime.send, realtime.messages and roles).
-- Scratch Postgres 16 only. Never run against staging or production.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema helm_private; create schema realtime;
grant usage on schema auth, realtime, public to anon, authenticated, service_role;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
create table public.golf_conversations (id uuid primary key, team_id uuid);
create table public.golf_conversation_participants (conversation_id uuid references public.golf_conversations(id) on delete cascade, user_id uuid references auth.users(id), hidden_at timestamptz, last_read_at timestamptz, primary key (conversation_id, user_id));
alter table public.golf_conversation_participants enable row level security;
create policy p_sel on public.golf_conversation_participants for select to authenticated using (true);
create policy p_upd on public.golf_conversation_participants for update to authenticated using (user_id = auth.uid());
grant select, update on public.golf_conversation_participants to authenticated;
grant select on public.golf_conversations to authenticated;
create table realtime.messages (id bigserial primary key, topic text, extension text, event text, payload jsonb, private boolean);
alter table realtime.messages enable row level security;
grant select on realtime.messages to authenticated;
create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
grant execute on function realtime.topic() to authenticated;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql security definer as $$ insert into realtime.messages(topic, extension, event, payload, private) values (topic, 'broadcast', event, payload, private) $$;
