-- READ-ONLY simulation behind docs/operations/2026-09-30-sg-penalty-and-shot-end-before-after.md (Q-89).
-- SELECT only: it never calls recalculate_*/recompute_*/refresh_* and creates nothing. Run it against
-- production with `supabase db query --linked -f <file>`; one row per (round, variant) with the five SG legs.
-- Variants: V0 live function; V1 = V0 + penalty charged to the earning shot; V2 = V0 + next-shot-start;
-- V3 = both (what migration 20260930150000 installs); V4 = V3 + par-3 tee shots as Approach (no-op today:
-- every par-3 first shot is recorded as shot_type approach).
-- Basis: non-test completed rounds whose shots qualify for the shot-level path.
-- V0 live: shot end = own recorded end; penalty charged by the penalty row's own lie
-- V1: V0 + penalty charged to the shot that earned it (origin = previous real shot, else next, else itself)
-- V2: V0 + next-non-penalty-shot-start end state (held 20260928160000)
-- V3: V1 + V2  (the new migration)
-- V4: V3 + par-3 tee shots counted as Approach (TS getStrokesGainedCategory parity)
with r as (
  select id as round_id, player_id, holes_played,
         strokes_gained_total st, strokes_gained_tee stee, strokes_gained_approach sap,
         strokes_gained_around_green sag, strokes_gained_putting sp,
         sg_scale_for_player(player_id) sc
  from golf_rounds
  where status = 'completed' and not is_test
),
qual as (
  select distinct gs.round_id
  from golf_shots gs
  where gs.round_id in (select round_id from r)
    and gs.shot_type is not null and gs.lie_before is not null
    and gs.distance_to_hole_before is not null and gs.distance_to_hole_before > 0
    and (gs.distance_to_hole_after is not null or gs.putt_made = true or gs.result in ('holed','hole'))
),
n as (
  select gs.id, gs.round_id, gs.hole_id, gs.shot_number, gs.shot_type, gh.par, r.sc,
    case when gs.shot_type = 'putting' then 'green' else sg_normalize_lie(gs.lie_before) end as lie_b,
    case when gs.distance_unit_before = 'feet' then gs.distance_to_hole_before / 3.0 else gs.distance_to_hole_before end as d_b,
    (gs.putt_made = true or gs.result in ('holed','hole')) as is_holed,
    coalesce(gs.is_penalty, false) as is_pen,
    case when gs.putt_made = true or gs.result in ('holed','hole') then 0
         when gs.distance_to_hole_after is not null then
           case when gs.distance_unit_after = 'feet' then gs.distance_to_hole_after / 3.0 else gs.distance_to_hole_after end
         else case when lead(gs.distance_unit_before) over w = 'feet'
                   then coalesce(lead(gs.distance_to_hole_before) over w, 0) / 3.0
                   else coalesce(lead(gs.distance_to_hole_before) over w, 0) end end as d_a_own,
    case when gs.putt_made = true or gs.result in ('holed','hole') then 'green'
         when gs.lie_after is not null then sg_normalize_lie(gs.lie_after)
         else sg_normalize_lie(lead(gs.lie_before) over w) end as l_a_own,
    gs.distance_to_hole_after as raw_d_after, gs.distance_unit_after as raw_u_after, gs.lie_after as raw_lie_after
  from golf_shots gs
  join golf_holes gh on gh.id = gs.hole_id
  join r on r.round_id = gs.round_id
  where gs.round_id in (select round_id from qual)
    and gs.shot_type is not null
    and gs.distance_to_hole_before is not null and gs.distance_to_hole_before > 0
  window w as (partition by gs.hole_id order by gs.shot_number)
),
c as (
  select n.*,
    nx.d as nx_d, nx.l as nx_l,
    org.found as org_found, org.o_lie, org.o_type, org.o_d_yd
  from n
  left join lateral (
    select case when x.distance_unit_before = 'feet' then x.distance_to_hole_before / 3.0 else x.distance_to_hole_before end as d,
           case when x.shot_type = 'putting' then 'green' else sg_normalize_lie(x.lie_before) end as l
    from golf_shots x
    where x.hole_id = n.hole_id and x.shot_number > n.shot_number
      and not coalesce(x.is_penalty, false)
      and x.distance_to_hole_before is not null and x.distance_to_hole_before > 0
      and (x.lie_before is not null or x.shot_type = 'putting')
    order by x.shot_number limit 1
  ) nx on true
  left join lateral (
    select true as found, o.shot_type as o_type,
           case when o.shot_type = 'putting' then 'green' else sg_normalize_lie(o.lie_before) end as o_lie,
           case when o.distance_to_hole_before is null then null
                when o.distance_unit_before = 'feet' then o.distance_to_hole_before / 3.0
                else o.distance_to_hole_before end as o_d_yd
    from golf_shots o
    where n.is_pen and o.hole_id = n.hole_id and o.shot_number <> n.shot_number
      and not coalesce(o.is_penalty, false) and coalesce(o.shot_type, '') <> 'penalty'
    order by (o.shot_number < n.shot_number) desc,
             case when o.shot_number < n.shot_number then -o.shot_number else o.shot_number end
    limit 1
  ) org on true
),
s as (
  select c.*,
    case when is_pen then 0 else sg_expected_strokes(lie_b, d_b, sc) end as exp_b,
    case when is_pen then 0 when is_holed then 0 when d_a_own > 0 then sg_expected_strokes(l_a_own, d_a_own, sc) else 0 end as exp_a_own,
    case when is_pen then true else (is_holed or d_a_own > 0) end as has_own,
    -- held rule: end state = next non-penalty shot's start; own recorded end only for the last shot
    case when is_holed then 0 when nx_d is not null then nx_d
         when raw_d_after is not null then case when raw_u_after = 'feet' then raw_d_after / 3.0 else raw_d_after end
         else 0 end as d_a_next,
    case when is_holed then 'green' when nx_d is not null then nx_l
         when raw_lie_after is not null then sg_normalize_lie(raw_lie_after) else null end as l_a_next,
    case when shot_type = 'putting' then 'putting'
         when shot_type = 'tee' then 'off_tee'
         when shot_type = 'around_green' then 'around_green'
         else 'approach' end as cat_std,
    case when shot_type = 'putting' then 'putting'
         when shot_type = 'tee' then (case when par = 3 then 'approach' else 'off_tee' end)
         when shot_type = 'around_green' then 'around_green'
         else 'approach' end as cat_std_p3,
    case when lie_b = 'tee' then (case when par = 3 then 'approach' else 'off_tee' end)
         when lie_b = 'green' then 'around_green'
         when d_b <= 50 then 'around_green'
         else 'approach' end as pen_row,
    case when not coalesce(org_found, false) then
           case when lie_b = 'tee' then (case when par = 3 then 'approach' else 'off_tee' end)
                when lie_b = 'green' then 'around_green' when d_b <= 50 then 'around_green' else 'approach' end
         when o_lie = 'tee' then (case when par = 3 then 'approach' else 'off_tee' end)
         when o_lie = 'green' then 'around_green'
         when o_d_yd is not null and o_d_yd <= 50 then 'around_green'
         else 'approach' end as pen_org
  from c
),
s2 as (
  select s.*,
    case when is_pen then 0 when is_holed then 0 when d_a_next > 0 then sg_expected_strokes(l_a_next, d_a_next, sc) else 0 end as exp_a_next,
    case when is_pen then true else (is_holed or d_a_next > 0) end as has_next
  from s
),
v as (
  select round_id, x.variant, x.cat, x.sg
  from s2
  cross join lateral (values
    ('V0', case when is_pen then pen_row else cat_std end,    case when has_own  then exp_b - exp_a_own  - 1 end),
    ('V1', case when is_pen then pen_org else cat_std end,    case when has_own  then exp_b - exp_a_own  - 1 end),
    ('V2', case when is_pen then pen_row else cat_std end,    case when has_next then exp_b - exp_a_next - 1 end),
    ('V3', case when is_pen then pen_org else cat_std end,    case when has_next then exp_b - exp_a_next - 1 end),
    ('V4', case when is_pen then pen_org else cat_std_p3 end, case when has_next then exp_b - exp_a_next - 1 end)
  ) x(variant, cat, sg)
),
pr as (
  select round_id, variant,
    round(coalesce(sum(sg) filter (where cat = 'off_tee'), 0)::numeric, 3) as tee,
    round(coalesce(sum(sg) filter (where cat = 'approach'), 0)::numeric, 3) as app,
    round(coalesce(sum(sg) filter (where cat = 'around_green'), 0)::numeric, 3) as atg,
    round(coalesce(sum(sg) filter (where cat = 'putting'), 0)::numeric, 3) as putt
  from v group by 1, 2
)
select pr.round_id, pr.variant, pr.tee, pr.app, pr.atg, pr.putt, (pr.tee + pr.app + pr.atg + pr.putt) as total,
       r.player_id, r.holes_played, r.st, r.stee, r.sap, r.sag, r.sp
from pr join r on r.round_id = pr.round_id
