# Fidelity and completeness audit: Practice plan (+ Practice tab, Documents) and Messages

Auditor: read-only fidelity agent, 2026-11-06. Repo `helmv3` at main `062f8a2`. File name: the brief's pattern `fidelity-<slug>.md` with slug `fidelity-practice-msg` would give `fidelity-fidelity-practice-msg.md`, so this file is `fidelity-practice-msg.md`.

Already in `lanes/practice.md` (PP-1 to PP-33), `lanes/messages.md` (MSG-1 to MSG-19) and `qa-staging.md` (QA-15, QA-16, QA-17). None of those findings is repeated here. Two earlier findings were wrong when checked against the code:
- **PP-3** says the plan page has no Back. On phone, the shell's stand-in bar draws "Back · Practice plan" (`src/clubhouse/shell/nav.ts:369-370`, `TopBar.tsx:55`, `standIn = pageTop ? null : pushed`). The real problem is the doubled bar described in FID-PRAC-10.
- **PP-17** says random has no dark override. It has one (`coachhelm-plan.css:119`, `#c9a35d`), but both values are ochre rather than plum. See FID-PRAC-11.

Design sources used: `design-refresh/practice-plan/` (02-PLAN incl. N-00 §0.1 and §0.2, 04-FIDELITY-SPEC, 05-SCREENS, 06-SCREEN-SPECS, 08-ACCEPTANCE, `redesign/coachhelm-practice.html`, COACHHELM_PRACTICE_PLAN.md) and `design-refresh/messages/` (05, 06 incl. tokens, SETTLED-4NOV.md, pin-sync/).

## Subpage inventory

Status values: matches / drifts / missing in code / missing in design / unreachable. Where a row says "drifts", the finding is named.

