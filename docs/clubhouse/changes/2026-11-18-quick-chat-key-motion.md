# Quick chat key — Changelog

## 2026-11-18 — The key's disc moves on the motion tokens

```text
Design package: none
PR/commit: agent/clubhouse-motion-fixes
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/quick-chat.css` `.ch-qck .hkey__disc`: the disc's fade was
  `opacity 0.2s` on the browser's default ease and its scale rode the retiring
  `--ch-ease`. It now fades over the quick beat (`--ch-dur-quick`, 180 ms) and
  scales over the base beat, both on `--ch-ease-ios` (MOTION-AND-VISUAL 3.2).
  Reduce Motion is unchanged.
- `config/clubhouse/motion-ratchet.json`: quick-chat.css drops its one off-token
  duration and one retiring token.

### Why

- Clubhouse audit 2026-11-18 (P2): an off-token duration and the default ease.

### Verification

- `motion-gate.test.ts`, `motion-durations-pinned.test.ts`.
