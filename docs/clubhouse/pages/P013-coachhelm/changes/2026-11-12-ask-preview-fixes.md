# 2026-11-12 — coachhelm

## 2026-11-12 — Ask answers from the 12 Nov preview and the staging check

```text
Design package: none (bug fixes from the owner's preview and a staging real-answer check)
PR/commit:      agent/preview-fixes, 567719cc25, 0f2913da35, f43dda9c77 and the show_visual ref fix
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Fixed

- A visual with one bad block draws the rest; what was not drawn is reported, not dropped silently.
- The step line counts this season's rounds and names last season's after ("against 76 earlier").
- Sources are named for what they read ("Team stats, this season", "This season against last"), never "Read".
- A list read (the calendar) beside a visual stays in Sources, not as a card under it.
- A team beside one player is not drawn as a one-column comparison.
- show_visual takes a read by the name it was cited with (`read:e1`) as well as `e1`; on staging two of four
  chart questions failed on that and answered in words.
