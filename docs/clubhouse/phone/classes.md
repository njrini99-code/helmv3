# Design: Classes (player, desktop and phone)

Status: approved. The owner's boards are the spec (D-22): `design/handoff/Player - Classes.html` and `Player - Classes - Mobile.html` (`classes.jsx`, `classes.css`, `gh-states.jsx`). The mobile board draws fourteen frames of one page (`ClassesM`: the shell's top bar "Classes" with "‹ More", the page, the tab bar with More on): the list, the empty state, the import in each step (pick, paste text, reading, review, imported), the four import errors (not a schedule, too large, reader failed, no classes found), sync failed, a class's detail and Add a class.

The route is `/golf/dashboard/classes`, for players. It sits under School in the sidebar and opens from More on the phone (D-66), so the phone's top bar goes back to More (`useBackFromMore`). Coaches have no Classes page; `/golf/dashboard/classes` keeps the Fairway page for them.

Built in `src/clubhouse/screens/classes/`. The screen is `ClassesView` over an injected set of writes (`ChClassesWrites`): the live set (`writes.ts`) keeps the table, columns and server actions the current page uses, unchanged; the preview passes fake ones.

## Board to data

| Board piece | Read | Write |
| --- | --- | --- |
| "Fall 2026 · Aug 20 – Dec 15", "Week 8 of 17" | The term in progress today in the team's zone, from `inferTermForImport` and `parseSemesterDates` (the current importer's rules; Fall 2026 runs Aug 20 to Dec 15, 17 weeks). Before a term starts: "Starts in 6 days" | none |
| Credits by class on the term bar | `golf_player_classes.credits`, for the classes of this term (a class with no term counts as this term) | none |
| A class card: tab (course code), name, instructor, the days it meets with the start under each, room | `golf_player_classes`: `class_name` (stored as "CODE - Name"), `instructor`, `days`, `start_time`, `building`, `room`, `credits`, `semester` | Opens its sheet |
| The card's colour | The tone follows the order the classes were added (the design's five paper tones). The stored `color` still goes to the calendar sync | none |
| "This overlaps the trip" and the travel card | This week's non-class, non-cancelled `golf_events` of the team (Monday to Sunday, in the team's zone) against the classes' days and times. Any team event counts, not only a trip; an all-day or multi-day event fills its days | none |
| "What your coach sees" | RLS: the player owns the row; an active coach of the team can read it; teammates cannot (`golf_player_classes` policies) | none |
| Add a class | none | `insert` into `golf_player_classes` through the RLS-scoped client (`player_id`, `team_id`, columns as the current form writes them) under a row id the sheet made when it opened, so a save retried after a lost answer reaches the row it stored (a duplicate-key answer on that id means it is saved, and the row is updated). Then `syncClassToCalendar`, as its own action that the save starts and does not wait for |
| Edit a class | The row | `update … eq id, eq player_id` (a policy that hides the row returns no row: "Nothing was saved"), then `syncClassToCalendar` (a diff-upsert per class id) for the class's whole term, not waited on |
| Remove a class | none | `removeClassFromCalendar(id)` first, then `delete` the row only if that worked (the current page's order: once the row is gone nothing can target the events' `[class:<id>]` tag) |
| Import schedule: file, paste, reading, review, imported | none | A screenshot or photo is read by `extractClassesFromScheduleImage` (vision); a PDF is read in the browser with PDF.js from the current importer's pinned CDN copy; a TXT file or pasted text is read by `parseScheduleText`. Nothing is saved until Import: one insert of the reviewed rows, skipping a class already there (its stored name and term; a class saved with no term counts as the current term), then `syncClassToCalendar` per class, not waited on. Each class starts from its own day (`syncStartFor`): the Monday after today, as the current importer does, but only where that Monday is inside the class's own term and leaves it standing. A class in next term, one imported before its term begins and one in the last 21 days of a term are put on the term's whole window |
| Sync failed, Retry | The failed ids and the start each class was synced from, held for the visit | `syncClassToCalendar` again, from the same start (never the insert) |

## Differences from the board (gaps), none built as a mock