| lane | subpage/state | phone/desktop | file:line | design ref | status |
|---|---|---|---|---|---|
| PRAC | /practice home (Practice tab) | both | none (no `src/app/golf/(dashboard)/dashboard/practice/page.tsx`; nav.ts:35-36 has no Practice entry) | 02-PLAN N-00 §0.2 route 1; 4.1 | missing in code (FID-PRAC-1) |
| PRAC | /practice/drills (drill library) | both | none | N-00 §0.2 route 2; 4.4 | missing in code (FID-PRAC-1) |
| PRAC | /practice/drills/[id] (drill detail and editor) | both | none | N-00 §0.2 route 3 | missing in code (FID-PRAC-1) |
| PRAC | /practice/groups (saved groups) | both | none | N-00 §0.2 route 4; 4.6 | missing in code (FID-PRAC-1) |
| PRAC | /practice/templates (templates plus six starters) | both | none | N-00 §0.2 route 5; 4.8 | missing in code (FID-PRAC-1) |
| PRAC | plan/[id]/edit builder: Blocks step | both | none | S-BLD.new-sheet, S-BLDD.board; N-00 4.2 | missing in code (FID-PRAC-1) |
| PRAC | builder: Groups step | both | none | S-BLD.*; N-00 4.6 | missing in code (FID-PRAC-1) |
| PRAC | builder: Drills step (drill bank picker) | both | none | S-BLDD.inspector; N-00 4.4 | missing in code (FID-PRAC-1) |
| PRAC | builder: Review step | both | none | N-00 4.2 | missing in code (FID-PRAC-1) |
| PRAC | builder helper (CoachHelm ghosts, kept) | both | none | S-BLD.helper / ghosts / kept | missing in code (FID-PRAC-1) |
| PRAC | print/[id] print studio | desktop | none | N-00 §0.2 route 8; 4.11 | missing in code (FID-PRAC-1) |
| PRAC | /practice/makeup | both | none | N-00 §0.2 route 9 | missing in code (FID-PRAC-1) |
| PRAC | Run view (live practice) | phone | none | N-00 4.13 | missing in code (FID-PRAC-1) |
| PRAC | Calendar Plan row | both | none (grep for a plan row in the calendar finds none) | N-00 4.15 | missing in code (FID-PRAC-1) |
| PRAC | Share sheet / Share PDF | both | none (no "Share PDF" anywhere in `src/`) | S-ASK.share-pdf, S-FMT.see dock, S-PLY.plan bar | missing in code (FID-PRAC-6) |
| PRAC | Plan page, coach | phone | src/clubhouse/routes/practice.tsx (PracticePlanRoute); app/.../practice/plan/[planId]/page.tsx:7 | S-DOC.sheet-coach | drifts (FID-PRAC-15..20) |
| PRAC | Plan page, coach | desktop | same | S-DOC.sheet-coach; QA-15 | drifts (QA-15 plus FID-PRAC-20) |
| PRAC | Plan page actions bar (Print only) | both | src/clubhouse/screens/coachhelm/plan/PlanPageActions.tsx | S-DOC.sheet-coach bar (Print, Share PDF) | drifts (FID-PRAC-6) |
| PRAC | Plan page, player | phone | routes/practice.tsx → PlayerPractice.tsx | S-PLY.practice | drifts (FID-PRAC-23, -24) |
| PRAC | Plan page, player "Open the plan" (full sheet) | phone | data/practice-plan.ts:98 (`planHref: null`) | S-PLY.plan | unreachable (FID-PRAC-7) |
| PRAC | Plan page, player print | both | none | S-DOC.print-player | unreachable (FID-PRAC-7) |
| PRAC | Plan page empty ("This plan isn't available" + Go to Calendar) | both | routes/practice.tsx | none | missing in design |
| PRAC | Plan page loading | both | app/.../plan/[planId]/loading.tsx (`<SkelRows rows={8}/>`) | 07-MOTION / RUBRIC skeleton rule | drifts (FID-PRAC-25) |
| PRAC | Plan page error | both | app/.../plan/[planId]/error.tsx (Fairway RouteErrorBoundary) | none (Clubhouse error rule) | drifts (FID-PRAC-25) |
| PRAC | Print (coach), window.print | desktop | src/clubhouse/screens/coachhelm/plan/PrintPlan.tsx:14 | S-DOC.print-coach; 04 §print | drifts (FID-PRAC-19) |
| PRAC | Plan format: empty | both | src/clubhouse/screens/coachhelm/plan/format/PlanFormat.tsx | S-FMT.empty | drifts (FID-PRAC-10, -21) |
| PRAC | Plan format: upload sheet | both | PlanFormat.tsx:75 | S-FMT.upload-sheet | drifts (FID-PRAC-5) |
| PRAC | Plan format: reading | both | PlanFormat.tsx | S-FMT.reading | matches (no new miss) |
| PRAC | Plan format: found | both | PlanFormat.tsx | S-FMT.found | drifts (FID-PRAC-22) |
| PRAC | Plan format: set receipt | both | PlanFormat.tsx | S-FMT.set | drifts (FID-PRAC-21) |
| PRAC | Plan format: see (sample in format) | both | PlanFormat.tsx | S-FMT.see | drifts (FID-PRAC-3, -6) |
| PRAC | Plan format: undone | both | PlanFormat.tsx; actions/coachhelm-plan-format.ts:50 | S-FMT.undone | drifts (FID-PRAC-4) |
| PRAC | Plan format: desktop | desktop | PlanFormat.tsx:118-124 | S-FMT.*; QA-16 | drifts (QA-16) |
| PRAC | Plan format loading | both | app/.../format/loading.tsx (CoachHelmRouteSkeleton) | none | missing in design |
| PRAC | Plan format error | both | app/.../format/error.tsx:20 | none | drifts (FID-PRAC-13) |
| PRAC | Ask: draft plan card | both | src/clubhouse/screens/coachhelm/plan/PlanCard.tsx | S-ASK.plan-card | matches beyond PP-n |
| PRAC | Ask: full plan portal | both | PlanCard.tsx:682-740 | S-ASK.full-plan | drifts (FID-PRAC-6, -20, -27) |
| PRAC | Ask: saved receipt | both | PlanCard.tsx | S-ASK.saved | matches beyond PP-n |
| PRAC | Ask: publish confirm | both | src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:118 | S-ASK.publish | drifts (FID-PRAC-24) |
| PRAC | Ask: published receipt | both | ConfirmCard.tsx:284 | S-ASK.published | drifts (FID-PRAC-8, -9) |
| PRAC | Ask: publish failed | both | ConfirmCard.tsx:279 | S-ASK.publish-failed | drifts (FID-PRAC-9) |
| PRAC | Ask: publish undone | both | ConfirmCard.tsx:245 | S-ASK.undone | matches |
| PRAC | Player notification (push + in-app) | phone | actions/practice-publish.ts; lib/golf/practice-fanout.ts | S-PLY.notify | matches beyond PP-n |
| PRAC | Team chat plan post | both | lib/coachhelm/v3/chat/practice-draft.ts:170 | default 4; N-00 4.16 team chat plan card | drifts (FID-PRAC-8) |
| PRAC | Seen by (plan) | both | none | N-00 4.17; S-DOC.list-shared | missing in code (FID-PRAC-8) |
| PRAC | Documents › Practice plans list, draft row | both | src/clubhouse/screens/hub/parts.tsx:680-790; data/hub.ts:905 | S-DOC.list-draft | drifts (FID-PRAC-14) |
| PRAC | Documents › Practice plans list, shared row | both | same | S-DOC.list-shared | drifts (FID-PRAC-14) |
| PRAC | Documents plan row → open | both | parts.tsx (openDocument → writes.ts:105-108) | S-DOC.sheet-coach | unreachable (FID-PRAC-2) |
| PRAC | Documents plan row menu → Delete | both | parts.tsx:777 | none | drifts (FID-PRAC-14) |
| PRAC | Player Documents › Practice plans | phone | data/practice-plan.ts:97 (static string) | S-PLY.docs | drifts (FID-PRAC-7) |
| PRAC | Sheet: long data (12+ players, many stops) | both | PracticePlanSheet.tsx | 06 S-ASK.full-plan (rotation container query) | drifts (FID-PRAC-20) |
| PRAC | Sheet: one-item / empty Bring | both | plan-sheet-model.ts:89; PracticePlanSheet.tsx | none | drifts (FID-PRAC-17) |
| MSG | Inbox list (V2) | phone | src/clubhouse/screens/messages/MessagesPhone.tsx:256 | 05 S-MSG | drifts (FID-MSG-2..4) |
| MSG | Inbox rail | desktop | MessagesView.tsx:659 | 05 S-MSG; QA-17 | drifts (QA-17) |
| MSG | Pinned card (Pin up to 3) | both | MessagesPhone.tsx:328-339; MessagesView.tsx:633; messages.css:4241-4330 | 06 MSG-LIST-07 | drifts (FID-MSG-1..4) |
| MSG | Unread state | both | MessagesView.tsx:364 (ConvRow) | 05 S-MSG.unread | matches beyond MSG-n |
| MSG | Row menu | both | MessagesView.tsx:532, 443 (mute modal) | 05 S-MSG.row-menu | matches (order checked) |
| MSG | Pin toasts | both | use-conversation-pins.ts | kept (not drawn) | matches |
| MSG | Empty (first run) | both | MessagesFirstRun.tsx:14 | 05 S-MSG.empty; 06 empty card 358×384.8 | drifts (FID-MSG-8, -11) |
| MSG | Fresh (HelloCard) | both | HelloCard.tsx:13 | 06 MSG-FRESH-01 | drifts (FID-MSG-5) |
| MSG | No team | both | MessagesNoTeam.tsx:18 | kept (not drawn) | matches |
| MSG | Rail empty / no search results | desktop | RailEmpty.tsx:11 | none | missing in design |
| MSG | Loading skeleton | both | MessagesSkeleton.tsx:10 | none | missing in design |
| MSG | Thread | phone | MessagesPhone.tsx:495 | 05 S-MSG.thread | matches beyond MSG-n |
| MSG | Thread | desktop | MessagesView.tsx:2256 | 05 S-MSG.thread | matches beyond MSG-n |
| MSG | Date pill / jump key | both | thread-v2.tsx:11, 59 | 05 date-pill, jump | matches |
| MSG | Typing ("Several people are typing") | both | MessagesView.tsx:516, 527 | 05 typing | matches |
| MSG | Times, NewDivider | both | MessagesView.tsx:2219-2239 | 05 times | matches |
| MSG | Composer | both | MessagesView.tsx:1834 | 05 composer | matches beyond MSG-n |
| MSG | Composer + attach sheet | both | ComposerPlusV2.tsx:15; messages.css:4798-4810 | 05 attach; Ruling 15; 06 tokens 52-54 | drifts (FID-MSG-9) |
| MSG | Attachments: image, file | both | MessagesView.tsx:918, 942 | 05 file | matches beyond MSG-n |
| MSG | Reply quote | both | MessagesView.tsx:1624 | 05 reply | matches |
| MSG | Edit message modal | both | MessagesView.tsx:2563 | 05 edit | matches |
| MSG | Delete message modal | both | MessagesView.tsx:2614 | kept (delete/leave) | matches |
| MSG | Poll composer sheet | both | polls.tsx:657 | 05 poll-composer | matches beyond MSG-n |
| MSG | Poll card / votes / close | both | polls.tsx:209, 460, 558 | 05 poll, votes | matches beyond MSG-n |
| MSG | Hold (lift) menu | both | hold-lift.tsx:22 | 05 hold, holdseen | matches beyond MSG-n |
| MSG | Reactions / who reacted | both | MessagesView.tsx:799 | 05 react; kept who-reacted | matches beyond MSG-n |
| MSG | Seen by receipt / pill / sheet / popover | both | seen-by.tsx:47-369 | 05 seen | matches beyond MSG-n |
| MSG | Notify anyway / pending / offline | both | NotifyAnyway.tsx:18-71 | kept (not drawn) | matches |
| MSG | Class line (group from a class) | both | GroupClassLine.tsx:18; ThreadClassSection.tsx:15 | kept (class line) | matches |
| MSG | Details (direct) | phone | MessagesPhone.tsx:910; details-v2.tsx:90 | 05 details | matches beyond MSG-n |
| MSG | Details (group) + members | both | MessagesView.tsx:2868; details-v2.tsx:184 | 05 groupdetails | matches beyond MSG-n |
| MSG | Mute menu | both | details-v2.tsx:63; MessagesView.tsx:3109 | 05 mute | matches |
| MSG | Conversation search | both | details-v2.tsx:168; message-hits.tsx:12 | kept (search) | matches |
| MSG | Photos and files | both | details-v2.tsx:271; MessagesPhone.tsx:1169 | 05 details | matches |
| MSG | Add / remove member, leave, delete conversation | both | MessagesView.tsx:2657-2782 | kept | matches |
| MSG | New message | phone | MessagesPhone.tsx:1205, 1435 | 05 S-MSG.new | drifts (FID-MSG-6) |
| MSG | New message | desktop | NewMessagePane.tsx:18, 34, 73 | 05 S-MSG.new | drifts (FID-MSG-7) |
| MSG | Announcements list | both | announcements.tsx:23 | kept (announcements) | drifts (QA-17) |
| MSG | Announcement detail | both | announcements.tsx:122 | kept | matches |
| MSG | Announcement form | phone | MessagesPhone.tsx:1489 | kept | matches beyond MSG-n |
| MSG | Switch control (Mute toggle off state) | both | tokens.css:683 | 06 tokens | drifts (FID-MSG-10) |

