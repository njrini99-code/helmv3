# Change ledger — roster_team

## 2026-08-27 — standing tier wraps instead of truncating

- SHA: 1a57943e6.
- Change: `FairwayPlayerCard`'s `standing_tier` line drops `truncate` and its
  `title` attribute; it now wraps.
- Why: at 390pt that cell is ~77px of text width while the tier phrases run
  19-25 characters ("Top quartile on your team"), so `truncate` cut inside the
  phrase and left "Top quartile…" — and the `title` tooltip that was the
  fallback does nothing on a touch device (2026-08-26 owner report).
