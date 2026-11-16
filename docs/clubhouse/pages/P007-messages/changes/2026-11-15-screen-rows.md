# 2026-11-15 — messages

## 2026-11-15 — Messages: flat bubbles, dated receipt, composer on the gutter

```text
Design package: clubhouse-handoff/prod-audit-2026-11-15/CLUBHOUSE-PROD-AUDIT-FINAL.md; MOTION-AND-VISUAL.md 4.1 and 4.5
PR/commit:      claude/project-thread-d9q2qs
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Bubbles are flat, like iMessage (DM-06): the two bubble drop-shadow filters,
  the sent bubble's lit edge and their four tokens are deleted, on bubbles, the
  typing bubble, the poll card and a sent file.
- A direct thread's receipt is plain caption text under the message, no pill
  (DM-05), and dated like the inbox rail: "Seen 7:50 AM" today, "Seen
  Yesterday", "Seen Sat", "Seen Sep 3".
- The composer sits on the page gutter, not 6px outside it, and its capsule is
  flat with a 1px control ring (`--ch-field-ring`, 3:1) instead of the float
  shadow (DM-07).
- New is a bare 44 glyph key in the accent ink, no disc, no shadow (MSG-L-01);
  the older duplicate phone rule is deleted.
- The date pill's saturate and every message glass read the one glass tokens
  (MOT-16).

### Why

- The production audit's rows (Nov 15), fixed to its specs, with Nick's
  MOTION-AND-VISUAL.md winning where the two differ.

### Verification

- Unit: receipts (adds the DM-05 dated receipt), composer and inbox tests.
- Before and after screenshots at 393 and 1440, light and dark, Chromium (tier
  C), in the PR.
