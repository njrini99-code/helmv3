# 2026-10-23 — Cross-screen rules (Clubhouse A+ WP-17)

## 2026-10-23 — One failure voice, Today on the phone, sortable headers (B10)

```text
Design package: none (Clubhouse A+ handoff, B10.3 to B10.5)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: B10.1 (one place for the create action) and B10.2 (large
titles) wait on the owner's A25 answer
```

### Changed

- Failure notices say what didn't happen and what to do: 84 bodies drop
  "the error has been reported" and keep their own reassurance ("Posted
  rounds are safe. Try again."), and the week's "display problem" guess
  goes.
- The phone calendar has Today whenever it is away from today: another
  day on Day or List, another month on Month. It sits at the right of
  the year's line, out of flow, so the header does not move.
- The desktop roster table's Player, Avg, HCP and Rounds headers sort by
  their column (the Sort players orders), and the column sorted by says
  so with `aria-sort` and an arrow. The phone list and the table share
  one sort module (`screens/roster/sort.ts`).

### Why

- The same thing behaved differently from screen to screen: five ways to
  say a load failed, Today only on desktop, and sorting that worked one
  way on the phone and another on desktop.

### Verification

- New `error-copy.test.ts`; a calendar test for the phone's Today; a
  roster test that a header sorts and carries `aria-sort`.
- WebKit: Today appears only away from today and takes no room; the
  roster headers sort, the arrow's room is kept so labels don't move.

## 2026-10-23 — One retry verb, one "not on a team" state (CONS-6, CONS-10)

```text
Design package: none (Clubhouse A+ handoff, CONS-6, CONS-10)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- A failure's action says "Try again" everywhere: the failure toasts'
  default, the offline toast, Settings, round entry and a message that
  did not send, as the notices already did.
- Fifteen pages say "You aren't on a team yet" through `ui/NoTeam`: a
  restricted page state with one icon, one title, the page's own body
  and code, and one way on (Team settings for a coach, Golf profile for
  a player). Stats, Qualifiers, CoachHelm and team rounds gain that way
  on; the Team setting itself has none.

### Why

- "Retry" and "Try again" named the same act, and the no-team state was
  drawn fifteen ways, some with no way forward.

### Verification

- New `retry-verb.test.ts` and `no-team.test.ts`; the tests find the
  failure key by its new name.

## 2026-10-23 — One spinner, icon weight, one back link (CONS-24, B12, CONS-29)

```text
Design package: none (Clubhouse A+ handoff, CONS-24, B12, CONS-29)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: B12's size steps wait on the CONS-4 icon-size answer; Round
setup's band back, onboarding's back and two pagers wait on a visual
decision
```

### Changed

- One spinner: every busy ring was already `ui/Spinner`, so five local
  spinners and their keyframes go.
- Icons draw an absolute line: 1.5px up to 17, 1.75px to 22, 2px above,
  so small icons are no longer hairlines beside 600-weight text.
- One back link: CoachHelm's Track record, Monday brief and Brief, the
  calendar panel and the course picker use `BackLink` (ChevronLeft 16,
  focus offset 2), a link to the parent or a button inside a page.

### Why

- Five spinners, icon lines from 0.8 to 2px, and nine ways to go back.

### Verification

- New `one-spinner.test.ts`, `ui/__tests__/Icon.test.tsx` and
  `one-back-link.test.ts` (which lists the held backs).

## 2026-10-23 — Desktop keys: Settings, a quiet N, arrow keys in lists (B11)

```text
Design package: none (Clubhouse A+ handoff, B11, partial)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: Cmd-1 to 9 waits on OQ-63; the toolbar search, the identity
menu, a cold People list and page-aware shortcuts follow
```

### Changed

- Cmd or Ctrl and a comma opens Settings, from a field too but never over
  a dialog, and the shortcuts sheet lists it.
- Home's N no longer fires inside a Modal: it checks a field, a dialog or
  a menu, and any open modal, with the shell's own tests.
- The Messages rail and the open Bell are one Tab stop each, and the
  arrow keys walk their rows (Home and End to the ends).

### Why

- A Mac app opens its settings with Cmd-comma, a key typed in a dialog
  should stay there, and a long list should not take a Tab per row.

### Verification

- `shortcuts.test.ts` (Cmd-comma), `home-new-key.test.tsx` (N over a
  native dialog and in a field), a Messages test for the arrow keys.

## 2026-10-23 — One rank rule, the season on the team's calendar (B13)

```text
Design package: none (Clubhouse A+ handoff, B13.2 and B13.4)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none (figures read the same rows; places and the season
boundary are computed differently)
Held items: Standing's window (B13.1) and the qualifier completeness
rule (B13.3) offer two options each, for the owner; the SQL readers'
CURRENT_DATE is C10, held
```

### Changed

- Places are taken on the value as shown, so two players shown at 74.3
  share a place ("T1"); Roster's standings and Home's leaderboard use
  the one rule. Stats' TeamRank keeps its "about the same" tie.
- The season turns on 1 August in the team's zone (New York where the
  zone isn't to hand), not the server's UTC date.

### Why

- Two players shown with the same average had different places, and an
  Eastern team's season turned about four hours early.

### Verification

- New `lib/__tests__/rank.test.ts` and `data/__tests__/season.test.ts`;
  a roster standings test for 74.30 and 74.333.

## 2026-10-23 — One number formatter per metric (CONS-15)

```text
Design package: none (Clubhouse A+ handoff, CONS-15)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none (display only)
Held items: formatSG's precision (two decimals in the spec body, one in
its table row) waits for the owner before any strokes-gained figure
moves onto it; the .toFixed ratchet starts at 112, not 0
```

### Changed

- `lib/format.ts` gains `formatAvg`, `formatSG`, `formatHcp` and
  `formatDistance`. The roster and onboarding handicap formatters are
  gone; every handicap reads through `formatHcp`.
- Team and player averages, penalties and putts on Roster, Stats and
  Home use the shared formatters. A missing figure is an em dash.
- TeamRank's two-decimal percent is a dot's position, not a figure, so
  it stays. `formatPct` keeps its percent scale (61.4 reads 61%).

### Why

- One metric should read at one precision everywhere.

### Verification

- New `display-rounding.test.ts` (`.toFixed(` outside `lib/format.ts`
  may only fall, 132 to 112 here); `format-number.test.ts` extended;
  related tests for every changed file (214 files).

## 2026-10-23 — Menu origin and the push dim (B16, partial)

```text
Design package: none (Clubhouse A+ handoff, B16)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: the physics springs (smoothPhysics, snappy) wait on OQ-17;
the sidebar fold stays as it is; device smoothness of the dim is
unverified
```

### Changed

- A menu grows from the corner nearest its trigger: from the bottom
  when it opens upward. The right-click menu does the same.
- On the phone a drill-in push dims the page beneath as a pushed screen
  does (`--ch-push-dim`, `--ch-vt-push-dim`), and Back lifts it.

### Why

- A menu that opened upward grew from its top, away from the trigger,
  and a route push left the page beneath at full brightness.

### Verification

- New `ui/__tests__/menu-origin.test.tsx`; the context menu, popup
  layout and CSS guard tests (31 files); `clubhouse:css` 0 findings.
