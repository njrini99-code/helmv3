# 2026-10-24 — Stats' empty figures render NoData (Clubhouse A+ S2, row 46)

## 2026-10-24 — 25 empty Stats figures read "No data" to VoiceOver (row 46)

```text
Design package: none (Clubhouse A+ row 46)
PR/commit:      agent/aplus-s2
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     string-typed values (a tile's or a table row's cells, a zone's
                Big), formatters and dashes beside their own words keep the bare
                string
```

### Changed

- Every Stats figure that renders the empty dash as a child (the leg and SG
  bars, the team rank, the phone hero and legs, the player's figures, the
  rounds table's greens and putts, the putting rates, the par tiles, the trend
  ends, Development's goal progress and more) renders `ui/NoData`: the same
  dash in tertiary ink, read aloud as "No data", not "dash".

### Why

- Row 46: an empty figure should be read as no data, in a legible ink.

### Tests

- `stats-visuals-sg.test.tsx`: a leg under its floor shows the dash to the eye
  and "No data" to a screen reader. The bare-string ratchet lives on S1's
  branch; the counts for these files are in the S2 report.
