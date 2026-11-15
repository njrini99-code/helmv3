# 2026-11-15 — coachhelm

## 2026-11-15 — Ask with the keyboard up, the full plan as a dialog, named charts

```text
Design package: none (production audit 2026-11-15, CLUBHOUSE-PROD-AUDIT-FINAL.md)
PR/commit:      claude/project-thread-7ygzj3 (QUEUE pa-ovl-01 to pa-ovl-12)
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- Ask pins to the visual viewport with the keyboard up and no longer adds 20px of scroll under itself (ASK-P-01, MAC-06).
- The phone's full plan is a native dialog (MOT-10) with real title buttons for its blocks (SWP-09).
- Chart wedges and coins reach a screen reader; a 14-unit wedge has a 44 target (SWP-05, SWP-08, SWP-10).
- Station chips, spot bars, the people line, leaderboard rows and the miss compass are named from their face (SWP-02, SWP-04, MAC-09).
- Stories drag with the shared sheet drag. Plan, file, standing and studio keys reach 44 by 44 on the phone.

### Why

- The 15 Nov production audit: phone layout, overlays and names that disagreed with the screen.

### Verification

- `plan/__tests__/plan-full-dialog.test.tsx`, `read/__tests__/read-page.test.tsx`, `team/__tests__/hole-a11y.test.tsx`, `chat/studio/__tests__/miss-compass.test.tsx`, `chat/cards/__tests__/cards.test.tsx` (jsdom).
- A real-iPhone pass (tier D) is still owed.
