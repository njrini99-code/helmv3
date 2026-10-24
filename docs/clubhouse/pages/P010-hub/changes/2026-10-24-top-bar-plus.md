# 2026-10-24 — Team Hub: the top bar's plus (B10.1)

## 2026-10-24 — A coach's create action is the phone top bar's plus

```text
Design package: none (Clubhouse A+ handoff, B10.1; P010 D6 for which action each
                tab offers)
PR/commit:      agent/aplus-lane-d
Contract IDs:   101901
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- On the phone, a coach's head primary moved to the top bar's trailing plus
  (in the bell's place, as on Calendar). It follows the tab exactly as the
  desktop head does: New announcement on Home and Announcements, Plan a trip on
  Travel, Assign a task on Tasks, none on Documents or on a tab whose read
  failed (the bar then shows the bell again). The phone head no longer draws
  the full-width button. A player's bar is unchanged. Desktop is unchanged.

### Why

- B10.1: one rule for the phone's create action, so it sits in the same place on
  every section.

### Verification

- hub.test › 101901 (the plus is the one New announcement; it follows the tab
  and opens Assign a task; a player has none). Wants an iPhone look: the plus
  in the bell's place, and the bell's return on Documents.
