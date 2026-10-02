# Clubhouse mobile and desktop UX optimization

Owner request, October 2: verify popup repairs, improve the mobile and desktop
experience, and focus on how smoothly the whole app feels. This review preserves
the supplied designs,
green/ivory identity, floating materials and Apple Messages direction.

## Current evidence

The pushed c1e81e0fe revision passes CI. Shared Modal, PhoneScreen, More and
Bell
keep the background stationary through nested overlays and exits. WebKit
375/390/430 checks cover scroll restoration, focus, rapid reopen, pointer
cancellation and a paused short drag. Physical iPhone Safari remains unverified.
The existing Preview serves identical runtime source at da44bd67b.

A follow-up inventory found separate Settings, Recruiting and CoachHelm history
dialogs still using earlier lifecycle code. This pass consolidates their
lifecycle
while preserving each header, busy guard and existing unsaved-work behavior.
Their WebKit verification includes retained content and locks during exit,
nested
confirmation, focus return, reduced motion, and paused/cancelled drags.
Synthetic
keyboard sizing is verified separately from actual iPhone keyboard behavior.

## Confirmed issues and corrections

- **High.** Observation: Custom Settings/Recruiting dialogs close immediately
  without the shared background lock; history drawer duplicates old drag
  listeners.; Correction and acceptance: Shared dialog lifetime and gesture
  ownership. Nested closes retain the other lock; exits retain content;
  reopening cancels stale exits; paused/cancelled/competing pointers do not
  dismiss accidentally.; State: automated verification passed

- **High.** Observation: A synthetic 300px keyboard moves Settings/Recruiting
  headers above the viewport; History extends behind it.; Correction and
  acceptance: Shrink sheets/drawer to available height; preserve rows and
  scrollable fields. Headers and actions remain reachable at 375/390/430px.;
  State: synthetic keyboard verification passed

- **High.** Observation: At 320px Round setup clips Browse courses and squeezes
  course text. Its container query cannot change the container’s own desktop
  padding.; Correction and acceptance: Responsive page padding and a stacked
  narrow course choice. Browse is visible and operable at 320/375/390/430/820px
  and short 480px height after scrolling.; State: WebKit verification passed

- **High.** Observation: Desktop Roster Message links omit the selected player
  although phone links and Messages already support it.; Correction and
  acceptance: Preserve player identity from profile and row actions into the
  existing Messages deep link. Multiple players and keyboard activation
  verified.; State: automated verification passed

- **Medium.** Observation: Settings Preferences is clipped on the 821px
  horizontal section rail, including after keyboard activation.; Correction and
  acceptance: Reveal focused/current sections inside the rail without scrolling
  the page or form vertically; defer focus reveal until WebKit's native
  alignment completes. Both ends and reduced motion fit at 821px.; State:
  automated verification passed

- **Medium.** Observation: Scrambling fractures mid-word in the 320px Stats
  summary.; Correction and acceptance: Use two columns inside the same card at
  360px and below; preserve four columns at 375px and unchanged text sizes,
  values and colors.; State: WebKit verification passed

- **Medium.** Observation: At small laptop widths the selected Roster profile is
  below the card list, outside the first viewport. The supplied handoff
  explicitly stacks it.; Correction and acceptance: Review task continuity with
  intended users; choose a reveal/scroll or layout change only after resolving
  the handoff’s intent.; State: design follow-up

These are observations with source/runtime evidence, not a numeric product
score.
Agents keep scoped reports and geometry in local ignored evidence directories.

## Smoothness acceptance

The whole task includes input response, scrolling, typing, navigation, overlays,
loading, and recovery. Animation screenshots alone cannot establish smoothness.
Native dialogs now retain their content, focus ownership and background lock
until the exit completes; a new open cancels an older exit. Panel exits use the
existing 260ms token and transform/opacity. Reduced motion closes immediately.

The performance pass uses an optimized committed snapshot against disposable
local data: eight players, 114 rounds, 2,016 holes and 5,782 shots. It records
three-run medians under 4x CPU throttling for coach/player Home and Stats cold
loads, navigation, period changes and profile tabs at 390/1280px. Inspect raw
layout shifts, blank/skeleton flashes, input-to-paint durations, long tasks,
read waves and useful-content timing together. This is a current baseline;
there is no before/after speed claim without comparable runs of both revisions.

Production Supabase performance advisors were read without changing schema or
customer data. They flag possible index/RLS work, but do not establish the cause
of a UI stall. Any database change needs evidence from the affected request and
the repository's reviewed migration/release path.

## Remaining coverage and order

- **1. Overlays and navigation.** Mobile checks: Bottom/side/child overlays,
  Back, outside dismiss, interrupted drags, browser chrome, safe areas, keyboard
  opening and closing.; Desktop checks: Dialog focus, Esc, menus near edges, Tab
  order, compound widgets, navigation/back restoration.; Completion evidence:
  Stable page markers; correct focus and lock lifetime; no clipped actions or
  trapped navigation. Physical-device checks separately.

