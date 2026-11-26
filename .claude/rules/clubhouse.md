---
paths:
  - "src/clubhouse/**"
  - "docs/clubhouse/**"
  - "design/handoff/**"
---

## Clubhouse (the from-scratch GolfHelm UI)

`src/clubhouse/` is a new UI tree built from the handoff in `design/handoff/`
(the Fairway Clubhouse Edition spec). It is the only coach and player UI: the
owner retired Fairway's coach and player screens. **The Fairway
rules in `design-system.md` do not apply here, and Fairway code must never be
reused here.** An earlier redesign layered new styles on top of Fairway and the owner
rejected the result; this tree exists so that cannot happen again.

- **Never import** `@/components/fairway/**`, `@/lib/fairway/**`,
  `@/lib/redesign/**`, `fairwayScope` or `.fairway-ds`. Never read `--fw-*` or
  any non-`--ch-*` custom property. Shared non-UI plumbing is fine: session,
  Supabase loaders, `@/lib/utils/capacitor`.
- **Styling:** plain CSS files, with every selector under `.ch-*` or
  `[data-ui="clubhouse"]` and tokens from `src/clubhouse/styles/tokens.css`.
  No Tailwind utilities in Clubhouse markup. Each page stylesheet has its own
  class prefix (`.ch-rsu-`, `.ch-cal-ft`): `clubhouse:check` fails when two
  page stylesheets anchor the same class.
- **Design system:** `design/refresh/DESIGN_LANGUAGE.md` (laws, surfaces, colour, type,
  the one toggle, charts, banned list). Its token tables are generated from `tokens.css`
  (`node scripts/clubhouse/design-language.mjs`); `clubhouse:check` fails on drift.
