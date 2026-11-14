# P012 Classes (player): numbers vs staging

App definitions: `src/clubhouse/data/classes.ts` (loadClasses): the player's own
golf_player_classes rows; the term from `termOn` (src/lib/golf/semester.ts,
fixed TERM_WINDOWS, no database read).

| Shown (Audit Testplayer, 13 Nov) | Expected (staging) | Verdict | Query |
| --- | --- | --- | --- |
| "No classes yet" (empty state) | Audit Testplayer: 0 golf_player_classes rows | Right | per-player count below |
| "Fall 2026 · Aug 20 – Dec 15" | Fixed rule: fall window 20 Aug–15 Dec (semester.ts TERM_WINDOWS); 13 Nov is inside it | Right by the app's rule (no school-specific term in the data) | none (code) |
| (Home, cross-check) "Fall 2026 · 1 of 8 have added classes" | Cole Bennett 14 classes (Fall 2026), the other 7 active players 0 | Right | per-player count below |

Query: `-- staging only: select p.first_name, p.last_name, count(c.id),
string_agg(distinct coalesce(c.semester,'(none)'), ', ') from golf_team_members
tm join golf_players p on p.id = tm.player_id left join golf_player_classes c on
c.player_id = p.id where tm.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' and
tm.status = 'active' group by 1,2`
