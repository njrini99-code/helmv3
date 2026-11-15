# 2026-11-15 — shared UI

## 2026-11-15 — A badge can be for the eye only

```text
Design package: none (production audit 2026-11-15, SWP-03; no visible change)
PR/commit:      claude/project-thread-7ygzj3 (the follow-up to #2538)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `src/clubhouse/ui/Badge.tsx` takes `decorative`: the badge is `aria-hidden`, for a control that already says its
  state in words. Calendar's `MarkBadge` passes it through. Off by default; nothing else changes.

### Why

- SWP-03 (WCAG 2.5.3): a phone Calendar row is named by its title, then hidden words with its state; its Reply,
  Cancelled, Moved or Now badge would have said the state a second time.

### Verification

- `src/clubhouse/screens/calendar/__tests__/label-in-name.test.tsx`.
