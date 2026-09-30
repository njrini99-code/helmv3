# P014 — Recruiting: design handoff

## Package

```text
Source:   the owner's Claude Design canvas "Clubhouse Recruiting" (https://claude.ai/artifact/BuCcHSQ3ps3zJxcsmraTza),
          copied into design/handoff/recruiting/ as thirteen boards (*.dc.html) and canvas.json (VERSIONS.md)
Version:  owner-approved boards, 2026-09-30 (Q-87)
          Desktop: Main, AddProspect, Empty, NoMatch, LoadFailed
          Phone:   PhoneList, PhoneDetail, PhoneEdit, PhoneStage, PhoneEmpty, PhoneNoMatch, PhoneSparse, PhoneFailed
Date:     2026-09-30
Status:   approved for the page's five desktop states and eight phone states. What the boards do not draw is built
          from Clubhouse's own parts and listed under "Not on the boards" (open)
```

The boards win over any prose, including the existing page's and this page's docs. Every board is the coach's view,
which is the only view there is: Recruiting has no player screen.

## Design objective

A quiet list a coach can keep open all season: the pipeline says where everyone stands, the list says who they are,
and the panel holds what the coach knows, with one primary action on the screen and a stage that changes in one tap.

## Problems being solved

A recruiting list in a spreadsheet and a notes app, with schedules in the camera roll; no sense of where the list
is heavy; a prospect's contact details three apps away.

## User goal

See where the recruiting list stands, open a prospect, change their stage or read what was written, and get back to
the list.

## Visual hierarchy

Desktop: the header (title, the count line, Add prospect), the pipeline of four stages with counts and shares, then
the list beside the open prospect's panel. The phone: the top bar (back to More, Add), the large title, search, the
compact pipeline, the count with its sort, then the rows; a prospect is a pushed screen with the hero, three tiles,
notes and documents.

## Components

### Reused Clubhouse primitives

`Button`, `EmptyState` (page size, D-71), `Icon`, `InlineNotice`, `Menu` (the phone's sort), `Modal` (a sheet on the
phone), `PillGroup`, `SearchField`, `Segmented` (the sort, and the stage control), `SectionBoundary`, `Skeleton`,
`PhoneTop`, `PhoneBar`, `PhoneIconAction`, `PhoneTextAction`, `PhoneScreen` (with `usePhoneStackHistory`),
`useBackFromMore`, `useChPhone`, `useChReducedMotion`, `useSheetDrag`, `useToast`, `useAction`, `haptic` and
`chTrail`. The press (`useChPress`) is mounted by the shell and reaches every button and link; this page does not
call it.

### New Clubhouse components

`Recruiting` (the live wrapper), `RecruitingView` (the state, the intents and the five writes; it draws the desktop
or the phone), `RecruitingDesktop` (header, list table, search and sort, `ProspectPanel`, `NoMatch`),
`RecruitingPhone` (the list, the pushed prospect and the stage sheet), `Pipeline` (with a `compact` form),
`Documents` (list, loading, failed, empty, the file drop, the upload dialog with its progress, the removal question), `ProspectForm` (the form's
rows, in a `Modal` on desktop and a `RecFormSheet` on the phone), `RecSheet` (`RecFormSheet`, `RecPickSheet`,
`RecActionSheet`: bottom sheets on the native `<dialog>`, dragged to dismiss), `parts` (`StageChip`, `EmptyRow`,
`ContactRows` and the like), `RecruitingSkeleton`, `RecruitingNoTeam`, `writes.ts` (every write behind one
interface, faked whole in tests and the preview), `upload.ts` (the transfer to Storage: prepare, PUT with progress, complete) and `ctx.ts` (what the view hands the two layouts). The pure rules
(stages, counts, shares, search, sort, dates, the form's checks, file screening) are in
`src/clubhouse/data/recruiting-shape.ts`; the server-only read is `data/recruiting.ts`.

### Modified Clubhouse components

The shell's navigation (`shell/nav.ts`: Recruiting in the coach's Team section after Roster, and the route marked
rebuilt). Nothing else in shared Clubhouse code was changed for this page.

## Actions affected

The list is `config/clubhouse/pages/P014-recruiting.json` `actions`, and the graph is WIRING.md.

## Contract categories affected

All 25 (CONTRACT.md).

## Motion intent

