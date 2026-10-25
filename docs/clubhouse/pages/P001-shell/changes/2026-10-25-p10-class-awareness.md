# 2026-10-25 — Class awareness (P-10): the Bell's held row

```text
Design package: P-10 Class awareness (plan 2026-10-24, changelog 2026-10-25)
PR/commit: branch claude/clubhouse-class-awareness
Contract IDs: new CH-1270, CH-1271 (Bridge IDs in CONTRACT.md)
Actions: releaseMyHeldPushes (Deliver now), through the shared deliverHeldNow
Data impact: reads golf_my_class_day for a player
Held items: the migrations; with class_awareness_v1 off, for a coach, or with nothing held, the Bell is exactly as it was
```

## Changed

- While pushes are held for a player's class, the Bell's first row (desktop
  popover and phone drop) reads "3 updates held until 11:50 AM" with Deliver now
  (CH-1271): 52 px, a hairline below, no tint or stripe, Deliver now in the
  dark-safe green. After Deliver now it reads "Delivered" for 2 seconds and
  goes. A refusal toasts CH-1270.
- The held items already appear in the Bell's list (the in-app rows are never
  held), so the row lists nothing twice.

## Not here

- Tapping a summary push opens Home, not Home with the Bell open: no Bell-open
  link parameter exists and none was added.

## Verification

- class-awareness-holds.test.tsx (CH-1270, CH-1271).
