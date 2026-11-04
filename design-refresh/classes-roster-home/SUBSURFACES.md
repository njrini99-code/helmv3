# Classes, Roster and coach Home: every surface the app has today (3 Nov)

Read-only inventory of helmv3 at 75b4956 (`src/clubhouse/` unless a path starts `src/app`), for the hub thread's 05-SCREENS. Nothing was changed. "Modal" below means `ui/Modal.tsx`: a phone bottom sheet with a grab handle and drag to close, capped at 92dvh (`styles/controls.css:525-536`), no detents; a centred dialog of the given width on desktop. None of these screens use FormSheet, ListSheet, ActionSheet or MenuSheet.

## Design vs app: things 05 to 08 need a rule for

- Design draws the class sheet at 90%, requests 62%, round 74%. The app's Modal has no detents (content height, 92dvh cap). Pick one: give Modal a detent prop or let the design heights be content heights.
- Design profile "…" opens nothing. App: a Modal with View stats, Mark inactive/active, Remove from team, then confirms. Needs the sheet spec applied.
- Design has no press-and-hold. App: 450ms hold on a coach Roster row or a Home round row opens PlayerPeek (Message, View stats, Plan 1:1, CoachHelm). Keep it; it needs a motion row.
- Design draws the Classes + as one button. App's + opens ClassForm directly (label "Add class"); Import is a separate header button. The design moves Add and Import behind the +, which needs a menu that doesn't exist yet.
- Player Roster rows are static in the app, and the design keeps them static. Matches.
- Bell is hidden on phone whenever a PhoneTop action shows (Classes with classes, coach Roster with players): `styles/shell.css:1241-1265`. The design's + and invite icon replace the bell, so it matches.
- Notifications sheet drops from under the bar (`shell/Bell.tsx:568`, motion `m.div`, not Modal). Not drawn in this lane.
- Classes route errors fall to the legacy Fairway `RouteErrorBoundary` ("Failed to load classes"), not a Clubhouse state. Worth a rule.
- Class-awareness surfaces (status panel, No class today, status switch in detail, exams) only show with `class_awareness_v1` and `statusWrites`. The preview passes no `statusWrites`, so none of them can be captured today.
- InClassSheet, TermSheet, TeamBreakSheet live in `screens/classes` but open only from coach Home's class line (and Messages).
- "Approve all" exists only on the phone Requests sheet, not the desktop card.

## Classes (player; coaches get the legacy "Classes are a player feature" page)

| Surface | Kind | Reached from | Component | Contents / writes |
|---|---|---|---|---|
| Classes | screen | Strip, `/golf/dashboard/classes`; `?new=1` opens Add | `ClassesView.tsx:349` | PhoneTop "Classes", + "Add class" (`:354`, hidden on first run); "Import schedule" (`:377`) |
| Class status panel | inline | Flag on + statusWrites | `ClassStatusPanel.tsx:162` | Share switch (writes), "Pushes during class · Change", "No class today ›", Tag/Re-sync/Fix notices; error CH-12270 |
| No class today | Modal 420 | Panel row | `NoClassTodaySheet.tsx:54` | Radio list, "Cancel" / "Mark no class"; toast with Undo |
| Term overview | inline | — | `parts.tsx:136` | "Week N of M"; overlaps button scrolls |
| Today | inline (phone) | — | `parts.tsx:465` | Empty "No classes today · next {day}" / "No classes this week" (CH-12308); row opens detail |
| Your classes | inline | — | `ClassesView.tsx:454` | ClassCard per class (`parts.tsx:261`), AddTile, "Delete all classes" |
| Overlaps, coach note | inline | — | `parts.tsx:350`, `:413` | Empty "Nothing overlaps this week" (CH-12302); error CH-12202 |
| First run | state | No classes | `ClassesView.tsx:393` | "Add your class schedule" (CH-12301), Import (primary), Add |
| Load failed | state | — | `:391` | CH-12201, Retry |
| Sync | inline | — | `parts.tsx:436` | "Adding to your calendar…", "Retry sync" |
| No team | state | — | `ClassesNoTeam.tsx` | CH-12305, "Open team settings" |
| Loading | skeleton | — | `ClassesSkeleton.tsx` | CH-12401 |
| Class detail | Modal 460 | Card or Today row | `ClassDetail.tsx:121` | Facts, Next meetings, "Remove class", "Edit class"; status detail when aware |
| Add an exam | Modal 440 | Detail | `ExamSheet.tsx:51` | Date, Starts, Ends, Name |
| Remove this exam? | confirm 420 | Trash icon | `ClassDetail.tsx:228` | Cancel / Remove |
| Add / Edit class | Modal 520 form | +, AddTile, Edit, Fix | `ClassForm.tsx:139` | Code, credits, name, instructor, days, times, overlap warnings, building, room, notes |
| Discard your changes? | confirm | Close while dirty | `ClassForm.tsx:322` | Keep editing / Discard |
| Import schedule | Modal 620, steps | Import | `ImportSchedule.tsx:228` | Pick (Segmented file or paste) → Reading (slow notice CH-12902) → Error kinds → Review ("Import {n} classes") → Done |
| Start over? | confirm | Review | `ImportSchedule.tsx:472` | Keep reviewing / Start over |
| Remove this class? | confirm | Detail | `ClassesView.tsx:511` | Keep it / Remove class |
| Delete all classes? | confirm | Button | `ClassesView.tsx:537` | Keep them / Delete all classes |

