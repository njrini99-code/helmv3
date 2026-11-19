# 2026-11-16 — P002

## 2026-11-16 — Home's desktop head sits under the bar like every page's

```text
Design package: none
PR/commit:      fix/home-desk-top-bar
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

The owner saw the player's Home in production and said the top bar looked
squashed. On a desk, Home alone kept the full head: a double rule 38px under
the bar with nothing between them, so the bar read as a tall, empty band, and
the greeting sat 44px lower than every other page's title. Home's head (the
player's, the coach's, the first run's and the loading head) is now the tight
head: no double rule above, the date just under the bar, and the greeting's top
on the same line as Calendar's, Team Hub's and Qualifiers' titles (112px at
1280 and 1440). The rule under the head stays. The phone is unchanged.
