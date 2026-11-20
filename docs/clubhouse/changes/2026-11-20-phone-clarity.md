# Clubhouse shared — Changelog

## 2026-11-20 — Phone clarity: law 1 back on the phone

```text
Design package: Nick, 20 Nov 2026, on the phone: "so frustrating to look at, continuously disorganized and no contrast screens"; "Get rid of these words, the page is way too busy"
PR/commit: agent/clubhouse-phone-clarity
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Why

- A WebKit probe on staging found text sitting straight on the page at
  393px wide, in breach of DESIGN_LANGUAGE law 1 (text lives on a
  surface):
  - Home: 111 runs.
  - Recruiting: 14.
  - Rounds: 13.
  - Calendar: 6.
- Home was flush by design: lay-01 (15 Nov) drew coach Home as Player
  Home's phone, with sections under ruled heads and "no white cards".
  Nick's call today is newer.
- Text contrast was never the problem: ink on linen measures about
  10:1. Figure and ground were: whole screens of text sat on the
  linen.

### Changed (phone only)

- **Home (P002):**
  - Every section is a card, 24 apart.
  - A section's context line sits under its title.
  - Team scoring's picker holds its three choices on one row.
- **Shell (P001):** no green scroll shade under the bar. It read as a
  muddy band over the cards; §5 bans the green-into-beige wash.
- **Rounds (P011):**
  - The season figures are a card.
  - The figures show label and value only, with no captions (Nick's
    call).
- **Recruiting (P014):** the pipeline and the prospect list are cards.
- **Practice (P017):** a day with no practice is card paper, not a well
  on the page. Today keeps its fill.

### Not done

- Desktop is unchanged; batch 2 applies law 1 there.
- Still on the page and still to move:
  - Calendar's month head.
  - Recruiting's "3 prospects" count.
  - Team Hub's two head figures.
- Checked in Playwright WebKit (W) only, not on an iPhone.
