# Practice drill push skeleton — Changelog

## 2026-11-16 — A drill pushes its header and a skeleton at once (MAC-04)

```text
Design package: production audit 2026-11-15 MAC-04 (P1-5), S4.1
PR/commit: claude/project-thread-10vtd2-motion-2 (#2544)
Contract IDs: D-64
Actions: none
Data impact: none
Held items: none
```

### Changed

- The drill route (`practice/drills/[drillId]`) waits as the drill page's
  own boxes instead of eight plain rows: the name and its line, Archive and
  Edit, the plan line, then the facts card. On a phone the bar ("Drill", back
  to Drills) is there from the first frame, as on the loaded page.
- `PracticeLoading` takes `page="drill"`; `PracticeDrillSkeleton` joins the
  other Practice skeletons.

### Why

- MAC-04 measured a 336 ms block (1,308 ms at 4x CPU, Chromium) before a
  drill's push could start. With the page's own skeleton the push draws its
  header in the first frame and the body streams in behind it.

### Verification

- Unit (vitest): skeleton-mirror (new drill case; the loading file imports the
  two sheets in order) and the other Practice tests.
- Not run: a browser look or a timing of tap to first frame. Owed: a W-tier
  look at 390 and 1440 against a real drill on staging, and a D-tier trace.
