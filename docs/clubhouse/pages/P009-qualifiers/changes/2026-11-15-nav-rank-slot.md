# P009 — Changelog

## 2026-11-15 — A push into a qualifier starts no view transition

```text
Design package: MOTION-AND-VISUAL.md section 3.3 (owner, 15 Nov 2026); production audit 2026-11-15 S4.8, MAC-04; queue pa-mot-02
PR/commit: claude/project-thread-10vtd2 (worker E1, nav)
Contract IDs: P009-B1
Actions: none
Data impact: none
Held items: none
```

### Changed

- `screens/qualifiers/RankSlot.tsx` (new): each leaderboard row's slide boundary (P009-B1) mounts from an effect after the board lands (`useRankSlideArmed`), not with it. `QualifierDetailPhone.tsx` and `QualifierDetail.tsx` use it in place of their inline `<ViewTransition>`. The slide on a refresh that re-ranks is unchanged.

### Why

- React 19.3 starts a document view transition, and snapshots the whole page, whenever a `<ViewTransition>` mounts in a transition commit, whatever its `enter` class (react-dom `trackEnterViewTransitions`). A navigation and a streamed page's reveal are both transitions, so every push into a qualifier started one over the live push.

### Verification

- Unit: `screens/qualifiers/__tests__/rank-slot.test.tsx`: a raw row boundary mounted in a transition calls `document.startViewTransition` (the control); the board mounted in a transition calls it zero times; once armed, a re-ranking refresh still starts the slide. W and D checks of the push are owed.
