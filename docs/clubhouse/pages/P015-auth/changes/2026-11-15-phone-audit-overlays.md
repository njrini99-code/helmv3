# 2026-11-15 — auth

## 2026-11-15 — One greeting rule; onboarding keys reach 44

```text
Design package: none (production audit 2026-11-15, CLUBHOUSE-PROD-AUDIT-FINAL.md)
PR/commit:      claude/project-thread-7ygzj3 (QUEUE pa-ovl-01 to pa-ovl-12)
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- The welcome greeting uses the app's one time-of-day rule (morning from 5), saying evening under its dark sky for the rest of the night (MAC-14).
- Onboarding's small keys reach 44 by 44 on the phone.
- The coach and player onboarding routes name the tab "Set up your team" and "Set up your profile" (GAP-R-08).

### Why

- The 15 Nov production audit: phone layout, overlays and names that disagreed with the screen.

### Verification

- `__tests__/auth*.test.ts` (unit).
- A real-iPhone pass (tier D) is still owed.
