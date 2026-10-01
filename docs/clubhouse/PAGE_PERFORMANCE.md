# Clubhouse page transitions, loading accuracy and heavy-page performance

The working standard for how Clubhouse moves, loads and saves. It condenses the
owner's research guide (2026-10-01, "GolfHelm Smooth Transitions, Accurate
Loading States, and Heavy Page Performance") into rules, then records where
each one stands. Measurements go in `PROGRESS.md`, "Page performance
(2026-10-01)"; each page's changes go in its CHANGELOG.

## Rules

1. **Stable shell.** The sidebar, top bar, tab bar and providers sit above the
   changing page and never remount or replay their entrance on navigation.
   Drafts, selected dates, filters and scroll live in deliberate owners (URL,
   session state) and come back when the player returns.
2. **Feedback before remote work.** A tap is acknowledged on the first frame.
   Three milestones are kept apart: acknowledged, destination usable,
   secondary work done. Navigation stays interruptible; the last choice wins.
3. **One motion vocabulary.** Page change: a restrained crossfade (owner's
   choice), shell anchored. Sheets: one entrance and dismissal with focus
   handled. New items: a small local insertion. Refresh or filter: the region
   updates without replaying the page entrance. Opacity and transform only;
   reduced motion and Animations off swap at once. Success feedback never
   precedes success.
4. **Loading is a state model.** First load (shaped skeleton), refresh with
   data (keep it, subtle updating mark), verified empty (useful empty state),
   first-load error (error and retry), refresh failed with data (keep it, say
   it may be out of date), mutation pending (on the control), saved on this
   device vs synced, offline. **Never show 0 strokes, 0 rounds or "No rounds
   yet" unless that is a verified result.**
5. **Skeletons match the final geometry.** Card sizes, chart heights, row
   spacing and header placement are final before data arrives. Titles and
   controls that are known render for real. No placeholder over usable data.
   Layout shift 0 on load and on every switch.
6. **Sections load independently.** First useful content first, optional
   regions stream behind Suspense; a failure stays local to its region.
7. **Selective prefetch.** Likely next destinations only; route code, route
   payloads, client data and assets are separate caches. Cache keys carry
   team, player, period and filters; identity change clears them.
8. **Previous content, honestly labelled.** A period or filter switch keeps
   the old figures, dimmed and still labelled with their own period, until the
   new ones land. A different player or team never shows the old one's
   figures under the new name. Stale responses never win.
9. **Expensive work off the tap path.** Long tasks are split, moved to the
   server or a worker; profile before memoizing.
10. **Render less.** Virtualize long lists where scale warrants (message
    history, round archives); lazy-load heavy chart code; reserve space.
11. **Honest optimism.** Optimistic only where reversible, with rollback or
    retry, idempotent mutation ids, and reconciliation after a timeout.
12. **Active rounds are durable.** Each accepted edit is persisted on the
    device promptly; server writes queue durably; recovery survives navigation,
    backgrounding and restart; status separates captured, saved on device and
    synced; no duplicates on double tap or retry.
13. **Measure what players get.** Production builds, phone viewport, 4x CPU,
    cold and warm: tap to acknowledgement, to first useful content, to critical
    content, to optional regions done; INP 200ms or less on taps; CLS 0.
14. **Test interruptions.** Rapid destination and filter switches, return to
    a screen, background during a save, refresh failure with cached data, one
    section failing, retry after an ambiguous timeout, slow phone with large
    history, reduced motion, keyboard in a sheet or chat, session or team
    change.

## Status (2026-10-01)

- **1 Stable shell.** Shell above `RouteFrame`; only the page frame is keyed.
  Context restore per page: in the page pass.
- **2 Feedback.** Done: `LinkPending` (selected look on the first frame,
  hairline after `--ch-dur-press`).
- **3 Motion.** Page crossfade done (`RouteFrame`, React `ViewTransition`);
  sheets and insertions keep the existing D-64 motion; audit queued.
- **4 State model.** Page pass, Stats/Home and CoachHelm/Rounds/Qualifiers
  first. Cross-cutting, done: a failed coach team read (staff, cookie check,
  org member count) is a route error with retry, never "You aren't on a team
  yet" and never the default team (`resolveCoachActiveTeam`, three-way);
  route Try again refreshes the server payload before resetting.
- **5 Skeleton geometry.** Page pass: measured CLS per route and switch.
- **6 Independent sections.** Page pass.
- **7 Prefetch and cache keys.** Page pass; nothing cached across users or
  teams.
- **8 Previous content.** Stats window switch done earlier (F-55). Team
  switch done: the old team's page fades out and takes no taps until the new
  one commits, and toasts are scoped to the team. The rest in the page pass.
- **9 Off the tap path.** Page pass, measured as long tasks and INP.
- **10 Render less.** Queued: Messages history, round archive.
- **11 Honest optimism.** Queued: Messages send, Calendar moves; Rounds in the
  page pass.
- **12 Durable rounds.** Engine R-1..R-12 (night audit); the hole-save status
  and advancing are in the page pass.
- **13 Measure.** Harness being built (`e2e/helpers`, production build on the
  local stack).
- **14 Interruptions.** F-59 (a quick Continue bounced) fixed; the rest per
  page.

Queued after the first two page groups: Calendar, Messages, Team Hub, Roster
(context restore), sheets and keyboard behaviour.

## iPhone layout brief (owner, 2026-10-01)

The brief's seven screenshots did not reach the session. Each of its findings
was traced in code instead; nothing below is a before and after against those
images.

| Finding | Cause found | Confidence | Fix |
| --- | --- | --- | --- |
| Dark name on the night welcome | Fixed on this branch (`972824ab5`, F-50), not yet on `main`: production still shows it | High (code and commit history) | Ships with this branch |
| Viewport or scaling | One viewport tag, `viewport-fit=cover`, zoom allowed; no root zoom or scale transform | High (code) | None needed |
| Safe-area ownership | `contentInset: 'never'`; CSS owns each edge once (top bar, tab bar, canvas) | High (code) | Left and right insets (landscape) are not handled yet |
| Keyboard | Capacitor resize `ionic` resizes nothing in Clubhouse (no `ion-app`); the web code owns it (`--keyboard-height`) | Medium (config read, no device) | One owner; the device check stays the owner's |
| Classes: title twice, crowded summary, Today collision | The phone kept the desktop header and term bar | High | Phone: one heading, the term in a line, Today first, overlaps before the deck (CH-12308) |
| Approach stats hierarchy, cramped bins, sample line, "You hits" | Stats files | — | Sent to the Stats/Home agent |
| Dashboard hero, countdown, selected day, bell | Home files | — | Sent to the Stats/Home agent |
| QA item in the return feed | 8 orphaned "QA CRUD Announcement v3" notifications to Demo players | High (read-only SQL) | Q-136: the write was declined; production unchanged |
| Continue gate | Shown after a fresh sign-in only | High | Q-137: on a phone it carries on by itself with the fold |

Measured with `e2e/clubhouse-phone-audit.spec.ts`, coach at 320px: no page
scrolls sideways; the smallest text is 10px (Team stats chart label), and the
Team stats KPI strip clips "Scrambling". The full sweep (375 to 430px, the
player routes, the night welcome) needs a quiet machine. A real iPhone,
Safari toolbars and the native wrapper were not tested.
