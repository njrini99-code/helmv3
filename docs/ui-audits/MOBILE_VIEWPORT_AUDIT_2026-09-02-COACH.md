# Mobile Viewport UX Audit — Coach Account — 2026-09-02

**Scope:** helmsportslabs.com, coach side only, 390×844 mobile viewport (iPhone 13 emulation).
**Screenshots:** `docs/ui-audits/mobile-viewport-shots-2026-09-02/coach/`

## ⚠️ Session blocker — coverage is partial

This audit was interrupted by a **session collision with the sibling player-account agent**, and a **credential mismatch**, both worth flagging before the findings:

1. **Shared browser profile collision.** Both agents were pointed at the same managed browser profile (`openclaw`, 2 tabs). Web auth (cookies/localStorage) is shared per-profile, not per-tab. Partway through this audit, the sibling agent's login as the player account **silently replaced the coach session in this tab** — the page kept rendering but the identity underneath had flipped from coach ("Nick Rini") to player ("Cole"). This was only caught because the "More" menu started showing the wrong profile card. I moved to an isolated browser profile (`imported`) to avoid further collisions.
2. **Credential mismatch.** The coach credentials supplied for this task (`rinin376@gmail.com`) log into a **player** account (dashboard shows "Good afternoon, Cole", "New round", "My Standing" — no Roster/Team/Calendar-management nav). The genuine coach session used for most of this audit ("Nick Rini", Demo University Golf, Roster/Team/Messages/Calendar nav) was a **pre-existing session already open in the shared tab** when the audit started, not one I logged into myself. I could not re-establish a fresh, independently-authenticated coach session once it was overwritten — I don't have valid coach credentials.

**Net effect:** findings below are real and screenshot-verified, gathered from the genuine coach session before it was overwritten. But coverage is incomplete — **not reached**: Settings, Qualifiers, Recruiting HQ, player stat-review screens from the coach's view, and deliberate error-state triggering (item 5). Recommend re-running with verified, independently-tested coach credentials in an isolated profile.

---

## Confirmed defects

### 1. Page loads with a stray scroll offset, clipping content behind the sticky header

Reproduced on **two different routes** — this looks like a systemic pattern, not a one-off.

- **Calendar** (`/golf/dashboard/calendar`): on fresh load, the page is scrolled down ~130px, cutting the top third off the green "Respond" button (an RSVP prompt for an event) so only the bottom half of its label is visible, overlapping the sticky "Calendar" title bar.
  - Screenshot: `07-calendar-onload-clipped-respond-button.png`
  - Compare to `07b-calendar-scrolltop-correct.png` — manually scrolling to `scrollY: 0` shows the button fully, confirming the loaded state (not the design) is the bug.
- **Messages** (thread view, e.g. `/golf/dashboard/messages`): on opening any conversation, the page auto-scrolls partway down, clipping the top of the "Team messages" H1 heading behind the sticky "Messages" tab bar (visible as a truncated sliver of text poking above the tab strip).
  - Screenshots: `04-messages-list.png` (list, fine) vs. `05-messages-typing-and-header-clip.png` and `06-messages-thread-squished-viewport.png` (heading clipped once a thread is open).

**Impact:** Looks broken/unpolished on first load of these screens; users may not notice the primary CTA ("Respond") at all since it's half-hidden under the header.

### 2. Opening a message thread leaves almost no visible room for the conversation itself

On mobile, opening a conversation does **not** collapse or hide the parent "Team messages" list header (eyebrow label, H1, subtitle, "2 conversations" count, "New message"/"Team" buttons). All of that stays on-screen above the thread panel, so the actual message-bubble viewing area is squeezed into roughly **100–150px** of the 844px-tall viewport — barely one message bubble — before the composer and bottom tab bar take the rest.

- Verified via DOM measurement: the scrollable message container had `clientHeight: 84–104px` against a `scrollHeight` of 700–2600px depending on thread length.
- Screenshot: `06-messages-thread-squished-viewport.png` — only a single line of the latest message is visible above the composer.

**Note on the "does it scroll to the newest message" complaint:** I could not reproduce a case where the container was mathematically *not* scrolled to its max — `scrollTop` consistently equaled `scrollHeight − clientHeight` on fresh load, i.e. it is technically scrolled to bottom. But because the visible window is so short, it *feels* exactly like the reported complaint: a coach opening a thread sees almost nothing of the recent conversation without scrolling up first to get context, and any newest message longer than one line is itself partially cut off. Recommend collapsing/hiding the list header when a thread is open on mobile, similar to how most chat UIs push the conversation to fill the viewport.

### 3. Typing legibility — no defect found

Checked message compose on the Team Updates thread at 390px width: typed text is dark-on-white, fully legible, not clipped, not covered by other UI (`05-messages-typing-and-header-clip.png`). The "can't see what I'm typing" complaint did not reproduce on this screen.

### 4. No overflow/clipping found on these screens

