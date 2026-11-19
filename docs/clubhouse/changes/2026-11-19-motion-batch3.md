# Clubhouse shared — Changelog

## 2026-11-19 — Motion gate truth, plate clip, WebKit desk fade, twin taps

```text
Design package: none
PR/commit: agent/clubhouse-motion-batch3
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `lib/slide-plate.ts`: every slide plate (the segmented thumb, the section
  strip's plate, Team Hub and Stats tab bars, the hole selector) glides on a
  translate, and shows the width between two options through a rounded
  `clip-path` on its trailing edge, not by animating `width` (F-29). Going
  to a narrower option the plate is widened once for the glide and given back
  its own width when the glide ends or is retargeted. Same timing and curve.
- `lib/nav-motion.ts`: `msToken` reads the unit of a duration token. WebKit
  served `--ch-dur-vt-out/in` in seconds, so the desk's Back and Forward faded
  over 0.12 ms and 0.18 ms, an instant swap (E-8).
- `lib/nav-once.ts`: the navigation hold drops a second tap only within 24 px
  of the one that started it (a double tap's twin); a tap elsewhere, a person
  changing their mind, goes through.
- `ui/PickerHost.tsx`: the phone date key's name says its placeholder too
  ("Start date, Pick a date"), so it holds what it shows (F-21).
- `styles/quick-chat.css`: the key's flag appears at once under Reduce Motion
  (F-28).
- The motion gate (`e2e/clubhouse-gate/motion.ts`) skips scroll-driven
  animations in its idle and first-paint rules (the large title's fade).

- `styles/tokens.css`: five rings named once (`--ch-ring-ink`,
  `--ch-ring-gain`, `--ch-ring-on-green`, `--ch-key-raised-ringed`,
  `--ch-ring-ledger-offset`) for the raw shadows #2586 added; the CSS
  ratchet's records are back at or under where they were.

### Why

- Clubhouse overnight audit 2026-11-19: F-21, F-28, F-29, E-8, and the gate's
  scroll-timeline false positive (28 of its 31 failures).
- Measured: motion gate 59 passed / 31 failed before, 90 / 0 after (WebKit,
  390x844). Desk Back in WebKit: the page left at opacity 0.65 at 63 ms and gone
  by 120 ms; the page come back to 0.88 at 63 ms and 1 at 180 ms.
