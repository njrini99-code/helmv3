-- Behaviour check run on 3 Nov 2026 against the draft on scratch Postgres 16: every line passed (see README.md).
\set ON_ERROR_STOP 1
\set A 'a0000000-0000-0000-0000-00000000000a'
\set B 'b0000000-0000-0000-0000-00000000000b'
create or replace function pg_temp.expect_err(sql text, msg text) returns text language plpgsql as $$
begin execute sql; return 'FAIL no error for '||msg; exception when others then
 if sqlerrm = msg then return 'ok '||msg; else return 'FAIL got '||sqlerrm||' want '||msg; end if; end $$;
set role authenticated; set request.jwt.claim.sub = :'A';
select 'pin1', golf_pin_conversation('c0000000-0000-0000-0000-000000000001', true)->'pins';
select 'pin2', golf_pin_conversation('c0000000-0000-0000-0000-000000000002', true)->'pins';
select 'pin3', golf_pin_conversation('c0000000-0000-0000-0000-000000000003', true)->'pins';
select 'pin again idempotent', golf_pin_conversation('c0000000-0000-0000-0000-000000000003', true)->'pins';
select pg_temp.expect_err($$select golf_pin_conversation('c0000000-0000-0000-0000-000000000004', true)$$, 'pin_limit');
select 'other team scope', golf_pin_conversation('c0000000-0000-0000-0000-000000000005', true)->'pins';
select pg_temp.expect_err($$select golf_pin_conversation('c0000000-0000-0000-0000-000000000009', true)$$, 'not_a_member');
select pg_temp.expect_err($$insert into golf_conversation_pins values ('a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-000000000004',null,0)$$, 'permission denied for table golf_conversation_pins');
select 'unpin middle', golf_pin_conversation('c0000000-0000-0000-0000-000000000002', false)->'pins';
select 'positions', string_agg(position::text, ',' order by position) from golf_conversation_pins where team_id='11111111-1111-1111-1111-111111111111';
select pg_temp.expect_err($$select golf_reorder_conversation_pins('11111111-1111-1111-1111-111111111111', array['c0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000002']::uuid[])$$, 'pins_changed');
select 'reorder', golf_reorder_conversation_pins('11111111-1111-1111-1111-111111111111', array['c0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000001']::uuid[])->'pins';
update golf_conversation_participants set hidden_at = now() where conversation_id='c0000000-0000-0000-0000-000000000003' and user_id = :'A';
select 'after hide', (select count(*) from golf_conversation_pins where conversation_id='c0000000-0000-0000-0000-000000000003'), string_agg(position::text, ',') from golf_conversation_pins where team_id='11111111-1111-1111-1111-111111111111';
set realtime.topic = 'golf-pins:a0000000-0000-0000-0000-00000000000a';
select 'A sees own broadcasts', count(*), max(payload::text) from realtime.messages;
set request.jwt.claim.sub = :'B';
select 'B sees A pins rows', count(*) from golf_conversation_pins;
select 'B sees A topic', count(*) from realtime.messages;
select 'B unpin other user conv (no-op)', golf_pin_conversation('c0000000-0000-0000-0000-000000000005', false);
reset role;
select 'A pin of c5 survived B', count(*) from golf_conversation_pins where conversation_id='c0000000-0000-0000-0000-000000000005';
delete from golf_conversation_participants where conversation_id='c0000000-0000-0000-0000-000000000005';
select 'after leave', count(*) from golf_conversation_pins where conversation_id='c0000000-0000-0000-0000-000000000005';
delete from golf_conversations where id='c0000000-0000-0000-0000-000000000001';
select 'after conv delete', count(*) from golf_conversation_pins;
set role anon; select pg_temp.expect_err($$select golf_pin_conversation('c0000000-0000-0000-0000-000000000002', true)$$, 'permission denied for function golf_pin_conversation');
