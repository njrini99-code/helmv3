# P007 — Messages: changelog

## 2026-10-08 — premium pass: findings D1, D2, D4

- D1: a thread is held at its newest message while it settles (`useThreadAnchor`, 700 ms). A push during hydration that resets the scroll under it no longer leaves it at the oldest message. The hold stops the moment the reader scrolls, touches or types.
- D2: a message that didn't send keeps full-ink text, on a muted fill inside a dashed edge, beside "Not sent · Retry". It is no longer faded to about 2.8:1, so it can be read before you retry it.
- D4: the preview opens the team thread only on desktop, after hydration, as the live screen does. The phone preview stays on the inbox. The live loader already auto-opens only at 821px and wider.

## 2026-10-08 — premium pass: announcements as letterhead (P007-A1)

An announcement reads as a signed team letter. The letterhead is one engraved line, the team and the full date ("Varsity · Wednesday 14 October"), with the asks in words at its end ("Urgent · please acknowledge") instead of two chips; then the 28px title, the body in full ink at a reading measure, and the posting coach's name and title over a 1px gilt rule. Tasks, files and receipts follow as before. On desktop the sheet takes the room's light as paper (`--ch-light-paper`, never on the words); on the phone it stays flush. No monogram or crest (owner: crests are declined, D3-2). The loader adds `signers` (the program's coaches by golf_coaches.id) and the announcement carries `authorId` (`created_by`); an unknown author shows no signature.

## 2026-10-08 — premium pass: prefilled messages (D2-7)

Actions that reach players open Messages prefilled and never send: `messagesPrefillHref({ players, draft, title })` (`screens/messages/prefill.ts`) links to `?prefill=<key>`: the key is an opaque hash, and the people, the draft and the group name stay in this tab's sessionStorage under it, never in the URL (query strings land in logs and history, and a draft can name a minor's health or schoolwork). Messages takes the entry once and deletes it (`takePrefill`); a cold link, a new tab or a used key opens Messages with nothing prefilled. Players not on the team are left out and reported (CH-7001); the rest stay chosen. One player with a thread opens it with the draft in its composer (an unsent draft of the coach's own wins); otherwise New message opens with the people chosen (a coach's two or more as a group named `title`) and the draft quoted. Nothing is created until the coach presses on, and the draft lands in the new thread's composer, where the coach presses Send. A player's prefill keeps one person (D-15). When nobody in it is on the team, CH-7001 says so.

## 2026-10-08 — dark: Clubhouse at night

Messages follows GolfHelm's dark theme ("Clubhouse at night"). Sent bubbles keep the green gradient with ivory type (not white); row hover and press, tool hovers and the reaction hover become ivory washes; the selected thread's rail, the To chips and the announcement acknowledgement take the light text green; announcement marks, the phone's group marks and Jump to latest keep their filled green with ivory type; the phone's idle Send glyph reads on its grey plate. Light mode is unchanged.

## 2026-10-08 — phone: Mobile clubhouse pass

Phone Messages now follows the owner's "Coach - Home - Mobile v2" board (round
3: fewer containers), carried from Home to every phone screen:

- the inbox sits on the parchment at the board's margins: Search, then the
  filters as engraved rings, the chosen one in the green tint (the tint and ink
  cross over on the quick beat and the list settles in under it, CH-7606), then
  Announcements under an engraved double rule in the bold 19px sans;
- conversations are rows on seams inset to the text, with the Ledger's press
  tint (never a scale); their dates (Today, This week, Earlier) are the ledger's
  engraved date line, not section titles, so they read as entries in one list;
- a pushed thread's name reads in the bar's ivory on the green chassis, and its
  keyboard focus ring is gilt instead of a dark green box;
- Details, New message and New announcement lose their white panels: sections
  open under the double rule, rows sit on seams, and the profile name is the
  large heavy sans in forest ink;
- a pushed announcement is the page itself: its title in the 31px heavy sans,
  with Tasks, Files and who has read it as sections; the acknowledgement keeps
  its green well;
- the route skeleton and the inbox's loading draw the inbox's own shape
  (Search, the filters, a section and its rows), so nothing moves when it lands.

## 2026-10-08 — Heads, notices and copy (states audit)

- The first-run and no-team pages open under the page's framed head (Messages
  and one line) on desktop instead of a bare canvas; the empty keeps the one
  action (CH-7309, CH-7308).
