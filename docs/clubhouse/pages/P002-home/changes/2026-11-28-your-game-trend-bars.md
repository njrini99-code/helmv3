# Changelog

## 2026-11-28 — Your game: each leg's trend as one bar per round against a named line

```text
Design package: none (owner direction in session: fix the trend lines first, in the real app)
PR/commit: this branch (claude/modest-goldberg-oizlpr)
Contract IDs: none changed
Actions: none
Data impact: none (reads the leg's existing trend, bench and lowerIsBetter)
Held items: a team-average reference needs a new server read and a privacy decision (player home compares to the Tour only)
```

### Changed

- Player Home, Your game: each leg's smoothed sparkline is replaced by one bar per round
  (oldest on the left) on a fixed reach per leg (`LEG_REACH`). A round that beat the
  reference stands above the line in solid green; a round that missed hangs below it
  in amber tint with a fine amber ring. Better is always up, so fewer putts stand above.
- The reference is the Tour's figure where the app has one (dashed data gilt), else the
  player's own average (zero ink), named with its figure at the line's end.
- The caption leads with the trend verdict (Improving / Slipping in gain or loss ink only
  when the newer rounds clear the older ones' spread, else "No clear change"), then
  "4 of 7 rounds beat Tour 66%".
- The separate You-vs-Tour bar under each leg is removed (the reference line carries it).
  The `.ch-ph-bench*` styles stay: coach Home's TeamGame still uses them.

### Why

- Owner: the trend lines were unreadable and had no contrast ("The trend lines sucks",
  "No contrast"). The old spark scaled to its own rounds, so noise read as drama, and its
  thin grey line on ivory carried no meaning.

### Verification

- Chromium (tier C) at 1440 and 402 on `/clubhouse-preview/home-player`; no horizontal
  overflow; before and after logged in VERIFY.md. WebKit is not installed in this
  container, so no W-tier phone pass was run.
- Related unit tests and the CSS ratchets pass; `typecheck:fast` exit 0.
