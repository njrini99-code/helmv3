with demo (id) as (
    values ('6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid),
    ('8a162bfc-c98f-923b-e847-d80d7803acb2'::uuid)
),

eligible as (
    select
        r.*,
        coalesce(r.team_id, (
            select min(m.team_id::text)::uuid from public.golf_team_members as m
            where m.player_id = r.player_id and m.status = 'active'
            having count(distinct m.team_id) = 1
        )) as resolved_team_id
    from public.golf_rounds as r
    where
        not exists (
            select 1 from demo as d
            where d.id = r.team_id
        )
        and not exists (
            select 1
            from public.golf_team_members as m
            inner join demo as d on m.team_id = d.id
            where m.player_id = r.player_id
        )
)

select jsonb_build_object(
    'teams',
    (
        select
            jsonb_agg(
                jsonb_build_object(
                    'id', t.id, 'name', t.name, 'excluded', exists (
                        select 1 from demo as d
                        where d.id = t.id
                    )
                )
            )
        from public.golf_teams as t
    ),
    'status_counts',
    (select jsonb_agg(s) from (select
        status,
        count(*) as rounds,
        count(*) filter (where course_id is null) as unlinked,
        count(*) filter (where resolved_team_id is null) as unresolved_team
    from eligible
    group by status) as s),
    'courses',
    (select jsonb_agg(c order by completed_rounds desc, name asc) from (
        select
            c.id,
            c.name,
            c.city,
            c.state,
            c.address,
            c.website,
            c.deleted_at,
            count(*) filter (where e.status = 'completed') as completed_rounds,
            count(*) as all_rounds,
            count(distinct e.resolved_team_id) as teams
        from eligible as e
        inner join public.golf_courses as c on e.course_id = c.id
        where e.resolved_team_id is not null
        group by c.id
        having count(*) filter (where e.status = 'completed') > 1
    ) as c),
    'unlinked',
    (select jsonb_agg(u order by rounds desc) from (select
        course_name,
        course_city,
        course_state,
        count(*) as rounds
    from eligible
    where
        status = 'completed'
        and course_id is null
        and resolved_team_id is not null
    group by course_name, course_city, course_state
    having count(*) > 1) as u)
) as cohort_audit;
