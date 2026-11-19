# P007 Messages — Changelog

## 2026-11-19 — The Seen by pill is named by its own text

```text
Design package: none
PR/commit: agent/clubhouse-motion-batch3
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `screens/messages/seen-by.tsx`: the pill's button has no `aria-label`; its
  name is the same sentence in a visually hidden span, so the faces' initials
  no longer sit outside its name (F-21, WCAG 2.5.3).

### Why

- Audit 2026-11-19, F-21 (axe label-content-name-mismatch): now 0 on Messages desk.
