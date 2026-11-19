# P001 Shell — Changelog

## 2026-11-19 — The page behind the bell drop and quick chat holds still

```text
Design package: none
PR/commit: agent/clubhouse-motion-batch3
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `shell/Bell.tsx`, `shell/quick-chat/QuickChatSession.tsx`: on the phone,
  while the notification drop or quick chat is open, the page behind takes
  `useOverlayScrollLock`, as Modal, PhoneScreen and Stories do (F-25).
- `shell/SectionStrip.tsx`, `styles/shell.css`: comments only; the strip's
  plate glides on a translate and a clip (shared change, F-29).

### Why

- Audit 2026-11-19, F-25: a scripted scroll moved the page 400 px behind both.
  Now 0 px, with the body fixed (Playwright WebKit, coach phone, staging).
