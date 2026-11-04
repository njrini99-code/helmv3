# 2026-11-03 — CoachHelm team board behind its flag

## 2026-11-03 — CT0a: count only what the board draws

```text
Design package: design-refresh/coachhelm-team/ (CT0a)
PR/commit:      agent/ct0a-drawn-later
Contract IDs:   none
Actions:        getTopInsightsForPlayers takes an optional drawnLater; no caller passes it yet
Data impact:    none until a caller passes it
Held items:     none
```

## 2026-11-03 — CT0: flag, loader and shapes

```text
Design package: design-refresh/coachhelm-team/ (CT0)
PR/commit:      agent/ct0-loader
Contract IDs:   none
Actions:        none; no route calls the loader yet
Data impact:    `course_id` added to `ROUND_COLUMNS`
Held items:     none
```

## 2026-11-03 — CT1: route, shell and the hole at rest

```text
Design package: design-refresh/coachhelm-team/ (CT1)
PR/commit:      agent/ct1-hole
Contract IDs:   none
Actions:        none
Data impact:    the route calls loadCoachTeamBoard with the flag on; off everywhere
Held items:     none
```

## 2026-11-03 — CT2: the spot card and the Course card

```text
Design package: design-refresh/coachhelm-team/ (CT2)
PR/commit:      agent/ct2-spot
Contract IDs:   none
Actions:        none
Data impact:    none; `stakes` and `patternsStatus` are additive
Held items:     none
```

## 2026-11-03 — CT3: sheets and the desktop inspector

```text
Design package: design-refresh/coachhelm-team/ (CT3)
PR/commit:      agent/ct3-sheets
Contract IDs:   as today's FocusActions
Actions:        Assign through today's useFocusActions; no new write
Data impact:    none
Held items:     none
```

## 2026-11-03 — CT4 to CT6: stories, huddle, roster, working, record

```text
Design package: design-refresh/coachhelm-team/ (CT4, CT5, CT6)
PR/commit:      agent/ct4-6-cards
Contract IDs:   as today's Re-check
Actions:        none new
Data impact:    none
Held items:     none
```

## 2026-11-03 — CT7: team board motion

```text
Design package: design-refresh/coachhelm-team/ (CT7)
PR/commit:      agent/ct7-motion
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

## 2026-11-03 — CR1 to CR5: one read, in full

```text
Design package: design-refresh/coachhelm-read/ (CR1 to CR5)
PR/commit:      agent/cr1-5-read
Contract IDs:   as today's FocusActions
Actions:        Assign, Dismiss, Undo through today's useFocusActions
Data impact:    none; the Deep dive loaders split behind unchanged exports
Held items:     none
```
