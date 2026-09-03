# Master Bug Report — helmsportslabs.com (Golf)

Consolidates every bug found across two separate investigations:

1. **Sep 1, 2026** — a live authenticated production investigation
   (backend/data-integrity focus, no screenshots — code, DB, and log evidence).
2. **Sep 2, 2026** — a mobile-viewport (390×844) UX audit across 5 agent runs,
   coach + player accounts, with screenshots for every visual finding.

Screenshot paths are relative to `docs/ui-audits/`. Full source reports:
`MOBILE_VIEWPORT_AUDIT_2026-09-02.md`,
`MOBILE_VIEWPORT_AUDIT_2026-09-02-COACH.md`,
`MOBILE_VIEWPORT_AUDIT_2026-09-02-FOLLOWUP.md`.

Note: does **not** include the older, separate `UI_AUDIT_2026-08-16.md` scripted
Playwright audit (54 findings from a different methodology, mid-August) — that
predates this investigation and isn't merged in here. Say the word if you want
that folded in too.

---

## Part 1 — Backend / production investigation (2026-09-01)

Found via live account access + repo/DB forensics, not visual inspection. No
screenshots — evidence is code diffs, DB rows, and logs.

### P0 — confirmed, fixes exist but never shipped

| # | Bug | Evidence | Fix status |
| --- | --- | --- | --- |
| 1 | **Shot-tracking data loss** — the round-save "salvage" path silently erases already-completed holes' scores/shots instead of preserving them. | 4 completed production rounds with zero scored holes (3 qualifier + 1 practice), all created in a 47-second cluster on Aug 31. | Fix exists (`66b742700`), never merged to `main`. |
| 2 | Autosave fails with a "missing/unauthorized round" error at `save_partial_round_atomic`. | Reproduced live. | Fix exists (`6b4cd28a`), unmerged. |
| 3 | Submit has the matching missing-round error. | Reproduced live. | Fix exists (`64dade1c7`), unmerged. |
| 4 | Inngest production credentials invalid — background/durable jobs degraded. | Since July 30. | Not fixed. |
| 5 | Self-heal repair automation (`com.helm.bridge-rca-repair` LaunchAgent) has **never run once** — bypasses its own wrapper, times out via SIGALRM, no fallback heartbeat. | Logs empty since Aug 27; `runs = 0`. | Not fixed. |

### Data quality (DB forensics)

- 9 qualifier rounds fall outside their own date window.
- 1 qualifier round assigned to the wrong course.
- 11 qualifiers missing a default course.
- 8 rounds missing per-round course assignment.

### P1 — live bugs

| # | Bug | Notes |
| --- | --- | --- |
| 6 | React error #310 (hook-count mismatch) crashes `/golf/dashboard/stats` and round-tracking navigation. | Fix already existed locally since July, never deployed. |
| 7 | Calendar **create** rejects a valid UI-supplied date ("Date must be YYYY-MM-DD"). | |
| 8 | Calendar **edit** rejects an end date before the start date with no visible feedback. | **Same bug class confirmed and root-caused on 09-02** — see Part 2, item UI-5: the styled error actually renders, just off-screen. |
| 9 | Calendar conflict-check wrongly denies legitimate attendees. | Fix `3c74640f5` exists, unmerged. |
| 10 | Round review throws `PGRST116` ("cannot coerce result to single JSON object"). | |
| 11 | Session expiry mid-round not fully handled. | **Reproduced live on 09-02 with a screenshot** — see Part 2, item UI-11 (autosave 307-redirects to `/login` mid-round). |
| 12 | Messages: "Load failed" / fetch aborted on send. | |
| 13 | Calendar hydration issue specific to iOS/WKWebView. | |

### User-facing data/UI weirdness (both roles)

- QA test fixtures visible to real accounts — fake qualifiers with impossible
  dates ("60824"–"60831"), QA tasks/travel/announcements/messages mixed into
  real data.
- CoachHelm dashboard: urgency badge count disagrees with its own label text.
- Team Stats page shows a stale July cache next to live September data.
- Course detail page: Par/Yardage/Rating render as blank dashes at the top while
  correct tee data renders below on the same page.
