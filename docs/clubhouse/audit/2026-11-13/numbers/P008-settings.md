# P008 Settings: numbers vs staging

App definitions: identity line = role (golf_team_coach_staff.role head_coach →
"Head coach") · team name · email; profile fields from golf_coaches /
golf_players.

| Shown (13 Nov) | Expected (staging) | Verdict | Query |
| --- | --- | --- | --- |
| Coach: "Head coach · Demo University Golf · <demo@golfhelmdemo.com>"; Full name "Coach (Demo)"; Title "Head Coach" | golf_team_coach_staff role head_coach, is_primary true; golf_coaches full_name 'Coach (Demo)', title 'Head Coach', email <demo@golfhelmdemo.com> | Right | staff/player union below |
| Player: "Player · Demo University Golf · <helm-audit-test-player-20260902@example.com>"; First "Audit", Last "Testplayer" | golf_team_members status active; golf_players first/last/email match | Right | same |
| Phone coach "Build 8c6e5f8" | Graded preview sha 8c6e5f84d2 | Right | none |

Query: `-- staging only: select 'staff', c.full_name, c.title, s.role::text,
s.is_primary, c.email from golf_team_coach_staff s join golf_coaches c on c.id =
s.coach_id where s.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' union all
select 'player', p.first_name || ' ' || p.last_name, null, tm.status::text,
null, p.email from golf_team_members tm join golf_players p on p.id =
tm.player_id where tm.team_id = '6ecdd1a6-…' and p.last_name = 'Testplayer'`