- **Add a class.** The board draws an inline card. It is a sheet (a bottom sheet on the phone) with the same fields, so the phone's keyboard, validation and Discard question work as everywhere else. The dashed tile at the end of the deck opens it.
- **Class detail.** The board's grade, next deadline and "Share with coach" switch have no column in `golf_player_classes` and no source. They are not drawn. The sheet shows when, where, instructor, term, notes and the next four meetings, with the ones that overlap the team marked. The meetings run from the later of today and the first day of the class's own term, and a class with no time or no days lists none and says "Not on your calendar" with the reason.
- **"Synced 2 minutes ago".** No column records a sync. The header says something only when a sync is running ("Adding to your calendar…") or failed ("1 class is not on your calendar", with Retry sync). The failed ids are held for the visit; a reload starts clean.
- **"Busy time only".** The board's note says the coach sees only busy time. The read policy lets an active coach read the whole class row (name, room, instructor). The card says what is true: the coach sees the classes, when they meet and where; teammates don't.
- **Import review.** The board's row has an Edit pencil. Each row can be removed from the review; a class is edited from its card once imported. The board's timed "Image received, Finding classes, Matching times" steps are animation, not progress, so the reading state says only what it is doing.
- **Import: what needs a look.** A parsed class with no days or no time is imported and marked "Need a look" (it can't be on the calendar without both). The result says how many classes are on the calendar and until when (each class's own term end), and names the ones that are not and why ("PHIL 150 (no meeting days)", "HIST 210 (no time set)"), rather than saying they all are.
- **Delete all.** The current Fairway page has "Delete all classes" and the board doesn't draw it. The owner approved it on 2026-09-30 (Q-75a) and it is built: a quiet red button under the deck (on the phone a full-width row, 44px tall, in the page's own flow and not in the header, which keeps Import schedule and Add class as the two actions), behind a bottom sheet that says how many classes go and that their calendar events go with them. The calendar comes first, then the rows, as on the current page.
- **Week strip and term bar** are drawn from the classes' own data; the term line marks today and this week.

## Beyond the board

- **Online and arranged classes** (no days and no times) list with "Online or arranged. No fixed meeting." They are saved and have nothing to put on the calendar: the save's sync takes them off it (a no-op when they never were on it). A class with times and no days says "Add the days this class meets." and is flagged "No meeting days, not on your calendar" (its sync has no meetings to write, and is not a failure). A class with days but no start or no end time says "Add the time this class meets.", is flagged "No meeting time, not on your calendar", and is taken off the calendar instead of synced, because the server would put it there from 08:00 to 09:00, a block the coach could plan around that isn't real.
- **A class from another term** keeps its card, named for its term, and is left out of this term's credits and overlaps. The form's exact-match refusal and overlap note count only the classes of the term the form is set to.
- **A class that meets on a weekend** draws seven days on its card; the others five. The form offers the weekdays, and a weekend day the class already has, so it can be taken off.
- **A player on no team** gets a page that says so, with the way to join (Settings): classes are saved with the team whose calendar they go on.

## States

Loading: a route skeleton (CH-12401), "Reading your schedule…" while a file is read (CH-12402), and "Adding to your calendar…" in the header while classes go on the calendar (CH-12403). The classes didn't load: CH-12201, in place of the page, never "no classes". The team's events didn't load: CH-12202, in the side column; the classes still show and no overlap is claimed. A section that crashes is contained (CH-12203). First run: CH-12301. Nothing overlaps: CH-12302. No team: CH-12305. Save, sync, remove and import each say when they fail, with Retry (CH-12001 to CH-12004); remove and discard ask first (CH-12501, CH-12502). Every form rule and every import error has its own number. Full list: `docs/clubhouse/catalog/classes.md`.

## Phone

`Player - Classes - Mobile.html`.

- The top bar is the shell's: "Classes" with "‹ More", and it is the page's one heading. The page header keeps the term line and Import schedule and Add class, which share the row; it draws no second "Classes" (owner's iPhone brief, 2026-10-01).
- Order, from the same brief: the term in one quiet line on the green card ("Week 7 of 16 · 15 credits"), this week's overlaps as a row that scrolls to them (drawn only when there are any), then **Today**: the classes that meet today, by start, each showing time, name, and room · code, and opening its class. With none today it names the next day that has a class (CH-12308). The overlap cards come next, then the deck. The credit bar and the term line with its Today and This week markers stay on desktop; on the phone the Today marker crowded the warning.
- On a card the course code is metadata (15px, secondary ink); the class name leads.
- Below 640px the deck is one column.
- The tab bar stays (More is on). The class's sheet, the form, the import and the three questions (remove, delete all and discard) are bottom sheets that drag to close; the delete-all question does not close while its delete is running.
- Not yet: a measured touch-target pass (the day picker, the week strip's cards) and a pass on a real iPhone (keyboard with the form open, swipe-back with a sheet open, haptics felt).