- **2. Layout and readability.** Mobile checks: 320/375/390/430px, short and
  landscape views, long names, filenames, large text, 820px boundary.; Desktop
  checks: 821/1024/1280/1440px, small laptops, zoom/reflow, table scrolling,
  readable row density, sticky headers, long values.; Completion evidence:
  Before/after screenshots plus geometry and successful control activation.
  Screenshots alone do not prove motion.

- **3. Complete daily tasks.** Mobile checks: Sign in → Home; event → RSVP;
  roster → Message; conversation → reply/photo; start/continue round; qualifier
  progress; Hub and Settings edits.; Desktop checks: The same coach/player tasks
  with keyboard, pointer, tables and side panels.; Completion evidence: Correct
  destination/object, preserved context, visible confirmation and continuation.
  Real writes use disposable local data.

- **4. Async and imperfect data.** Mobile checks: Slow/refused/unknown/partial
  saves, offline, interrupted uploads, session expiry, Retry, navigation during
  work.; Desktop checks: Concurrent object edits, filter/team changes, export
  failures, stale responses, refresh and history recovery.; Completion evidence:
  Draft/choice preservation; duplicate prevention; truthful pending and
  persisted states. Missing, zero, empty and unreadable remain distinct.

- **5. Visual consistency.** Mobile checks: Card/bubble elevation, page
  contrast, type floors, icons, selected states, hit targets and spacing.;
  Desktop checks: Shared materials and controls, visual hierarchy, dense panels,
  chart/metric labels and empty states.; Completion evidence: Match maintained
  design handoffs and current owner overrides; retain accessible focus and
  meaningful scoring colors.

- **6. Performance.** Mobile checks: Production-build cold/warm navigation,
  heavy histories, animation under CPU pressure, keyboard/scroll compositing,
  image/font loading.; Desktop checks: Large lists/tables, chart filters, menu
  placement, main-thread tasks and repeated navigation.; Completion evidence:
  Measured tap acknowledgment, useful-content timing, layout shift and long
  tasks. Development timings and WebKit emulation do not establish physical
  Safari frame pacing.

- **7. Accessibility and release.** Mobile checks: VoiceOver, text size, reduced
  motion, forced colors, labels/errors, touch-only operations, actual iPhone
  Safari.; Desktop checks: Keyboard-only completion, focus order/traps,
  screen-reader names, zoom, contrast, reduced motion and forced colors.;
  Completion evidence: Scoped automated checks plus intended-user/device checks;
  required CI and explicit owner release decisions.

## Route and role task matrix

- **Auth/onboarding.** Task to exercise: Sign in, recover password, join correct
  team, return to intended destination.; Difficult states to retain: Invalid
  input, repeated submit, slow artwork, reduced motion, expired invite/session.

- **Home.** Task to exercise: Orient to today and next event; act on it.;
  Difficult states to retain: All-day/multi-day events, team timezone, no
  schedule, incomplete metrics.

- **Roster/recruiting.** Task to exercise: Find a person, inspect them,
  message/invite or edit the correct person.; Difficult states to retain: Long
  names, inactive/no data, requests, permission differences, selection after
  filtering.

- **Calendar/classes.** Task to exercise: Find an event/class, inspect timing,
  RSVP or edit.; Difficult states to retain: Overlaps, date boundaries,
  empty/failed reads, capacity and existing role rules.

- **Messages.** Task to exercise: Open the intended conversation; read older
  history; reply/send photo and recover.; Difficult states to retain: Multiline
  input, long attachments, keyboard resizing, deleted parent, confirmation loss,
  partial attachment refusal.

- **Stats.** Task to exercise: Choose period/player, understand figures and
  inspect source round.; Difficult states to retain: No data, early sample,
  nine-hole rounds, missing par, failed sections, filter no-match.

- **Qualifiers/rounds.** Task to exercise: Start or resume, select course,
  record progress, submit the correct round.; Difficult states to retain:
  Offline durability, missing course, busy submission, stale server state,
  interruption and reopen.

- **Team Hub.** Task to exercise: Read/respond, acknowledge, RSVP and edit the
  correct item.; Difficult states to retain: Independent concurrent writes,
  refused writes, tab navigation while pending, unknown confirmation.

- **CoachHelm.** Task to exercise: Ask, continue a conversation, find history
  and understand evidence.; Difficult states to retain: Unavailable history,
  long response, stopped/failed request, role/source limits.

- **Settings.** Task to exercise: Change profile/preferences and confirm
  destructive actions.; Difficult states to retain: Dirty draft, save pending,
  refused save, nested discard prompt, keyboard and long lists.

## Boundaries

Layouts fitting their viewport do not prove that people can complete a task.
Accessibility scans do not prove physical-device behavior. Optimistic feedback
is not persistence evidence. Customer production writes, feature flags, held
migrations, merge and production release are separate owner decisions.
Current release dependencies remain in RELEASE_CANDIDATE.md.