Toasts: "Class added", "Class updated", "{code} removed", "All {n} classes deleted"; "Couldn’t add/update/remove…", "Couldn’t import your schedule", "{code} is saved, but not on your calendar"; class status toasts with Undo; shared "Still saving…" (CH-1902) and offline "{failed}: you’re offline" with "Try again" (CH-1903).

## Roster, coach (phone)

| Surface | Kind | Reached from | Component | Contents / writes |
|---|---|---|---|---|
| Roster | screen | Strip | `RosterPhone.tsx:133` | "Invite players" icon (`:140`), kicker counts, sort Avg/SG/Name, Active, Inactive |
| Row | tap / 450ms hold | Row | `RosterPhone.tsx:407` | Tap: profile. Hold: PlayerPeek (`ui/PlayerPeek.tsx:31`) |
| Join requests banner | inline | Pending | `:469` | Opens Requests; error CH-3203 |
| Join requests | Modal | Banner, `?tab=requests` | `:494` | Decline / Approve per row, "Approve all {n}", team code Copy |
| Player profile | push (PhoneScreen) | Row, `?player=` | `RosterProfile.tsx:63` | Message, Plan 1:1, figures, trend, recent rounds "All {n}", CoachHelm panel, About, Availability Segmented Available/Injured/Away (writes), Coach’s note |
| More actions | Modal | Profile "…" | `RosterPhone.tsx:581` | View stats, Mark inactive/active, Remove from team |
| Mark inactive/active? | confirm 460 | More actions | `RosterStatus.tsx:50` | Writes status |
| Remove player? | confirm 460 | More actions | `Roster.tsx:405` | "Keep {first}" / "Remove player" |
| Invite players | Modal | Icon, empty state, `?invite=1` | `Roster.tsx:917` | Team code Copy, invite link Share/Copy, Done |
| Email invites | sub-form | Inside Invite | `InviteByEmail.tsx:140` | Chips field, "Send {n} invites"; off CH-3980 |
| States | inline | — | `RosterPhone.tsx:182-233` | Refresh notice, CH-3202, CH-3201, "No players yet" CH-3301, skeleton CH-3401, no team CH-3306 |

Desktop adds Export, the Requests card, search, Status segmented, Team/List toggle, sort Avg/Handicap/Rounds/Name, RosterPeek, and a row kebab and right-click menu (`Roster.tsx:856`, `:388`).

## Roster, player (phone)

`TeamRosterPhone.tsx`: PhoneTop with no action (bell shows), Coaches and Players, sort Name/Class/Hcp (hidden when solo), static rows. States: CH-3210, CH-3307, solo CH-3309, no team CH-3308, skeleton.

