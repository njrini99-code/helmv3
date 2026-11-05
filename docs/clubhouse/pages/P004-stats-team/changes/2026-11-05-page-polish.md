# 2026-11-05 — P004

## 2026-11-05 — Team trend uses its width; the tight head

```text
Design package: none
PR/commit:      agent/clubhouse-parity-stats-calendar
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

The team trend and the four leg cards no longer list weeks at either end that nobody has a value in on the chosen lens. Weeks come from every round in the window (stats-team.ts `weekKeys`) and strokes gained only from rounds with shots, so a newer round without hole data left an empty stretch and a cliff in the plot. When such a week is dropped from Strokes gained at the newer end, the note says "Newer rounds have no shot data, so the line stops at Jul 6." Scoring keeps its weeks. No figure changes.

The page's desktop head is the tight head (`data-canopy-head="tight"`, approved by the owner for Roster in P003-A3 and Recruiting in P014 #5): no double rule above the title, and 20px less space over it. The skeleton matches. The in-tree Coach Home handoff draws no rule above its title (`.h3-head`, design/handoff/Coach - Home.html).
