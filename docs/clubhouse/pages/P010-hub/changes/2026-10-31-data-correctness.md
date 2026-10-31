# 2026-10-31 — Hub: acknowledgement counts and failed reads

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

- Coach acknowledgement counts are over players still on the team (no "8 of 7");
  a failed ack, task, document or roster read refuses instead of zeros.
- Player task details that fail to read refuse instead of an empty list; coach
  RSVPs keep today's all-day event.
