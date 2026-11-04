# Brief: Messages

Nick asked for Messages with "more depth" that looks "more premium and modern like iMessage, Claude", and for the send, typing and every micro-animation to be designed, on phone and desktop, including the conversation, its details, poll votes and the empty states. He reviewed the page on 31 Oct: "Dude this looks great. Make sure the motion is pristine there's a lot of moving parts." Then: "I want all of the designs to be accurately reflected in the builds."

The approved look and motion is `redesign/clubhouse-messages.html`. The build must match the page, not interpret it. Exact values are in `04-FIDELITY-SPEC.md`, file steps in `02-PLAN.md`, data in `03-DATA-CHECKS.md`.

**Routes:** `/golf/dashboard/messages` (coach and player). Phone pushes inbox → thread → details. Desktop is three columns: rail, thread, details.

## Rules for all of Messages

- **Top bar:** unchanged. Phone list: today's green `TopBar` with "Messages ⌄" and the bell, and the parchment sheet's 16 px lip. Phone conversation: today's `PhoneBar` row, back key, face, name and role on the left, info key on the right. Desktop: today's glass canvas bar with breadcrumbs, search, bell and settings.
- **Cards:** one card style from `DESIGN_LANGUAGE.md` (radius 16, 1 px ring, two-layer shadow). Titles inside the card. No accent left-border cards.
- **Page:** one flat colour, `--ch-grouped-bg`. No text sits on the page except the large title, its context line and the times revealed by dragging. Day labels, Seen by and sender names move onto small surfaces or into the bubble.
- **Glass:** only on bars, the composer, menus, the reaction bar, the jump button and the date pill. Never behind data, never on a bubble.
- **Text Size:** every size follows iPhone Text Size through `--ch-type-k`. Phone text floor 12 px.
- **Edges:** 16 px phone edge, 20 px on large phones (430 pt).
- **Motion:** transforms and opacity only, with one exception (the desktop details column, spec section 7). Springs from `CH_SPRINGS`, three of them new. Reduce Motion: nothing travels, crossfades of `CH_FADE_MS` (180 ms today, opacity only, linear; the shared value in START_HERE. The design page draws 120 ms). Settings > Animations off behaves like Reduce Motion.
- **Data:** only what the screen already loads. Nothing new is collected. Pins stay on the device in 11b and move to the account in the held PR 11h (Nick, 31 Oct: "pins sync is a go"; `pin-sync/PIN-SYNC.md`). Typing on rows, pins and group names is built from broadcasts the app already sends.
- **Release:** prep and PRs only. No deploy, migration or flag flip.

---

## 1. Inbox

**What it's for:** see who needs an answer, open a conversation, start a new one.

**Today:** boxed sections of 64 px rows with 32 px coins, the filter as plain chips, the title in the bar only.

**Redesign:**
- Large title "Messages" under the green bar with a context line ("3 unread · Team channel active 7:31 AM").
- Search well and a New message key on one row.
- Filter All / Unread / Groups as a segmented well; the paper thumb slides.
- Pinned row: up to three large faces (62 px) with a last-message bubblet or live typing dots.
- Recent conversations in one card: 44 px faces, about 72 px rows, two-line previews, an unread dot before the name, a mute glyph.
- Desktop rail: the same, flat and continuous (owner: "too card heavy"), 320 px wide, the selected row washed.

## 2. Conversation

**What it's for:** read and answer.

**Today:** radius 16 bubbles with a 6 px tail corner, a gradient on yours, names above the first bubble on the page, a time under every run, reaction chips under the bubble, a text "Seen by" line, a plain long-press sheet.

