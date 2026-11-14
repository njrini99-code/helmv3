# P002 Home: numbers vs staging

Demo University Golf, tz America/New_York, season from 2026-08-01.

| Shown (coach, 13 Nov) | Expected (staging) | Verdict | Query |
| --- | --- | --- | --- |
| "7 players haven't posted a round in 48+ days, Cole the longest at 48." | 6 players last scored 2026-09-26 (48 d). Cole: last round visible to this team 2026-09-26 (48 d); his 21 Oct tournament rounds and 29 Sep–6 Oct practice rounds carry another team_id, so the coach's RLS can't see them. Audit Testplayer: no rounds (not counted). | Count and days right for team-scoped data. Copy: all seven tie at 48, so "Cole the longest" names an arbitrary player (CN). | quiet-players CTE over golf_team_members/golf_rounds (is_test false, completed, total_score not null, round_date >= 2026-08-01); Cole rounds with team_id comparison |
| "6 tasks overdue" | 6 top-level tasks past due with an assignee not done (9 past due in all, 11 tasks) | Right | tasks CTE over golf_tasks/golf_task_assignments |
| "2 posts awaiting acknowledgement" | 2 announcements require acknowledgement, both with players missing | Right | anns CTE over golf_announcements/golf_announcement_acknowledgements |
| "No events scheduled" (Up next) | 0 events left this week (Mon 9–Sun 15 Nov after Fri 18:00); 3 next Tue–Wed | Window right; copy wrong (F-0006) | golf_events from 2026-11-10 |
| "Fall 2026 · 1 of 8 have added classes" | 8 active players | Right (numerator checked in P012-classes.md: Cole has classes, the other 7 none) | golf_team_members active count |