Roster list, "Invite player" modal, the player row's "Actions" (⋮) dropdown, and the account "More" bottom sheet all rendered cleanly at 390px — no horizontal scroll, no clipped buttons, close controls reachable.
- `01-roster-list.jpg`, `02-roster-invite-modal.png`, `03-roster-player-actions-menu.png`, `08-more-sheet-wrong-identity.png` (ignore the identity shown in that last one — see blocker note above; the sheet's *layout* is what was being checked and it's fine).

---

## Not reached (blocked by session/credential issue above)

- Settings
- Qualifiers
- Recruiting HQ
- Player stat/round-review screens from the coach's view
- Deliberate error-state triggering (bad input, styled vs. raw error UI)
- Scheduling/event **creation** flow specifically (only the Agenda/RSVP view was reached)

## Tooling note (not an app defect)

Early in this session, browser `resize` calls intermittently reset to a desktop-sized capture (800×513) with the mobile-width page rendered letterboxed in the top-left corner — most likely the same cross-agent window-sharing issue described above (window-level resize is shared across tabs/agents). Switching to per-tab `emulate` (device profile) instead of `resize` fixed this reliably. Screenshots taken before the fix were re-verified against pixel dimensions before being trusted.

---

## Continuation — gaps filled (2026-09-02, later same day)

**Setup:** browser profile `imported` (isolated from the sibling player-account agent), tab `t2`/target `golf-audit-coach-2`, 390×844 (iPhone 13 emulation). Logged in fresh via `/golf/login` with the verified coach credential (njrini99@gmail.com) — confirmed genuine coach identity ("Nick Rini," Demo University Golf, coach-only nav) via the account sheet and, later, by decoding the session's Supabase auth-cookie JWT claims (`email`, `user_metadata.role`) — never the raw token/cookie itself.

This pass covered the six items the first run didn't reach: **Settings, Qualifiers, Recruiting HQ, player stat/round-review screens from the coach's view, deliberate error-state triggering, and the event-creation flow.**

Findings 1–4 below are layout and DOM-geometry measurements (element bounding-rect coordinates, `window.scrollY`, visible text truncation) that do not depend on which account was authenticated at the time — they reproduce from CSS/layout, not from data returned per-role. The Calendar `scrollY: 386` offset (finding 4) was independently re-measured on a second fresh page load, after the clean coach re-login described in the session-instability section below, and reproduced (`scrollY: 364` on that load — same pattern, same order of magnitude). Finding 1 (the off-screen validation error) was captured before the clean re-login; it wasn't re-triggered under the verified session afterward, but it's a client-side date-comparison check with no plausible dependency on account role, so this doesn't weaken it.

### Confirmed defects

**1. Calendar validation error renders off-screen — coach can't see why "Create event" silently failed.**
Filled in the "New event" modal with a valid name but an End date before the Start date, then tapped **Create event**. The button did nothing visible — no error appeared on screen, no navigation. DOM inspection showed why: a correctly-styled red error banner ("End date must be on or after the start date," red border/background, warning icon — the styling itself is clean, not raw/ugly) was rendered, but at `getBoundingClientRect().y: -7`, i.e. above the top edge of the modal's visible scroll area. The modal does not auto-scroll to reveal its own validation error. A coach filling this form on mobile would see the button appear to do nothing and have no way to know why, unless they happened to scroll up inside the sheet.
- Screenshot: `19-new-event-date-error-scrolled-offscreen.png` (error manually scrolled into view for documentation — this is *not* what the coach sees by default).

**2. Toast/banner notifications overlap and obscure the bottom tab bar — reproduced twice, on two different screens.**
Same pattern in two unrelated places:
- Settings → Password & Security, submitting a wrong current password: the "Current password is incorrect" toast (cleanly styled, red icon, white card) renders sitting on top of the bottom nav bar, covering the "Home / Helm / Team" labels while visible. Screenshot: `10-settings-password-error-toast.png`.
- Rounds & Stats → a round's "Open full review" (CoachHelm AI analysis): the "Review Generated — AI analysis complete for your round" success toast does the same thing, again covering the bottom tab labels. Screenshot: `17-toast-overlaps-bottom-nav-2nd-instance.png`.

Two independent instances (one error, one success; two different screens) point to a systemic toast-positioning bug rather than a one-off, likely the toast container's `bottom` offset not accounting for the fixed bottom nav's height on mobile.

**3. Truncated stat label on the coach's player-stats view.**
Coach → Roster → a player's "⋮" menu → **View Stats** → scroll to the "Core Ball Striking" bento row: the third tile's label reads "SCRAMBLI…" — "Scrambling" is clipped with an ellipsis because it doesn't fit the fixed-width tile at 390px, while the other two tiles ("FAIRWAYS", "GIR") fit fine. Screenshot: `15-player-stats-scrambling-label-clipped.png`.