Toasts: "{name} marked {status}", "Note saved for {first}", "{n} players added", "Team code copied", "Invite link copied", "{n} invites sent"; "Couldn’t…" failures (CH-3006, CH-3080).

## Coach Home (phone)

| Surface | Kind | Taps → destination | Component |
|---|---|---|---|
| Hero | header | — | `HomePhone.tsx:74` |
| Waiting on you | capsules | join requests → `/roster?tab=requests`; replies → `/calendar?date=&event=`; tasks → `/team-hub?tab=tasks`; posts → `/team-hub?tab=ann`; CH-2220 | `CoachQueue.tsx:57` |
| Day card | card | Title → event; Nudge / Message → `/messages?prefill=` (draft only); Directions → Apple Maps; recap row → Round sheet | `DayCard.tsx:67` |
| No events | state | Type chips and "Add event" → `/calendar?new=1` (CH-2309) | `HomePhone.tsx:222` |
| Class line | button | In class now, or Term sheet | `ClassHomeLine.tsx:98` |
| In class now | Modal 420 | Rows → messages; Edit/Set dates → Term; Mark a day → Breaks | `InClassSheet.tsx:93` |
| Term sheet | Modal 460 form | "Save dates" | `TermSheet.tsx:89` |
| Breaks | Modal 460 form | "Mark no classes"; remove confirm 420 | `TeamBreakSheet.tsx:76`, `:135` |
| Live now | card (`&live=`) | Live view, tournament live, PlayerLiveSheet (Modal 520) | `LiveNowCard.tsx:85` |
| Later today / Coming up | inline | Rows → event; Calendar | `DayCard.tsx:184` |
| Today empty | state | "Plan" → `/calendar?new=1` (CH-2301) | `HomePhone.tsx:263` |
| Since you last looked | inline | Rounds → Round sheet; changes → event | `DayCard.tsx:376` |
| Team scoring | inline | none; failed CH-2211 | `HomePhone.tsx:357` |
| The team’s game | inline | "Team stats" → `/stats`; names → `/stats?player=&tab=game`; CH-2218/2219/2314/2315 | `TeamLegs.tsx:204` |
| This week | inline | Day → `/calendar?view=day&date=` | `HomePhone.tsx:411` |
| Latest rounds | inline | Row → Round sheet; hold → PlayerPeek; CH-2202/2302 | `HomePhone.tsx:460` |
| Round sheet | Modal 520 | Message, Round recap or Player stats, CoachHelm | `HomePhone.tsx:549` |
| First run | state | "Invite players" → `/roster?invite=1`, "New event" (CH-2308) | `CoachHome.tsx:136` |
| Loading | skeleton | CH-2401 | `HomeSkeleton.tsx` |

## Shell

- Bell: drop-down sheet under the bar, "Notifications" / "Mark all read", closes by dragging up or tapping off (`shell/Bell.tsx:568`).
- Section strip: `shell/SectionStrip.tsx` (mounted `shell/ClubhouseFrame.tsx:209`), opened by the title button (`shell/section-switch.tsx:315`) or a pull on the bar; section pills plus "Account".
- Shell-wide: OfflineBanner (CH-1901), PullToRefresh.

## Preview routes (`src/app/clubhouse-preview/[screen]/page.tsx`)

- classes: default, clear, empty, failed, partial, mixed, noteam, loading; write fakes failwrites, failsync, failpartial; read-notschedule, read-fault, read-none, read-warn.
- roster: default, empty, failed, partial, availability, helm-failed, helm-off, invite-email, loading.
- roster-player: default, empty, failed, noteam, loading.
- home: default, empty, eventsonly, norounds, noevents, failed, loading, error, cachefailed, tourfailed, queuefailed, noholes, unranked; `&live=busy|one|many|finished|event|failed`.
- Any screen: `&bell=empty|failed|slow`, `&ask=push`.
- Open on load: Roster `&invite=1`, `&tab=requests`, `&player={id}`; Classes `&new=1`. Nothing opens Class detail, Import, the confirms, the Round sheet or the class-awareness sheets, so those need a fixture or a click step in capture.
