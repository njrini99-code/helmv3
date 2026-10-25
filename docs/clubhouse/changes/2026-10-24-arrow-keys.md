# 2026-10-24 — Arrow keys in the remaining lists (B11)

## 2026-10-24 — Arrow keys on Roster, Rounds, Qualifiers; skeletons skip Tab

```text
Design package: none (Clubhouse A+ handoff, B11)
PR/commit:      agent/aplus-lane-d
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     the Stats player list (lane C's files); Cmd N (see Why)
```

### Changed

- `lib/roving.ts` walks only rows that are links or enabled buttons. A loading
  skeleton's placeholder rows share the row class (the Messages rail, the
  Settings rail) and used to take the Tab stop (#2361 audit).
- Up and Down walk the desktop Roster table's players, the Rounds library's
  rounds and the Qualifiers list (the hero, then the cards); Home and End go to
  the ends; each list is one Tab stop. Each registers its keys with the
  shortcuts sheet ("Move between players", "rounds", "qualifiers").
- `RovingRows` (ui/RovingRows.tsx, drawing nothing) runs the walk from inside a
  list's own SectionBoundary, so its tab stops land after that boundary
  hydrates; set from the page's outer element they hit server HTML still
  hydrating, and React reported a mismatch (qualifiers-hydration.test).

### Why

- B11: desktop keyboard parity with Mac apps.
- Cmd N is not added. A browser keeps Cmd N for a new window and a page cannot
  take it reliably (docs/clubhouse/changes/2026-10-23-cross-screen.md recorded
  the same); N stays Home's create key, and the phone and desktop create
  actions are the top bar's plus and the head's primary.

### Verification

- lib/__tests__/roving.test.tsx (placeholders get no Tab stop; only controls
  are walked); roster.test, rounds.test and qualifiers.test › row 63; the
  messages.test rail case now waits for the conversations (it had been walking
  the placeholders, which is the audit's finding).