- A saved 1-hole practice round displays as "2/18" in My Rounds.
- "Save for later" still triggers a browser unload ("are you sure you want to
  leave") warning.

**Root cause pattern:** most of these have fixes already built and tested on
local feature branches — they were never merged into `main` and deployed.
Release-pipeline gap, not "nobody noticed."

---

## Part 2 — Mobile viewport UX audit (2026-09-02, 390×844)

Confirmed, screenshot-verified defects only. "Clean" areas are summarized at the
bottom, not itemized.

### UI-1. Round Review chart truncated

Fixed 520px-wide chart SVG inside a ~208px container, no scrollbar/swipe hint.
Only ~40% of the round shows but looks complete. Reproduced both roles — shared
component bug.

- `mobile-viewport-shots-2026-09-02/coach-round-detail-score-chart-overflow.png`
- `mobile-viewport-shots-2026-09-02/player-round-detail-score-chart-overflow.png`

### UI-2. Calendar loads pre-scrolled, clipping the RSVP button

Fresh load lands scrolled ~130px down, cutting the top third off the green
"Respond" button under the sticky header.

- `mobile-viewport-shots-2026-09-02/coach/07-calendar-onload-clipped-respond-button.png`
- Compare:
  `mobile-viewport-shots-2026-09-02/coach/07b-calendar-scrolltop-correct.png`
  (manually scrolled to top — button displays fine, confirms it's the load
  position that's broken)

### UI-3. Calendar's default Agenda view — same bug, bigger

Re-measured on a clean coach session: `scrollY: 386` on fresh load (vs. ~130px
for the RSVP case), hiding the entire "Calendar / September 2026 / New event"
header block. Same root cause as UI-2, larger magnitude, hits the default
landing view.

- `mobile-viewport-shots-2026-09-02/coach/18-calendar-onload-scroll-offset-386px.png`

### UI-4. Message threads: header never collapses, ~3-32% of screen for actual messages

Confirmed on **both roles**. The container is mathematically scrolled to bottom
(`scrollTop = scrollHeight − clientHeight`), but the parent "Messages" list
header (title, subtitle, conversation count, buttons) stays on-screen above the
thread, squeezing the visible conversation into 100-272px of an 844px viewport.
Reads exactly like "doesn't load the newest message" even though it technically
does.

- `mobile-viewport-shots-2026-09-02/coach/06-messages-thread-squished-viewport.png`
- `mobile-viewport-shots-2026-09-02/coach/05-messages-typing-and-header-clip.png`
- `mobile-viewport-shots-2026-09-02/player-followup-messaging-scroll-initial-load.png`
  (player-side confirmation)

**Fix direction:** collapse/hide the list header when a thread is open, same fix
for both UI-2/UI-3 and this — likely one shared layout bug.

### UI-5. Calendar validation error renders off-screen

Entering an end date before the start date in "New Event" produces a
correctly-styled red error banner — but at `getBoundingClientRect().y: -7`,
above the visible scroll area of the modal. The modal doesn't auto-scroll to
reveal its own error, so "Create event" appears to silently do nothing.

- `mobile-viewport-shots-2026-09-02/coach/19-new-event-date-error-scrolled-offscreen.png`
  (manually scrolled into view for documentation)

### UI-6. Toast notifications overlap the bottom nav bar

Reproduced twice, two different screens — systemic toast-positioning bug, not a
one-off:

- Settings → wrong password: error toast sits on top of the bottom nav, covering
  its labels.
- Round review → "Open full review": success toast does the same.

- `mobile-viewport-shots-2026-09-02/coach/10-settings-password-error-toast.png`
- `mobile-viewport-shots-2026-09-02/coach/17-toast-overlaps-bottom-nav-2nd-instance.png`

### UI-7. Truncated stat label

Coach → player stats → "Core Ball Striking" row: the "Scrambling" tile label
clips to "SCRAMBLI…" at 390px; the other two tiles fit fine.

- `mobile-viewport-shots-2026-09-02/coach/15-player-stats-scrambling-label-clipped.png`

### UI-8. Round setup: yardage field has no bounds validation

Per-hole yardage in New Round → hole setup silently accepts `99999` — no red
border, no message — and flows straight into "Total Yards: 106,409" for an
18-hole course. Contrast with the live shot-entry "distance remaining" field,
which validates correctly.

- `mobile-viewport-shots-2026-09-02/followup/07-hole-yardage-out-of-range.png`

### UI-9. Tee-selection screen is mostly empty space

Single tee card floats with ~500px of blank space above and below it on a
390×844 screen — reads as unfinished, not deliberate.

- `mobile-viewport-shots-2026-09-02/player-followup-round-setup-tee-select-empty-space.jpg`

### UI-10. Silent no-op "Next hole" nav control

The top-bar `Next →` link is fully enabled (not `disabled`, no `aria-disabled`)
before the current hole is finished. Clicking it does nothing — no navigation,
no toast, no message. Contrast with the bottom "Next shot" button, which
correctly disables and shows helper text. No screenshot (behavior, not a visual
state).

### UI-11. Unlabeled "Save failed" icon — and a live session-expiry repro

During normal shot entry, autosave began failing (network capture: `307`
redirects to `/golf/login` mid-round — the session was invalidated server-side).
The UI's only response is a small icon badge with `aria-label="Save failed"` but
**no visible text** — a sighted player sees an ambiguous orange triangle, not
tappable, no explanation. This is a live reproduction of the Part 1 "session
expiry mid-round" bug (item 11).

- `mobile-viewport-shots-2026-09-02/player-followup-round-entry-save-failed-unlabeled-icon.png`

### Minor / cosmetic (not blockers)

- Round-review hint copy says "**Hover** or tap a hole" — "Hover" is a
  desktop-only affordance leaking into mobile copy.
- Disabled vs. enabled primary-button color contrast is subtle enough to misread
  at a glance (noted independently in two different flows).
- One test event ("Retest Valid Coach Session Event," Wed Sep 2) was created on
  the live Demo University Golf calendar during testing and no delete control
  was found for it — needs manual cleanup.

### Investigated and ruled out (not real bugs — don't recheck)

- A clipped "Next: configure holes →" button on New Round setup — was a
  stale-layout artifact from a still-open drawer, not a real defect.
- "Only coaches can create team events" permission error during one test —
  traced to genuine session-identity churn in the test browser profile (likely
  autofill/saved-password interference), not an app authorization bug.
  Reproduced correctly-working behavior once a verified clean session was
  confirmed.

### Confirmed clean (no defect found)

- **All modals/sheets/dropdowns** at 390×844 across both roles — New Event,
  RSVP, Invite player, Actions menus, Create qualifier, Add prospect, Add
  itinerary, New message, New Announcement, Create task, Add course, CoachHelm
  sheet, Choose-a-course sheet, global search, notifications, More sheet,
  Exit-round dialog.
- **Typing legibility** everywhere tested — message compose, round-entry numeric
  fields.
- **Error-state styling** — login (empty/invalid), invalid deep-link URL, 404
  page, inline field validation: all clean, on-brand, no raw/ugly output.
  (Exceptions: UI-5, UI-11 above.)
- **Shot-tracking entry polish** — genuinely high quality: consistent
  pill-button controls, real ARIA radiogroups, live contextual feedback, dynamic
  score-aware button labels, a shot-trail graphic, context-aware field
  relabeling per shot type, proper double-confirm on destructive delete. Not
  vibe-coded.
- **Recovery dialog** ("Recover Unsaved Progress?") and **exit/delete-round
  dialog** — both well-designed, good UX patterns worth reusing elsewhere.
- Settings, Qualifiers, Recruiting HQ, and most of player stats/round-review
  (coach's view) — clean at mobile width.

---

## Summary tally

- **Backend/production (Part 1):** 5 P0s (1 active data-loss bug, 3 unshipped
  fixes, 1 dead automation), 8 P1s, 6 user-facing data/UI issues, 4 data-quality
  gaps.
- **Mobile UX (Part 2):** 11 confirmed visual/interaction bugs, 3 minor/cosmetic
  notes, 2 leads investigated and ruled out, broad areas confirmed clean (all
  modals, typing, most error states, shot-entry polish).
- **Overlap:** UI-5 and UI-11 are 09-02 screenshot evidence for two bugs Part 1
  had already flagged from logs alone (calendar date-validation, session expiry
  mid-round) — same bugs, now with root cause and visual proof.
