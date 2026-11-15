# 2026-11-15 — messages

## 2026-11-15 — Seen by: a section left empty fades out, opacity only (MOT-15)

```text
Design package: none (production audit 2026-11-15, MOT-15)
PR/commit:      worktree-agent-a28a8e337f498ea91 (motion, ambient loops slice)
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     screenshots owed (the receipt list as the last person moves from Not seen yet to Seen)
```

### Changed

- `screens/messages/seen-by.tsx`: a section that empties ("Not seen yet" once
  everyone has opened it) leaves on opacity over the quick beat (180 ms) instead
  of folding its height to 0 on the smooth spring. The rows' glide between
  sections and the count and meta crossfades are unchanged.

### Why

- A height exit lays the list out again on every frame.

### Verification

- `__tests__/messages-seen-by.test.tsx` and the receipts tests; source and jsdom
  only, no browser or device run.
