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