Rows: 93 (52 Practice plan, 41 Messages).

## Feature checklist

| lane | claimed feature (source §) | built | real data | reachable | works | flag | evidence |
|---|---|---|---|---|---|---|---|
| PRAC | Practice tab home (N-00 §0.2 r1, 4.1) | no | n/a | no | no | golf_practice_plans | no page.tsx under app/.../practice; nav.ts:35-36 |
| PRAC | Plan builder, four steps Blocks/Groups/Drills/Review (N-00 4.2) | no | n/a | no | no | golf_practice_plans | no plan/[id]/edit route |
| PRAC | Blocks: add, reorder, time per block (N-00 4.3) | no | n/a | no | no | — | no builder |
| PRAC | Drill bank / library with team drills (N-00 4.4) | read-only in Ask | yes, capped 20+20 | via Ask only | partly | coachhelm_practice_plans_v1 | practice-reads.ts:24,27,31 |
| PRAC | Drill detail / editor (N-00 4.5) | no | n/a | no | no | — | no drills/[id] route |
| PRAC | Saved groups (N-00 4.6) | no | n/a | no | no | — | no groups route |
| PRAC | Rotation grid (N-00 4.7; 06 S-ASK.full-plan) | yes (sheet only) | yes | yes | yes | — | PracticePlanSheet.tsx |
| PRAC | Templates plus six starters (N-00 4.8) | no | n/a | no | no | — | no templates route |
| PRAC | Plan format: upload, read, set (S-FMT.*) | yes | yes | from Ask link only | partly | coachhelm_practice_plans_v1 | PlanFormat.tsx; coachhelm-plan-format.ts:43 |
| PRAC | Plan format applied to drafts and sheets (S-FMT.set "Plans from Ask and the builder now use it") | no | n/a | n/a | no | — | no reader of `sections` (FID-PRAC-3) |
| PRAC | "It learns as you go" (S-FMT.found / COACHHELM_PRACTICE_PLAN.md) | no | n/a | n/a | no | — | no implementation |
| PRAC | Format Undo restores prior (S-FMT.undone) | partly | yes | yes | no | — | coachhelm-plan-format.ts:43,50 |
| PRAC | Ask drafts a plan (S-ASK.plan-card) | yes | yes | yes | yes | coachhelm_practice_plans_v1 | practice-draft.ts |
| PRAC | Save plan to Documents (S-ASK.saved) | yes | yes | yes | yes | coachhelm_practice_plans_v1 | actions/practice-plans.ts |
| PRAC | Full plan view in Ask (S-ASK.full-plan) | yes | yes | yes | partly | — | PlanCard.tsx:682-740 |
| PRAC | Print, coach (S-DOC.print-coach) | yes | yes | yes | partly | — | PrintPlan.tsx:14 |
| PRAC | Print, player (S-DOC.print-player) | no | n/a | no | no | — | data/practice-plan.ts:98 |
| PRAC | Print studio (N-00 4.11) | no | n/a | no | no | — | no print/[id] route |
| PRAC | Share PDF (S-ASK.share-pdf, S-FMT.see, S-PLY.plan) | no | n/a | no | no | — | no "Share PDF" in src/ |
| PRAC | Share to players / link (N-00 4.12) | no | n/a | no | no | — | — |
| PRAC | Publish with 8-second held receipt (S-ASK.publish) | yes | yes | yes | yes | coachhelm_practice_plans_v1 | ConfirmCard.tsx; practice-draft.ts:162 |
| PRAC | Player notification, push + in-app (S-PLY.notify) | yes | yes | yes | yes | — | practice-publish.ts; practice-fanout.ts |
| PRAC | Told row on published receipt (S-ASK.published) | no (renderer only) | n/a | n/a | no | — | practice-draft.ts:171 returns no notifications; ConfirmCard.tsx:284 |
| PRAC | Published Documents strip (S-ASK.published) | no | n/a | n/a | no | — | ConfirmCard LANDS has no publish_practice_plan |
| PRAC | Team chat post "plain text with a link" (default 4) | partly | yes | yes | partly | — | practice-draft.ts:170 |
| PRAC | Team chat plan card (N-00 4.16) | no | n/a | no | no | — | — |
| PRAC | Seen by (N-00 4.17) | no | n/a | no | no | — | no Seen by for plans |
| PRAC | Take down / unpublish | yes | yes | from Ask | yes | — | practice-publish.ts (takeDown) |
| PRAC | Player's view of today (S-PLY.practice) | yes | yes | yes (from notification) | yes | golf_practice_plans | PlayerPractice.tsx |
| PRAC | Player opens full plan (S-PLY.plan) | no | n/a | no | no | — | data/practice-plan.ts:98 |
| PRAC | Player Documents entry (S-PLY.docs) | partly | static text | no | no | — | data/practice-plan.ts:97 |
| PRAC | Documents › Practice plans list with draft/shared line (S-DOC.list-*) | partly | yes | yes | partly | golf_documents_library | hub.ts:905; parts.tsx:771 |
| PRAC | Open a plan from Documents (S-DOC.sheet-coach) | no | n/a | no | no | — | writes.ts:105-108 |
| PRAC | Delete a plan from Documents | partly | yes | yes | wrong action | — | parts.tsx:777 |
| PRAC | Run view (N-00 4.13) | no | n/a | no | no | — | — |
| PRAC | Calendar Plan row (N-00 4.15) | no | n/a | no | no | — | — |
| PRAC | Makeup sessions (N-00 §0.2 r9) | no | n/a | no | no | — | — |
| PRAC | Flags checked together (02-PLAN §0.1(12)) | no | n/a | n/a | no | both | format/page.tsx:7 vs plan/[planId]/page.tsx:7 |
| MSG | Inbox list, unread, row menu (05 S-MSG) | yes | yes | yes | yes | golf_messages_redesign_v1 | MessagesPhone.tsx:256; MessagesView.tsx:364 |
| MSG | Pin up to 3 (05 S-MSG; SETTLED-4NOV) | yes | yes | yes | yes | golf_messages_redesign_v1 | MessagesPhone.tsx:328 |
| MSG | Pins sync across devices (pin-sync/) | built, migration held | localStorage only | yes | this device only | HELD 20261031150000 | use-conversation-pins.ts:97,119 |
| MSG | New message, direct and group (05 new) | yes | yes | yes | yes | — | MessagesPhone.tsx:1205; NewMessagePane.tsx:18 |
| MSG | Empty / first run / fresh (05 empty, fresh) | yes | yes | yes | partly | — | MessagesFirstRun.tsx:14, MessagesPhone.tsx:319 |
| MSG | Thread, times, date pill, jump, typing (05) | yes | yes | yes | yes | — | thread-v2.tsx; MessagesView.tsx:2256 |
| MSG | Composer, attach (photos, file, poll) (05) | yes | yes | yes | yes | — | ComposerPlusV2.tsx:15 |
| MSG | Reply, edit, delete (05) | yes | yes | yes | yes | — | MessagesView.tsx:1624, 2563, 2614 |
| MSG | Polls and votes (05) | yes | yes | yes | yes | — | polls.tsx |
| MSG | Hold, react, who reacted (05) | yes | yes | yes | yes | — | hold-lift.tsx; MessagesView.tsx:799 |
| MSG | Seen by (05 seen, holdseen) | yes | yes | yes | yes | — | seen-by.tsx |
| MSG | Details, group details, members, mute (05) | yes | yes | yes | yes | — | details-v2.tsx; MessagesView.tsx:2868 |
| MSG | Search in a conversation (kept) | yes | yes | yes | yes | — | details-v2.tsx:168 |
| MSG | Announcements list, detail, form (kept) | yes | yes | yes | yes | — | announcements.tsx; MessagesPhone.tsx:1489 |
| MSG | Add/remove member, leave, delete (kept) | yes | yes | yes | yes | — | MessagesView.tsx:2657-2782 |
| MSG | Pending, offline, notify anyway (kept) | yes | yes | yes | yes | — | NotifyAnyway.tsx |
| MSG | No team (kept) | yes | yes | yes | yes | — | MessagesNoTeam.tsx:18 |
| MSG | Class line (kept) | yes | yes | yes | yes | — | GroupClassLine.tsx:18 |
| MSG | "Message the team" from first run (05 empty) | partly | yes | yes | phone wrong | — | MessagesPhone.tsx:319 vs MessagesView.tsx:3595 |

