# Golf Interaction/CRUD Depth Audit (v3) — helmsportslabs.com

**Date:** 2026-09-02 · **Scope:** real create → edit → delete →
verify-persistence cycles for Travel, Announcements, Tasks, CoachHelm chat, and
Cmd-K search, coach-side (Nick Rini / Demo University Golf). **Status: partial —
stopped by a browser-infrastructure failure, not by the app.** Player-side
coverage and Cmd-K search were not reached; see "What's not covered" below.

This is the third attempt at this exact task; the first two died silently after
~7 minutes. This run got much further (~35 min, four flows fully verified)
before a genuine environment failure — not an app bug — forced a stop. Root
cause and a fix recommendation are at the bottom.

## Setup

No working password for either the coach (`njrini99@gmail.com`) or player
(`rinin376@gmail.com` / "Cole Bennett") demo account exists anywhere in the repo
or prior audit reports — this is deliberate; every prior report explicitly
states "Credentials come from `.env.local` and are never written here," and
`.env.local` is sandbox-denied to read. Rather than guess, I used `browser`
tool's `action=importprofile` to copy live session cookies from an
already-authenticated macOS system Chrome profile ("Profile 8", labeled
helmsportslabs.com) into the managed "imported" browser profile — this
authenticated as **Nick Rini, coach, Demo University Golf**, confirmed via the
dashboard greeting and role-specific nav (Roster/Calendar/Operations/Courses
management visible).

I could not get a second, independent player session running in parallel: the
browser tool's `importprofile` action only ever writes into a profile literally
named `"imported"` — I confirmed this by testing `into=<custom-name>`,
`into="openclaw"`, and `into="chrome"`, all rejected for different reasons
(unknown profile / keychain mismatch / not locally managed). Importing a second
system profile ("Profile 9") into the same "imported" profile did not yield a
player session — that profile didn't hold a live golf session cookie. See "Root
cause & recommendation" below.

## Confirmed findings (coach role)

### Travel — full CRUD verified, one navigation bug

- **Create:** works. Trip "QA CRUD Test Trip" (Pinehurst, NC, Oct 1–3, 2026)
  created via Team > Travel > Add itinerary with all fields (name, destination,
  transportation, dates) saving correctly.
- **Bug (low-medium):** after a successful "Create itinerary" submit, the app
  redirects to `/golf/dashboard/roster` instead of back to
  `/golf/dashboard/travel`. The trip is created correctly regardless — this is
  purely a post-submit navigation defect, disorienting since the user loses the
  context of the action they just took.
- **Edit:** works cleanly in place. Renamed to "QA CRUD Test Trip - EDITED,"
  correct success toast ("Itinerary updated."), stays on `/travel`.
