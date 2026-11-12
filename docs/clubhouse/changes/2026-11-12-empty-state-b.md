# 2026-11-12 — every empty state reads as Tournaments' first run (W19 B)

## 2026-11-12 — One empty-state anatomy: a page's is a roomy card with Tournaments' medallion

```text
Design package: none (owner decision W19/Q3, 12 Nov 2026: direction B, "a moment"; shots/proto-w19/w19-compare.png)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new; CH-7309 reworded in the catalog
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `ui/States.tsx`: every `EmptyState size="page"` that is not a failure is one anatomy, the honest states' card
  (`.ch-es--page`), whether or not it passes a `shape` or `kind`. It used to fork: a page empty without a shape drew
  the route error's medallion (`.ch-empty-page`), one with a shape drew a smaller card. Tournaments' first run, Live,
  History, Stats' empty window and the rest now draw the same card as Roster, Recruiting and Team Hub.
- The card (ui.css): at the page's measure, with Tournaments' first run as the reference, which reads exactly as
  before. Tournaments' medallion (the green-800 tile on faint rings, 148px, 120 on a phone), its 28 strong title (22 on
  a phone) and 15 sentence at 42ch, 12px apart in 460px, its air (40/24 in the card, 72/88 under the Ledger's head on
  a desk, 52/24/40 on a phone). shell.css draws the medallion and the type for the route error and every page empty
  from one rule set (`.ch-empty-page__art, .ch-es--page … .ch-es__glyph`, `.ch-empty-page__ic, .ch-es__tile`, the
  title and body pairs, the medallion colours and their dark rings). On a desk the card also holds at least 320px
  (240 on a phone) so a short empty still holds the page. Never a tall box inside another card: the room is left out
  inside a surface, a sheet or the Stats sheet's card.
- A first run keeps the glyph it is given (it was dropped before); a page's first run with none takes its layout's
  (people, rows, week, …). Sections take only their own.
- Sections stay compact in the same order (glyph, title, sentence, action); their glyph is a 28px tile tinted
  `--ch-green-50` with a `--ch-green-700` glyph (`.ch-es__glyph`, `.ch-empty__icon`): a dark 28px tile was the loudest
  thing in a light card.
- The route error's own markup is left to what it is for: a failed read (`tone="danger"`) and a dead end that keeps
  the whole canvas, now `size="canvas"` (not found, CH-1306).
- The shape under a first run stays hidden (owner, 4 Nov).
- Call sites: Practice's empty is the page's (`size="page"`, CalendarDays); Roster (Users), Recruiting (UserSearch)
  and Team Hub (Megaphone) name their glyph; Messages' first run (CH-7309) is the shared page empty, not its own
  drawing, with its copy and both actions; Recruiting's prospect-pane rows (W42) keep a 28px tinted tile at the left
  (a section's).
  Each page keeps one primary: the empty's action is primary only where the page head has none.

### Why

- The owner's preview walk (W19) found every page drawing its empty differently; Q3 picked B, "a moment", as the one.

### Verification

- `ui/__tests__/empty-state-b.test.tsx` (anatomy, glyph rules, canvas and danger keep their markup, the medallion and
  type shared with the route error, the section tile, Tournaments' air, the 320/240 room gated outside other cards). `states.test.tsx`, `LiveView.test.tsx`, `stats-team.test.tsx`
  and `pane-empty-lines.test.ts` moved to the new anatomy. WebKit contact sheet: `$H/shots/w19-b/`.