**Redesign:**
- Bubbles radius 19, 2 px between bubbles of a run, 10 px before a run, 6 px join corners, a drawn tail on the last bubble.
- Theirs: card paper with the ring and soft shadow. Yours: flat green with a lit top edge and a green shadow.
- Group threads: the sender's name inside the first bubble of a run, the face beside the last.
- Times: drag the thread left on the phone (it follows at 60 %, up to 58 px, then springs back); hover on desktop. Day labels in small paper pills, and a floating date pill while scrolling.
- Reactions: corner badges, the opposite colour of the bubble; your own carries the champagne ring.
- Seen by: up to five faces in a paper pill under your latest message; tap opens the sheet.
- Typing: a bubble with three waving dots that hides after 5 s; the reply grows out of it.
- Jump to latest: a glass circle with a count once you're a screen up.

## 3. Composer and send

**Redesign:** one glass pill: +, the field, and the send key, which springs in only when there's text. Grows a line at a time to six lines (132 px), then scrolls. On send, your bubble rises from where the text sat in the field to its slot while the thread makes room on the same spring. Delivered crossfades to Seen.

**+ menu:** today's actions (Photos, File, Poll) in the new glass menu. The + turns to ×; the menu blooms from it. A picked file sits as a chip above the field. No Announcement row and no Camera row (Nick, 31 Oct: "no to announcement", "No don't add camera"). Photos already offers the camera on iPhone by itself. The design page draws exactly these three (v9).

## 4. Hold menu

**Redesign:** press sinks the bubble to 0.97. At 450 ms it lifts over a blurred thread with the reaction bar above and the menu below: Reply, Seen by (your messages in groups), Copy, Edit, Delete. Double-tap toggles Like. Desktop: a hover bar beside the bubble and right-click open the same.

## 5. Polls

**Redesign:** the poll card in sentence case; each choice a well with a scaleX bar, the count and up to three voter faces; "Most votes" chip; tapping fills the ring and draws the check. "See votes" opens a sheet (phone) or centred card (desktop) grouped by choice with a bar per group.

## 6. Details

**Redesign:** phone pushes a page; desktop opens a 300 px column beside the thread that stays on the latest message. Header: large face, name, role or member count. Four quick actions (Search, Mute, Files, Leave or Add). Cards: Members or People with role chips, Class status, Shared files and media, Mute.

## 7. Empty and new

**Redesign:** first run inside a card with an illustration and New message; a new conversation's hello card with starters that fill the field and never send by themselves; New message's To field turns a picked name into a green token.

---

## 8. Pins on every device (PR 11h, held)

Nick, 31 Oct: "pins sync is a go". Pins move from the device to the account: pin on the iPhone, it shows on the Mac in about a second, same order, up to 3 per team, private to you. It needs a new table, so it ships as its own draft PR after 11a to 11g, with the migration drafted and held until the owner applies it after the first deploy. Until then pins stay on the device and nothing on screen changes. Plan: `pin-sync/PIN-SYNC.md`.

## Must not change

- The green bars on phone and the glass canvas bar on desktop, their contents and gestures.
- The data model (`model.ts`), the hooks, realtime, sends, retries, failed and pending states, drafts, prefill, search hits, announcements, Notify anyway, the class line, mute labels and behaviour, delete and leave flows, and every error code.
- Swipe right to reply. Row swipes to mark read or unread and delete (owner decision 14). Long press at 450 ms with 10 px slop. Right-click on desktop.
- Lenis smooth scroll on desktop and the thread's end anchor (`use-thread-anchor.ts`). Nick: "I like the smooth scroll."
- Rule B7 for arrivals.

## Done when

- Every one of the 22 states matches its design shot at 390, 430, 390 at XXL and desktop 1440, light and dark, in a side-by-side compare, with every difference listed in the PR as matches, fixed, or can't-match with the reason.
- Every animation in spec section 7 matches its design clip at 390 wide, normal and with Reduce Motion, and the build passes the same 11 interrupt cases the page's motion check runs (spec section 11).
- Every tap, hold, swipe and key in spec section 6 does the same thing and lands in the same place, Back included.
- Contrast holds a 4.9:1 target (4.5:1 floor) for text and 3:1 for marks in light and dark (spec section 2 lists each pair).
- Unit, style, lint, type and the Messages e2e pass.
