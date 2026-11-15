# P008 Settings — Changelog

## 2026-11-15 — Settings reads in one wave

```text
Design package: none (production audit 2026-11-15, PMAC-12 and MAC-11's time to first byte)
PR/commit: claude/project-thread-10vtd2 (worker F, load)
Contract IDs: none changed (read order only; every card and state is as it was)
Actions: none
Data impact: none (the same reads, started together; no write, no schema change)
Held items: the time-to-first-byte measurement (below)
```

### Changed

- `data/settings.ts`: the role's reads (a player's notification routing, join requests and team row; a coach's team settings, team row, CoachHelm row and philosophy row) need only the ids and the team, so they now start with the account's own reads (user, delivery preferences, saved keys, profile, phone) instead of after them. Two database round trips one after the other become one. The coach's CoachHelm access read still follows, since it needs the CoachHelm row.

### Why

- PMAC-12: Settings took 750 ms to its first byte and 2.06 s to its largest paint in production (Chromium emulation, 393 px); the time was in this loader.

### Verification

- Unit (vitest): `data/__tests__/settings-waves.test.ts` (new: each role's reads are asked for while the first wave's slowest read is held; fails on the previous loader), `__tests__/settings-server.test.tsx` (every card and failure state unchanged).
- Not measured here: time to first byte on `/golf/dashboard/settings` for a coach and a player, before and after, on a production build (C tier is enough for a server time).
