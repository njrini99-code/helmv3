# 2026-10-31 — Messages: previews, failures and reuse

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

- Failed or pending sends survive a refetch; Retry shows pending and clears on
  success.
- A message with only an attachment previews as "Sent an attachment"; the badge
  refetches when the rail's unread total changes and counts the active team
  only.
- Editing or deleting a message refreshes every member's preview; a failed inbox
  read never shows the groups alone; search failures say so.
- A coach's same-title group is reused only when nobody in it is outside the
  chosen audience, and never one they deleted; a conversation started and then
  deleted or left leaves the list.
