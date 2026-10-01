# P001 — Shell: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

## 2026-10-01 — High-fidelity audit: no staggered reveal, honest press, flat cards, phone type

Owner answers on the high-fidelity audit (PROGRESS Q-139).

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none (owner decisions on the audit)
Contract IDs:   none new (CH-1601, CH-1606 behaviour changed)
Actions:        none
Data impact:    none
Held items:     none
```

- **Reveals (audit F01).** The staggered first-paint reveal is gone; a page is
  shown as soon as it is ready and the crossfade is its only entrance. The
  RouteFrame guard that stopped the reveal replaying is gone with it. An
  empty page fades in once instead of in steps.
- **Press (audit F02).** Only `.ch-btn` (and `data-ch-press`) up to 240px
  wide compress; rows, links, tabs and cards do not. A release springs back
  from where the press got to, and a second press lets the first go.
- **Materials (audit F04).** Cards (`--ch-sheet-*`) are flat ivory with a
  hairline and one light lift; content wells are a flat tint. Glass stays on
  the top bar and tab bar (20px, was 34px) with an opaque fallback when
  backdrop-filter is missing or the OS asks for less transparency.
  Popovers are opaque. Controls keep their tactile wells and raised pills.
- **Phone type (audit F09).** Below 820px the type tokens are 16px reading,
  14px secondary, 13-14px labels and 13px captions; tab labels 11.5px (were
  10.5px). Literal sizes in page CSS move to the tokens page by page.
- Not verified on a device; jsdom and the CSS checks only.

## 2026-10-01 — A team switch never shows the old team under the new name

PAGE_PERFORMANCE.md rules 4 and 8.

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none
Contract IDs:   none new (CH-1003, CH-1813, CH-1814 unchanged)
Actions:        setActiveTeam (unchanged)
Data impact:    none
Held items:     none
```

- **Switching mark.** The new team's name still shows on the tap. Until the
  new team's page commits, the old page fades out and takes no taps:
  `.ch-root[data-ch-switching]`, with `#ch-content` aria-busy. The refresh
  runs in a transition, so the mark lifts in the commit that draws the new
  page. A refused or failed switch lifts it too.
- **Toasts are team-scoped.** `ToastProvider scope` is the team. A switch
  clears the stack, so an old team's Undo or Retry cannot act from the new
  team's page.
- **Failed team read.** A coach whose team could not be read gets the route
  error with a retry. It never shows "not on a team yet" and never the default
  team (`resolveCoachActiveTeam`).

## 2026-10-01 — Page changes crossfade; a nav tap shows at once

Owner, 2026-10-01: "Everything page transition and load needs to be extremely
smooth and accurate" (crossfade chosen over a slide or none).

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none (Next.js 16 view-transitions guide, `useLinkStatus`)
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

- **Crossfade.** `RouteFrame` wraps the page in React's `<ViewTransition>`,
  keyed by route: the old page fades out in 120ms and the new one fades in
  over 200ms a beat later, in opacity only. The shell (sidebar, top bar, tab
  bar) is anchored and never fades; taps pass through while it runs. Reduced
  motion and Settings › Animations off swap at once. Tokens on `<html>`
  (`--ch-dur-vt-*`), every rule scoped to a Clubhouse document.
- **Pending.** `LinkPending` inside each sidebar and tab-bar link: the tapped
  item takes the selected look on the first frame and the old one lets go, and
  a hairline sweeps across the top only if the page takes longer than
  `--ch-dur-press`. "Loading" is announced once.
- **Checked.** Five sidebar navigations on a local stack: each ran one view
  transition with only the page named (`ch-page`), layout shift 0. Clubhouse
  suites 2667/2667; `clubhouse:check` clean.

## 2026-10-01 — The team switcher: a head coach on two or more teams switches teams (owner, Q-130)

```text
PR/commit:      agent/swap-audit: 67f40c962, a928a9416
Design package: design/handoff/ (v2): sidebar.css and the boards' team chip (the team under GolfHelm with
                chevrons-up-down), m-ch.jsx MoreM (the me card's chevrons-up-down); the popover is the design
                system's PopoverPanel
Contract IDs:   10103, 10405, 10611, 10803, 11707, 11813, 11814 (catalog CH-1003, CH-1305, CH-1707, CH-1813, CH-1814)
Actions:        ACT-P001-SWITCH-TEAM
Data impact:    none new. Reads the staff rows and teams the layout already reads (`userData.coachTeams`,
                `canSwitchTeams`); `setActiveTeam` (existing, shared with Fairway) writes the `golf_active_team` cookie.
Held items:     none
```

- **Issue.** A head coach staffed on two teams (men's and women's) could not
  switch teams in Clubhouse, as Fairway lets them. The boards draw a team chip
  with chevrons that did nothing, and the switcher had been a recorded non-goal.
