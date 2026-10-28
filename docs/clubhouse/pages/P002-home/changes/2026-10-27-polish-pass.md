# 2026-10-27 — Polish pass: Home

## 2026-10-27 — Phone queue targets and line breaks

```text
Design package: none (production polish pass before launch; doctrine in .claude/rules/clubhouse.md)
PR/commit:      agent/clubhouse-polish
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Phone "Waiting on you": each link is 44px tall (it was 42) and the dots between
  them are gone on the phone, where the parts wrap as a list and a dot dangled at
  a line's end or opened the next line (`styles/home.css`).
- Hero subline: a no-break space ahead of a title's dot keeps "· Pinehurst No. 2"
  from opening a line (`screens/home/model.ts` homeSubline).
- Player "From your coach": the count and its words stay together ("2 tasks due"
  no longer splits after the 2) (`screens/home/CoachAsks.tsx`).

### Why

- 44px is the touch floor; a line that starts with "·" or ends on a bare number
  reads as broken.

### Verification

- `__tests__/logic.test.ts`, `__tests__/player-home.test.tsx`, `__tests__/home.test.tsx`
  (191 pass). WebKit at 390, preview and signed-in local stack.
