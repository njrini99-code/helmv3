# Clubhouse shared — Changelog

## 2026-11-20 — The rest of batch 6, and batch 7's code (premium plan)

```text
Design package: premium plan 2026-11-19, batches 6 and 7
PR/commit: agent/clubhouse-phone-feel-b6b
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- POP-02: a pushed phone screen's first commit is its frame alone, so
  the push starts on the tap's next frames. Its content renders in the
  background (`useDeferredValue`) while the slide runs, and lands
  under it. Focus and the iOS swipe claim wait for the content.
- GES-17 done state: `Button` takes `done` (with `doneLabel`, default
  "Saved"). It shows a check and the word, said once to VoiceOver.
  `useDoneFlash()` holds it for about 900ms.
- ST-1: `ui/Truncate` is the one truncate policy. One line ends in an
  ellipsis; more lines clamp at a word. A cut text keeps its whole
  words as the accessible text and as the title.
- ST-5: anyone the team no longer lists is "Former member"
  (`lib/person-fallback.ts`), in Messages and Calendar. It replaces
  "Member" in some places and "Former player" in others.
- HL-6, A15: the native launch canvas is the Clubhouse page colour
  (#E8E3D5 by day, #111512 at night), plain, with no mark. It ships
  with the next app build (`node scripts/native-canvas.mjs`).
- HL-7: `ui/HelmMark` draws the GolfHelm mark as a vector, on the
  geometry of the 116px PNG it replaces. It is used in the phone top
  bar, the sign-in and welcome screens and onboarding. The onboarding
  watermark keeps the PNG.

### Not done

- GES-13 (the stretch while dragging) and the app's name under the
  icon (HL-5) wait on the owner.
- POP-02 still needs an iPhone timing before and after; nothing was
  measured on a device.
