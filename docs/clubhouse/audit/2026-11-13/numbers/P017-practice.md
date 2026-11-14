# P017 Practice: numbers vs staging (Demo University Golf, tz America/New_York)

App definitions: `src/clubhouse/data/practice-home.ts:129-176`: golf_events
event_type 'practice', cancelled_at null, start_time from now − 8 d to now + 21
d; minutes = end − start for a timed event; week = Mon–Sun in the team's zone;
plans = golf_practice_plans kind 'event'.

| Shown (13 Nov) | Expected (staging) | Verdict | Query |
| --- | --- | --- | --- |
| Coach desktop "30 min of practice this week"; Mon 9 "3:00 PM · Ended" | One practice this week: 'Ask check practice' Mon 9 Nov 15:00–15:30 ET (30 min, confirmed) | Right | events/plans union below |
| "No practice on the calendar in the next two weeks" | No practice event from 13 Nov to 4 Dec | Right | same |
| "Past plans (1)"; player "Ask check plan · Ended · Mon, Nov 9 · 3:00 to 3:30 PM" | One kind='event' plan, 'Ask check plan', published, on that event | Right | same |
| Fri 13 tile "–" (no practice) | No practice today; the team's Fall Invitational trip (13–15 Nov) is in golf_travel_itineraries only | Right for practice; the strip doesn't show the trip (also on F-0001) | see F-0001 |

Query: `-- staging only: select 'event', e.title, e.start_time at time zone
'America/New_York', e.end_time at time zone 'America/New_York', minutes,
e.all_day, e.status, e.cancelled_at is not null … from golf_events e where
e.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' and e.event_type = 'practice'
and e.start_time >= '2026-11-05' and e.start_time < '2026-12-05' union all
select 'plan', p.title, …, p.status from golf_practice_plans p where p.team_id =
'6ecdd1a6-…' and p.kind = 'event'`
