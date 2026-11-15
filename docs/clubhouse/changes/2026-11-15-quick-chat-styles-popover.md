# 2026-11-15 — quick chat styles describe the popover open

## 2026-11-15 — quick-chat.css: comments follow the popover open (MOT-09); no rule changed

```text
Design package: none (production audit 2026-11-15, MOT-09, spec S3.5)
PR/commit:      worktree-agent-a28a8e337f498ea91 (motion, ambient loops slice)
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none (no visible change from this file; the open itself is logged on P001)
```

### Changed

- `styles/quick-chat.css`: the comments that described the panel "pouring"
  from the key now describe the popover open (96% at the key's centre,
  transform and opacity only, `useQcMotion`). No selector or declaration
  changed.

### Why

- The motion they described is gone (P001-shell,
  `2026-11-15-quick-chat-popover.md`).

### Verification

- None needed beyond the P001 entry's tests; comments only.
