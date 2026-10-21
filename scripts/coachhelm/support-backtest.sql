-- Read-only export for scripts/coachhelm/support-backtest.ts (CoachHelm
-- Slice 1, 02-accuracy-standard §8). SELECT only; run it through a read-only
-- path (the Supabase MCP execute_sql, or psql on a read replica) and save the
-- single JSON cell it returns to a file.
--
-- One element per live v3 insight (engine v3, not archived, not dismissed,
-- lifecycle detected/tentative/matured): a flat object with short keys
-- holding only the evidence values the support pass reads (the script maps
-- them back; see SHORT_KEYS there). The player is replaced by a truncated md5
-- key, so the file carries no ids; no names, titles or content leave the
-- database. The generators' cause text is reduced to cl = 0 (the placeholder
-- or none) or 1 (any other cause line).
--
-- r90: the player's completed, non-test rounds in the last 90 days, used only
-- by the "rounds stamped" scenario (what Slice 0b's `rounds_n` would supply
-- for rows that carry no round count today). rt: completed, non-test rounds
-- on file (reach denominator: players with >= 5).
with live as (
  select i.player_id, i.insight_type, i.evidence as e
  from public.golf_coach_insights i
  where i.engine_version = 'v3'
    and i.archived_at is null
    and coalesce(i.dismissed, false) = false
    and i.lifecycle_state in ('detected', 'tentative', 'matured')
),
rounds as (
  select r.player_id,
         count(*) filter (where r.round_date >= now() - interval '90 days') as r90,
         count(*) as rt
  from public.golf_rounds r
  where r.is_test = false and r.status = 'completed'
  group by r.player_id
)
select json_agg(jsonb_strip_nulls(jsonb_build_object(
  'p', left(md5(l.player_id::text), 8),
  't', l.insight_type,
  'r90', coalesce(rd.r90, 0),
  'rt', coalesce(rd.rt, 0),
  'm', l.e->>'metric',
  'pol', l.e->>'polarity',
  'yv', round((l.e->>'your_value')::numeric, 3),
  'n', (l.e->>'sample_n')::numeric,
  'cv', round((l.e->>'comparison_value')::numeric, 3),
  'cs', l.e->>'comparison_source',
  'si', round((l.e->>'strokes_impact')::numeric, 3),
  'sm', l.e->>'strokes_impact_method',
  'est', (l.e->>'estimated')::boolean,
  'rn', (l.e->>'rounds_n')::numeric,
  'ns', nullif(jsonb_array_length(coalesce(l.e->'source_round_ids', '[]'::jsonb)), 0),
  'rp', (l.e->'detail'->>'rounds_played')::numeric,
  'ba', (l.e->'detail'->>'band_attempts')::numeric,
  'at', (l.e->'detail'->>'attempts')::numeric,
  'gh', (l.e->'detail'->>'green_hit_n')::numeric,
  'gp', round((l.e->'detail'->>'green_hit_pct')::numeric, 3),
  'sv', (l.e->'detail'->>'save_n')::numeric,
  'sk', (l.e->'detail'->>'saves_made')::numeric,
  'dn', (l.e->'detail'->>'downhill_n')::numeric,
  'dp', round((l.e->'detail'->>'downhill_pct')::numeric, 3),
  'ln', (l.e->'detail'->>'level_n')::numeric,
  'lp', round((l.e->'detail'->>'level_pct')::numeric, 3),
  'lt', (l.e->'detail'->>'ltr_n')::numeric,
  'rl', (l.e->'detail'->>'rtl_n')::numeric,
  'dr', (l.e->'detail'->>'driver_n')::numeric,
  'nd', (l.e->'detail'->>'non_driver_n')::numeric,
  'dh', (l.e->'detail'->>'driver_fairway_hits')::numeric,
  'nh', (l.e->'detail'->>'non_driver_fairway_hits')::numeric,
  'se', round((l.e->'detail'->>'gap_se')::numeric, 4),
  'pr', (l.e->'detail'->>'practice_rounds')::numeric,
  'cr', (l.e->'detail'->>'competitive_rounds')::numeric,
  'lo', round((l.e->'detail'->>'delta_ci_low')::numeric, 4),
  'hi', round((l.e->'detail'->>'delta_ci_high')::numeric, 4),
  'ta', round((l.e->'standing'->>'team_avg')::numeric, 3),
  -- Slice 1b: the player's own standing value (leave-one-out team mean)
  -- and the putt-bias "balanced" marker (a row that claims nothing).
  'pv', round((l.e->'standing'->>'player_value')::numeric, 3),
  'tc', (l.e->'detail'->>'testable_cells')::numeric,
  'tn', (l.e->'standing'->>'team_n')::numeric,
  'la', round((l.e->'standing'->>'level_avg')::numeric, 3),
  'lc', (l.e->'standing'->>'level_n')::numeric,
  'cl', case
    when coalesce(l.e->'diagnosis'->>'root_cause', '') = '' then 0
    when l.e->'diagnosis'->>'root_cause' ~* 'is off its benchmark\s*[.,;:–—-]\s*likely cause inferred from the aggregate, not a measured shot sequence\.?\s*$' then 0
    else 1
  end
)))
from live l
left join rounds rd on rd.player_id = l.player_id;