- **Doctrine:**
  - Red is for errors only (MOTION-AND-VISUAL 4.7, Nick 15 Nov 2026, retiring D-42's under-par red): an error or a destructive action, plus the pin flag and a penalty stake as drawn on the course. Under par is the gain: `--ch-score-under` and its family read the gain tokens. Gains are green; losses are amber. Champagne means attention (a due date, a personal best).
  - Instrument Sans for display, body and data; JetBrains Mono for keyboard hints only (`lib/fonts.ts`). Sentence case: no tracked uppercase, no serif.
  - Tabular numbers everywhere. Use a true minus `−`, `E` for even and `—` for no data.
  - Motion follows the twelve-token vocabulary (MOTION-AND-VISUAL 3.2, on D-64's beats): press 110ms, quick 180ms, base 260ms, release 280ms, marks 360ms and reveal 520ms, from the `--ch-dur-*` tokens and `CH_DUR` / `CH_DUR_MS`; two curves, the iOS curve `--ch-ease-ios` (`cubic-bezier(0.32, 0.72, 0, 1)`, `CH_EASE_IOS`), which everything that travels rides (the 15 Nov production audit, S3.1), and `--ch-ease-out` (`CH_EASE_OUT`) for a press going down and things leaving; loading waits `--ch-dur-busy-delay` and holds a skeleton `--ch-dur-busy-min` (`CH_BUSY`): every wait goes through `useBusy` (`lib/use-busy.ts`), nothing new for 150 ms, then a static skeleton shaped like the content (no shimmer, no pulse) held at least 300 ms, then a 180 ms fade (MOTION-AND-VISUAL 3.9); one spring, `CH_SPRING`, critically damped. Every other motion token is retiring and may only lose uses (`src/clubhouse/__tests__/motion-gate.test.ts`). Nothing a tap opens overshoots: the old `(0.34, 1.3, 0.64, 1)` curve and CSS `linear()` springs are gone, and the `--ch-*-spring-*` tokens are the iOS curve on a D-64 beat. The press is `useChPress` (`lib/press.ts`, MOTION-AND-VISUAL 3.8): a finger's press waits 50 ms (the delay lives only there) and every press shows at least 110 ms; a button or the shared chip goes to scale 0.97 over press on `--ch-ease-out` and back over release on the iOS curve; a row, option or menu item takes the linen wash `--ch-sel` in over press and out over release on the iOS curve, and a desk row's hover is the same wash, at once. A list row arrives and leaves only through `ui/ListPresence.tsx`: an insert rises 8 px over the base beat on the iOS curve, a remove shrinks to 0.96 over the quick beat and the rows around it close over the base beat (3.5). A kept keyframe lives in `styles/motion.css` (3.12). Routine first-paint staggering is retired: content is visible immediately, and `shell/RouteFrame.tsx` plus `styles/shell.css` own the whole-page crossfade. Use `useChReducedMotion`: under Reduce Motion anything that travels becomes a 180 ms fade (3.11), and Animations off swaps immediately. Pushed phone screens retain their separate `PhoneScreen` transition; auth course choreography follows its own tokens and contract. What moves and can be interrupted or thrown (sheets, pushed screens, the segmented pill, a swap's incoming copy, the nav plate) rides the D-64 springs on those durations, `CH_SPRINGS` through `chSpring`/`chSpringCurve` in `lib/motion.ts`, bounce 0 (S3.1), and a released sheet finishes on the `gesture` spring (Apple's 0.5 s, bounce 0), while a released back swipe finishes from where it is over 520 × (1 − progress) ms, at least 35% of 520, on the iOS curve, with no haptic (MOTION-AND-VISUAL 3.3). No count-ups or routine staggers, and no first-paint draw-ins on charts or graphics (Q-153) except one: a bar chart's first view in a session grows its bars from the origin the chart gives them (the par line, a zero) over the marks beat (360 ms) on the iOS curve, once per screen per session (`useFirstViewGrow`, `lib/motion-glide.ts`), never on a revisit, never for a line chart, never under Reduce Motion or Animations off, and never over bars the server drew; a window change glides the marks over the marks beat; anything else is drawn in place, and only a value that changes afterwards may move (MOTION-AND-VISUAL 3.7). One exception (owner; `docs/architecture/coachhelm-visual-playbook.md` §3): a CoachHelm chat visual that arrives in a LIVE Ask answer (`screens/coachhelm/chat/visual/CoachComposition.tsx`) rises in, block by block 80 ms apart, on the base beat, its line draws over the reveal beat and its bars grow on the base beat; decided once at mount, never under reduced motion or Animations off, never for a thread restored from history, opacity, transform and path length only, and numbers are never counted up. `ui/charts/Line.tsx` takes it only through its opt-in `drawIn`. A second (owner, "there should be an animation of your shots"): the rounds course view (`screens/rounds/track/CourseView.tsx`, `HoleMap` `play`) settles the hole in on the reveal beat as it opens, then plays the hole's shots once, each drawing along its path over the reveal beat after the last lands, a ball travelling it and the landing number popping in on the base beat; decided at mount and on a hole change, never under reduced motion or Animations off, opacity, transform and path length only, and the shot screen's own map (`frame="wide"`) never plays. The full live set, pinned by `src/clubhouse/__tests__/motion-durations-pinned.test.ts`: a phone page change with motion on starts no view transition (the 15 Nov production audit, S4.4, S4.8): a section switch (the tab bar, a sidebar item) and any other swap show the new page, or its route skeleton's frame, in the first frame (the skeleton's blocks follow after 150 ms), and a drill-in pushes and Back pops on the live page (`lib/nav-motion.ts`, `shell/use-route-swipe.ts`) over 520 ms on the one curve, `--ch-ease-ios` `cubic-bezier(0.32, 0.72, 0, 1)`, the page beneath drawing back 30% under a 0.075 black dim, the page pushed in taking no taps until it lands (E-2, `data-ch-arriving`), and a figure the row marks `data-ch-share` (a team round's score) travels into the same figure on that page over the push, two ghosts crossfading on transform and opacity (E-6, `lib/share-morph.ts`, the Web Animations API, never a view transition; no target, plain push); a desktop page change crossfades with no gap, 120 ms out and 180 ms in together (owner decision 3, A10), Back and Forward included (E-8, `playDeskHistory`), and only a crossfade holds the route skeleton back 150 ms; Reduce Motion crossfades a page change over 180 ms; the script smooth spring settles in 462 ms (CSS has no spring durations); the one loop is the working indicator, on the working beat (`--ch-dur-typing` 1200 ms, `--ch-ease-typing`), and only while work runs; under Reduce Motion it is still; the Stats busy dim holds off 150 ms and then holds at least 300 ms, as Ask's chat switch does (`--ch-dur-busy-delay`, `--ch-dur-busy-min`, A11); a CoachHelm view switch moves the one switch at once and shows the next view's skeleton in place of the view, its blocks after 150 ms, held at least 300 ms (`screens/coachhelm/SwitchFrame.tsx`, N13C-67); on a desk the top bar's last crumb, hidden while the page's own title is in view, comes in as that title goes under the bar, a quick-beat fade with a 4 px rise on the iOS curve, and a page that opens already scrolled shows it at once (D16, `shell/large-title.tsx` `watchCanvasScroll`). Change one only together with this text and that test.
  - Type is nine roles (MOTION-AND-VISUAL 4.3, Nick 15 Nov 2026), scaled by `--ch-type-k`: large title, title, headline, body, callout, footnote, caption, the hero figure (600, 44 phone and 56 desktop) and the row figure. A new rule reads a role; the numeric steps it replaces only fall (`src/clubhouse/__tests__/legacy-type-roles.test.ts`). Sizes sit on 12 steps (mot-08's 11 plus the desktop large title's 30): 11, 12, 13, 14, 15, 16, 17, 20, 22, 28, 30 and 34 px, written as `calc(N * var(--ch-type-k))` or `Npx`; weights on 400, 500, 600 and 700. Big figures of 40px and up are free. Pick the nearest step, never a half pixel. `src/clubhouse/__tests__/look-feel-pass-css.test.ts` pins it; SVG chart labels sized in drawing units are outside it.
  - Haptics follow v2 (D-70): selection, light for primary buttons, success for saves and sends, warning before destructive actions, medium only for a sheet settling, error on failure; other taps are silent.
  - No emoji and no exclamation marks.
- **Haptics:** only through `src/clubhouse/lib/haptics.ts`.
- **Phone:** iPhone only. The owner's phone board (`… - Mobile.html` in
  `design/handoff/`; v1 boards in `design/handoff/mobile/`) is the phone spec; without one, write the draft in
  `docs/clubhouse/phone/<screen>.md` first and build from it, noting in the PR
  that no owner board exists. It is never a shrunken desktop.
  Follow `docs/clubhouse/MOBILE.md`, and never commit a native config that
  points anywhere but production.
- **New design:** follow `docs/clubhouse/README.md` step by step. The
  screen checklist is `docs/clubhouse/SCREENS.md`.
- **Tracker:** `docs/clubhouse/PROGRESS.md`. Move a gate only with evidence.
  Each page also has a manifest (`config/clubhouse/pages/`), six page docs
  (layout in `docs/clubhouse/README.md`) and numbered contracts (D-60, D-68, D-69);
  after a catalog change run `node scripts/clubhouse/registry.mjs sync`.
- **Before you report work done,** run `npm run clubhouse:shots -- check` and
  `npm run clubhouse:check` (it also gates changelogs and the VERIFY
  screenshot logs, below).
- **Reviews:** when a reviewer is useful, use `clubhouse-polish-reviewer`
  (`.claude/agents/clubhouse-polish-reviewer.md`) against current runtime owners,
  page contracts and handoff screenshots. `ui-polish-reviewer` targets Fairway.
  Reviewer agents are optional and risk-based.
- **Shared exemplars:** `src/clubhouse/AGENTS.md` indexes current Modal, Menu,
  Button, FormLine, Surface, PhoneScreen and route-transition owners. Follow
  their live implementations and current styles, rather than stale comments
  or unmodified handoff timings.

## Docs and screenshots in the same change

`clubhouse:check` fails a page whose implementation files changed since the
merge-base with `origin/main` (tests exempt) but which logged nothing.
It runs in CI (Static checks, full history) and reads uncommitted files too, so
a red gate can be another session's work in progress.

Log a change as a new file, never by editing a shared log: a page's entry is
`docs/clubhouse/pages/<P###-slug>/changes/<YYYY-MM-DD>-<slug>.md`, and a shared
piece (a file under `src/clubhouse/ui`, `lib` or `styles` that no page owns, or
a component several pages name) gets one entry in `docs/clubhouse/changes/`,
not one on each page. Each branch adds its own file, so parallel branches never
conflict on a log; the page `CHANGELOG.md` files keep the older history and
an edit to one still satisfies the gate.

- **Visible change:** a change file holding one entry (the `## YYYY-MM-DD`
  block in `docs/clubhouse/templates/CHANGELOG.md`), plus before and after
  screenshots.
- **Naming:** `npm run clubhouse:shots -- name --page P### --surface <kebab>
  --role coach|player|none --viewport 390 --state <kebab> --phase
  before|after|baseline|evidence` prints the path, in the local gitignored store
  `.helm/screenshots/clubhouse/<P###-slug>/<YYYY-MM-DD>/`:
  `P###__surface__role__viewport__state__phase__sha7.png`. Then
  `clubhouse:shots -- record <file> --route <route>`.
- **Log:** one row per file in the page's VERIFY.md `## Screenshots` (label =
  file name, phase, commit, what it shows). Never invent rows.
- **Screenshots go in the PR description, never in git.** A capture left in a
  scratch dir (`clubhouse:shots -- check` warns) is filed with
  `clubhouse:shots -- import <file> --page P### ...`.
- **Gallery:** `clubhouse:shots -- gallery [--page P###]` builds a local HTML
  gallery per page (before and after side by side, filter by role and
  viewport) and opens it; `record` and `import` rebuild it.
- **Links:** each PAGE.md "Related" block and `docs/clubhouse/AUDITS.md` are
  generated by `registry.mjs sync`. A new audit or plan doc is registered in
  `config/clubhouse/audits.json` first; `clubhouse:check` fails an unregistered
  one and any relative markdown link under `docs/clubhouse/` that does not resolve.
- **Behavior or state change:** also CONTRACT.md and the catalog, then
  `node scripts/clubhouse/registry.mjs sync`. A gate that moves in `PROGRESS.md`
  moves with evidence; the manifest `status` stays true.
