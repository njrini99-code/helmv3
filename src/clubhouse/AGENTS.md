# Clubhouse UI guidance

Root `AGENTS.md` remains the operating guide. This file covers the Clubhouse
exception for agents working in this tree (Clubhouse is the only coach and player
UI; the owner retired Fairway's screens on 2026-11-14). Start with
[`docs/clubhouse/STATUS.md`](../../docs/clubhouse/STATUS.md): current state, the
release branch, how to turn it on and roll it back, remaining work and open
owner decisions. Read `.claude/rules/clubhouse.md` for the scoped rules,
`docs/clubhouse/README.md` for the workflow and `docs/clubhouse/MOBILE.md` for
phone behavior. Fairway's primitives, tokens and motion rules do not apply here.

Use live state and code first, then the mapped page CONTRACT, DESIGN and WIRING
in `docs/clubhouse/pages/P###-*/`, the manifest in `config/clubhouse/pages/`, and
the September prototypes in `design/handoff/`, except the files its
[`RETIRED.md`](../../design/handoff/RETIRED.md) lists: those are not the design
any more. Where `design-refresh/<page>/` exists it replaces the handoff for that
page. Runtime values come from `styles/tokens.css`, `styles/auth-tokens.css` and
`lib/fonts.ts`; handoff files are references, not a reason to restore behavior
superseded by owner revisions.
Who each address is for (coach, player, shared or signed-out, and the component
each role gets) is in `docs/clubhouse/generated/CLUBHOUSE_ROUTE_MAP.md`. A new
route is labelled in its manifest's `screens`; `clubhouse:check` fails until
it is.
The design system (laws, surfaces, colour, type, the one toggle, charts, the
banned list, and token tables generated from `styles/tokens.css`) is
[`design-refresh/DESIGN_LANGUAGE.md`](../../design-refresh/DESIGN_LANGUAGE.md).
`DESIGN.md` at the repo root and `docs/clubhouse/UI_OWNERSHIP.md` index these
owners. Follow the existing approved design; new phone designs still follow
the phone-design workflow in `.claude/rules/clubhouse.md`.

## Current and retired pages (owner, 11 Nov 2026)

Each line is the one current version of a page. Do not work on, screenshot or
copy any other version; an old address opens the current page.

- Roster: as built in `screens/roster`. Coach desktop opens on the table with its
  sticky panel (owner, premium plan 19 Nov, decision 8; it opened on the cards
  from commit `9e6db115f3`); the phone follows `design-refresh/classes-roster-home`
  (approved 31 Oct). The "Your players." Roster in `design/handoff/` is retired
  (`design/handoff/RETIRED.md`).
- Player Home: the 28 Oct version, permanent (commit `dc11bf6b7e`). Do not
  restyle it.
- CoachHelm Team (coach): the drawn golf hole, `screens/coachhelm/team`
  (preview `coachhelm-team`). The signal-list board is gone; the `coachhelm`
  preview opens `coachhelm-team`.
- A coach's page for one player: the player file, `screens/coachhelm/file`
  (preview `coachhelm-player-file`). The coach's Deep dive and Standing of a
  player (preview `coachhelm-coach-player`) are retired by the owner but not
  removed yet: the file's "Full standing" link still opens the coach Standing.
  Do not polish or screenshot either. A player's own Standing and Deep dive
  stay.
- A player's CoachHelm Board: Your week, `screens/coachhelm/file/YourWeek.tsx`
  (preview `coachhelm-player`). The older player board is gone.
- Qualifiers: players have one Qualifiers page, the qualifiers they are entered
  in first. "My qualifiers" is gone; `/my-qualifiers` (a `next.config.mjs`
  redirect) and the `my-qualifiers` preview open Qualifiers.
- CoachHelm chat: direction A only
  (`docs/clubhouse/coachhelm-chat-v3/LOOK.md`).
- Stills in any `shots/test-pass` folder were taken before the fixes. They are
  evidence of defects, never targets.
- Every picture shown to the owner is named with role (coach or player), phone
  or desktop, light or dark, before or after.

Retired preview addresses are listed in `preview/retired.ts`.

## Current shared exemplars

Paths below are relative to `src/clubhouse/`. Read the actual implementation
and its consumer before copying a pattern; comments may describe older values.

- Dialog/sheet: `ui/Modal.tsx`, `lib/dialog-lifetime.ts`, `lib/sheet-drag.ts`
  and `lib/overlay-scroll.ts`. Preserve native dialog top layer, retained exit
  content, focus return, phone drag and nested scroll locks.
- Action menu: `ui/Menu.tsx`. Preserve portal positioning, keyboard navigation,
  Escape, trigger focus return and viewport/keyboard bounds.
- Primary/link action: `ui/Button.tsx` and `styles/controls.css`. `href` renders
  a Next link; action buttons default to `type="button"`. Preserve shared
  variants and primary haptic.
- Scoring trend: `ui/FormLine.tsx`. Preserve accessible static figures, honest
  early/no-data states and golf scoring direction. This is not an HTML form.
- Card/well: `ui/Surface.tsx`, `styles/ui.css` and `styles/tokens.css`. Preserve
  shared heading/body/footer and Inset. Current styles own depth; do not
  restore decorative rings from old comments.
- Pushed phone detail: `shell/PhoneScreen.tsx` and `ui/PhoneBar.tsx`. Preserve
  immersive shell, title focus, covered-screen inertness, keyboard-aware scroll
  lock, base transition or immediate reduced-motion swap.
- Routine route change: `shell/RouteFrame.tsx`, `styles/shell.css`,
  `lib/reduced-motion.ts` and `lib/motion.ts`. Content is visible immediately.
  Preserve the desktop crossfade with anchored chrome and Back/Forward
  scroll restoration. A section switch (a tab bar or sidebar item, read by
  `lib/nav-motion.ts`) swaps at once instead, owner-approved 2026-10-22
  (mot-03), and so does every phone navigation with motion on: a drill-in
  pushes and Back pops on the live page (`lib/nav-motion.ts`,
  `shell/use-route-swipe.ts`), with no view transition (audit 2026-11-15,
  S4.1, S4.8). The page pushed in takes no taps until it lands, a figure a
  row marks `data-ch-share` rides the push into the same figure on the page
  (`lib/share-morph.ts`), and the desk's Back and Forward crossfade as a tap
  does (audit 2026-11-19, E-2, E-6, E-8). There is no routine first-paint
  stagger.

The shell handoff is `design/handoff/m-shell.jsx`; depth references are
`design/handoff/depth.css` and `design/handoff/design-system/guidelines/elevation.html`.
Use the page's manifest and DESIGN document to find its desktop and phone
boards. Auth choreography is separate: consult P015-auth and its runtime
course/welcome implementation rather than applying routine-route timing.

When review is useful, `.claude/agents/clubhouse-polish-reviewer.md` supplies the
Clubhouse checklist. Reviewers are optional and risk-based. Keep source
inspection, browser observations, emulated viewports, physical-device testing
and owner acceptance distinct (say which you did). Record only observed evidence in VERIFY and
move release gates only with the evidence required by the page contract.