- The rail's title is the heavy sans in forest ink; it had kept the old display
  serif's loose tracking.
- A rail that didn't load gives its notice the rail's full width (CH-7201).
- With no conversation open, the desktop's thread pane holds its empty (CH-7305)
  in the middle of the pane, as it already stood top to bottom, instead of
  against the rail's rule.
- The typing dots no longer show under a conversation that didn't load or is
  still loading (CH-7602).
- Notice and empty titles lose their trailing period and take curly apostrophes
  ("Conversations didn’t load", "You aren’t on a team yet"), and so does every
  other line the page writes, its toasts included; words a server sends are
  shown as sent (b8, held by `copy-apostrophes.test.ts`).

## 2026-10-07 — Another conversation settles in

On desktop, opening another conversation or announcement settles it in with a
6px rise (base) while the last fades out (quick), hidden from assistive tech;
each keeps its own scroll and a thread still opens at its end (CH-7605). The
first one a visit opens appears at once. Instant with reduced motion. New test:
messages.test › CH-7605.

## 2026-10-07 — One continuous conversation rail

The inbox rail is no longer three boxed cards (Announcements, Today, This week).
The rows sit directly on the rail as rounded targets, the way a mail sidebar
works:

- a soft tint on hover and on press;
- the open conversation is a raised ivory key ruled in the field green at its
  left;
- fine seams separate conversations, inset to the text, and hide next to a
  hovered or selected row.

The Messages title is set in the display serif.

## 2026-10-06 — Display type relaxed

The owner found the display type too compact. Display headings on this page
widen (width axis 88 → 96) and the tightest tracking eases to -0.026em, as on
every Clubhouse page. Layout and content are unchanged.

## 2026-10-06 — Premium interaction corrections

```text
PR/commit:      #2155, codex/clubhouse-smoothness-audit
Design package: existing Clubhouse focus and motion owners
Contract IDs:   existing keyboard and reduced-motion behavior
Data impact:    none
Held items:     physical iPhone and complete manual release acceptance
```

Keyboard-only Message actions reveal visibly on focus without covering the
message. Quoted-message scrolling observes OS reduced motion and the live
Clubhouse Animations preference; disabled animation means an immediate jump.

See [premium audit](../../PREMIUM_AUDIT.md) for focused evidence and limits.

<!-- clubhouse:release-audit:start -->
## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 18 mapped
actions and 24 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p007-messages). Approved handoffs and contract
IDs are preserved; runtime gaps stay explicit.
<!-- clubhouse:release-audit:end -->

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

## 2026-10-06 — Motion import path moves to `motion/react`

```text
PR/commit:      #2153 (agent/deps-ui-upgrade)
Design package: none; no visual or behavior change
Contract IDs:   none
Data impact:    none
Held items:     none
```

Dependency upgrade only. `framer-motion` 13 is replaced by the `motion` 14
package, so this page's animation imports change from `framer-motion` to
`motion/react`. The animation API, durations, curves and reduced-motion gating
are unchanged; Motion 14 only removed internal compatibility APIs this tree
never used.

## 2026-10-02 — End obsolete slow-save feedback

Messages now ties its CH-1902 notice to the attempt it describes. The notice
and pending timer end on settlement, screen unmount, or team-scope change.
Old callbacks cannot revive it after A → B → A navigation, and old cleanup
preserves new feedback. This affects feedback only: send/retry, busy guards,
refusal and unknown attachment outcomes remain unchanged. The 5-second
threshold and default 4-second confirmations / 8-second errors are unchanged.
The focused Messages regression confirms that a settled mute failure removes
the slow notice while its error remains visible. The shared verification set
has 21 unique passing cases: 11 Toast and 10 page/action cases. No later
optimized-build or browser result is claimed by this entry.

## 2026-10-02 — Owner correction: softer reply and message surfaces

Removed the green stripe from quoted replies in both composer and history.
The author and snippet establish hierarchy on a softly floating ivory face.
Attachment cards, file chips and reaction badges consume canonical elevation
instead of adding their own decorative outlines. Composer recovery notices
retain their status tone and actions with a softer floating edge. Existing
reply, send, multiline, scroll and recovery behavior stays intact.
The selected inbox conversation keeps its tint and stronger title while
dropping the same green edge stripe.