Rows: 57 claimed features (38 Practice plan, 19 Messages). Not fully built or not working end to end: 34 (31 Practice plan, 3 Messages).

## Findings

### FID-PRAC-1 Practice tab, builder, drill bank, groups, templates, print studio, Run view and Calendar Plan row do not exist
- Severity: P0
- Where: all Practice routes, phone and desktop, light and dark
- File: src/app/golf/(dashboard)/dashboard/practice/ (only `format/` and `plan/[planId]/` exist); src/clubhouse/shell/nav.ts:35-36 (CH_NAV_COACH has no Practice entry); src/clubhouse/screens/practice/model.ts (2-line re-export, no screens)
- What's wrong: 02-PLAN N-00 §0.2 specifies nine routes: /practice, drills, drills/[id], groups, templates, plan/[id], plan/[id]/edit (Blocks, Groups, Drills, Review), print/[id] and makeup. It also specifies items 4.1 to 4.17: Share, six starter templates, the Run view, the Calendar Plan row, the team chat plan card and Seen by. 05-SCREENS draws the whole S-BLD.* and S-BLDD.* families. The code has one of the nine routes (plan/[id]) plus Plan format. No builder exists, no Practice tab is in the nav, and `CH_PRACTICE_PAGES` (nav.ts:214) matches routes that cannot be reached. A plan can only be made by asking CoachHelm.
- Should be: 02-PLAN N-00 §0.2 and 4.1-4.17; 05-SCREENS S-BLD.helper/new-sheet/ghosts/kept, S-BLDD.board/inspector; 08-ACCEPTANCE builder items
- Fix: Build N-00 as planned, after applying the held N-00 migrations 010000 to 010800. Put the routes under app/.../practice/, add Practice to CH_NAV_COACH, and build the builder from the existing PracticePlanSheet model plus ui/ Sheet, Segmented and List rows. Until then, take the routes out of CH_PRACTICE_PAGES and stop the copy promising "the builder".
- Confidence: high

### FID-PRAC-2 A plan in Documents cannot be opened
- Severity: P0
- Where: Team Hub › Documents › Practice plans, plan row tap, phone and desktop, light and dark
- File: src/clubhouse/data/hub.ts:905 (`ext = d.file_url == null ? 'plan' : …`); src/clubhouse/screens/hub/parts.tsx:680-790 (row → `writes.openDocument`); src/clubhouse/data/writes.ts:105-108 (getPreviewUrl)
- What's wrong: A plan row has no `file_url`, so Open goes to getPreviewUrl, which fails with "This file has no stored copy to open." The comment at hub.ts:904 says plan rows open the plan page, but ChHubFile carries no planId, so nothing can route there. S-DOC.sheet-coach is reached from this row in the design.
- Should be: 05-SCREENS S-DOC.list-draft / list-shared → S-DOC.sheet-coach; 02-PLAN "plans live in Documents"
- Fix: Add `planId` to ChHubFile from the golf_documents row (or the practice plan join). In parts.tsx, route a plan row to `/golf/dashboard/practice/plan/{planId}` with `router.push` instead of openDocument.
- Confidence: high

### FID-PRAC-3 The plan format is saved but never used
- Severity: P1
- Where: Plan format set and see; Ask draft; plan sheet. Both platforms, both themes.
- File: src/app/golf/actions/coachhelm-plan-format.ts:43 (writes `sections`); src/lib/coachhelm/v3/chat/practice-reads.ts (no format read); src/clubhouse/screens/coachhelm/plan/sheet/plan-sheet-model.ts (fixed section order)
- What's wrong: S-FMT.set says "Plans from Ask and the builder now use it." No code reads `golf_practice_plan_formats.sections` when drafting or rendering a sheet. The sheet always uses its own fixed sections. The design's sheet foot line "In your format · Fall practice sheet" is never shown. "It learns as you go" (S-FMT.found, COACHHELM_PRACTICE_PLAN.md) has no code.
- Should be: 05-SCREENS S-FMT.set / see; COACHHELM_PRACTICE_PLAN.md format section
- Fix: Read the team's format in practice-reads.ts and pass `sections` to the draft prompt. Make plan-sheet-model.ts order and rename sections from it. Add the foot line. Until then, change the receipt copy so it does not claim plans use the format.
- Confidence: high

