# 2026-11-11 — settings

## 2026-11-11 — The player's phone is read through golf_player_private_fields

```text
Design package: none (security review 2026-11-11, finding 1)
PR/commit:      #2500
Contract IDs:   none new
Actions:        none new
Data impact:    none (read path only; the held migration 20261112090000 makes golf_players.email, .phone and .gpa unreadable through the table)
Held items:     20261112090000_golf_players_coaches_contact_columns.sql
```

- The Settings loader reads the player's own phone through `readPlayerPrivateFields`
  (`src/lib/golf/player-private-fields.ts`) instead of selecting `phone` from `golf_players`.
  Before the migration is applied it falls back to the table, so nothing changes on screen.
- A failed phone read now fails the player's golf card, as a failed profile read already did, so a blank phone is never
  shown on a form that would save it back.

Evidence: `src/clubhouse/__tests__/settings-server.test.tsx` (unit), no screen change.