## 2026-10-02 — Visual repair: six-line phone editor

The phone writing pill now includes its padding and borders when sizing, with
a 144px mobile cap so six 20px lines fit completely. Desktop keeps its 132px
cap. Longer drafts still scroll within the field and retain the visible caret.
Settled WebKit checks at 375, 390 and 430px in a 480px viewport kept the editor
and Send inside the available screen. The focused sizing regression passed.

## 2026-10-02 — Release repair: composer resize and attachment outcome recovery

The WebKit phone thread reproduced a 180px bottom gap after selecting a quote
and
writing six lines: the last bubble remained behind the expanded composer. The
thread anchor now observes viewport/content size and preserves the prior reading
intent even when Safari emits a resize scroll before the observer. Newest
readers
stay at the end; older readers keep their position. Before/after captures record
the exact gap; simulated keyboard opening/closing also held the end.

Attachment text can be delivered even when the metadata batch fails. The UI now
separates complete, partial, refused and unknown outcomes. Partial recovery
keeps
only unsaved files and original reply target, so retry does not duplicate
delivered
text. Recovery filename chips now wrap unbroken names within the phone viewport.
Unknown recovery freezes the original payload, uses the hook's same-attempt
retry, and preserves later pending-request edits separately. The hook stores the
exact uploaded request under the authenticated user and conversation before the
server call. After a page reload, the composer shows the stored caption,
filenames
and reply target; Retry uses those original IDs and paths without uploading or
plain-text sending again. The later ordinary draft remains durable even while a
recovery Retry is pending. A refused recovered attachment displays filenames to
choose again, since a reload cannot restore local File bytes. CH-7217 gates
normal
Send when the pending-request check cannot be completed. CH-7022/7023 preserve
existing shared-file-open CH-7021. Local authenticated WebKit recovery verified
lost responses after commit, reload, and stable message/attachment counts.

## 2026-10-02 — Phone messaging follows the owner's Apple Messages benchmark

Branch: `codex/clubhouse-design-fidelity`. Shiro fix review and Frontend Design
Premium interaction review found identical rounded phone bubbles, a redundant
avatar rail in direct chats, and Return sending immediately. Restored run
geometry
and terminal tails, expanded the usable bubble column to 82%, retained existing
green/ivory depth, and made phone Return multiline with explicit Send. Desktop
keyboard behavior is preserved.

Long press keeps selected text and actual time in the existing action sheet.
Reply and swipe right select a real parent; swipe left reveals actual message
time.
Quotes show loaded author/text or attachment labels, truthful
deleted/unavailable
states, and scroll only to loaded parents. Parent jumps honor reduced motion
with
an instant scroll; the focused timestamp/quote test verifies both motion
settings.
Sending forwards the existing reply
ID
through text and attachment hooks. Pending sends synchronously lock reply
changes;
text failures retain the target in their bubble and attachment refusals restore
text/files/target. Leaving a phone thread clears reply intent while retaining
text.
The pending long-press timer is cancelled on unmount.

Verification: final Messages suite 74/74 and audit suite 8/8 (82 total), capped
at
one worker, 11.61 seconds. Scoped ESLint and diff checks pass. WebKit at 375,
390 and
430 has no horizontal overflow; 390 pointer long press, rightward Reply gesture,
Return/newline and selected-message context were exercised. Thread Axe scan
reports
zero WCAG 2 A/AA and 2.1 AA violations. Four captures are local and recorded
under
`P007-messages/2026-10-02`; Next's development indicator overlaps Attach in
captures
and is development-only. Physical iPhone Safari remains an owner verification
gap.

## 2026-10-01 — The intended depth in message bubbles

Branch: `codex/clubhouse-design-fidelity`. Owner requested more depth in bubbles
and cards. Incoming bubbles now use a graded warm ivory sheet, with upper light,
lower edge and two grounded shadows. Sent bubbles use a graded Augusta green
face and their own highlight/contact shadow. The same tokens apply to desktop
and phone; phone body text retains its 17px reading size. No sending, delivery,
unread, attachments or identity behavior changes. Before/after WebKit thread
captures are in the local screenshot gallery.

## 2026-10-01 — Aesthetic audit: unread rows read as unread, placeholders and initials hold their floors