### FID-PRAC-4 Undoing a new format deletes the old one
- Severity: P1
- Where: Plan format, set → Undo, both platforms
- File: src/app/golf/actions/coachhelm-plan-format.ts:43 (`upsert … { onConflict: 'team_id' }`), :50 (`delete().eq('id', id)`)
- What's wrong: Setting a format overwrites the team's only row. Undo then deletes that row. A coach who had format A, set format B and pressed Undo ends up with no format at all, not format A. S-FMT.undone shows the prior format kept.
- Should be: 05-SCREENS S-FMT.undone ("Your sheet is back to …")
- Fix: Before the upsert, return the prior row (name, sections, source_document_id) in the receipt's undo payload, and have undoPlanFormat upsert it back. Delete the row only when there was no prior row.
- Confidence: high

### FID-PRAC-5 Format upload is filed in "Practice plans" and each retry leaves a document behind
- Severity: P1
- Where: Plan format, upload sheet → "Try another", both platforms
- File: src/clubhouse/screens/coachhelm/plan/format/PlanFormat.tsx:75 (`createGolfDocument({ … player_visible: false, folder: 'Practice plans' })`)
- What's wrong: The uploaded sample sheet is stored as a golf_document in the "Practice plans" folder. Held migration 20261026090300 adds a check that only plans may sit in that folder, so this insert will fail once that migration is applied. Until then, every "Try another" adds another file row to the coach's Practice plans list. Nothing removes the rows.
- Should be: S-FMT.upload-sheet (the sample is reference material, not a plan); held migration 090300
- Fix: File the sample under a non-plan folder (for example "Plan formats") or store it as a format-only upload. Delete the previous sample document when the coach picks another.
- Confidence: high

### FID-PRAC-6 No Share PDF anywhere, and no Print in Ask's full plan
- Severity: P1
- Where: Plan page bar; Ask full plan; Plan format "see" dock; player plan bar. Both platforms.
- File: src/clubhouse/screens/coachhelm/plan/PlanPageActions.tsx (Print only); src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:682-740 (portal has no Print or Share)
- What's wrong: The design draws Share PDF in S-ASK.share-pdf, in the S-FMT.see dock and in the S-PLY.plan bar. A grep finds no "Share PDF" in src/. The Ask full-plan portal has neither Print nor Share. Its only way out is opening the plan page.
- Should be: 05-SCREENS S-ASK.full-plan, S-ASK.share-pdf, S-FMT.see, S-PLY.plan
- Fix: Add a Share PDF action to PlanPageActions and the portal footer that renders PrintPlan to a PDF (or uses `navigator.share` with a generated file), with a Print fallback. Use the ui/ Button secondary pair the design shows.
- Confidence: high

### FID-PRAC-7 The player can't open the full plan, print it, or reach it from Documents
- Severity: P1
- Where: Player plan page; player Documents; phone, both themes
- File: src/clubhouse/data/practice-plan.ts:97 (`documents: 'Team Hub › Practice plans'`), :98 (`planHref: null`)
- What's wrong: `planHref` is always null, so PlayerPractice never shows "Open the plan" (S-PLY.plan) and the player has no Print (S-DOC.print-player). The Documents line is a fixed string, not a link or a real path.
- Should be: 05-SCREENS S-PLY.plan, S-PLY.docs, S-DOC.sheet-player, S-DOC.print-player
- Fix: Set `planHref` to the plan page with a player sheet mode (PracticePlanSheet with the coach-only parts hidden), and add Print there. Make the Documents line a real link to the plan's Documents row once FID-PRAC-2 is fixed.
- Confidence: high

### FID-PRAC-8 Publish: team chat post has no link, Told row never shows, no Seen by
- Severity: P1
- Where: Ask publish → published receipt; Team chat; Documents shared row. Both platforms.
- File: src/lib/coachhelm/v3/chat/practice-draft.ts:170 (`${i.title} is published. ${i.when}.`), :171 (summary "Published. N people told.", no `notifications`); src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:284 (`r.notifications.filter…`)
- What's wrong: Default 4 says the team chat post is plain text with a link to the plan. The post has no link. The run returns no notifications array, so the receipt's Told row (the list of who was told) never renders. Seen by for plans (N-00 4.17, S-DOC.list-shared) does not exist.
- Should be: 02-PLAN defaults §4; 05-SCREENS S-ASK.published; N-00 4.16, 4.17
- Fix: Add the plan URL to the post text. Return `notifications` from publishPracticePlan (recipients plus status) through run(). Add a Seen by line from the existing practice-plans recordOpen data, using the seen-by.tsx SeenFaces pattern.
- Confidence: high

### FID-PRAC-9 Publish failed says "Nothing was saved." with no Try again, and the published Documents strip is missing
- Severity: P1
- Where: Ask publish failed and published receipts, both platforms
- File: src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:279 (`Nothing was saved.`); LANDS map (no `publish_practice_plan` entry)
- What's wrong: For a failed publish the spec says "Nothing was sent." with a Try again button. The code reuses the save copy and has no retry. The design's published state shows a Documents › Practice plans strip. With no LANDS entry it never renders.
- Should be: 06-SCREEN-SPECS S-ASK.publish-failed and S-ASK.published
- Fix: Use kind-specific failed copy ("Nothing was sent.") and add a Try again button that re-runs the flow. Add a LANDS entry for publish_practice_plan pointing to Documents › Practice plans.
- Confidence: high

### FID-PRAC-10 Plan format on phone draws two green bars (extends PP-16)
- Severity: P1
- Where: Plan format, phone ≤820, light and dark
- File: src/clubhouse/screens/coachhelm/plan/format/PlanFormat.tsx:118-124 (`.fbar.is-page`, Link to /golf/dashboard/calendar "Practice"); src/clubhouse/shell/nav.ts:369-370 (PUSHED_BELOW stand-in)
- What's wrong: The shell's stand-in bar draws because the page renders no PhoneTop. The page then draws its own `.fbar` below it, so there are two stacked bars with two Backs. The page's own Back goes to Calendar, labelled "Practice". The design draws one bar.
- Should be: 05-SCREENS S-FMT.* (one bar); DESIGN_LANGUAGE phone top bar rule
- Fix: Render the page's bar as the shell's PhoneTop (so `pageTop` suppresses the stand-in), or drop `.fbar` on phone. Point Back to where the coach came from (Ask, via `from`).
- Confidence: high

### FID-PRAC-11 The random drill kind is ochre in light and dark, not plum (corrects PP-17)
- Severity: P1
- Where: Plan sheet rotation, kind legend and segments, both platforms, light and dark
- File: src/clubhouse/styles/coachhelm-plan.css:103 (`--ch-pl-cpv-random: #8a6a2f`), :119 (`#c9a35d`), used at :178, :232, :391
- What's wrong: 04 §2 gives random as plum, #6E5487 light and #B49ACB dark. The code uses ochre in both themes. Ochre reads as the amber loss colour, which breaks "amber for losses only" (06 Fixes).
- Should be: 04-FIDELITY-SPEC §2 kind colours; 06-SCREEN-SPECS Fixes
- Fix: Set `--ch-pl-cpv-random` to #6E5487 in light and #B49ACB in dark (or add `--ch-kind-random` in tokens.css and use it).
- Confidence: high