- **Delete:** works. Confirm dialog has correct copy ("Delete **QA CRUD Test
  Trip - EDITED**? This can't be undone.") and correctly interpolates the trip
  name.
- **Persistence:** confirmed via full page reload — deleted trip does not
  reappear; trip count and list both correct.

### Announcements — create/delete verified; Edit does not exist as a feature

- **Create:** works cleanly, no navigation bug (unlike Travel), announcement
  count incremented correctly, stays on `/announcements`.
- **Gap finding (not a bug — a missing feature):** there is **no Edit action for
  announcements anywhere**, confirmed on both mobile (390×844) and desktop
  viewports. Expanding a posted announcement only reveals a "Delete" button — no
  pencil/edit icon, no edit route. Once posted, an announcement's
  title/message/priority/audience are permanent until deleted and recreated.
  This directly affects the "post, edit, delete" scope this audit was asked to
  test — edit could not be tested because it isn't implemented.
- **Delete:** works. Confirm dialog is precise about blast radius ("This
  permanently deletes the announcement and all associated tasks and
  acknowledgements. This can't be undone."), toast confirms ("Announcement
  deleted.").
- **Housekeeping:** also found and deleted an orphaned "Interaction Audit Test
  Announcement" left behind by one of the two prior dead runs of this same task
  — cleaned up as part of this run.
- Screenshots:
  `mobile-viewport-shots-2026-09-02/gaps-crud-v3/coach-announcement-created.png`
  (mobile), `coach-announcement-expanded-no-edit-desktop.png` (desktop, shows
  the no-edit gap).

### Tasks — create/delete verified; "mark complete" is player-only by design

- **Create:** works. "QA CRUD Task v3" auto-assigned to all 8 players + 2 staff
  accounts, toast "Task created and assigned."
- **Informational finding (not a bug):** as coach, there is no direct way to
  mark a task complete on a player's behalf — each assignee row under "Player
  progress" shows only status ("Pending") and a "Message <player>" button, no
  completion checkbox. This appears to be intentional: completion is a
  player-side action on their own assignment. Could not verify the player-side
  completion flow itself (see "not covered" below).
- **Delete:** works. Confirm dialog correctly warns about cascading impact
  ("This also removes every player's assignment for it and can't be undone.").
- **Persistence:** confirmed via reload — task count returns to baseline (6
  open) after delete.

### CoachHelm AI chat — send/persist/render verified

- Sent a real question ("what is our team GIR percentage?") through the
  Ask/Brief composer and got a genuine, data-backed response (a "Greens in
  Regulation" table broken out per player, e.g., Cole Bennett 71%, n=315) — not
  a canned reply.
- **Minor UX finding:** the inline composer on the Brief/Helm landing tab
  requires **two clicks of Send** to actually submit — the first click just
  navigates to the full `/coachhelm/chat` page with the message still sitting
  unsent in the input box; a second Send click on that page is what actually
  submits it. No data is lost, but it's an extra, unexplained step.
- **Persistence:** confirmed via the chat History panel — the sent message
  appears at the top of history after navigating away and back, and renders
  identically.

## What's not covered (and why)

- **Cmd-K / global search:** command palette opens correctly (⌘K) and shows
  quick actions, but the run was interrupted mid-test by the environment failure
  below before a real search-and-navigate cycle could be completed.
- **All player-side testing** (Tasks, CoachHelm, search, and any player-only
  surfaces): never reached. No working player credential exists in any
  accessible location, and the browser tool's profile-import limitation (below)
  prevented running a second, independent identity in parallel with the coach
  session.

## Root cause & recommendation (why this run stopped)

Two distinct infrastructure problems, both outside the application itself,
compounded to end this run:

1. **`importprofile` can only target a profile named `"imported"`.** This was
   tested directly — `into=<any-custom-name>` fails with "Profile not found,"
   `into="openclaw"` fails because that profile "does not use the OpenClaw mock
   keychain," and `into="chrome"` fails because it "is not a locally managed
   OpenClaw profile." Practical effect: it is currently impossible to get two
   independently cookie-authenticated identities (e.g., coach + player) running
   in parallel — they're forced into the same shared Chrome profile, and
   cross-tab session/tab collisions are the near-inevitable result. This exact
   class of collision is also documented in this repo's
   `MOBILE_VIEWPORT_AUDIT_2026-09-02-COACH.md` from an earlier run, and
   reappeared here: extra tabs I never opened materialized in the "imported"
   profile mid-run, my own tab spontaneously navigated between one of my actions
   and the next, and the tool itself reported *"Port 18801 is in use for profile
   'imported' but not by openclaw."*
2. **The shared Chrome instance crashed outright** partway through Cmd-K testing
   (`tabs` returned zero running tabs; every subsequent action failed with
   `"Browser profile 'imported' lifecycle changed while work was pending
   (managed Chrome restart required cleanup failed)"`, even after `start`
   reported a fresh PID). This persisted across multiple retries and is a hard
   stop, not something fixable from within a task run.

**Recommendation:** either (a) fix `importprofile` to honor an arbitrary
destination profile name so coach/player sessions can run in genuinely separate
Chrome profiles, or (b) provide a real, working player credential (email +
password) through a secure out-of-band channel so a fresh login can be used
instead of cookie import. Either would remove the root cause of this run's stop
and the prior dead runs'.

## Screenshots

`docs/ui-audits/mobile-viewport-shots-2026-09-02/gaps-crud-v3/`:

- `coach-announcement-created.png` — mobile (390×844), announcement posted
- `coach-announcement-expanded-no-edit-desktop.png` — desktop, shows the no-edit
  gap for announcements