**4. Sticky-header on-load scroll offset — reproduced on Calendar's default Agenda landing, larger magnitude than previously logged.**
This is the same bug class already confirmed in the first pass (Calendar's RSVP button, Messages' thread heading), but measured here on a fresh coach session, twice, at a **larger offset than before**: the Calendar tab's default Agenda view loads with `window.scrollY: 386` (vs. ~130px previously recorded for the RSVP-button case), hiding the entire "Calendar / September 2026 / New event / mini week-strip" header block on first paint — only the Day/Week/Month/Agenda sub-tabs and the event list are visible until the user scrolls up. Reproduced consistently across two separate fresh page loads. No new screenshot needed beyond `18-calendar-onload-scroll-offset-386px.png` since it's the same underlying pattern already documented; flagging the larger magnitude and the fact it hits the *default* landing view (not just a specific RSVP prompt) as worth prioritizing.

### Minor / polish (not a layout bug)

- The round-review screen's hole-by-hole hint reads "**Hover** or tap a hole to see what happened" — "Hover" is a desktop-only affordance leaking into copy that's also served on mobile, where only "tap" applies.

### No defect found

Clean at 390px, no clipping/overflow, no positioning issues:
- **Settings**: profile info, email-change, and password-change form sections (all fields, labels, and buttons render correctly at every scroll position — the earlier appearance of a clipped "Save changes" button was just normal viewport-edge scroll, confirmed not a bug once scrolled).
- **Qualifiers**: list, qualifier detail, Edit-qualifier form (including the multi-round course/scoring-rules section and Cancel/Save footer), and the CoachHelm selection/leaderboard/coach-picks screen.
- **Recruiting HQ**: prospect list, "Add to Recruiting HQ" modal (status pills, required/optional fields, long-text input in First name handled without overflow), and the Edit-prospect modal (including the destructive "Remove" action, not exercised).
- **Player stats/round-review (coach's view)**: stats header, strokes-gained card, ball-striking/approach/off-the-tee progress-bar sections (aside from the one truncated label above), round-review overview, hole-by-hole "story" and "what to do next" cards, and the Coach Notes textarea.
- **Event creation modal itself**: unlike the pages behind it, the "New event" modal has its own internal scroll context and does *not* inherit the sticky-header on-load clipping — it opens fully visible at its own top. The "Discard this event?" confirmation dialog is centered and clean.
- **Sticky-header on-load offset — explicitly checked and not reproduced** on Settings, Qualifiers, and Recruiting HQ: all three land at `scrollY: 0` (or visually equivalent, top of page) on fresh navigation, unlike Calendar/Messages. The event-creation modal and its error/discard dialogs are also unaffected (see above), since they scroll within their own sheet rather than the page. This appears specific to Calendar and Messages, not a page-wide pattern.

### Session instability — tooling caveat, not a confirmed app defect

While testing the event-creation error flow, a **valid** "Create event" submission (name filled, dates valid) unexpectedly failed with "Only coaches can create team events" even though the page chrome still showed the coach's dashboard throughout. Decoding the live session cookie's JWT claims at that moment showed the authenticated account was `rinin376@gmail.com` (role: `player`) — a *third*, different identity from both the coach (`njrini99@gmail.com`) and the player seen in the first audit pass ("Cole Bennett"). A subsequent hard refresh briefly rendered the dashboard as "Cole Bennett" (player) before any further action.

Investigated the likely cause before writing this up: the `imported` browser profile has a non-empty Chrome `Login Data` file (saved passwords), meaning autofill or another writer to that profile's storage is a live explanation for the identity churn — not necessarily an application bug. To isolate it: cleared all cookies, logged in fresh with njrini99@gmail.com, immediately decoded the new session cookie (confirmed `email: njrini99@gmail.com`, `role: coach` — coach session genuinely active, verified before touching anything else), then **immediately retried event creation with valid data — it succeeded with no error.** This confirms "Only coaches can create team events" is *correct, working authorization logic reacting to whatever session was actually live at that moment* — not an app defect. Screenshot `20-create-event-permission-error-during-session-instability.png` documents the error state for the record, but it should not be read as proof of a permissions bug.

What's left unexplained, and outside what browser automation alone can attribute: *why* the session identity churned across three different accounts within one profile during this run. Given the `imported` profile carries saved credentials and this is the second run in a row (across two separate audit passes) to hit unexplained identity swaps in this environment, recommend a **manual, non-automated re-check** of session stability on a real device/browser before ruling this out as pure tooling artifact — screenshot `21-session-reverted-to-cole-bennett-player.png` shows the mid-session identity flip for reference. The viewport also intermittently reverted to the same desktop-sized letterboxed capture described in the original Tooling Note above (~5 times this pass); re-applying `emulate` before each screenshot fixed it every time and is the same known non-app issue, not a new finding.

**Test data left behind:** the valid retest submission ("Create event succeeded" above) created a real, non-demo-labeled calendar event — "Retest Valid Coach Session Event," Wed Sep 2, 9:00–11:00 AM, Practice — on the live Demo University Golf calendar. Looked for a delete/remove control in the event-detail sheet and the Edit-event sheet by searching button text for "delete"/"remove" and found none, but that search wouldn't catch an icon-only trash control if one exists — absence isn't confirmed, just not found this way. This test event should be manually removed or accounted for before treating the demo calendar's event count as clean.