### FID-PRAC-12 Plan format and plan page check different flags
- Severity: P1
- Where: /practice/format and /practice/plan/[id] routing
- File: src/app/golf/(dashboard)/dashboard/practice/format/page.tsx:7 (`isPracticePlansEnabled` only); plan/[planId]/page.tsx:7 (`isPracticeTabEnabled` only)
- What's wrong: 02-PLAN §0.1(12) says to check both flags. With coachhelm_practice_plans_v1 on and golf_practice_plans off, a coach can publish from Ask and players get a notification whose plan page redirects to Calendar. With the flags the other way round, Plan format redirects while plans still open.
- Should be: 02-PLAN §0.1(12)
- Fix: Gate both routes, and the publish flow, on `isPracticePlansEnabled() && isPracticeTabEnabled()`, or have publish refuse when the tab flag is off.
- Confidence: high

### FID-PRAC-13 Plan format's error page sends "home" to a route that doesn't exist
- Severity: P1
- Where: Plan format error state, both platforms
- File: src/app/golf/(dashboard)/dashboard/practice/format/error.tsx:20 (`homePath="/golf/dashboard/practice"`)
- What's wrong: /golf/dashboard/practice has no page.tsx (see FID-PRAC-1), so the error page's way out lands on a 404.
- Should be: Clubhouse error rule (a way back that works)
- Fix: Set homePath to /golf/dashboard/coachhelm or /golf/dashboard/calendar until the Practice tab exists.
- Confidence: high

### FID-PRAC-14 Documents plan rows look and act like files
- Severity: P1
- Where: Team Hub › Documents › Practice plans rows (coach), both platforms, both themes
- File: src/clubhouse/data/hub.ts:905 (ext 'plan' → type "PLAN"); src/clubhouse/screens/hub/parts.tsx:771 (Download icon), :777 ("Delete file" → `onDelete` → deleteDocument)
- What's wrong: The design rows read "Draft · Only coaches · Thu, Nov 5" and "Shared with players · Thu, Nov 5". The code shows the generic type "PLAN" and a Download icon on something that can't be downloaded. "Delete file" calls deleteDocument rather than deletePracticePlan, so it removes the document row and leaves the plan (and any published notices) behind.
- Should be: 05-SCREENS S-DOC.list-draft, S-DOC.list-shared
- Fix: Give plan rows a state line from plan status and date, a chevron instead of Download, and a "Delete plan" item that calls the deletePracticePlan action in actions/practice-plans.ts with the planId from FID-PRAC-2.
- Confidence: high

### FID-PRAC-15 Sheet headings drop the player count and total time
- Severity: P2
- Where: Plan sheet Groups and Schedule headings, all surfaces
- File: src/clubhouse/screens/coachhelm/plan/sheet/PracticePlanSheet.tsx (Groups and Schedule `.pp-h`)
- What's wrong: The design has "Groups · 9 players" and "Schedule · 3 h" (redesign/coachhelm-practice.html:1314-1315). The code shows bare "Groups" and "Schedule".
- Should be: redesign/coachhelm-practice.html:1314-1315; 06 S-ASK.full-plan
- Fix: Append the count and total from plan-sheet-model.ts in a `.pp-h span` muted span.
- Confidence: high

### FID-PRAC-16 Sheet foot copy is wrong and the page count is hard-coded
- Severity: P2
- Where: Plan sheet foot, all surfaces, print
- File: src/clubhouse/screens/coachhelm/plan/sheet/PracticePlanSheet.tsx:122 (`Page 1 of 1`)
- What's wrong: The design is "Draft · not published" or "Published Wed, Nov 4, 9:14 PM", then "In your format · Fall practice sheet", then the page. The code shows "Draft · Only coaches" or "Published" with no time, no format line, and "Page 1 of 1" even on a two-page print.
- Should be: redesign/coachhelm-practice.html sheet foot; 06 S-ASK.full-plan
- Fix: Use the design copy with the published timestamp. Add the format line (FID-PRAC-3). Drop the page stamp on screen, and in print use a CSS counter in the print footer.
- Confidence: high

### FID-PRAC-17 Bring uses "×", Notes draws 3 lines, empty Bring shows a bare heading
- Severity: P2
- Where: Plan sheet Bring and Notes, all surfaces
- File: src/clubhouse/screens/coachhelm/plan/sheet/plan-sheet-model.ts:89 (`${b.item} × ${b.qty}`); PracticePlanSheet.tsx (Notes lines, Bring section)
- What's wrong: The design is "Alignment sticks · 6". The code is "Alignment sticks × 6". Notes has 4 ruled lines in the design and 3 in the code. With nothing to bring, the code still draws the "Bring" heading over nothing.
- Should be: redesign/coachhelm-practice.html sheet; DESIGN_LANGUAGE (no empty headings)
- Fix: Use ` · ${qty}`, draw 4 note lines, and omit the Bring section when the list is empty.
- Confidence: high

### FID-PRAC-18 Why lines don't mark losses in amber
- Severity: P2
- Where: Plan sheet `.pp-why` lines, both themes
- File: src/clubhouse/screens/coachhelm/plan/sheet/PracticePlanSheet.tsx (pp-why); src/lib/coachhelm/v3/chat/practice-draft.ts:72-94 (planCardMeta evidence `String(m.value)`)
- What's wrong: The design marks the losing stat in each Why line with the amber `.neg` style and U+2212. The code prints `String(m.value)` with no `.neg` span and a hyphen minus.
- Should be: 06 Fixes "amber for losses only"; DESIGN_LANGUAGE number format (U+2212)
- Fix: Format the value with the shared stat formatter (U+2212) and wrap negative values in `<span class="neg">` with the amber loss token.
- Confidence: medium

### FID-PRAC-19 Print margin and page size differ from spec; no repeating header
- Severity: P2
- Where: Print, coach, desktop
- File: src/clubhouse/screens/coachhelm/plan/PrintPlan.tsx:14 (`@page { size: letter portrait; margin: 12mm; }`)
- What's wrong: The spec is A4 or Letter at 16mm margins, with the plan title and date repeated at the top of each page. The code forces Letter, uses 12mm and has no running header.
- Should be: 04-FIDELITY-SPEC print; 05-SCREENS S-DOC.print-coach
- Fix: Use `@page { margin: 16mm }` with no forced size, and add a print-only header that repeats via `position: running()` or a table-header group.
- Confidence: high

