# P014 Recruiting (coach): numbers vs staging

Prospect names and hometowns are replaced with placeholders (recruits can be
minors).

App definitions: `src/app/golf/actions/recruiting.ts:178-181` /
`src/clubhouse/data/recruiting-shape.ts`: golf_recruits for the coach's team,
newest updated_at first; row line = hs_class · hometown, state (`rowLineOf`);
division from organizations.division.

| Shown (13 Nov) | Expected (staging) | Verdict | Query |
| --- | --- | --- | --- |
| "3 prospects · 0 committed"; pipeline 1 Watched · 1 Recruiting · 1 Offered · 0 Committed | 3 golf_recruits: watched ×1, recruiting ×1, offered ×1, committed ×0 | Right | below |
| Rows (Recently updated): Prospect A "No class or hometown yet" Watched Sep 30; Prospect B "2028" Offered Jun 9; Prospect C "2027 · <hometown, state>" Recruiting Jun 9 | Prospect A: hs_class null, no hometown, updated 30 Sep ET; Prospect B: 2028, updated 9 Jun; Prospect C: 2027, <hometown, state>, updated 9 Jun | Right (order and dates) | below |
| Next step "—" on every row; inspector "No next step yet" | next_step_label and next_step_date null on all 3 | Right | below |
| "Division I · Contact period through Nov 25 …" | organizations.division 'D1', golf_teams.gender 'mens' | Division right; the calendar dates are a static rule (not in the data), not checked | below |

Query: `-- staging only: select r.first_name, r.last_name, r.status, r.hs_class,
r.hometown, r.state, r.next_step_label, r.next_step_date, (r.updated_at at time
zone 'America/New_York')::date, t.gender, o.division from golf_recruits r join
golf_teams t on t.id = r.team_id left join organizations o on o.id =
t.organization_id where r.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' order
by r.updated_at desc`
