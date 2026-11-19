# Shared Button — Changelog

## 2026-11-18 — A link button can fetch its page ahead, as list rows do

```text
Design package: none
PR/commit: agent/clubhouse-motion-fixes
Contract IDs: A13 (extended)
Actions: none
Data impact: none
Held items: none
```

### Changed

- `ui/Button.tsx`: `ahead` on a link button spreads `usePressPrefetch`: the page is
  fetched whole as the press starts, and the link is marked `data-ch-ahead`, so the
  shell's idle fetch takes it when it is among the first on screen.
- Home's round links use it: coach phone "Round recap" (`HomePhone`), "Open recap"
  on coach Latest rounds (`CoachLatest`), player Home (`PlayerHomePhone`) and the
  desktop latest round (`LatestRound`). See P002's entry.

### Why

- Clubhouse audit 2026-11-18 (P2), "round rows are not prefetched". Measured on the
  pre-fix build (WebKit, iPhone 17 Pro preset, coach, raw tap at a fixed point):
  coach Rounds list rows were already fetched ahead (idle fetch of the first rows)
  and committed 43 ms after the tap; Home's round link had no fetch ahead at all
  and committed 580 ms after the tap.

### Verification

- `ui/__tests__/button-ahead.test.tsx`.
