# 2026-11-12 — messages

## 2026-11-12 — The desktop thread spans its pane, as Messages on the Mac (W17)

```text
Design package: none (preview walk fix, PREVIEW_ISSUES.md W17, #9)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new (MSG-209 day marker size)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Desktop: the message list drops its 760 px reading-measure cap and sits on the composer's 28 px inset, so their bubbles
  start at the pane's left edge and yours end at its right. The composer pill spans the same width.
- Desktop: the hover time is in the row's flow beside the bubble (after theirs, before yours) instead of hanging past the
  row's right edge, where a wide window put it far from its message (#9).
- The day marker ("Yesterday 6:12 PM") is 13 px, one step up from 12.
- The bubble caps (520 px or 72% on desktop) are unchanged.

### Why

- Nick's walk (W17) at 1920: incoming bubbles started 270 px in from the pane edge, and the timestamps read thin.

### Verification

- `screens/messages/__tests__/thread-full-width-desktop.test.ts` pins the desktop list, composer, time and marker rules.
- Messages suites: 48 files, 474 tests, exit 0; look-feel and messages CSS tests: 7 files, 67 tests, exit 0.
- Not yet seen in WebKit at 1440 and 1920.