```text
PR/commit:      agent/swap-audit (#2111): ba75b0a24 (list), f724065db (thread)
Design package: none (owner's aesthetic audit guide, 2026-10-01)
Contract IDs:   none new
Actions:        none
Data impact:    none; visual only
Held items:     none
```

- **Issue.** (1) On the phone the ink ramp had no step: tertiary text was raised
  to hold 4.5:1 on the darker page and sat 1.1 contrast points under secondary
  (7.4 against 6.3 on a card), so a preview, a time and a caption read as one
  gray. (2) An unread row differed from a read one by a name at 600 against 500
  and a preview 1.1 points darker. (3) The search placeholder measured 2.8:1 on
  the phone page. (4) A thread's 30px coin drew its initials at 10.2px, under
  the phone's 12px floor (Q-141).
- **Fix.** `tokens.css` (phone block): `--ch-ink-600` is `#46433d`, 9.3 against
  6.3. `messages.css`: an unread row's name is 700 and its preview
  `--ch-ink-700` (11.1:1; a read preview stays tertiary, 6.3:1). `controls.css`:
  search, input and textarea placeholders use `--ch-text-tertiary` (5.5:1 on the
  page). `ui.css`: on the phone an avatar's initials are the larger of 34% of
  the coin and the smaller of 12px and 42% of it. The last three are shared, so
  every phone page takes them (recaptured before each later family).
- **Not done, on purpose.** The selected state of the phone filter chips (the
  board's raised white) and the solid green disc a group draws (the board's
  `.m-grp`) are owner calls: Q-148 and Q-149.
- **Contrast pass (`d4367ee`).** The desktop rail's All, Unread and Groups
  switch was 4.1:1 on the well (shared `.ch-seg__b`, secondary ink now).
- **Verification.** Before and after at 375, 390, 430 and 1440 on the Messages
  preview fixture; the labels are in VERIFY.md "Screenshots".
  `messages.test.tsx` 66 of 66. No overflow, clipping or off-screen element at
  any width; no touch target under 44px by hit test. Not tested: a real iPhone,
  the keyboard-open state, the installed app.

## 2026-10-01 — Page pass: stale threads said, failed text in its bubble

PAGE_PERFORMANCE.md rules 4 and 11.

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none
Contract IDs:   CH-7216 (new)
Actions:        none
Data impact:    none
Held items:     none
```

- **Out of date, said so.** When a thread's read fails but an earlier copy is
  on screen, the messages stay and a notice above them says they may be out
  of date, with Try again. Before, a failed refresh was silent. CH-7202 still
  covers a thread with nothing to show.
- **Send, audited.** The send is already honest. It uses a client id threaded
  to the server (a retry after a commit is not a duplicate), keeps the failed
  bubble with Retry and Discard, and says "couldn't confirm" apart from "not
  sent".
- **A failed text lives in its bubble only (owner, 2026-10-01: "Bubble
  only").** The composer no longer puts a failed text back in the box. Doing
  so made a second Send under a new id easy, where the bubble's Retry reuses
  the id and is duplicate-safe. A failed attachment send has no bubble, so
  its text and files still go back in the box (MSG-26). CH-7004 and CH-7005
  now point to the thread.

## 2026-10-01 — An unsent draft survives a reload (swap audit F-12)

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none (no visual change)
Contract IDs:   71202 widened: a draft survives a thread switch and a reload
Actions:        none
Data impact:    none; drafts are kept in sessionStorage per signed-in user (cleared when the tab closes)
Held items:     none
```

- **Issue.** Drafts lived in a component Map: kept across thread switches,
  lost on a reload.
- **Fix.** `DraftStore` writes through to sessionStorage keyed by the user, so
  a reload keeps the draft while another account on the device, or a closed
  tab, does not. Refused or malformed storage falls back to memory.
- **Checked.** `messages-drafts.test.ts` 3/3; `messages.test.tsx` and
  `messages-mobile.test.tsx` green.

## 2026-09-30 — Mute is observed like every other messaging action (swap audit F-17)

```text
PR/commit:      agent/clubhouse (release train #2110)
Design package: none (swap audit fix, no visual change)
Contract IDs:   none
Actions:        `getGolfConversationMute`, `setGolfConversationMute` wrapped with `withAdminObserved`
Data impact:    Registered under the `messaging` feature in `lib/admin/feature-registry.ts`. No behaviour or schema change.
Held items:     none
```

