# Clubhouse progress

The from-scratch GolfHelm UI. Code: `src/clubhouse/`. Spec: `design/handoff/`
(desktop, owner-approved). Flag: `golf_clubhouse_ui` (production off). Rules:
`.claude/rules/clubhouse.md`. Enforcement: `npm run clubhouse:check`, which
also validates this file.

Nothing in `src/clubhouse/` imports or styles through Fairway. Shared
non-UI plumbing (session, Supabase loaders, the Capacitor haptics bridge) is
allowed.

## How a screen moves

A screen advances one gate at a time. Each gate is checked (`[x]`) only when
its evidence exists. The phone gates are separate from the desktop gates
because every screen gets its own native phone design, never a squeezed
desktop.

| Gate | Done when |
| --- | --- |
| `spec` | The desktop reference is identified, the data sources are mapped, and gaps are logged below |
| `desktop` | Built pixel-accurate against the reference screenshots at 924px and 1280px |
| `wired` | Every figure comes from a real loader, and null, zero and early-read states render distinctly |
| `states` | Empty, loading and failed-read states are designed and built, and they are distinct from each other. Every action goes through `useAction`, so a failure tells the coach what failed and what to do next, fires an error haptic and is reported to Sentry. Route errors render the Clubhouse error view |
| `error-tracking` | Server reads log through `chLogServer`, client crashes through `chReport` (tagged `ui=clubhouse` and `surface`), intents leave breadcrumbs, nothing is swallowed, and every failure path was forced once |
| `phone-spec` | A written native phone design (`docs/clubhouse/phone/<screen>.md`) is approved by the owner |
| `phone` | The phone design is built at 390px, with safe areas and the bottom tab bar |
| `motion` | Transitions, press and haptics are wired within the doctrine (90/150/220/360ms, 0.985 press, no count-ups or staggers) |
| `accessibility` | Keyboard path, landmarks and roles, chart text equivalents, announced status changes, AA contrast |
| `performance` | No server waterfall, client JS only on interactive islands, no layout shift after first paint |
| `verified` | typecheck, lint, tests and `clubhouse:check` are green, and a browser pass on desktop and phone is logged below |

Statuses are `todo`, `doing`, `blocked (reason)` and `done`.

Each screen past `spec` has a checklist at `docs/clubhouse/screens/<slug>.md`,
copied from `CHECKLIST_TEMPLATE.md`. It has one section per gate, and
`clubhouse:check` refuses a `done` gate while its section still has an
unchecked box. That checklist is the definition of pro quality for the
screen.

## Screens

<!-- clubhouse:screens:start -->
| Screen | Route | spec | desktop | wired | states | error-tracking | phone-spec | phone | motion | accessibility | performance | verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Foundation | (shell, tokens, primitives) | done | doing | doing | doing | doing | doing | todo | doing | doing | doing | todo |
| Home | /golf/dashboard | done | doing | doing | doing | doing | doing | todo | todo | doing | doing | todo |
| Roster | /golf/dashboard/roster | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
| Stats (team) | /golf/dashboard/stats | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
| Stats (player) | /golf/dashboard/stats?player= | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
| Calendar | /golf/dashboard/calendar | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
| Messages | /golf/dashboard/messages | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
| CoachHelm | /golf/dashboard/coachhelm | blocked (still in design) | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
| Rounds, Practice, Lineups, Events, Scouting | various | blocked (no design yet) | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
| Player app (all screens) | /golf/dashboard (player role) | blocked (no design yet) | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
<!-- clubhouse:screens:end -->

## Decisions

- D-1 (2026-09-29): Parallel and flag-gated. The coach role only; players keep the Fairway shell until their screens are designed.
- D-2 (2026-09-29): Light theme only. The handoff's chart colours are tuned for light paper, and dark mode is not designed.
- D-3 (2026-09-29): Phone navigation is a bottom tab bar in the ivory-pass style, with a selection haptic on tab change.
- D-4 (2026-09-29): Home's "New session" button is not built. The README says it was removed, although the screenshot still shows it.
- D-5 (2026-09-29): Each screen gets a written phone design that the owner approves before it is built.
- D-6 (2026-09-29): Schema changes are written as migrations and never applied by an agent.
- D-7 (2026-09-29): Errors reuse the existing pipeline (`logError`, `logServerError`, chunk and stale-action recovery) with a Clubhouse view and voice. The messages coaches see say what failed and what to do next, and never show raw server text.

## Data gaps (shown honestly, never invented)

- Home: the prototype's weather, "Week 7 of 12" and "5 of 6 players ready" have no source. They are omitted until one exists.
- Home: the prototype's greeting subline ("Two players need a conversation") needs a real attention source. It is omitted in this pass.
- Shell: the top-bar search and the notifications bell arrive with their own screens. Until then they are not rendered, so there are no dead controls.
- Shell: Practice and Events are in the design's navigation but have no route. They are hidden until the owner decides what they point to.
- Shell: the sidebar's next-event readiness bar ("5 of 6 ready") has no source. It is omitted.

## Verification log

<!-- Append: date, screen, gate, what ran, result. -->
