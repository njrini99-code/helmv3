# 2026-11-05 — Redesign follow-ups: flags off, contrast, motion, numbers, pins, Stats

## 2026-11-05 — What the train changed with flags off, and what its lanes got wrong

```text
Design package: design-refresh/START_HERE.md (flag off renders as main; shared values)
PR/commit:      agent/clubhouse-redesign-followups
Contract IDs:   none new
Actions:        none new
Data impact:    none (reads only)
Held items:     none
```

Flags off: Messages file chips no longer rise on each keystroke, and CoachHelm Team shows the off notice instead of "Add your players". Contrast: text and icons move off dark `--ch-accent` to `--ch-green-600`. Motion: Stats figures no longer fade in on load, and coach Home's strokes gained bars respect Reduce Motion. Numbers: player Home applies `countsForScoring` behind the Stats flag, Recent rounds and "All N" list every round, the track record tick reads tenths correctly, and Quick chat's week uses the team's time zone. Pins: the device import waits for the inbox and runs once. Stats content the train dropped returns on the redesigned surfaces: the figure gauge, the team comparison, the score trend's words, early tags and the team trend.

No screenshots in this entry: these changes were made without a browser and are checked in the final WebKit pass.

Depth (owner, 5 Nov: "I just want more depth"): the redesign's cards move to `--ch-elevation-lifted`, a firmer edge and a longer cast than `--ch-elevation-reading`, in both themes. This goes past DESIGN_LANGUAGE's two-layer shadow on the owner's call. Roster's leader cards take nearly the card's fill with a year ring, because the drawn 11% tint matched the page's tone.

Avatars (owner, 5 Nov: "Avatar colors are supposed to be calm neutral"): `ui/Avatar` no longer draws a year colour, which reverses DESIGN_LANGUAGE's class-year coins; the year stays in its chip and the class bar. Leader cards (owner, same day) centre their text and carry the player's last-five bars.
