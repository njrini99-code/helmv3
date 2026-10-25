# 2026-10-25 — Class awareness (P-10): Hold during class

```text
Design package: P-10 Class awareness (plan 2026-10-24, changelog 2026-10-25)
PR/commit: branch claude/clubhouse-class-awareness
Contract IDs: new CH-8030, CH-8216 (Bridge IDs in CONTRACT.md)
Actions: none server-side; a player's own RLS-scoped write to golf_player_class_settings.hold_pushes. Turning it off also calls releaseMyHeldPushes
Data impact: reads golf_my_class_day; writes golf_player_class_settings
Held items: the migrations; with class_awareness_v1 off, for a coach, or before the class day loads, Notifications is exactly as it was
```

### Changed

- Notifications gains one quiet row for a player, "Hold during class" (CH-8216): "Non-urgent pushes wait until class ends, then arrive as one. Urgent ones still come through." On by default. Desktop: its own "During class" card after Email and push; phone: its own "During class" group. It sits away from Quiet mode on purpose: it defers, never silences, has no schedule, and touches push during class blocks only.
- It is stored in `golf_player_class_settings.hold_pushes`, not in `users.notification_preferences` (the applied whitelist trigger keeps 15 keys and would drop a new one).
- While class status sharing is off the switch is off and disabled, with "Turn on class status sharing in Classes to hold pushes."
- Turning it off sends what is waiting now; a refused save puts the switch back and toasts CH-8030.

### Verification

- class-awareness-holds.test.tsx (CH-8030, CH-8216, desktop and phone).
