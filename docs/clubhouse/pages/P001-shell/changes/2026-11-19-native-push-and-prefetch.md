# P001 Shell — Changelog

## 2026-11-19 — Pushes take no stray taps, start sooner and carry their figure

```text
Design package: none
PR/commit: agent/clubhouse-native-polish
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/shell.css`: the page a push or a pop brings in takes no taps until it lands (`data-ch-arriving`, E-2); the shared figure waits hidden while its ghost flies (`data-ch-sharing`, E-6); the desk's Back and Forward fade a copy of the page left (`.ch-frame-fading`, E-8).
- `shell/use-prefetch-tabs.ts`: every push link on the page is fetched whole as the pointer goes down, not only marked rows, and the page's first rows teach Next their route shape as it paints (one default prefetch per shape), so a quick tap commits at once (E-1).
- `shell/SectionStrip.tsx`: Tournaments is fetched ahead with the other sections; the strip no longer filters the switch's sections again without the features (E-3).
- `shell/Bell.tsx`: a notification row pushes through `usePushOnce`.

### Why

- Audit 2026-11-19 F-02, F-03 and F-15; enhancements E-1, E-2, E-3, E-6 and E-8.

### Verification

- `lib/__tests__/grab-push.test.ts`, `shell/__tests__/press-any-push.test.tsx`, `shell/__tests__/warm-sections.test.tsx`.
- `npm run clubhouse:check`. WebKit before and after numbers are in the PR body.
