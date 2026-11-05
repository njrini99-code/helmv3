# 2026-10-31 — CoachHelm: Ask reads the real rows

## 2026-10-31 — Data correctness pass

```text
Design package: none (data audit against Guilford, Shenandoah and UNCW, owner
                2026-10-31: "literally everything needs to be checked for
                correctness")
PR/commit:      #2428 (agent/clubhouse-data-truth)
Contract IDs:   none new
Actions:        none new
Data impact:    reads only
Held items:     none
```

### Changed

- Upcoming events read replies the calendar's way, keep today's all-day events
  and say when a cap or failed read left the answer partial.
- Open tasks leave test tasks out and count null-status ones; trips under way
  are listed.
- Averages and trends use full 18-hole rounds only and say what was left out;
  action plans' idempotency key is scoped to the conversation.
