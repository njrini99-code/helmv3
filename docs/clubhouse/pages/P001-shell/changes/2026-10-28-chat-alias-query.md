# 2026-10-28 — Shell: the old chat address keeps its query

## 2026-10-28 — `/coachhelm/chat` keeps `?c=` and `?q=`

```text
Design package: none (CoachHelm audit of main, 2026-10-28)
PR/commit:      fix/coachhelm-ask-polish
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     the Clubhouse Ask does not read ?q= yet
```

### Changed

- `routes/alias.ts`: `aliasText` reads a free-text query value (trimmed,
  no control characters, at most 1000 characters) for a target that
  writes it back through URLSearchParams, never raw.
- The old `/coachhelm/chat` layout sends a coach to the Ask sub-tab with
  the conversation (`?c=`, id-shaped through `aliasId`) and the question
  (`?q=`, encoded). Before, the redirect dropped both. Nothing else of
  the old query is carried; a player still lands on their CoachHelm.

### Verification

- `alias.test.ts` (the chat redirect: kept, encoded, dropped).