- **Fix.** For a head coach on two or more teams (`canSwitchTeams`, the gate
  `setActiveTeam` enforces, so an assistant is never offered a switch the server
  refuses) the sidebar's brand block is a menu button that opens a listbox of the
  teams (arrows, Home, End, Enter, Esc, focus back), and the phone More sheet
  lists the teams under who they are. A pick calls `setActiveTeam`, shows the new
  team at once, refreshes every screen, and the route remounts for the new team
  (`RouteFrame` is keyed by pathname and team). A refusal or a network failure is
  a toast (CH-1003) with the reason, no Retry when trying again cannot help, and
  the team goes back. A coach on one team, an assistant and a player keep the plain
  label (CH-1305). The More sheet scrolls on a short screen, for every role.
- **Checked.** `team-switch.test.tsx` 16/16 (removing the `canSwitchTeams` gate
  fails 2); the Clubhouse suite 2515/2515; `clubhouse:check` clean; a browser pass
  at 1280 and 390 (the popover, the sheet, a refused switch). Not exercised: a
  switch that lands (the preview has no session), and a device pass of the sheet.
- **Open.** With `HELM_CLUBHOUSE_TEAMS` set, a head coach who switches to a team
  that is not listed gets Fairway for it.

## 2026-10-01 — Team allowlist for the first activation; the remaining old addresses open Clubhouse screens; a failed sync reports; server events carry the UI tag (swap audit §14, §18, Q-131)

```text
PR/commit:      agent/swap-audit (#2111): a49a75f6a, 6daf50afc, 5c4a9c33a, 8a1dd47f8, a99fa9638
Design package: none (no visual change)
Contract IDs:   none new
Actions:        none
Data impact:    none (reads only). New server env HELM_CLUBHOUSE_TEAMS (unset = every team).
Held items:     none
```

- **Gate.** `isClubhouseFor` is async. With `HELM_CLUBHOUSE_TEAMS` set, only
  the signed-in user's active team gets Clubhouse, and a failed team read
  falls back to Fairway; unset, the flag alone decides (Q-131). Every call
  site awaits it.
- **Old addresses.** Player pages, game, print and genome open the Stats
  profile; genome compare and a coach's `/rounds` open Team stats; `/team`
  opens Settings (Team or Golf); `/courses` and `/whats-new` open Home;
  `/intelligence` opens CoachHelm; the old qualifying workspace opens that
  qualifier's selection; a player's CoachHelm chat opens CoachHelm.
- **Push.** A tapped notification's absolute URL is reduced to a same-origin
  path before the guard, so taps open their screen (both UIs, §14 D5).
- **Observability.** `OfflineSync` reports every failed item to Sentry (high
  once retries end); `chLogServer` events carry `ui` and `surface` tags.
- **Checked.** `gate.test.ts`, `gate-allowlist.test.ts` 5/5; `alias.test.ts`
  8/8; `offline-sync.test.tsx` 4/4; `safe-redirect.test.ts` 11/11.

## 2026-09-30 — The shell starts the offline sync engine (swap audit F-14)

```text
PR/commit:      agent/clubhouse (release train #2110)
Design package: none (swap audit fix, no visual change)
Contract IDs:   none (no UI)
Actions:        none
Data impact:    `shell/OfflineSync.tsx` (new, no UI) is mounted in `ClubhouseShell`; it initializes `getSyncEngine()` and feeds `useOfflineSyncStore`, as the Fairway shell's `OfflineProvider` does. No schema change.
Held items:     none
```

- **Issue.** Only the Fairway shell started the sync engine. Under Clubhouse, a
  round, hole or shot queued offline synced only while a round screen was open:
  no interval, no sync after a reload, and service-worker sync requests went
  unanswered.
- **Fix.** `OfflineSync` starts the engine for the session, mirrors its state
  into the offline store (which drives the offline banner and round screens),
  answers `sw-sync-requested`, and stops auto-sync on unmount.
- **Checked.** `offline-sync.test.tsx` 3/3; shell 49/49.

## 2026-09-30 — Phone sheets and the keyboard; Phone tap targets reach 44 x 44; Quick second taps; Native-feel and phone-width scans; Old addresses open the rebuilt screens; The bell on phone tab roots (Clickables gap 1); Team Hub count for players (Clickables gap 3); The gear opens the page's own settings (Clickables gap 20)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Phone sheets and the keyboard

- **Issue.** On the phone the keyboard covered the lower fields and the Save
  button of every bottom sheet with a text field (New event, Plan a trip, New
  announcement, notes, Add a course). The app never resizes for the keyboard,
  and only Messages and the Settings sheets lifted themselves.
- **Fix.** Every sheet (`.ch-modal`) now sits on top of the keyboard while it is
  open, shrinks to the space above it and scrolls its body, so the focused field
  and the footer stay visible (`controls.css`, `--keyboard-height`).
- **Checked.** Not yet seen on an iPhone; the keyboard only exists in the native
  shell.

### Phone tap targets reach 44 x 44

