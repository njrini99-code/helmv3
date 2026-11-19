# Clubhouse shared — Changelog

## 2026-11-19 — `lib/phone-edges.ts`: the phone edges' writer

```text
Design package: none
PR/commit: agent/clubhouse-verify-switch
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- New `lib/phone-edges.ts` (`writePhoneEdges`): writes the phone's edge
  colours (page colour on `<html>` and `<body>`, theme-color, light
  status-bar glyphs) the first time, and afterwards only what changed. The
  restore it returns stays the first write's. The shell's `usePhoneEdges`
  calls it; the page entry is
  `pages/P001-shell/changes/2026-11-19-phone-edges-once.md`.

### Why

- F-23 (audit 2026-11-19, verify after merge): rewriting the same edges on
  every page change restyled the whole document inside the section switch.

### Verification

- `lib/__tests__/phone-edges.test.ts`. No visible change, so no screenshots.