A stage in the pipeline lifts its ring 1px on hover and takes a second ring while it is the filter (CH-14601); a
prospect opens on the phone by sliding in over the list (CH-14602, the shell's pushed screen). The rest is the
shell's: the press (about 6px) and the first-paint rise. No count-ups and no stagger; this page's CSS uses only the v2
tokens (`--ch-dur-quick`, `--ch-dur-base`; D-64). Reduced motion and Animations off remove all of it.

## Haptic intent

v2 grammar (D-70): selection for a stage, a row and a sort; warning before Delete prospect and Remove document;
success when a write lands; error when it fails. Every other tap is silent.

## Desktop

The header holds the title, one line ("Prospects you're following, from first look to commitment. Only coaches see
this page.") and Add prospect. Under it the pipeline: four stages joined by a line, each a dot with its name, count
and share of the list (largest remainder, so the shares always sum to 100). Below, two columns: the list (a search
box and a sort above a table of Prospect with its monogram, Class, Hometown, Stage and Updated) and the open
prospect's panel (name, class and hometown, the stage control, Edit, contact rows with Email and Call, notes,
documents with Upload, and the added and updated dates). A
narrow canvas (container under 860px) drops the panel beneath the list and narrows the columns. Add and Edit open a
dialog; Delete asks in another.

## Phone

Approved spec `docs/clubhouse/phone/recruiting.md`. The list sits under a "‹ More" top bar with "+" as its one
action; a prospect is a pushed screen (an iOS edge swipe pops it); the edit form, the stage picker and delete are
bottom sheets that drag to dismiss; the sort is a menu. The tab bar stays.

## Accessibility

A captioned table with a button for each name and `aria-current` on the open one; the pipeline is a named group of
toggle buttons; the stage control is a radio group; a polite status line announces a stage change; field alerts are
tied to their fields; sheets and dialogs are native `<dialog>`s that hold focus and return it. No charts.

## Data assumptions

Only data the app has. Every figure is a column of `golf_recruits` (first and last name, email, phone, hometown,
state, class year, notes, status, created and updated dates) or a row of `golf_recruit_documents` (title, category,
file name, type, size, date). The pipeline's counts and shares are computed from the list, not stored, and do not
follow the search. The stage filter's "share" is the stage's part of the whole list, not of the search.

Not shown because no source exists: a recruit's photo, a rating, a rank, a school, a last-contacted date, or a
stage history. The monogram is the initials.

## Existing backend capabilities used

`getRecruits`, `createRecruit`, `updateRecruit`, `deleteRecruit` (`src/app/golf/actions/recruiting.ts`) and
`getRecruitDocuments`, `deleteRecruitDocument`, `getRecruitDocumentUrl` and, for an upload, `prepareRecruitDocumentUpload`
then `completeRecruitDocumentUpload` (`recruit-documents.ts`; the current page keeps `uploadRecruitDocument`). Two
additions on the server, both optional for the current page: `createRecruit` takes a request id, and the two upload steps
send the file straight to Storage (a server action's body is capped far below a film). WIRING.md maps each.

## HELD requirements

### New features

None.

### New data/schema

The film migration (item 6 above), written and not applied: `supabase/migrations/20260930140000_recruit_documents_film.sql`.

### Owner decisions

Q-87 (the boards); D-64 (motion), D-66 (navigation), D-70 (haptics) and D-71 (page empty state) apply.

## Not on the boards

Built from Clubhouse parts in the boards' style; each is an open question for the owner (proposed, not recorded in
PROGRESS.md by this session):

1. **The upload dialog.** The boards show Upload but not what it opens. It asks for a title (pre-filled from the file
   name) and a category (Note, Schedule, Transcript, Film, Other), as the current page does.
2. **Removing a document.** No control is drawn. A 44px trash button on each row, then a question (CH-14502).
3. **No team.** A page that says so and opens Team Settings (CH-14306), built from Roster's pattern.
4. **A stage with nobody in it.** The filter says "No prospects in Offered" and offers Show all stages (CH-14302).
5. **Add prospect on the phone.** The boards' "+" goes to the edit sheet; a new prospect gets one more row, Stage,
   and starts at Watched, as the desktop Add board does. The current page's server default for a new prospect is
   Recruiting; the boards' Add dialog shows Watched, and the boards win.
6. **Film (decided 2026-09-30, Q-95 item 6: film uploads are allowed, as a file drop).** The board's sample
   `Swing, down the line.mov` can be uploaded once the migration is applied: MP4, MOV and M4V up to 100 MB (everything
   else stays at 25 MB), refused before sending with "That film is over 100 MB" (CH-14105) and, if Storage still turns
   one down, in the dialog with "Storage won't take that file type" or "a file this large" (CH-14107, CH-14108). The
   file goes straight to Storage on a signed URL (a server action's body is capped far below a film), with a real
   progress bar and "Keep this page open until it finishes" (CH-14407). A video chosen or dropped starts as Film.
   The 100 MB cap is a stated assumption: the project's upload limit could not be read.
   **The file drop** (desktop only; "as a file drop" is the owner's word): dropping a file on a prospect's Documents
   opens the same dialog as Upload. The section shows a dashed edge and "Drop a file to add it" while a file is over it
   (CH-14917). One file at a time: several files or a folder are refused with a sentence (CH-14109, CH-14110). The
   Upload button stays, as the keyboard path and the phone's only one; the phone has no drop and no hint.
7. **Pronouns.** The boards' sample copy says "him" and "his". The page cannot know a prospect's pronouns, so its copy
   says "them" and "their".
8. **A remembered filter.** The stage filter and the sort are kept per browser (`localStorage`), as on the current
   page; the owner may prefer the page to always open unfiltered.

## Explicit non-goals

Sending anything: no email or text is sent from GolfHelm. No player-facing view. No import, export or sharing of a
list. No stage history, reminders or tasks. No change to what the current page's server actions do: the additions
are an optional request id on `createRecruit` and two new upload steps. The one schema change is the film migration.
