# P007 — Messages: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

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
