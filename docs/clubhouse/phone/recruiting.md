# Phone: Recruiting (coach)

Status: approved. The owner's boards are the spec: the eight `Phone*` boards in `design/handoff/recruiting/` (canvas "Clubhouse Recruiting", https://claude.ai/artifact/BuCcHSQ3ps3zJxcsmraTza, approved 2026-09-30, Q-87). They draw one page in eight frames: the list (`PhoneList`), a prospect (`PhoneDetail`), the edit sheet (`PhoneEdit`), the stage picker (`PhoneStage`), first run (`PhoneEmpty`), no match (`PhoneNoMatch`), a prospect with nothing yet (`PhoneSparse`) and did not load (`PhoneFailed`). The mockups win over any prose here.

The route is `/golf/dashboard/recruiting`, for coaches. It is in the Team section of the sidebar, after Roster (production puts Recruiting HQ beside Roster in its Players hub), and on the phone it opens from More (D-66), so the top bar goes back to More (`useBackFromMore`).

Built in `src/clubhouse/screens/recruiting/`: `RecruitingPhone` (the list and the pushed prospect), `RecSheet` (the edit sheet, the stage picker and the action sheet, on the native `<dialog>`), `ProspectForm` (the form's rows, shared with desktop), `Documents`, `Pipeline` (`compact`). `RecruitingView` holds the state and the writes and draws `RecruitingPhone` under 820px (`useChPhone`), so desktop and phone are one screen with one catalog.

## Board to component

| Board | Component and behaviour |
| --- | --- |
| `PhoneList`: "‹ More", "+", the large title, Search, the compact timeline, "8 prospects" with "Recently updated ⌄", rows | The shell's `PhoneTop` (back to More, and Add prospect as the one action), the large title (hidden from assistive tech: the top bar carries the heading), `SearchField`, `Pipeline compact` (four 40px stages on one line, the same filter as desktop), the count and a `Menu` for the sort (Recently updated, Name, Class year; ticks the choice), and one 64px row per prospect: monogram, name, "2027 · Charlotte, NC", stage chip. "8 of 12" when a search or stage narrows the list |
| `PhoneDetail`: back "Recruiting", "Edit", the hero, three tiles, Notes, Documents with Upload, "Added Aug 12 · Updated 2 days ago" | A pushed screen (`PhoneScreen`, a history entry so the iOS edge swipe pops it, CH-1906; CH-14602). Stage, Email and Call as tiles: Stage opens the picker, Email is a `mailto:` link and Call a `tel:` link (nothing is sent from GolfHelm). Notes as a card, Documents with Upload and a 52px row per file (title and category tag; a trailing remove button is not on the board, see "Not on the boards") |
| `PhoneEdit`: "Cancel", "Prospect", "Save", grouped rows, Notes, Delete prospect | `RecFormSheet`: a bottom sheet that drags to close (CH-1611), Cancel and Save in its bar, three grouped cards (first and last name; email and phone; hometown, state and class), Notes, and Delete prospect, which opens the action sheet. The sheet is the form, so Enter saves. Nothing closes it while a save runs, and a failed save leaves it open with what was typed (CH-14910) |
| `PhoneStage`: "Stage", "Done", four rows, "Saves as soon as you pick. Players never see this." | `RecPickSheet`: a row per stage with its chip and blurb and a tick on the current one. A pick saves at once and the tick moves before the answer; a pick that fails goes back with a Retry toast inside the sheet (CH-14003). Done closes it. Arrow keys move the pick |
| `PhoneEmpty` | `EmptyState size="page"` (CH-14301) with "Add your first prospect"; no search, no timeline, no "+" in the top bar |
| `PhoneNoMatch` | `NoMatch phone` (CH-14302): `No match for "Tampa" in Offered`, "Try another word, or look across every stage.", Search all stages first, then Clear search |
| `PhoneSparse` | A Stage row (chip and chevron) in place of the tiles, then "No contact details yet", "No notes yet" and "No documents yet", each with its own action (CH-14303 to CH-14305); the headings above them are hidden so nothing is said twice |
| `PhoneFailed` | `InlineNotice` (CH-14201): "Your prospects didn't load", "Nothing was lost. Check your connection and try again.", Try again; no "+" |

## Delete on the phone

The destructive action sheet of the owner's brief: a title ("Delete Mason Reilly?"), a line ("This removes them from your list, with their notes and documents. This can't be undone."), Delete prospect in red, and Cancel apart below it (`RecActionSheet`, CH-14501). A warning haptic is felt before it opens (CH-14702). Typing the name is not asked.

## Not on the boards (built from Clubhouse parts, open questions in `pages/P014-recruiting/DESIGN.md`)

- **Add prospect on the phone.** `PhoneList`'s "+" goes to the edit sheet. A new prospect opens the same sheet titled "New prospect" with "Add" for its action and one more row, Stage (Watched, Recruiting, Offered, Committed), because a new prospect has no Stage tile yet; it starts at Watched, as the desktop Add board does.
- **Upload.** A chosen file opens a bottom sheet (`Modal`) with its title, pre-filled from the file name, and its category (Note, Schedule, Transcript, Film, Other), as the current page asks. A file over its limit (25 MB, or 100 MB for film: MP4, MOV, M4V) or of a type the bucket does not take is refused there (CH-14105, CH-14106), and so is a file Storage turns down after it was sent (CH-14107, CH-14108). The phone keeps the file picker, which offers film; it has no file drop and no drop hint (CH-14917 is desktop only). A film shows the transfer's progress and "Keep this page open until it finishes" (CH-14407).
- **Remove a document.** A 44px trash button at the end of each row, then a question (CH-14502).
- **A stage with nobody in it** (CH-14302 without a search) and **no team** (CH-14306).
- **Pronouns.** The boards' sample copy says "him" and "his" for a prospect. The page cannot know, so its copy says "them" and "their" ("Add an email or phone number to reach Owen or their family from here.").

## Phone notes

- Every control is 44 x 44 or has a hit area that reaches it; text fields are 16px so iOS does not zoom. The native scan (`scripts/clubhouse/native.mjs recruiting` at 390 and 430) checks both.
- The tab bar stays (More is on). The keyboard never resizes the page: an open sheet sits on top of it (`body.keyboard-open`).
- Not yet: a pass on a real iPhone (keyboard with the edit sheet open, swipe-back with a sheet open, haptics felt, a file chosen from Photos and Files).
