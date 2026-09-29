# Phone design: Home (coach)

Status: draft (awaiting owner approval)

The coach opens this between classes and on the range. It answers one question: what needs me today.

## Layout, top to bottom
1. Large title "Today" with the date under it; collapses on scroll.
2. Next up card (full width, green raised): the next event's time, title and place, with a "Starts in 50 min" line. Tap opens it in Calendar.
3. This week strip: seven day pills in one row (no scrolling), today filled green. Tapping a day opens Calendar's day view.
4. Latest rounds: a vertical list of the last five rounds (avatar, player, score to par with the Clubhouse score marks, course and date). "All rounds" when Rounds is rebuilt.
5. Leaderboard: the top five by scoring average with the smooth form line per row; "Full leaderboard" expands in place.

## Differences from desktop
- The desktop two-column sheet (calendar beside rounds) becomes one column; the calendar block is replaced by the Next up card and the week strip, because a month grid is unreadable at 390px.
- The leaderboard's trend column keeps its line but drops the axis; the row is 64px tall.

## States
Skeleton in the same order; a failed section shows its own inline notice in place; no team shows the no-team state full screen.
