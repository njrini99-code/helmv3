# P016 Tournaments: numbers vs staging

Demo University Golf, tz America/New_York, season from 2026-08-01.

App definitions: `src/clubhouse/data/tournaments.ts:405-430`: tracked =
golf_tournaments rows for the team; "Set up from calendar" = golf_events with
event_type 'tournament', status <> 'cancelled', no recurrence, no parent,
start_time >= 2026-08-01, not already a tracked round; date = start_time's date
(all-day: the UTC date), grouped by `setupGroups` (one calendar entry = one
round day).

| Shown (13 Nov) | Expected (staging) | Verdict | Query |
| --- | --- | --- | --- |
| Coach: "2 tournaments on your calendar to set up" / "2 tournaments not tracked yet" | 0 golf_tournaments rows; 2 tournament events since 1 Aug: Tri-State Invitational (27 Aug 11:30 UTC – 29 Aug 21:00 UTC), Fall Invitational (all-day, 2 Oct 04:00 UTC – 4 Oct 03:59 UTC = 2–3 Oct ET). Coastal Collegiate (Jun) and Spring Preview (30–31 Jul) are before the season | Count right | events + tournaments union below |
| "Fall Invitational · Oct 2 · 1 calendar entry"; "Tri-State Invitational · Aug 27 · 1 calendar entry" | Fall Invitational runs 2–3 Oct; Tri-State 27–29 Aug | Start dates right; end dates dropped (S4 filed) | same |
| Player: "No tournaments yet" | 0 golf_tournaments rows for the team | Right | same |
| (cross-check with F-0001) Fall Invitational today | The only calendar entry named Fall Invitational is 2–3 Oct (status still 'scheduled'); the 13–15 Nov Pinehurst trip lives only in golf_travel_itineraries with event_id null | Tournaments can't show the trip as today (no tournament or calendar row for it). Data inconsistency in staging, not filed | same |

Query: `-- staging only: select 'event', e.id, e.title, e.event_type,
e.start_time, e.end_time, e.all_day, e.status, e.recurrence_rule is not null,
e.parent_event_id is not null from golf_events e where e.team_id =
'6ecdd1a6-63fe-4beb-b094-00118f334163' and (e.event_type in
('tournament','travel') or e.title ilike '%invitational%') union all select
'tournament', t.id, t.name, … from golf_tournaments t where t.team_id =
'6ecdd1a6-…'`
