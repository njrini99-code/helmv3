# 2026-11-04 — Empty states, avatars and skeletons

## 2026-11-04 — One empty state, coins that hold their initials, skeletons you can see

```text
Design package: design-refresh/DESIGN_LANGUAGE.md section 9
PR/commit:      agent/clubhouse-redesign-followups
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

Every shared empty state now draws one anatomy: centred, inside the card that
would have held the data. Rings and rules under an empty are no longer drawn,
because they read as a page stuck loading. Lane rules on a name cell (`.c span`,
`.pat span`) no longer reach `ui/Avatar`, which had set initials to 14px in a
24px coin and broken their centring; the coin's tracking is gone for the same
reason. Skeleton inks are darker in both themes. A cold load draws Home's
skeleton on Home only, and the neutral frame paints the system canvas instead of
the green page. Home's desktop week says when it is empty, the phone no longer
says it twice, Messages has one empty state and one New message on desktop, a
player with no rounds draws no form bars, and a tournament with no holes says so
instead of "0 holes".
