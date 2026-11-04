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
