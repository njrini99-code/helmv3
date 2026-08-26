begin;

select plan(2);

select has_index(
  'public',
  'golf_rounds',
  'golf_rounds_qualifier_player_round_number_uq',
  'Qualifier rounds have a unique per-player slot index'
);

select is(
  (
    select indexdef
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'golf_rounds'
      and indexname = 'golf_rounds_qualifier_player_round_number_uq'
  ),
  'CREATE UNIQUE INDEX golf_rounds_qualifier_player_round_number_uq ON public.golf_rounds USING btree (qualifier_id, player_id, qualifier_round_number) WHERE ((qualifier_id IS NOT NULL) AND (qualifier_round_number IS NOT NULL) AND (status IS DISTINCT FROM ''abandoned''::text))',
  'The slot index permits abandoned history but forbids duplicate active or submitted qualifier rounds'
);

select * from finish();
rollback;