- **Issue.** The mute actions were the only golf message actions not wrapped for
  the admin coverage contract (the tripwire failed in `test:all`).
- **Fix.** Both are wrapped and registered; their signatures and results are
  unchanged.
- **Checked.** `src/lib/admin/__tests__` 773/773.

## 2026-09-30 — Right click opens reactions (Clickables gap 23)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Right click opens reactions (Clickables gap 23)

- **Issue.** On desktop a right click on a message did nothing.
- **Fix.** It opens the message's reaction bar, as the React button does; the
  phone keeps its long press.
- **Checked.** messages 64/64, the mutation caught.

## 2026-09-30 — Clickables 10, 13, 14: Schedule invite, desktop Files, attach in New message

```text
Contract IDs:   none new (70209, 70406, 70616, 70630 now also draw on desktop Details; 70501 and 70604 also reach a first message)
Actions:        ACT-P007-SCHEDULE (new); ACT-P007-LIST-FILES and ACT-P007-SEND-ATTACHMENT widened
Data impact:    none
```

### Changed

- The desktop thread header's calendar icon is Schedule (label and tooltip) and
  opens Calendar's New event
  (`?new=1`); a direct thread with a player adds `&with=<golf_players.id>`
  (D-52), a group or a coach
  thread does not. The phone tile is unchanged (`?new=1`, no invite).
- Desktop Details lists the shared files, as the phone does: one shared read and
  open
  (`screens/messages/files.ts`), the same loading, none-yet, didn't-load and
  won't-open states.
- New message on the phone has the thread composer's Attach (+). Its files go to
  the thread with the
  first message and are sent there through `api.sendFiles`, so the 10-file cap,
  the type and size check
  (CH-7101) and the failure (CH-7006) are the thread's. A refused file is
  reported once the thread has
  opened and stays in its box.

### Verification

- `npx vitest run src/clubhouse/__tests__/messages.test.tsx` 63/63 (55 before);
  each new test fails with its
  fix removed (8 mutations).

## 2026-09-30 — Every contract proven by a test; drafts kept per thread

```text
Contract IDs:   71202 (new: DRAFT_KEPT_ACROSS_THREADS); tests attached to all 16 hand contracts
Data impact:    none
```

### Changed

- Drafts are kept per conversation by the container; switching threads no longer
  loses them.
- Each hand contract names a test that names its Bridge ID; five new tests
  (70101, 70102, 70901 with
  72001, 71202, 72301).
- CONTRACT.md tables are generated by `registry.mjs sync`; the notes are kept.

### Verification

- `npx vitest run src/clubhouse` 382/382; the 71202 test fails with the fix
  removed.

## 2026-09-29 — V2 page docs (gold standard)

```text
Design package: design/handoff/ v2 (Coach - Messages.html, Coach - Messages - Mobile.html)
PR/commit:      agent/clubhouse (this commit)
Contract IDs:   70101 to 72401 (88 on this page: 73 from the catalog, 15 new behaviour contracts without a code)
Actions:        18 (ACT-P007-*)
Data impact:    none
Held items:     conversation-files (feature), message-attachments-hardening (data)
```

### Changed

- The six page docs, the manifest's actions, and the 15 behaviour contracts
  (core view, deep links,
  realtime, success, draft kept, optimistic send, retry, section Try again,
  phone stack, Enter to send,
  one load per thread, failures reported, the held gate, the tests).

### Why

- D-62: Messages is the gold standard the other pages copy. D-69: every category
  answered.

### Verification

- `clubhouse:check` clean with the contract check on; `npx vitest run
  src/clubhouse` 377/377.

## 2026-09-29 — v2 foundation carried onto Messages

```text
Contract IDs: 70408 (new: no team, CH-7308)
```

### Changed

- v2 motion (D-64), v2 haptics (D-70): sends and changes that land fire success;
  Retry and Add are
  silent. The no-team state is the v2 page empty state (D-71). Messages moved
  under More on the
  phone for both roles (D-66).

## 2026-09-29 — Phone build and merge

- The phone stack (Inbox, Thread, Details, New message, announcements) on the
  approved spec, D-40 to
  D-49; `getGolfConversationFiles`, held (D-48, D-61).

## 2026-09-29 — Desktop build

- Desktop Messages on the live realtime hooks (D-13) with announcements inside
  (D-16), and the full
  state catalog (CH-70xx to CH-78xx).
