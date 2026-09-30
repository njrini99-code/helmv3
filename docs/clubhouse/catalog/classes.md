# Classes catalog (12xxx)

Route: `/golf/dashboard/classes` (players). Coaches keep the Fairway page there; the page gives a Clubhouse player the new screen and everyone else the current one. Spec: `docs/clubhouse/phone/classes.md`. Boards: `design/handoff/Player - Classes.html` and `Player - Classes - Mobile.html`.

The player's class schedule by term: the term at a glance, every class as a card, this week's overlaps with the team's events, and the sheets to add, edit, import and remove. A class is a row of `golf_player_classes`, put on the team calendar by `syncClassToCalendar` and taken off it by `removeClassFromCalendar` (the same tables and actions the current page uses).

Where things live:
- Code: `src/clubhouse/screens/classes/` (`Classes` live wrapper, `ClassesView`, `parts`, `ClassForm`, `ClassDetail`, `ImportSchedule`, `import-read`, `writes`, `ClassesSkeleton`, `ClassesNoTeam`)
- Loader: `src/clubhouse/data/classes.ts` (`loadClasses`), with its pure steps in `classes-shape.ts`
- Route: `src/clubhouse/routes/classes.tsx`; page: `src/app/golf/(dashboard)/dashboard/classes/page.tsx` (`LegacyClassesPage.tsx` is the current page, kept for everyone else)
- Tests: `src/clubhouse/__tests__/classes.test.tsx`
- Preview: `/clubhouse-preview/classes` (`?state=clear|empty|failed|partial|mixed|noteam|loading|failwrites|failsync|read-notschedule|read-fault|read-none|read-warn`; the default is the board's Fall 2026 with the Pinehurst trip). Pasted text is really read by the current parser; a file is read as the state says

Saving a class and putting it on the calendar are two actions on purpose. A failed sync's Retry only syncs; it never inserts the class a second time (audit DATA-02: a sync failure once made a re-submit insert the class again; the current page fixed it with `syncClassSafely`, and this page avoids it by construction). A new class's row id is made in the browser when the sheet opens and travels with the save, so a save that is retried (the toast's Retry, or Add tapped again) after its answer was lost reaches the row it stored: a duplicate-key answer (23505) on that id updates that row rather than adding a second copy.

The calendar start is decided per class (`syncStartFor`). An import puts each class on the calendar from next Monday, so a schedule read mid-term doesn't fill it with meetings already held, but only where that day is inside the class's own term and leaves it standing; a class in next term, one imported before its term begins, or one in the last weeks of a term is put on the term's whole window (the sync refuses, or re-derives another term for, a start outside it). A Retry starts each class from where its failed attempt did; a save syncs the whole term. A class with no start or no end time is not synced: it is taken off the calendar (`removeClassFromCalendar`), and its card, sheet and the import result say "no time set".

Every write goes through `useAction`, so these belong to the shell as well: offline refusal (CH-1903), slow saves (CH-1902) and the success and error haptics (D-70). The sync is its own action: the save and the import do not wait for it, so their sheets are free and their own slow-save notice is not held open while the calendar is told.

## 120xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-12001 | Adding or updating a class fails | "Couldn't add GEOG 110" (or "Couldn't update …") + the server's reason if it is a sentence, else "Nothing was changed. Check your connection and try again." + Retry. The sheet stays open with what was typed; nothing is sent to the calendar. Done: "Class added" or "Class updated" | `useAction('classes.save')` → `writes.save` | classes.test › CH-12001 |
| CH-12002 | A class saved but did not reach the calendar (the sync failed, threw, wrote no meetings for a class that has them, was refused offline, or was skipped because another sync was still running, as when a class is saved while an import is being put on the calendar) | When the sync ran and failed, threw, or wrote no meetings for a class that has them: an error toast, "GEOG 110 is saved, but not on your calendar" + "GEOG 110: <reason>. Retry to try again." (for an import: "1 of 4 classes are saved, but not on your calendar" and the names) + Retry, which syncs again from the same start and does not save again. Offline, the shell's CH-1903 toast says the same with "you're offline" and its Retry syncs. While another sync is still running (a class saved while an import is being put on the calendar) there is no toast, because nothing has failed yet: the class is flagged and the header's Retry sync puts it there. In every case the class stays in the list with "Not on your calendar", the header says "1 class is not on your calendar" with Retry sync, and the class's sheet has the same notice and button, so a saved class is never off the calendar without the flag. The class is saved first ("Class added" shows at once) and the calendar is told in the background: the sheet is free meanwhile (CH-12403) | `useAction('classes.sync')` → `writes.sync` (`syncClassToCalendar`), started by the save and the import without waiting on them; the failed ids and the start each class was synced from are held for the visit (no column records them), so a Retry repeats what failed | classes.test › CH-12002 |
| CH-12003 | Removing a class fails (the calendar removal or the delete) | "Couldn't remove STAT 201" + "Couldn't take this class off your calendar: <reason>. The class was kept so you can try again." + Retry; the question stays open and the class stays. Done: "STAT 201 removed" | `useAction('classes.remove')` → `writes.remove`: the calendar first, then the row, so a retry finds it | classes.test › CH-12003 |
| CH-12004 | Importing the reviewed rows fails to save | "Couldn't import your schedule" + "Nothing was saved. Check your connection and try again." + Retry; the review stays as it was. Done: the "Schedule imported" view (no toast): how many classes are on the calendar and until when (each class's own term end), and which are not and why ("no meeting days", "no time set"). It does not wait for the calendar | `useAction('classes.import')` → `writes.importRows` | classes.test › CH-12004 |

## 121xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-12101 | Save with no course code | "Add the course code, for example STAT 201." beside the box (`role="alert"`, `aria-invalid`); focus goes to the first field that needs it | `checkDraft` | classes.test › CH-12101 |
| CH-12102 | Save with no course name | "Add the course name." | `checkDraft` | classes.test › CH-12101 CH-12102 CH-12103 |
| CH-12103 | Save with no term | "Choose the term this class is in." | `checkDraft` | classes.test › CH-12101 CH-12102 CH-12103 |
| CH-12104 | The end is not after the start | "Ends must be after it starts." | `checkDraft` | classes.test › CH-12104 CH-12105 |
| CH-12105 | A start with no end, or an end with no start | "Add both a start and an end time, or leave both empty." | `checkDraft` | classes.test › CH-12104 CH-12105 |
| CH-12106 | Credits that are not a whole number from 0 to 12 | "Credits is a whole number from 0 to 12." | `checkDraft`, `parseCredits` | classes.test › CH-12106 |
| CH-12107 | A class at exactly another class's days and times | "STAT 201 already meets at exactly this time. Change the days or times, or edit that class." under Days; nothing is sent. Editing a class never counts against itself, and only a class in the term the form is set to counts (a class with no term is in the current term) | `checkDraft`, `overlapsAmong` | classes.test › CH-12107 |
| CH-12108 | A class that overlaps another class without being the same | A note in the sheet, "Overlaps another class: STAT 201 on Tue, Thu." It doesn't block the save (amber, never red). Only classes in the term the form is set to count | `ClassForm`, `overlapsAmong` | classes.test › CH-12107 CH-12108 |
| CH-12109 | A class overlaps a team event this week (in the form, or among the imported classes) | "Overlaps the team: Practice on Mon, …. This week. Your coach can see your classes." Imported: "3 overlaps with the team this week." and the first two. It doesn't block. The events are this week's, so only a class in this term can overlap them: a form set to another term, or an imported class in next term, shows none | `conflictsOf` over the team's events for Monday to Sunday | classes.test › CH-12001, CH-12109 |
| CH-12110 | Read schedule with nothing pasted | "Paste your schedule text first." under the box | `ImportSchedule` | classes.test › CH-12110 |
| CH-12111 | A file over 12 MB | "That file is too large" + "Use a file under 12 MB. A screenshot of the schedule page is usually under 2 MB." + Choose another file / Paste text instead. Refused before anything is sent | `screenFile` | classes.test › CH-12111 CH-12112 |
| CH-12112 | A file that is not an image, PDF or TXT | "We can't read that file type" + "Use a PNG, JPG or WebP screenshot, a PDF or a TXT file, or paste the text." | `screenFile` | classes.test › CH-12111 CH-12112 |
| CH-12113 | The reader says the image is not a class schedule | "This doesn't look like a class schedule" + the reader's sentence + Choose another file | `classifyReadError` | classes.test › CH-12113 CH-12114 |
| CH-12114 | The reader finds no classes | "No classes found" + "We read it but couldn't find course codes or times. Try pasting your schedule text." + Paste text | `ImportSchedule` | classes.test › CH-12113 CH-12114 |

## 122xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-12201 | The player's classes don't load | "Your classes didn't load" + "Nothing is lost. Your classes are still saved; try again in a moment." + Try again (asks the server again). It never reads as "no classes", and Add and Import are not offered beside a schedule the page can't show | `InlineNotice`; `loadClasses` logs `chLogServer('classes', 'classes', …)` | classes.test › CH-12201 |
| CH-12202 | The team's events don't load | In the side column: "The team's events didn't load" + "Overlaps with practice and travel can't be checked right now. Nothing has changed. Try again in a moment." + Try again. The classes still show; the overview draws no overlap count, no card is flagged, and the sheets claim no overlap | `OverlapsCard`; `chLogServer('classes', 'events', …)` | classes.test › CH-12202 |
| CH-12203 | A section crashes while drawing | "The term overview couldn't be shown." (or "Your classes", "This week's overlaps") + "The rest of the page is fine. This has been reported automatically." + Try again | `SectionBoundary classes.term`, `classes.deck`, `classes.side` | classes.test › CH-12203 |
| CH-12204 | The reader fails or throws | "Reading the schedule didn't finish" + "Your schedule can still be added with Paste text." + Paste text instead | `ImportSchedule` | classes.test › CH-12204 |

## 123xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-12301 | No classes yet | "Add your class schedule" + "Import a screenshot of your schedule and we'll add every class. Your coach can see when you're busy, so practice and travel get planned around class." + Import schedule / Add a class. The term bar and the header actions are not drawn | `EmptyState size="page"` | classes.test › CH-12301 |
| CH-12302 | No class meets a team event this week | "Nothing overlaps this week" + "None of your classes meets over practice, travel or another team event." The overview counts 0 | `OverlapsCard` | classes.test › CH-12302 |
| CH-12303 | A class with no fixed meeting (online or arranged) | On its card: "Online or arranged. No fixed meeting." The week strip isn't drawn. A class with days but no start and end time is not this one: its card says "Add the time this class meets." and flags "No meeting time, not on your calendar", its sheet says "No time set" and "Not on your calendar: no time set", and it is taken off the calendar rather than synced (the server would put it there from 08:00 to 09:00) | `ClassCard`, `ClassDetail`, `writes.sync` | classes.test › CH-12303 CH-12304 |
| CH-12304 | A class with times but no days | "Add the days this class meets." and a flag "No meeting days, not on your calendar" (a class with no days has no meetings to put on the calendar) | `ClassCard` | classes.test › CH-12303 CH-12304 |
| CH-12305 | A player on no team | "You aren't on a team yet" + "Your classes go on your team's calendar so your coach can plan around them. Join a team, then add your classes." + Open team settings | `ClassesNoTeam` (server component) | classes.test › CH-12305 |
| CH-12307 | An import where every class is already on the schedule | "Nothing new to import" · "Already on your schedule" + "That class is already on your schedule, so nothing was imported. Remove the existing entry first to import again." Nothing is synced | `ImportedView` | classes.test › CH-12307 |

## 124xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-12401 | The page is on its way | The header, the term overview, four class cards and the two side cards, in place | `ClassesSkeleton` via `classes/loading.tsx`, for a player in the Clubhouse shell (`useClubhouseRole`); a coach there, who has the current Fairway page, and anyone outside the shell get the Fairway skeleton | classes.test › CH-12401 |
| CH-12402 | A schedule is being read | "Reading your schedule…" + "Finding course codes, days, times and rooms" over a page with a scan line. It says what it is doing; the board's timed "Image received, Finding classes, Matching times" steps aren't drawn because they aren't progress | `ImportSchedule` (reading) | classes.test › CH-12110 CH-12402 CH-12705 |
| CH-12403 | Classes are being put on the calendar | In the header: "Adding to your calendar…" (`role="status"`) until they land | `SyncStatus` | classes.test › CH-12403 |

## 125xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-12501 | Remove class | "Remove this class?" + "STAT 201 comes off your schedule and your calendar. This can't be undone." Keep it · Remove class (danger; "Removing" while it runs) | `Modal` | classes.test › CH-12501 CH-12702 |
| CH-12502 | Cancel or close a form that has changes | "Discard your changes?" + "What you typed here isn't saved." Keep editing · Discard. The form comes back with what was typed if the answer is to keep editing. An untouched form closes without asking | `ClassForm` | classes.test › CH-12502 |

## 126xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-12601 | Hovering a class | It lifts 2px (quick) | `.ch-cl-card:hover`, `--ch-dur-quick` | preview |
| CH-12602 | A schedule is being read | A scan line sweeps down the page (still with reduced motion) | `.ch-cl-read__scan`, `--ch-dur-shimmer` | preview |

## 127xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-12701 | A class is opened | Selection | `ClassCard` | classes.test › CH-12701 |
| CH-12702 | Remove class is tapped in a class's sheet | Warning, before the question | `ClassDetail` | classes.test › CH-12501 CH-12702 |
| CH-12703 | A day is chosen or cleared in the form | Selection | `ClassForm` | classes.test › CH-12703 |
| CH-12705 | The import switches between a file and pasted text | Selection | `Segmented` in `ImportSchedule` | classes.test › CH-12110 CH-12402 CH-12705 |

## 128xx Accessibility

| # | When | They get | How | Test |
| --- | --- | --- | --- | --- |
| CH-12801 | A screen reader moves through the deck | The page is labelled "Classes"; each class is one button named "STAT 201, Probability and Statistics, Tue, Thu 9:00–10:15 AM" (or "…, no fixed meeting") | `ClassCard`, `main aria-labelledby` | classes.test › CH-12801 |
| CH-12802 | The card's week strip | Hidden from screen readers; the button's name says the same in words | `ClassCard` (`aria-hidden`) | classes.test › CH-12802 |
| CH-12803 | The term overview | One labelled region: "Fall 2026, week 8 of 17, 13 credits · 5 classes, ends Dec 15"; the bars and the line are drawing and hidden | `TermBar` | classes.test › CH-12803 |
| CH-12804 | A save is refused | Each message is next to its field with `role="alert"` and the field is `aria-invalid` and described by it; focus moves to the first one | `ClassForm` | classes.test › CH-12804 |
| CH-12805 | The import's drop zone | A real button, so the keyboard opens the file picker too; a file dropped on it is read | `ImportSchedule` | classes.test › CH-12805 |

## 129xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-12901 | A screenshot is chosen while offline | "You're offline" + "Reading a screenshot needs a connection. Reconnect and try again, or paste the text, which works offline." + Try again (reads it once back) / Paste text instead. Pasted text and a TXT file are read on the device and don't need a connection | `ImportSchedule`, `isOffline` | classes.test › CH-12901 |
| CH-12902 | A read is slow | After 5 seconds, once: "This is taking longer than usual. Keep this open." Closing the sheet while it runs drops the answer | `ImportSchedule`, `CH_SLOW_SAVE_AFTER` | classes.test › CH-12902 |