### FID-PRAC-20 Full plan sheet metrics drift on almost every rule
- Severity: P2
- Where: Plan sheet (plan page, Ask full plan, print), phone and desktop, both themes
- File: src/clubhouse/styles/coachhelm-plan.css:1-82 vs redesign/coachhelm-practice.html:904-974
- What's wrong (design → code):

  | Element | Design | Code |
  |---|---|---|
  | paper padding / radius | 22 20 14 20, r5 | 20 20 12, r4 |
  | pp-top gap | 10 | 8 |
  | pp-mark radius / tracking | r9, .02em | r8, .01em |
  | pp-org span | 12.5/16.3 | type-13 |
  | pp-date padding / radius | 5 0 6, r9 | 4 0 6, r8 |
  | pp-date span | 10.5 600 .08em | type-11-strong .01em |
  | pp-title | 30/31.5 | type-28 |
  | pp-focus | 15.5/22 | 16 |
  | pp-meta div padding | 9 10 | 8 8 |
  | dd | 13.5 600, margin 3 | 14-strong, margin 2 |
  | pp-h | 13.5 | 14 |
  | pp-g padding / gap / radius | 8 8 9 8, gap 7, r10 | 8, gap 6, r8 |
  | gh | gap 5, 12.5 | gap 6, 14 |
  | gd | 700 | 400 (second rule) |
  | li | 13.5 | 14 |
  | drow gap / padding | gap 10, padding 10 0 | 8, 8 |
  | pn | 14.5 | 15 |
  | pd | 13.5 | 14 |
  | span.all padding / radius | 5 9, r7 | 4 8, r6 |
  | who span padding | 3 8 3 3 | 2 8 2 2 |
  | pp-why | 12.5/17.5, margin-top 7 | 13, 6 |
  | rot cells at phone (container query) | 32×28 | 40×30 |
  | rot .h | 11.5 | 12 |
  | pp-two gap | 18 | 16 |
  | pp-check gap / size | 7, 13.5 | 6, 14 |
  | pp-foot | padding-top 10, 11.5 | 8, 12 |

- Should be: redesign/coachhelm-practice.html:904-974; 06 S-ASK.full-plan
- Fix: Port the design values. The paper is a fixed document scale, so use its exact px values rather than the nearest type step. Add the `@container (max-width: …)` rule for 32×28 rotation cells. Remove the second `.gd` rule that resets weight to 400.
- Confidence: high

### FID-PRAC-21 Plan format rows, hints and receipt drift
- Severity: P2
- Where: Plan format empty, set and learn states, both platforms, both themes
- File: src/clubhouse/screens/coachhelm/plan/format/PlanFormat.tsx (set receipt icon, Undo) and its CSS (`.cur`, `.fhint`, `.lrn .ft`, `.okc`)
- What's wrong (design → code):
  - `.cur` padding / gap: 14 16, gap 10 → 12 16, gap 8.
  - `.fhint` padding: 6 16 14 → 0 16 12.
  - `.lrn .ft` padding: 2 16 14 → 2 16 12.
  - `.okc` colours: gain-tint #E8EEE8 with gain #14613D, 22 round → accent-tint with green-600.
  - Set receipt check: 14 icon → CircleCheck 18.
  - Undo: 18 undo icon with gap 6 → no icon.
- Should be: redesign/coachhelm-practice.html S-FMT; 06 S-FMT.*
- Fix: Port the values. Use the gain tokens (`--ch-gain`, `--ch-gain-tint`) and ui/ Icon size 14 and 18 (Undo2).
- Confidence: high

### FID-PRAC-22 Format "found" view shows 3 of 5 sections and no summary line; no More key
- Severity: P2
- Where: Plan format found state, both platforms
- File: src/clubhouse/screens/coachhelm/plan/format/PlanFormat.tsx (found tags; bar)
- What's wrong: The code always shows three tags (Header, Groups, Schedule), whatever the read found. The design lists every section read and the line "1 page · 5 sections". The design bar has a More key; the code bar does not.
- Should be: 05-SCREENS S-FMT.found
- Fix: Render one tag per `sections` entry from readPlanFormat, add the summary line, and add the More key with the ui/ menu.
- Confidence: high

### FID-PRAC-23 Player plan stops and chips drift
- Severity: P2
- Where: Player plan page, phone, light and dark
- File: src/clubhouse/screens/coachhelm/plan/player/PlayerPractice.tsx; src/clubhouse/styles/coachhelm-plan.css:1347-1420
- What's wrong (design → code):
  - Stop padding / gap: 11 16, gap 10 → 12 16, gap 8.
  - now / next chip: 2 7, r7, gain-tint / gain and flat-tint #EFEDE7 → 2 6, r6, accent-tint / green-600 and well-bg-flat.
  - "In Documents" card: the title with the meta pushed right (`margin-left:auto`), no icon, meta not a link → a tile icon with stacked text.
- Should be: redesign/coachhelm-practice.html S-PLY.practice; 06 S-PLY.*
- Fix: Port the values and use the gain tokens. Rebuild the card as a single ui/ List row with trailing meta.
- Confidence: high

### FID-PRAC-24 Group faces are 24 px and leave out the viewer
- Severity: P2
- Where: Player plan group faces; Ask publish confirm coins. Both platforms.
- File: src/clubhouse/screens/coachhelm/plan/player/PlayerPractice.tsx:58 (`size="xs"`); src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:118 (`size="xs"`)
- What's wrong: The design faces are 26 and include the viewer (`avs(['Eli','Jonah','Owen'])`). The code uses Avatar xs (24) and lists only the others. There is no 26 Avatar size in ui/ (xs 24, sm 28).
- Should be: redesign/coachhelm-practice.html S-PLY.practice and S-ASK.publish
- Fix: Add a 26 size to ui/Avatar (or a `.ch-av-26` modifier), use it in both places, and include the viewer marked "You".
- Confidence: medium

### FID-PRAC-25 Plan page loading and error aren't Clubhouse screens
- Severity: P2
- Where: Plan page and Plan format loading and error, both platforms, both themes
- File: src/app/golf/(dashboard)/dashboard/practice/plan/[planId]/loading.tsx (`<SkelRows rows={8}/>`); plan/[planId]/error.tsx and format/error.tsx (Fairway RouteErrorBoundary, "Failed to load Plan format… Please try again.")
- What's wrong: The loading state is eight generic rows, not a sheet-shaped skeleton. The error pages use Fairway's boundary and copy, which Clubhouse's error rule replaces.
- Should be: RUBRIC skeleton and error rules; DESIGN_LANGUAGE error copy
- Fix: Use a paper-shaped skeleton (title, meta grid, rows) from the Clubhouse skeleton parts, and the Clubhouse route error component with plain copy.
- Confidence: high

### FID-PRAC-26 Drill bank is capped at 20 and library drills all read as "skill"
- Severity: P2
- Where: Ask draft, drill choices
- File: src/lib/coachhelm/v3/chat/practice-reads.ts:24 (`limit(20)`), :27 (`limit(20)`), :31 (library rows have no `kind`)
- What's wrong: A team with more than 20 drills, or a library with more, silently loses the rest. Library drills carry no kind, so they default to 'skill' and colour the rotation wrongly.
- Should be: N-00 4.4 drill bank; 04 §2 kinds
- Fix: Filter by area and minutes before limiting (or page), and map the library `category` to a kind.
- Confidence: high

### FID-PRAC-27 "?from=coachhelm" is passed and ignored
- Severity: P2
- Where: Ask full plan → Open plan page → Back, phone
- File: src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:395 (`?from=coachhelm`); src/clubhouse/routes/practice.tsx (no read of `from`)
- What's wrong: The plan page never reads `from`, so Back uses the shell default rather than returning to the Ask thread.
- Should be: DESIGN_LANGUAGE back rule (back returns where you came from)
- Fix: Read `from` in PracticePlanRoute and set the PhoneTop back target to the CoachHelm thread.
- Confidence: medium

