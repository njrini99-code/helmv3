# P013 — CoachHelm: change

## 2026-10-22 — Game profile folds into Standing; Ask links a player's reads

```text
Design package: clubhouse-coachhelm-design-call.md (Nav: "Game profile
                folds into Standing"); chs-37, chs-39
PR/commit:      see git log (claude/coachhelm-standing-ask)
Contract IDs:   130760 CH-13913, 130761 CH-13914, 130762 CH-13915 (new);
                CH-13260, CH-13360, CH-13361, CH-13860, CH-13930
                reworded; CH-13261, CH-13460 retired
Actions:        none (read only)
Data impact:    none written; Standing also reads the genome (loadGenome),
                the Game profile's insight read is gone, and an Ask
                answer's reads link only for a player on the coach's roster
Held items:     none
```

### Changed

- Player strip: Board, Standing, Deep dive (was Board, Game profile,
  Standing, Deep dive). Coach strip: Deep dive, Standing.
- Standing ends with "How you play" ("How Jonah plays" for a coach): the
  persona's sentence, the window, then the measures Standing has no row
  for. Scrambling, par 3s and pressure stay Standing's own rows.
- `?view=profile` and `view=profile&player=` open Standing at that section,
  once, with no redirect.
- An Ask answer that names a player's reads lists them, each opening that
  player's Deep dive on the read; a player not on the coach's team gets
  the same rows with no link.

### Why

- The Game profile repeated the Board's reads and three of Standing's rows;
  the design call folds it into Standing. Coach and player stay at parity.
- A coach reading an Ask answer can open the read it drew on in one tap.

### Verification

- vitest (src/clubhouse, 303 files), tsgo, eslint, clubhouse:check.
- 390x844 light and dark captures in the PR.
