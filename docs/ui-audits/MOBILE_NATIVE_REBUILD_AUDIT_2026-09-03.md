<!-- markdownlint-disable MD013 MD060 -->
<!-- MD013 (80-col) and MD060 (table pipe padding): this is a prose
     findings document with file:line citations and comparison tables that
     do not survive hard wrapping without becoming unreadable. Same
     convention the other prose docs in this repo use. -->

# Helm mobile native-class rebuild — audit

**Date:** 2026-09-03 · **Branch:** `agent/mobile-p0-stability` (from `origin/main` @ `7f93595f7`)
**Scope:** the authenticated mobile app, messaging first.
**Method:** source reading with `file:line` citations, four parallel read-only
specialist audits, and the production release stamp. **No physical device was
used** — see §J.

---

## Premise correction, before anything else

**Production is not stale.** The live release stamp on helmsportslabs.com is
`a60a42e2b`. Four prior mobile waves are already in it:

| Commit | What it shipped |
|---|---|
| `15df63726` | iOS 2.1 foundation, no-keyboard-on-open, honest skeletons |
| `346bd143b` (#1739) | `--keyboard-height` mechanism; golf composer + distance box |
| `8f36ea44f` (#1768) | nine findings from the 2026-09-02 mobile viewport audit |
| `bf6851103` (#1774) | remaining findings from the UI audit swarm |

So `mobileShowChat` (the thread-open master-detail), the keyboard-height
subtraction on the golf messages shell, and the thread-view masthead collapse
**already ship**. The seven commits merged to `main` but not yet promoted are
all Bridge/admin — deploying them would not change the mobile app.

This matters because it defines what must *not* be rebuilt. The defects in the
owner's screenshots are the ones those four waves did not reach.

**There is also already a Mobile Doctrine** — 11 numbered rules distilled from a
prior nine-reviewer audit. Live code cites it as `docs/MOBILE_DOCTRINE.md`
(`src/app/golf/(dashboard)/dashboard/template.tsx:6`), but the file was archived
to `docs/archive/2026-07-devibe/MOBILE_DOCTRINE.md` and that path now resolves
to nothing. **Finding: doc-path drift on the repo's own standing design law.**
This work builds to those rules rather than inventing a parallel system.

---

## A. Root causes found

Ranked by how much of the reported feeling each explains.

1. **`AppShell.tsx:325` — `topBarProps` was a bare object literal.**
   `FairwayTopBar` is `React.memo`'d and `sidebarProps` ten lines above is
   correctly `useMemo`'d, but this one was rebuilt every render, so the memo
   never held. `FairwayDashboardContent` subscribes to `useNotificationBadges()`
   at the top of the persistent tree (`FairwayDashboardShell.tsx:336`), so the
   **45-second badge poll** re-rendered the whole shell and repainted the top
   bar with nothing visibly changed. This is the mechanism behind "the header
   rebuilds between tabs". **FIXED.**

2. **`use-golf-messages.ts:182` — the thread fetch omitted `has_attachments`.**
   `MessageThreadPane` only requests signed URLs for messages whose
   `has_attachments` is truthy, so every message read from the database had it
   `undefined`, signing never fired, and `MessageAttachments` returned `null`.
   The realtime `INSERT` handler uses `payload.new` — the full row — so a photo
   *was* visible to whoever had the thread open when it arrived and gone for
   everyone afterwards, sender included. That is the production "Can't see pics"
   report, and it is why nothing appeared in telemetry: nothing failed.
   **FIXED.**

3. **`MessageComposer.tsx:172` — Enter-to-send assumed a Shift key exists.**
   An iOS software keyboard reports its return key as plain `Enter`, so the
   newline branch was unreachable: a player could not put a line break in a team
   message at all. **FIXED.**

4. **`FairwayMessages.tsx:494` — an editorial masthead on a phone.** The list
   view printed the destination name three times (top-bar title, `eyebrow`,
   `title`) plus team name, conversation count, and a stacked action row, above
   a conversation list. **FIXED.**

5. **`ui/drawer.tsx:74` — a second, older bottom drawer that never learned about
   the keyboard.** 23 call sites, several text-entry. **FIXED.**

6. **`MessagesFairway.tsx:90` — baseball never received #1739.** Its height
   budget accounts for every piece of chrome except the keyboard, so a baseball
   coach typing a message has the composer under the keys. **NOT FIXED — still
   live.** It was fixed and then REVERTED when scope was set to golf only; the
   revert commit carries the one-line fix so it can be reapplied deliberately
   rather than rediscovered from a user complaint.

7. **`FairwayMessages.tsx` — `<MessageComposer>` was mounted with no `key`.**
   Its `message` and `pendingAttachments` are local state cleared only on a
   successful send, while both send handlers read whatever
   `selectedConversationId` is current *at send time*. A draft or attached
   photo therefore survived a conversation switch and was delivered to whoever
   was selected next, with no visual cue. **This is a privacy defect, not a
   convenience gap.** **FIXED**, with a gate.

8. **`MessageThreadPane.tsx` — a successful-but-empty attachment fetch fell
   into no branch.** The send is two unbatched statements; realtime broadcasts
   on the first, so a recipient's fetch can land before the attachment rows
   commit and get an empty result with *no error*. The handler recognised only
   error and non-empty, so the bubble rendered a static "📎 Attachment" label
   with no gallery and no retry — permanently, since the effect only re-runs
   when the *set* of attachment-bearing ids changes. This is the second half of
   "Can't see pics": the missing column broke every reload, this race broke
   live arrival. **FIXED** (recorded as unresolved + one bounded auto-retry).

9. **`ui/input.tsx:190` — an invisible button that still took taps.** A 44×44
   clear control at `opacity-0` with no `pointer-events-none`, over the input's
   right edge. Tapping to place the cursor could fire Clear and wipe the field.
   **FIXED.**

10. **`FairwayRoundDetail.tsx:926` — the Pulse chart was pinned to 520px on
    *every* viewport.** The real cause was narrower than the audit's: an inline
    `style={{ width }}` beat the `w-full max-w-[520px]` classes in the cascade,
    so `w-full` never applied anywhere. In a ~208px phone column it clipped to
    the leftmost ~40% of the round inside a silent `overflow-x-auto` — and
    because that slice forms a plausible V shape, it read as a *complete*
    trend. A coach drew conclusions from 40% of a round. **FIXED** (responsive).

11. **`calendar/page.tsx:64→157` — a genuine two-phase sequential Supabase
    waterfall.** Phase 2's four queries cannot start until phase 1 resolves
    `teamId`. The repo's own `NavPending.tsx:14` cites calendar as the slowest
    route. **In progress — see §I.**

---

## B. Mobile shell problems

- **The shell does NOT remount between sibling routes.** Verified: chrome and
  all providers live in `(dashboard)/layout.tsx:291` → `FairwayDashboardShell`,
  above `{children}`. Next layouts persist by construction. The "rebuilding"
  feeling was re-rendering (§A.1), not remounting. Recorded so nobody re-audits.
- Top bar is `4rem` fixed; bottom nav is `min-h-[56px]` with safe-area pad and
  **no backdrop-blur** — already doctrine-compliant. Not touched.
- `FairwayTopBar.tsx:261` already renders the page title on mobile. Any page
  masthead repeating it is redundant by construction.

## C. Navigation / rendering problems

- Bottom nav, sidebar and sub-nav all route through one `ShellLink` adapter
  rendering `next/link` with explicit `prefetch` (`FairwayDashboardShell.tsx:186`).
- **Ruled out with evidence:** loading skeletons are shape-matched across 12
  spot-checked routes, several carrying in-code notes about the specific CLS bug
  they fixed; all five `.channel()` subscriptions have matching
  `removeChannel` teardown; the composer correctly isolates keystroke state
  (`MessageComposer.tsx:60`), so typing does **not** re-render the conversation.
- Notification badges resolve post-mount from `useState(0)`, but the markup is
  conditional (`FairwayBottomNav.tsx:205`) and absolutely positioned — a visual
  pop-in, **not** a layout shift. Worth knowing it is a different symptom than CLS.
- `key={index}` on a growing message list (`ChatThread.tsx:178`) — unverified
  reorder risk, recorded not fixed.

## D. Messaging architecture problems

- **Attachments:** §A.2. Fixed with a gate.
- **Optimistic send:** an optimistic stub is appended and reconciled only when
  the realtime echo arrives, matched by *first optimistic message from me*
  (`use-golf-messages.ts:271`). If two echoes land out of order the contents
  swap slots, and `optimistic-${Date.now()}` collides for two sends in the same
  millisecond. Real, narrow. **Not fixed** — wants a client-generated UUID.
- **Failure is already recoverable.** I expected the composer to brick on a
  rejected send; it does not. `handleSendMessage` catches, toasts, and returns
  `false` (`FairwayMessages.tsx:341`), so the text is preserved and `sending`
  resets. Recorded because I nearly reported the opposite.
- **Ordering:** realtime messages are appended without re-sorting on
  `created_at`. Simultaneous sends can display out of chronological order.
- **Absent entirely:** reactions, reply/quote, mentions, pinned messages,
  drafts, date/unread separators, read receipts beyond `read`, message grouping.
  All P1 in the spec's own ordering.

## E. Layout / overflow problems

- The messages surface itself is clean: one `overflow-hidden` region sized to
  the remaining viewport with two independent scroll owners, and `min-h-0` /
  `min-w-0` correctly threaded (`FairwayMessages.tsx:525,537,564,567,576,604`).
- `overscroll-behavior` is used consistently across 40+ containers.
- The prior audit's two confirmed overflow defects (a 520px chart in a 208px box
  on round review, both roles) remain open — outside messaging, not addressed.

## F. Touch / button interaction problems

- Pressed states are **systemic, not missing**: 255 `active:` utilities plus 20
  `whileTap` call sites. Bottom-nav targets are `min-h-[56px]`.
- Reduced motion has a real central helper (`useReducedMotionGuard`) mandated by
  the design-system rules, plus a CSS belt-and-braces block.
- **The hover-reachability sweep found ZERO real defects in golf/Fairway.** The
  ~32-file `group-hover:opacity-*` count was a grep count, and triaging all ten
  golf/Fairway candidates found every one already handled: `md:`/`sm:`-gated so
  they are visible by default on phone (`AttachmentPreview.tsx:167`,
  `VersionHistory.tsx:177`, `FairwayTaskTemplateList.tsx:351`,
  `FairwayDocuments.tsx:1775`), decorative marks inside an already fully-tappable
  tile (`ConflictWarning.tsx:153`, `PracticeRxPanel.tsx:213`), `hidden … lg:flex`
  so never rendered on phone (`MessageThreadPane.tsx:666`,
  `FairwayRoundRow.tsx:226`), or carrying an explicit
  `[@media(hover:none)]:opacity-100` fallback (`data-table.tsx:145`).
  `PlayersGridView.tsx` even carries a test asserting the absence of this bug
  class. **That remediation had already been done — recorded so it is not
  re-audited.**
- The sweep did find the **inverse** bug in a shared primitive
  (`ui/input.tsx:190`, §A.9), now fixed.
- Five genuine instances of the original class **do** exist outside golf/Fairway
  and are NOT fixed here: `PlayerNotesSection.tsx:204`, `TeamCard.tsx:262`,
  `CompareBar.tsx:99`, `FilterPanel.tsx:343`, `ProgramEditorClient.tsx:767`
  (baseball / coach-discover / lifting). `CompareBar.tsx:99` is the sharpest —
  it is the *only* remove control on a selected-player chip.

## G. Proposed spacing / design-system changes

Deliberately minimal, because the tokens already exist and the doctrine already
specifies the rhythm. The only changes made were **removals** on phone:
the Messages masthead below `md`, and the two spacings that existed to give it
air (`py-6`→`py-3`, `mt-6`→`mt-3`). No new token, scale, or system introduced —
adding a parallel spacing system is what the spec calls a duplicate responsive
system.

## H. Route transition model

Already implemented and already correct against Doctrine Rule 9: a shared
classifier (`src/lib/motion/route-motion.ts` `useRouteRevealMotion` +
`isGolfLateralDestination`) makes lateral tab switches instant and reveals only
forward/detail pushes; opacity-only, with a documented reason for avoiding
transform (it would establish a containing block and re-anchor `position:fixed`
descendants). One reveal, one owner. **No change made or needed.**

## I. File-level implementation plan

**Landed on this branch:**

| File | Change |
|---|---|
| `fairway/app-shell/AppShell.tsx` | memoize `topBarProps` |
| `fairway/pages/messages/MessageComposer.tsx` | pointer-gate Enter-to-send and the desktop hint |
| `fairway/pages/messages/MessageComposer.enterKey.test.tsx` | new — 7 tests |
| `fairway/pages/messages/FairwayMessages.tsx` | compact phone action row; drop mobile masthead |
| `ui/drawer.tsx` | `--keyboard-height` lift; `vh`→`dvh` |
| `hooks/golf/use-golf-messages.ts` | select `has_attachments` |
| `hooks/golf/__tests__/use-golf-messages.attachment-flag.test.ts` | new — 3 tests |
| `baseball/messages/MessagesFairway.tsx` | keyboard term + `data-fw-keyboard-aware` |

**Deliberately deferred, with reasons:**

- **Dedicated chat route** — P1 #15 in the spec's own ordering, and the
  master-detail behaviour it would buy already exists via `mobileShowChat`. The
  real gap it closes is narrower than "card inside a page": conversation
  selection is state, not URL (`FairwayMessages.tsx:291`), and the
  `?conversation=` deep link is *stripped* by `router.replace`, so opening a
  thread creates no history entry — the back gesture exits Messages instead of
  returning to the list, and an open thread cannot be linked. Worth doing; not
  P0; too large to ride along with stability fixes.
- **Calendar waterfall** (§A.7) — a real fix, but it is a server-data
  restructure on the app's slowest route and does not belong in a mobile
  stability PR.
- **Safe-area on `ui/drawer.tsx`** — 11 of its 23 call sites already pad
  themselves; a container-level pad would double-pad exactly those. Needs a
  per-call-site pass.
- **Optimistic-send UUID + ordering** (§D) — correct fix is a client-generated
  id threaded through the server action; a contained change, but a behavioural
  one on the send path, and it wants its own PR and its own tests.

---

## J. What is NOT verified

Stated plainly because the spec requires physical-device validation and the
tooling here cannot substitute for it.

**Everything below is reasoned from source, not observed on a phone:**

- keyboard open/close geometry, repeated cycles, and the `--keyboard-height`
  values actually published on a real iOS keyboard
- safe-area behaviour on a notched device, and whether Safari-tab and
  installed-PWA insets differ (the code has **no** `display-mode: standalone`
  detection at all — an installed PWA takes the plain-web path)
- the "roughly 110px recovered" figure for the Messages list view, which is
  computed from Tailwind values, **not** measured
- rubber-band scrolling, orientation change, background/foreground
- that the attachment fix actually renders a photo end-to-end — the gate proves
  the column is requested, not that storage signs and the image paints

Note also that the 2026-09-02 audit recorded composer typing legibility as
"clean — no issue" at 390×844. That was a desktop browser with no software
keyboard, so it structurally could not observe the reported defect. It is not
counter-evidence.

**Physical iPhone checklist:** open a conversation and type — composer visible
above the keys, header does not jump, list resizes; send a photo, reload, and
confirm it still renders; press Return mid-message and confirm a newline
instead of a send; confirm no "Press Enter…" text; rapid-tap the five bottom-nav
destinations and watch the top bar for repaint; open a task/expense/upload
drawer and tap its text field.
