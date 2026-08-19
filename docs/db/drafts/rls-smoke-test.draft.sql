begin;

create temporary table test_results (
  step text,
  outcome text,
  detail text
) on commit drop;

do $test$
declare
  v_creator uuid := '45f0e995-d52e-4c3c-96ec-4a8bf00cf6d0';
  v_a uuid := 'ec0277c5-2172-f004-5527-8a4a2e33dad6';
  v_b uuid := '2a8f02e2-adfd-37bd-0ab6-b64dde31363e';
  v_c uuid := 'cd2ec785-a3ac-3f19-1f3c-fcf15ef7a1c0';
  v_conv uuid := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  v_real_conv uuid := 'ab10422a-dc65-4abc-944c-ec4fbdf3a7bb';
  v_real_creator uuid := 'cf4a4e43-7944-4471-9e07-c78b5595480c';
  v_stranger uuid := 'ec5ab0a6-2eb8-46d4-df27-169bd636e1c8';
  v_msg_count int;
  v_cur_user text;
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', v_creator, 'role','authenticated')::text);

  select current_user into v_cur_user;
  insert into test_results values ('0_context', 'INFO', 'current_user=' || v_cur_user);

  begin
    insert into golf_conversations (id, team_id, is_team_chat, title, created_by)
    values (v_conv, null, false, 'RLS TEST rollback only', v_creator);
    insert into test_results values ('A_create_conversation', 'ALLOW', 'conv=' || v_conv);
  exception when others then
    insert into test_results values ('A_create_conversation', 'ERROR', sqlstate || ' ' || sqlerrm);
  end;

  begin
    insert into golf_conversation_participants (conversation_id, user_id, joined_at)
    values (v_conv, v_creator, now());
    insert into test_results values ('1_self_insert', 'ALLOW', null);
  exception when others then
    insert into test_results values ('1_self_insert', 'ERROR', sqlstate || ' ' || sqlerrm);
  end;

  begin
    insert into golf_conversation_participants (conversation_id, user_id, joined_at)
    values (v_conv, v_a, now()), (v_conv, v_b, now());
    insert into test_results values ('2_bulk_insert_A_and_B_one_statement', 'ALLOW', 'matches real createConversation code path (othersParticipantIds.map -> single .insert call)');
  exception when others then
    insert into test_results values ('2_bulk_insert_A_and_B_one_statement', 'ERROR', sqlstate || ' ' || sqlerrm);
  end;

  begin
    insert into golf_conversation_participants (conversation_id, user_id, joined_at)
    values (v_conv, v_c, now());
    insert into test_results values ('3_later_separate_insert_of_C_after_AB_settled', 'ALLOW', 'this is the case main is worried about: separate statement after A+B already landed');
  exception when others then
    insert into test_results values ('3_later_separate_insert_of_C_after_AB_settled', 'ERROR', sqlstate || ' ' || sqlerrm);
  end;

  -- switch identity to a REAL production conversation's creator
  execute format('set local request.jwt.claims = %L', json_build_object('sub', v_real_creator, 'role','authenticated')::text);

  begin
    select count(*) into v_msg_count from golf_messages where conversation_id = v_real_conv;
    insert into test_results values ('4_real_creator_select_own_messages', 'ALLOW', 'count=' || v_msg_count);
  exception when others then
    insert into test_results values ('4_real_creator_select_own_messages', 'ERROR', sqlstate || ' ' || sqlerrm);
  end;

  begin
    insert into golf_conversation_participants (conversation_id, user_id, joined_at)
    values (v_real_conv, v_stranger, now());
    insert into test_results values ('5_inject_stranger_into_real_settled_conversation', 'ALLOW_VULNERABLE', 'this would be the original attack succeeding');
  exception when others then
    insert into test_results values ('5_inject_stranger_into_real_settled_conversation', 'DENY_BLOCKED', sqlstate || ' ' || sqlerrm);
  end;

end $test$;

select * from test_results order by step;

rollback;
