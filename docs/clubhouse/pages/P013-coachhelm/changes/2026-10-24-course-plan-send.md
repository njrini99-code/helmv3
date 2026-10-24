# 2026-10-24 — CoachHelm: course plan Send to

## 2026-10-24 — The course plan's player version can be sent to the player's thread

```text
Design package: none (Clubhouse A+ handoff, section 0.4 CoachHelm: "Course plan can only be copied; add Send to Messages")
PR/commit:      agent/aplus-lane-d
Contract IDs:   none
Actions:        none (navigation to Messages; nothing is sent or written)
Data impact:    none (the draft waits in this tab's sessionStorage under an opaque key, prefill.ts)
Held items:     none
```

### Changed

- Beside "Copy for {first name}", the plan's player version has "Send to
  {first name}": it opens Messages on that player's thread (or New message,
  seeded, when there is none yet) with the plan written in the composer. The
  coach reads it and presses Send (D2-7: an action that reaches players never
  sends). It is a link, so it stays silent (D-70).

### Why

- Copying and switching screens to paste was the only way to get the plan to the
  player.

### Verification

- coachhelm-course-plan.test › Send to (the link carries only the prefill key;
  the draft is the plan, addressed to that player alone).
