# Strokes gained conventions vs Helm's SG function

Accessed 2026-09-30. "Not found" = no citeable source opened.

## A. Broadie's method
- Shot value g = J(start) - J(end) - 1, where J is the average strokes a PGA TOUR player needs from that distance and lie (tee, fairway, rough, sand, green, recovery) [1, eq. 1]. Over a hole the values sum to J(first shot) - n, since J is 0 once holed [1, eq. 2].
- Baseline: ShotLink 2003-2010, 8 million+ shots, majors excluded; piecewise polynomials, with putts from a one-putt physical model plus a three-putt curve because long-putt data is sparse [1, s.3].
- The book *Every Shot Counts* was not opened; only his site reply [2] is used.

## B. Tour categories
- Official pgatour.com descriptions are generic: Off the Tee is par 4 and 5 tee shots; Approach and Around the Green state no threshold [3].
- Secondary reports: Around the Green is any shot off the green within 30 yards of the green's edge; Approach is par-3 tee shots plus other shots beyond 30 yards [5, 6].
- Broadie: long game over 100 yards, short game under 100, putting is shots on the green "not including the fringe" [1]. Data Golf uses 50 yards from the pin for Around the Green and calls the Tour's method "more complicated" [7].
- FLAG: our 50 yards from the hole matches Data Golf, not the Tour. Par-3 tee = Approach matches.

## C. Penalties
- Broadie: an OB shot is "minus 2" because shot 3 starts from the same place [2]. No Broadie water or drop example found; equation 2 implies tee SG = E(tee) - E(drop) - 2 (my derivation).
- 18Birdies and Arccos charge the penalty to the shot that earned it [10, 11]; Golfmetrics needs only the next shot's start [12].
- Raw ShotLink has separate penalty and drop rows; one penalty row sat 20 yards out (ball in water) while the next shot started 70 yards out after the drop [9]. Supports our rule.
- Official Tour penalty documentation: not found. Nothing contradicts our rule.

## D. Next start = this shot's end
- Equation 2 requires it [1]; a re-tee ends on the tee [2]. A recovery lie shifts blame to the previous shot [1, 7, 12]. Rough-then-fairway-drop: no source.

## E. Baselines
- Data Golf baselines: men ranked 125-175; women (round-level data only) ranked 120-145 [8].
- LPGA: KPMG Performance Insights began at the 2021 Women's PGA, first full season 2022 [17, 18]; in 2021 caddies entered the data, not ShotLink [16]. ShotLink at LPGA events from 2019, and any LPGA baseline method or shot-level table: not found.
- Scaling the PGA table for women: not found as a recognised practice. Golfmetrics says female pros use the scratch benchmark [12].
- Amateurs: Broadie uses scratch-relative SG [15]; Arccos and Shot Scope describe handicap baselines built from their own shot databases [13-15]. College shot-level baseline: not found.

## F. Putting by distance
- PGA TOUR 2026 season, through Sep 27 [4]: 15-20 ft 19.72%; 20-25 ft 12.68%; 15-25 ft combined 16.69%. Earlier, season unstated: 18.3% and 12.47% [21].
- Stat 341, "Putting from 3'" ("less than 3 feet"): 99.50% [4]. Golf.com calls it 2-3 ft, 99.4% [21]. So the Tour does publish a sub-3 ft rate.
- Edge wording is "between" or "less than"; (lo, hi] is unverified. 2024 values not retrievable.
- LPGA 2022: 29.5% from 10-15 ft [19]. A 15-20 / 20-25 ft pair: not found [20]. Broadie publishes no table at these bands [1].

## G. Other qualifiers
- Published Tour SG is field-relative: the descriptions subtract the field average for the round [3]. Ours is raw against the baseline.
- Fringe: Golfmetrics records fringe shots as fairway even with a putter [12]. Tour handling of putts from off the green: not found.
- Tap-in benchmark is 1.0 [1].
- Without a recovery lie, a punch-out is blamed on itself, not the shot before [1, s.3.4].
- Missing shots: the hole total stays right but the category split can be wrong; Golfmetrics excludes picked-up holes [12]. Check every stroke lands in exactly one category so they sum to Total.
- Test-round exclusion: no public convention.

