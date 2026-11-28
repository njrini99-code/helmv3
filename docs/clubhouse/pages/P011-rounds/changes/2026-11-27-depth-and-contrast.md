# P011 — Changelog

## 2026-11-27 — The putts meter's comment says what it draws

```text
Design package: none; Nick's ask (27 Nov 2026): "more depth more modern premium look", "color contrast has been an issue"
PR/commit: branch clubhouse-depth-contrast (local, not pushed)
Contract IDs: none changed
Actions: none changed
Data impact: none
Held items: before and after pictures still owed
```

### Changed

- `screens/rounds/parts.tsx`: the comment above the round row's putts meter
  said fewer putts fills more. The meter draws more putts as more fill, per 18
  on `PUTTS_SCALE`, the season bar's way (CH-14); the comment now says so. No
  change to what the page draws.
- The round cards lift with the deeper card elevation (shared entry:
  `docs/clubhouse/changes/2026-11-27-depth-and-contrast.md`).

### Why

- A comment that contradicts the code sends the next change the wrong way.

### Verification

- Comment only; the rounds tests are unchanged and pass.