- **Issue.** The native-feel scan found controls under Apple's 44pt minimum on
  the phone: segmented controls drawn at 26px, small buttons at 30px, pills at
  36px, 40px icon buttons and short text links (Team stats, Add, Message).
- **Fix.** On the phone each of these controls gets an invisible hit area that
  reaches 44 x 44 around it, without changing how it is drawn (`controls.css`,
  zero specificity so a page's own hit area wins).
- **Checked.** scripts/clubhouse/native.mjs at 390 and 430px.

### Quick second taps

- **Issue.** A fast second tap on a control (a score stepper, a toggle) could be
  read by iOS as a double-tap zoom.
- **Fix.** Buttons, links, tabs, switches, labels and selects use `touch-action:
  manipulation` and no long-press link preview; pinch zoom still works
  everywhere (`base.css`).
- **Checked.** Code change; not yet seen on an iPhone.

### Native-feel and phone-width scans

- **Issue.** The accessibility scan ran only at 1280 and 390px, never checked
  sideways scrolling, and stopped the whole run when one tap failed.
- **Fix.** New `scripts/clubhouse/native.mjs` (tap targets under 44, text fields
  under 16px that iOS zooms into, sideways scroll, at 390 and 430px); `a11y.mjs`
  takes `CH_WIDTHS`, fails a phone page that scrolls sideways, and reports a
  failed tap instead of crashing.
- **Checked.** First run: no sideways scroll and no zoom-on-focus field on any
  screen.

### Old addresses open the rebuilt screens

- **Issue.** With Clubhouse on, notifications and bookmarks to /tasks,
  /announcements, /documents, /travel, /roster/[id] and /rounds/[id]/review
  opened Fairway pages inside Clubhouse.
- **Fix.** Each route's layout sends the viewer to the rebuilt screen (Team Hub
  tabs, the player's Stats profile, /rounds/[id]) through `routes/alias.ts`,
  only when that screen is rebuilt for their role; flag off, nothing changes.
- **Checked.** alias 4/4, the mutation caught. Not run: a signed-in browser
  check.

### The bell on phone tab roots (Clickables gap 1)

- **Issue.** Tab roots that draw their own title (CoachHelm, the player's Rounds
  and Team Hub) hid the bell, so a player had no bell on three of four tabs.
- **Fix.** `PhoneTop start` with no action puts the top bar in a `start` mode:
  the page title and the bell.
- **Checked.** shell.test 47/47, 4 of 4 mutations caught; seen at 390.

### Team Hub count for players (Clickables gap 3)

- **Issue.** A player's Team Hub item had no count.
- **Fix.** The sidebar and phone tab carry the current app's Team Hub count
  (unread announcements, tasks and trips), nothing when there are none.
- **Checked.** shell.test 48/48, 3 of 3 mutations caught.

### The gear opens the page's own settings (Clickables gap 20)

- **Issue.** The coach's top-bar gear on CoachHelm and Team Hub opened the
  Settings home.
- **Fix.** There it reads CoachHelm settings or Team Hub settings and opens that
  section (?section=coachhelm, ?section=team); elsewhere and for players it
  stays Settings.
- **Checked.** shell 49/49, 2 of 2 mutations caught.

## 2026-09-30 — V2 page docs; every hand contract proven by a test

```text
Contract IDs:   10102, 10301, 10801, 10802, 10901, 11301, 11401, 11402, 11901, 12301, 12401 (new, no catalog code)
Actions:        7 (ACT-P001-*)
Data impact:    none
```

### Changed

- The six page docs, the manifest's actions, and 11 behaviour contracts, each
  named by a test.
- New tests: 10102 with 10802 (the frame, and the notice for a role's unbuilt
  route), 10301 (the bell
  re-reads on open), 11301 (Mark all read rolls back), 10901 (success toast and
  haptic; a switch shows
  no toast), 11402 (toast Retry), 11401 (route Try again), 12301 (failures
  reported), and
  `gate.test.ts` for 10801.
- `useAction`'s doc comment said a success fires the commit haptic; it fires
  success (D-70). Fixed.

### Verification

- `npx vitest run src/clubhouse/__tests__/shell.test.tsx
  src/clubhouse/__tests__/gate.test.ts`: 42/42.
  11301 and 10102/10802 fail with their code broken (checked, restored).

## 2026-09-29 — v2 foundation

- v2 motion (D-64), haptics (D-70), the page empty state (D-71) and navigation
  (D-66) for every page.

## 2026-09-30 — toasts inside an open dialog

- CH-1812: a toast raised while a dialog or sheet is open renders inside it, so
  it is seen, announced and its Retry can be tapped. A modal dialog makes the
  rest of the page inert and the top layer paints over it; checked in headless
  Chromium and WebKit (a top-layer popover outside the dialog is inert too, so
  it is not a fix). Found by the Calendar contract pass; it had disabled every
  in-dialog Retry on every page.
- The More sheet follows v2 `MoreM`; sign-out is shared with Settings (CH-1002).
