# 2026-10-24 — iOS app: Reduce Transparency turns Clubhouse's glass solid

## 2026-10-24 — The native half of the bridge (C4)

```text
Design package: none (Clubhouse A+ Phase 3, C4, rows 51 and 92)
PR/commit:      agent/aplus-phase3
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     an Xcode build, an App Store build and a device check
```

### Changed

- `GolfBridgeViewController.swift` mirrors `UIAccessibility
  .isReduceTransparencyEnabled` onto the page as
  `html[data-reduce-transparency]`: a document-start script for every load,
  and live when the setting changes. The web half (tokens and the five
  surfaces that hard-coded their blur) shipped on #2361.
- The swipe flag's script swap is now one helper, `replaceUserScript`, so the
  two flag scripts never remove each other.

### Verification

- `reduce-transparency-bridge.test.ts` pins the Swift and the tokens to one
  attribute; `swiftc -parse` is clean. Owed: an Xcode build and an iPhone with
  Reduce Transparency on and off.
