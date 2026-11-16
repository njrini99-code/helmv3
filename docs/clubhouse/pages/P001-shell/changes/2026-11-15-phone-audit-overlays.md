# 2026-11-15 — shell

## 2026-11-15 — The account sheet, the Bell, the skip link and the dock

```text
Design package: none (production audit 2026-11-15, CLUBHOUSE-PROD-AUDIT-FINAL.md)
PR/commit:      claude/project-thread-7ygzj3 (QUEUE pa-ovl-01 to pa-ovl-12)
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- The account sheet is the shared Modal (native dialog, shared grab, drag and
  scrim); when its opener has gone inert, focus returns to the section title
  (OVL-12).
- The old Ask key and its sheet (`AskSheetBody.tsx`) are retired with their CSS
  (OVL-19).
- The Bell drop drags with the shared sheet drag (new `up` direction) instead of
  its own.
- The phone top bar and Ask pin to the visual viewport while the keyboard is up
  (`PhoneScreen.tsx` `useSafariKeyboardFit` scope `shell`; ASK-P-01, MAC-06).
- Light status bar glyphs over the green phone bar (CHROME-P-01).
- The skip link sits in a `nav` of its own and the phone dock is a labelled
  region, so no control is outside a landmark (MAC-20).
- The section switcher's "something new" badge is the button's description, not
  part of the heading (PMAC-13).
- The team switch popover and the palette open and leave as every menu does
  (`chMenuMotion`).
- The quick chat uses the one shared online hook.

### Why

- The 15 Nov production audit: phone layout, overlays and names that disagreed
  with the screen.

### Verification

- `shell/__tests__/identity-menu.test.tsx`, `__tests__/motion-physics.test.tsx`,
  `__tests__/skip-link-css.test.ts`, `__tests__/shell-dock.test.tsx` (jsdom).
- A real-iPhone pass (tier D) is still owed.
