# Recruiting catalog (14xxx)

Route: `/golf/dashboard/recruiting` (coaches only). The page gives a Clubhouse coach the new screen and everyone else the current Fairway page; a player is sent Home before either, as the current page does. Spec: `docs/clubhouse/phone/recruiting.md`. Boards: `design/handoff/recruiting/` (the owner's canvas, approved 2026-09-30).

The coach's prospect tracker: high-school golfers a coach is following from first look to commitment, with their contact details, notes and private documents. It is a tracker, not a CRM: Email and Call are `mailto:` and `tel:` links, and nothing is sent from GolfHelm. A prospect is a row of `golf_recruits` and a document a row of `golf_recruit_documents` with its file in the private `recruit-documents` bucket, reached only through a link that expires. Every read and write is the current page's own server action (`getRecruits`, `createRecruit`, `updateRecruit`, `deleteRecruit`, `getRecruitDocuments`, `uploadRecruitDocument`, `deleteRecruitDocument`, `getRecruitDocumentUrl`), which scopes to the coach's active team; RLS limits both tables to the team's coach staff.

Where things live:
- Code: `src/clubhouse/screens/recruiting/` (`Recruiting` live wrapper, `RecruitingView`, `RecruitingDesktop`, `RecruitingPhone`, `Pipeline`, `Documents`, `ProspectForm`, `RecSheet`, `parts`, `writes`, `ctx`, `RecruitingSkeleton`, `RecruitingNoTeam`)
- Loader: `src/clubhouse/data/recruiting.ts` (`loadRecruiting`), with the pure rules in `recruiting-shape.ts` (stages, counts, shares, search, sort, dates, the form's checks, file screening)
- Route: `src/clubhouse/routes/recruiting.tsx`; page: `src/app/golf/(dashboard)/dashboard/recruiting/page.tsx`
- Tests: `src/clubhouse/__tests__/recruiting.test.tsx`
- Preview: `/clubhouse-preview/recruiting` (`?state=empty|nomatch|failed|loading|sparse|noteam|detail|add|edit|delete|docsfailed|failwrites|failstage|slow`; the default is the board's eight prospects with Mason Reilly open)

A stage is saved the moment it is picked. The prospect moves at once and goes back, with a Retry, if the save does not land (CH-14003); an add, an edit and a delete wait for the server. The pipeline's counts and shares are the whole list's, whatever the search says; a stage filter and the sort are remembered per browser (`localStorage`), not per account, as on the current page. A search looks at name, hometown, state, email and notes.

## 140xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-14001 | Adding a prospect fails | "Couldn't add Ellie Morrow" + the server's reason if it is a sentence, else "Nothing was added. Check your connection and try again." + Retry. The dialog or sheet stays open with what was typed. Done: "Ellie Morrow added" (CH-14905) | `useAction('recruiting.add')` → `writes.create` (`createRecruit`) | recruiting.test › CH-14001 |
| CH-14002 | Saving changes to a prospect fails | "Couldn't save Mason Reilly's changes" + the reason, else "Nothing was changed. Check your connection and try again." + Retry. The form stays open with what was typed. Done: "Mason Reilly saved" (CH-14906) | `useAction('recruiting.save')` → `writes.update` (`updateRecruit`) | recruiting.test › CH-14002 |
| CH-14003 | A stage change fails | "Couldn't move Mason Reilly to Committed" + "Mason Reilly is still Offered. Try again." + Retry. The prospect has already gone back to the stage it was in (the row, the panel, the pipeline's counts); Retry moves them again and, if that fails too, puts them back again | `useAction('recruiting.stage')` → `writes.update` (`updateRecruit`, status only); the move and its undo are both inside the action | recruiting.test › CH-14003 |
| CH-14004 | Deleting a prospect fails | "Couldn't delete Mason Reilly" + "Nothing was deleted. Check your connection and try again." + Retry. The question stays open and the prospect stays. Done: "Mason Reilly deleted" (CH-14907) | `useAction('recruiting.delete')` → `writes.remove` (`deleteRecruit`) | recruiting.test › CH-14004 |
| CH-14005 | Uploading a document fails | "Couldn't upload Fall schedule" + the server's reason if it is a sentence ("File is too large (max 25 MB).", "Unsupported file type.", "Only this team's coaches can add recruit documents."), else "Nothing was added. Check your connection and try again." + Retry. The dialog stays open with the title and category chosen. Done: "Fall schedule added" (CH-14908) | `useAction('recruiting.upload')` → `writes.documents.upload` (`uploadRecruitDocument`, which removes the stored file if its row does not save) | recruiting.test › CH-14005 |
| CH-14006 | Removing a document fails | "Couldn't remove Fall schedule.pdf" + "It is still on the prospect. Try again." + Retry. The question stays open and the document stays. Done: "Fall schedule.pdf removed" (CH-14908) | `useAction('recruiting.removeDocument')` → `writes.documents.remove` (`deleteRecruitDocument`) | recruiting.test › CH-14006 |
| CH-14007 | Opening a document fails | "Couldn't open Fall schedule.pdf" + "The link could not be made. Check your connection and try again." + Retry. Nothing is downloaded | `useAction('recruiting.openDocument')` → `writes.documents.open` (`getRecruitDocumentUrl`, then the in-app browser on the iPhone and an anchor on the web) | recruiting.test › CH-14007 |

## 141xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-14101 | Save with no first name | "Add a first name." beside the box (`role="alert"`, `aria-invalid`); focus goes to it. Nothing is sent | `checkDraft` | recruiting.test › CH-14101 |
| CH-14102 | A class year that is not a four-digit year from 2020 to 2040 | "Class year is a four-digit year from 2020 to 2040." (the box takes digits only) | `checkDraft` | recruiting.test › CH-14102 CH-14103 |
| CH-14103 | A state that is not two letters | "Use the two-letter state code, like NC." (the box capitalises and stops at two characters) | `checkDraft` | recruiting.test › CH-14102 CH-14103 |
| CH-14104 | A value past the server's limit: names and hometown 120 characters, email 254, phone 40, notes 5,000 | "Notes is too long (5,000 characters at most)." and so on, beside the field. The form takes the text as typed or pasted and says so on Save, so nothing is cut without the coach knowing | `checkDraft`, `FIELD_LIMITS` (the same limits as `validateRecruitInput`) | recruiting.test › CH-14104 |
| CH-14105 | A file over 25 MB | The dialog says "That file is over 25 MB" + "Choose a smaller file, or a lower-resolution copy." + Choose another file. Refused before anything is sent | `screenFile`, `MAX_FILE_BYTES` (the bucket's own limit) | recruiting.test › CH-14105 CH-14106 |
| CH-14106 | A file whose type the bucket does not take | "We can't take that file type" + "Use a PDF, an image, a text or spreadsheet file, or a Word or PowerPoint document." + Choose another file | `screenFile`, `DOC_EXTENSIONS` (the server's allowlist; film as video is not on it) | recruiting.test › CH-14105 CH-14106 |

## 142xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-14201 | The prospect list doesn't load | "Your prospects didn't load" + "Nothing was lost; this page just couldn't reach them. Check your connection and try again." (phone: "Nothing was lost. Check your connection and try again.") + Try again (asks the server again). It never reads as "your list starts here", the pipeline and search are not drawn, and Add prospect is still offered on desktop, as on the board | `InlineNotice`; `loadRecruiting` flags the read and logs `chLogServer('recruiting', 'prospects', …)` | recruiting.test › CH-14201 |
| CH-14202 | A prospect's documents don't load | In the Documents section: "Documents didn't load" + "Nothing is lost. Try again in a moment." + Try again (reads the list again). The rest of the prospect still works | `InlineNotice` in `Documents` | recruiting.test › CH-14202 |
| CH-14203 | A section crashes while drawing | "The pipeline couldn’t be shown." (or "The prospect list", "The prospect panel", "The prospect") + "The rest of the page is fine. This has been reported automatically." + Try again | `SectionBoundary recruiting.pipeline`, `recruiting.list`, `recruiting.panel` | recruiting.test › CH-14203 |

## 143xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-14301 | First run: no prospects | "Your prospect list starts here" + "Add the golfers you're watching. Keep their contact details, notes and documents in one place, and move them through Watched, Recruiting, Offered and Committed." + Add your first prospect. The pipeline shows four zeros and dashes (its buttons are off), and the header has no Add button: the page's own action is the one primary | `EmptyState size="page"`, `Pipeline` | recruiting.test › CH-14301 |
| CH-14302 | A search or a stage matches nothing | `No prospects match "Tampa" in Offered` + "Search looks at names, hometowns, email and notes. Try another word, or look across every stage." + Clear search · Search all stages. Only a stage: "No prospects in Offered" + "Nothing has reached this stage yet. Move a prospect here from their panel, or look across every stage." + Show all stages. The phone says `No match for "Tampa" in Offered`. The open prospect stays open beside it | `NoMatch` | recruiting.test › CH-14302 |
| CH-14303 | A prospect with no email and no phone | "No contact details yet" + "Add an email or phone number to reach Owen or their family from here." + Add (opens the form on Email). Email and Call appear once there is something to link to | `ContactSection`, `EmptyRow` | recruiting.test › CH-14303 CH-14304 |
| CH-14304 | A prospect with no notes | "No notes yet" + "Where you saw them, what stood out, and what happens next." + Add a note (opens the form on Notes) | `NotesSection`, `EmptyRow` | recruiting.test › CH-14303 CH-14304 |
| CH-14305 | A prospect with no documents | "No documents yet" + "Schedules, transcripts and film, private to your staff." + Upload | `Documents`, `EmptyRow` | recruiting.test › CH-14305 |
| CH-14306 | A coach on no team the page can resolve | "You aren't on a team yet" + "Recruiting is your team's list of prospects. Create or join a team, then add the golfers you're following." + Open team settings. Not on the boards: built from the same pattern as Roster's no-team page | `RecruitingNoTeam`, for `getRecruits`' `no_team` answer | recruiting.test › CH-14306 |

## 144xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-14401 | The page is on its way | The header, the pipeline, the table and the panel in their final slots; on a phone, the search, the timeline and seven rows | `RecruitingSkeleton` via `recruiting/loading.tsx`, inside the Clubhouse shell (`ClubhouseSwitch`); everywhere else the existing skeleton | recruiting.test › CH-14401 |
| CH-14402 | A prospect's documents are loading | Two rows where the list will be, marked busy, with "Loading documents" for a screen reader | `Documents` | recruiting.test › CH-14402 |
| CH-14403 | An add or a save is on its way | The button says "Saving" and is off; nothing closes the dialog or the sheet. After 5 seconds the shell says "Still saving…" once (CH-1902) | `ProspectForm`, `useAction` | recruiting.test › CH-14403 |
| CH-14404 | A document is uploading | The dialog's button says "Uploading" and is off | `UploadDialog` in `Documents` | recruiting.test › CH-14404 CH-14005 |
| CH-14405 | A document is being removed | The question's button says "Removing" and is off | `Documents` | recruiting.test › CH-14502 CH-14405 |
| CH-14406 | A prospect is being deleted | The question's button says "Deleting" and is off | `RecruitingView` | recruiting.test › CH-14501 CH-14406 |

## 145xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-14501 | Delete prospect, from the panel (desktop) or the edit sheet (phone) | Desktop: "Delete Mason Reilly?" + "This removes them from your list, with their notes and documents. This can't be undone." Keep them · Delete prospect (danger; "Deleting" while it runs). Phone: the same title and line as an action sheet, with Delete prospect in red and Cancel apart. Typing the name is not asked | `Modal` (desktop), `RecActionSheet` (phone) | recruiting.test › CH-14501 CH-14702 |
| CH-14502 | Remove a document | "Remove this document?" + "Fall schedule.pdf is deleted from Mason's documents. This can't be undone." Keep it · Remove document (danger; "Removing" while it runs) | `Modal` in `Documents` | recruiting.test › CH-14502 CH-14405 |

## 146xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-14601 | Hovering or pressing a stage in the pipeline | The stage's ring lifts 1px on hover and takes a second ring while it is the filter (quick). With reduced motion it changes without moving | `.ch-rec-pipe__dot`, `--ch-dur-quick` | preview |
| CH-14602 | A prospect opens on the phone | The screen slides in from the right over the list and back out on pop (base); with reduced motion it fades | `PhoneScreen` | preview |

## 147xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-14701 | A stage is picked, as the filter or as a prospect's stage; a row is opened; a sort is chosen | Selection | `Pipeline`, `Segmented`, `Menu`, `RecruitingView.select` | recruiting.test › CH-14701 |
| CH-14702 | Delete prospect is tapped | Warning, before the question | `RecruitingView.askDelete` | recruiting.test › CH-14501 CH-14702 |

## 148xx Accessibility

| # | When | They get | How | Test |
| --- | --- | --- | --- | --- |
| CH-14801 | A screen reader reaches the pipeline | One group named "Filter by stage"; each stage is a toggle button named "Offered, 1 prospect" with its pressed state, and is off while the list is empty | `Pipeline` (`aria-pressed`, `aria-label`) | recruiting.test › CH-14801 |
| CH-14802 | A screen reader moves through the prospects | Desktop: a real table with a caption and column headers, each name one button, the open one `aria-current`. Phone: a list of buttons named with the prospect, class and stage | `ProspectTable`, `RecruitingPhone` | recruiting.test › CH-14802 |
| CH-14803 | A stage is changed | The stage control is a radio group that arrow keys move; the new stage is announced politely ("Mason Reilly is now Committed") once it has saved | `Segmented` in `ProspectPanel`, the status line in `RecruitingView` | recruiting.test › CH-14803 |
| CH-14804 | A save is refused | Each message is beside its field with `role="alert"`, the field is `aria-invalid` and described by it, and focus moves to the first | `ProspectForm` | recruiting.test › CH-14804 |
| CH-14805 | Email and Call | Real links (`mailto:`, `tel:` with only digits and a plus) named by what they do, so the phone dials and the mail app opens; nothing is sent from GolfHelm | `ContactRows`, the tiles in `RecruitingPhone` | recruiting.test › CH-14805 |

## 149xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-14901 | Any write while offline | The shell's toast, "Couldn't move Mason Reilly to Committed: you're offline" + "Reconnect, then try again. Nothing was changed." + Retry (CH-1903). Nothing is sent and nothing moves, so there is nothing to put back | `useAction`, before the action runs | recruiting.test › CH-14901 |
| CH-14902 | A player opens Recruiting | They are sent Home before the page draws; the Clubhouse route itself draws nothing for a session with no coach | `page.tsx` (`redirect('/golf/dashboard')`), `ClubhouseRecruitingRoute` | recruiting.test › CH-14902 |
| CH-14903 | The server refuses a write because the caller is not the team's coach | The server's sentence is the toast's reason: "Only this team's coaches can add recruit documents." | `useAction`'s `friendlyReason` | recruiting.test › CH-14903 |
| CH-14904 | Recruiting opens | The header and its Add prospect, the pipeline with every stage's count and share, the list sorted by recently updated, and the first prospect's panel; the server read it all before first paint | `RecruitingDesktop`, `RecruitingPhone` (`main`) | recruiting.test › CH-14904 |
| CH-14905 | A prospect is added | "Ellie Morrow added" (toast). They are in the list and open, even if the search or stage would have hidden them | `RecruitingView` | recruiting.test › CH-14001 CH-14905 |
| CH-14906 | Changes to a prospect are saved | "Mason Reilly saved" (toast); the row, the panel and the pipeline show the change | `RecruitingView` | recruiting.test › CH-14002 CH-14906 |
| CH-14907 | A prospect is deleted | "Mason Reilly deleted" (toast); they leave the list and the counts, and the next prospect opens | `RecruitingView` | recruiting.test › CH-14004 CH-14907 |
| CH-14908 | A document is added or removed | "Fall schedule added" or "Fall schedule.pdf removed" (toast); the list reads again and keeps its rows on screen while it does | `Documents` | recruiting.test › CH-14005 CH-14908 |
| CH-14909 | A stage is picked | The prospect is in the new stage before the server has answered (the row's chip, the panel's control, the counts and shares), and goes back if the save fails (CH-14003) | `RecruitingView` (`moveAction`) | recruiting.test › CH-14003 CH-14909 |
| CH-14910 | A save fails | The dialog or sheet stays open with every field as it was typed | `ProspectForm` | recruiting.test › CH-14001 CH-14910 |
| CH-14911 | A write fails, or the list does not load | Retry on the toast runs the same action again with the same arguments, with everything that follows a write inside it; Try again on the notice reads the list again | `useAction`, `InlineNotice` | recruiting.test › CH-14003 CH-14911 |
| CH-14912 | The server sends a fresh list (after a write, or Try again) | It replaces the page's copy, so a retry after a failed read shows the prospects and never "your list starts here" | `RecruitingView` | recruiting.test › CH-14912 |
| CH-14913 | Keyboard | Enter in a field of the form saves it through the same checks as the button; Esc closes a dialog or clears the search; arrow keys move the stage | `ProspectForm`, `Modal`, `SearchField`, `Segmented` | recruiting.test › CH-14913 |
| CH-14914 | The phone | At 820px and below Recruiting is the phone build from the owner's boards, never a shrunken desktop: the top bar reads Recruiting with "‹ More", a prospect is a pushed screen, and the edit form, the stage picker and delete are bottom sheets | `RecruitingPhone` | recruiting.test › CH-14914 |
