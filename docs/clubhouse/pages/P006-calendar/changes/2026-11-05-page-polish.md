# 2026-11-05 — P006

## 2026-11-05 — Week view bars and shading

```text
Design package: none
PR/commit:      agent/clubhouse-parity-stats-calendar
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

A run (a timed event over several days, so in the all-day lane) that covers one
week column, such as its first day on the week's last column, shows its name and
not its times: the time took the room and left "8:00 AM S". The day view's wide
column and bars over two or more columns keep them.

The grid's washes are quieter, because they stack on today's column: today's
tint 2.5% to 1.5%, gone time 3.5% to 2%, night 5.5% to 3% (dark night 18% to
10%, dark today 4% to 2.5%).

The page's desktop head is the tight head (`data-canopy-head="tight"`, approved
by the owner for Roster in P003-A3 and Recruiting in P014 #5): no double rule
above the title, and 20px less space over it. The skeleton matches. The in-tree
Coach Home handoff draws no rule above its title (`.h3-head`,
design/handoff/Coach - Home.html). The skeleton's held masthead height goes from
136px to 116px by the same 20px (arithmetic, not yet measured in WebKit).