### FID-PRAC-28 Unnamed groups fall back to "Player"
- Severity: P2
- Where: Plan sheet Groups, all surfaces
- File: src/clubhouse/screens/coachhelm/plan/sheet/plan-sheet-model.ts (group name fallback `'Player'`)
- What's wrong: The design names groups "Group 1", "Group 2" and so on. A group without a name renders as "Player", which reads as a person.
- Should be: redesign/coachhelm-practice.html groups
- Fix: Fall back to `Group ${index + 1}`.
- Confidence: medium

### FID-MSG-1 Pins sync is built but held; pins live on one device
- Severity: P1
- Where: Inbox pinned card, phone and desktop
- File: src/clubhouse/screens/messages/use-conversation-pins.ts:97, :119 (localStorage path); supabase/migrations/HELD.md (20261031150000_golf_conversation_pins)
- What's wrong: pin-sync/ promises pins that follow the user across devices. With the migration held, the hook falls back to localStorage, so a pin made on a phone is missing on desktop. The UI gives no sign of this.
- Should be: messages/pin-sync/; SETTLED-4NOV pins
- Fix: Apply 20261031150000 (owner decision). Until then, the feature is device-only and should be listed that way.
- Confidence: high

### FID-MSG-2 Pinned card padding, radius and gaps drift
- Severity: P2
- Where: Inbox pinned card, phone and desktop, both themes
- File: src/clubhouse/styles/messages.css:4241-4330
- What's wrong (spec → code):
  - Header padding: 14 16 10 → 12 16 8.
  - Pins padding / radius / gap / grid gap: 10 4 9, r18, gap 7 → 8 4 8, r16, gap 6, grid gap 6.
  - Bubblet radius: r11 → r12.
- Should be: messages 06-SCREEN-SPECS MSG-LIST-07
- Fix: Port the values. Use `--ch-radius-lg` plus 2 (or a local 18) as the spec draws it.
- Confidence: high

### FID-MSG-3 Pin faces: direct 64 with 22 initials, group 62
- Severity: P2
- Where: Inbox pinned card faces, phone
- File: src/clubhouse/screens/messages/MessagesPhone.tsx:339 (`size="xl"` for direct pins); GroupMark at :489 (62)
- What's wrong: The spec is one 62 face with 23.5/600 initials. Direct pins render at 64 with 22 initials, so direct and group pins sit at different sizes in one row.
- Should be: messages 06 MSG-LIST-07
- Fix: Add a 62 Avatar size (or a pin modifier) with 23.5/600 initials, and use it for both kinds.
- Confidence: high

### FID-MSG-4 Group pins show a last-message bubblet
- Severity: P2
- Where: Inbox pinned card, group pin, phone
- File: src/clubhouse/screens/messages/MessagesPhone.tsx:328 (`const said = c.lastSenderId !== api.viewer.userId ? c.lastText : null;`, no `!c.group` check)
- What's wrong: MSG-LIST-07 says the bubblet is for direct conversations only. Group pins show it too, with no sender name, so it reads as if the group spoke.
- Should be: messages 06 MSG-LIST-07
- Fix: Only set `said` when `!c.group`.
- Confidence: high

### FID-MSG-5 HelloCard face is 64, spec 72
- Severity: P2
- Where: Fresh conversation (HelloCard), both platforms
- File: src/clubhouse/screens/messages/HelloCard.tsx:13 (`size="xl"`)
- What's wrong: MSG-FRESH-01 draws a 72 face. Avatar xl is 64 with 22 initials.
- Should be: messages 06 MSG-FRESH-01
- Fix: Add a 72 size to ui/Avatar (or a HelloCard modifier) with initials scaled to match.
- Confidence: high

### FID-MSG-6 New message suggestion faces are 36, spec 32
- Severity: P2
- Where: New message, phone, suggestion list
- File: src/clubhouse/screens/messages/MessagesPhone.tsx:1435 (`size="md"` under `api.redesign`)
- What's wrong: The spec draws 32 faces in the suggestion rows. Avatar md is 36. There is no 32 size (sm 28, md 36).
- Should be: messages 06 S-MSG.new
- Fix: Add a 32 size to ui/Avatar and use it here.
- Confidence: medium

### FID-MSG-7 "Players you haven't messaged" lists coaches too
- Severity: P2
- Where: New message, desktop, empty search
- File: src/clubhouse/screens/messages/NewMessagePane.tsx:34 (`api.directory.filter(… !direct.has(p.userId))`), :73 (subtitle)
- What's wrong: The subtitle says "Players", but the list is the whole directory minus existing direct conversations, so coaches appear under it.
- Should be: messages 05 S-MSG.new copy
- Fix: Filter to `p.role === 'player'` under that subtitle, or change it to "People you haven't messaged".
- Confidence: high

### FID-MSG-8 "Message the team" does the same as "Start a conversation" on phone
- Severity: P2
- Where: Messages first run, coach, phone vs desktop
- File: src/clubhouse/screens/messages/MessagesPhone.tsx:319 (`onTeam={… ? onNew : undefined}`); MessagesView.tsx:3595 (opens the group dialog)
- What's wrong: On phone, both buttons open the same blank New message. On desktop, "Message the team" opens the group dialog. The two platforms behave differently.
- Should be: messages 05 S-MSG.empty
- Fix: On phone, open PhoneNewMessage in group mode with the team preselected, matching desktop.
- Confidence: high

### FID-MSG-9 Attach tiles use the wrong fills; the attach tokens don't exist
- Severity: P2
- Where: Composer + attach sheet, both platforms, both themes
- File: src/clubhouse/styles/messages.css:4798-4810 (Photos `var(--ch-bubble-mine-fill)`, File and Poll on well with a green glyph); src/clubhouse/styles/tokens.css (no `--ch-attach-*`)
- What's wrong: Ruling 15 and 06 tokens (lines 52-54) give `--ch-attach-photos` #2F7D4C, `--ch-attach-file` #7F612A and `--ch-attach-poll` #155A39, each with an ivory glyph. The code has one green fill and two well tiles.
- Should be: messages 06 tokens 52-54; SETTLED-4NOV Ruling 15
- Fix: Add the three tokens (light and dark) to tokens.css and use them with an ivory glyph.
- Confidence: high

### FID-MSG-10 Switch off-ring is #8e8a80, spec #8F8B81
- Severity: P2
- Where: Mute and settings switches, off state, light
- File: src/clubhouse/styles/tokens.css:683 (`--ch-switch-off-ring: #8e8a80`)
- What's wrong: The spec is #8F8B81. The code is one step off on each channel.
- Should be: messages 06 tokens
- Fix: Set the token to #8F8B81 and check the dark value at :930 against the spec.
- Confidence: high

### FID-MSG-11 First-run illustration has hard-coded colours
- Severity: P2
- Where: Messages first run illustration, dark
- File: src/clubhouse/screens/messages/MessagesFirstRun.tsx:26-28 (`#fdfcf8`, `#d6c08f`)
- What's wrong: The flag and highlights use literal hex. They don't change in dark mode, so the ivory strokes glare on the dark card.
- Should be: DESIGN_LANGUAGE (tokens only, light and dark)
- Fix: Use `var(--ch-ivory)` / `var(--ch-card-bg)` and the gold token via `currentColor` or CSS variables on the SVG.
- Confidence: high