## Agree / differ / owner decision
| Item | Status |
|---|---|
| Shot formula, telescoping, holed = 0 | Agrees [1] |
| OB re-tee = -2; penalty on the earning shot; next start ends the shot | Agrees [2, 9-12]; no Tour document |
| Par-3 tee = Approach | Agrees [5, 6] |
| Around the Green within 50 yards of hole | Differs from the Tour (30 yards from edge); matches Data Golf. Owner decision |
| Penalty earned on the green mapped to Around the Green | Inconsistent: Putting is shots on the green [1, 5]. Owner decision |
| Raw vs field-adjusted SG | Differs; label "vs Tour baseline" |
| One 15-25 ft row | Official pair exists: bar about 3 points low at 15-20 ft, 4 high at 20-25 ft (our rows 2024, these 2026). Owner decision |
| No Tour 0-3 ft value | Differs: stat 341, 99.50% |
| LPGA 2024 rows | No public LPGA baseline found; verify provenance |
| Recovery and fringe lies | Verify our lie mapping |

## Sources (all accessed 2026-09-30)
1. Broadie, "Assessing Golfer Performance on the PGA TOUR", Apr 2011 preprint of Interfaces 42(2), 2012. https://columbia.edu/~mnb2/broadie/Assets/strokes_gained_pga_broadie_20110408.pdf
2. Broadie, reply on "Every Shot Counts by Mark Broadie", everyshotcounts.com (earliest comment Mar 2014). http://everyshotcounts.com/248-2/
3. PGA TOUR stat pages 02567, 02568, 02569, 02564, 02674, 02675. https://www.pgatour.com/stats/detail/02568
4. PGA TOUR stat pages 406, 407, 02328, 341. https://www.pgatour.com/stats/detail/406
5. Ballengee, "PGA Tour unveils expanded strokes gained statistics", Golf News Net, 24 May 2016. https://thegolfnewsnet.com/ryan_ballengee/2016/05/24/pga-tour-unveils-expanded-strokes-gained-statistics-18859/
6. Golf Compendium, "Yearly Strokes Gained: Approach the Green Leaders", Sep 2020. https://www.golfcompendium.com/2020/09/strokes-gained-approach-the-green-yearly-leaders.html
7. Data Golf, FAQ. https://datagolf.com/frequently-asked-questions
8. Data Golf, "Introducing our women's data and rankings" (9 Jun 2026 on page). https://datagolf.com/introducing-womens-rankings
9. Flaska, "Building a Strokes Gained Model for Golf", 14 May 2023. https://scottflaska.github.io/blog/posts/04_strokes_gained/index.html
10. 18Birdies Knowledge Base, "How do Penalties Affect Strokes Gained?", updated 11 Aug 2025. https://help.18birdies.com/article/713-how-do-penalties-affect-strokes-gained
11. Arccos, penalties guide, 8 Oct 2025. https://eu.arccosgolf.com/blogs/community/your-quick-guide-to-more-precise-arccos-insights
12. Golfmetrics, FAQ. https://golfmetrics.com/faq/
13. Shot Scope, ebook 4 "Strokes Gained" (undated PDF). https://shotscope.com/ebook/Strokes_Gained.pdf
14. Arccos, "Strokes Gained Analysis Explained", 3 Apr 2020. https://www.arccosgolf.com/blogs/community/understanding-strokes-gained
15. Arccos, "Strokes Gained Is The Future Of Improvement For Golfers", 15 Jun 2020 (quotes Broadie). https://www.arccosgolf.com/blogs/community/strokes-gained-future-improvement-golf
16. Ryan, "The LPGA Tour is set to embark on a statistical revolution", Golf Digest Middle East, 24 Jun 2021. https://golfdigestme.com/the-lpga-tour-is-set-to-embark-on-a-statistical-revolution/
17. KPMG, "Transforming performance: advanced analytics" (2023). https://kpmg.com/us/en/articles/2023/transforming-performance-advanced-analytics.html
18. KPMG, "Making history with KPMG Performance Insights". https://kpmg.com/us/en/how-we-work/client-stories/making-history-with-kpmg-performance-insights.html
19. LPGA.com, "KPMG Performance Insights: Best Insights of the 2022 LPGA Tour Season", 1 Dec 2022. https://www.lpga.com/news/2022/kpmg-performance-insights-best-insights-of-the-2022-lpga-tour-season
20. LPGA.com, "Behind the Leaderboard: Stats of the Year for the 2023 LPGA Tour Season", 28 Nov 2023. https://www.lpga.com/news/2023/behind-the-leaderboard-stats-of-the-year-for-the-2023-lpga-tour-season
21. Dethier, "Just how often do Tour pros miss short putts?", Golf.com, 31 Jul 2019. https://golf.com/instruction/putting/pga-tour-putting-make-percentages-distance/
