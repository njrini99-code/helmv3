# 2026-10-28 — Team Hub visual pass

## 2026-10-28 — No rail on any post, cards at 16, one plus on every tab, the chosen tab in view

```text
Design package: none (Clubhouse visual pass 2026-10-28, area E; RUBRIC H6, H10, H17, H4,
                Team Hub checklist)
PR/commit:      visual-pass-2026-10-28
Contract IDs:   101901
Actions:        ACT-P010-UPLOAD-FILE (a second way in on the phone: the top bar's plus)
Data impact:    none
Held items:     an iPhone look at the tab strip's glide to an off-screen tab, the 44pt
                trip pager and the 4px facepile overlap; Safari's handling of
                vector-effect on the reaction glyphs is P007's
```

### Changed

- The desktop rule that hung a 2px champagne rail in the gutter of a featured
  announcement (`.ch-hb-ann.is-featured`, hub.css) is gone (H6, owner's
  2026-10-02 "no accent rails"). Nothing renders `featured` today; the lead
  post is already marked by its green plate and 34px headline, so no
  replacement mark was needed.
- Cards on 16, not 20: `.ch-hb-card`, `.ch-hb-ann` and `.ch-hb-pass` take
  `--ch-radius-card` (H17). Widget tiles were already 16.
- One plus on every tab (phone, coach): the top bar's action now draws the plus
  glyph on every tab (Travel drew a plane), and Documents gets one too, "Upload
  a document", which opens the drop zone's own file chooser. Desktop keeps the
  drop zone as Documents' primary (D6) and its labelled buttons.
- The chosen tab is scrolled into view in the phone's sideways tab strip. Tasks,
  opened from the strip's "tasks open" figure or a link, sat past the edge with
  a
  sliver of its underline showing. The first paint jumps; a later change glides.
- The tab bar speaks the shared tab tokens (tokens.css, Area A): gap
  `--ch-tab-gap`, the chosen label in `--ch-tab-ink-selected` (forest, as on the
  player profile; was primary ink), hover `--ch-tab-ink-hover`, the bar
  `--ch-tab-bar` at `--ch-tab-bar-h` (light green-600, 7.2:1 on the workspace;
  dark green-600, 7.8:1), and the dark-only bar override is gone. Unselected
  tabs
  keep the secondary ink, a step above `--ch-tab-ink`, as the Hub chose for five
  tabs that carry counts. The font stays written as the 14 medium role, which is
  the token's value, so the type-role ratchet reads it.
- Tab counts follow Text Size (`calc(11 * --ch-type-k)`, the pill grows with
  it); on the phone the pill is 20 with a 12px floor and 6px from its label.
- The trip pager's keys are 44 × 44 on the phone (were 30 wide, H10). The trip
  tile's "Itinerary" link (18px tall) gets a 44pt hit area under a finger, grown
  only on the short side, as every `.ch-btn` does.
- The trip tile's facepile overlaps by 4px, not 8, so each coin's initials are
  whole ("TM" read "T|").
- A separator never opens a wrapped line: the space before " · " and " – " in a
  trip's date, time and the Stays line is U+00A0 ("Pine Needles / · Southern"
  now
  wraps after the dot).

### Verification

- `look-feel-pass-css`: hub.css's raw longhand count fell to 46; its pin is
  lowered to match.
- `hub.test` › 101901 (the plus follows the tab, now including Upload a
  document on Documents); `hub-redesign` › A24 (separators keep the word before
  them; the test pins the new strings).
- Before: `/home/claude/vp/before/{light,dark}/{393,1280}/hub*.png`,
  `/home/claude/vp/before-states-E/`; after: `/home/claude/vp/after-E/`.
- Contrast measured (WCAG): desktop tab label ink-700 on the workspace 10.3:1
  light, 11.8:1 dark; chosen label forest 11.2:1 light, green-700 9.3:1 dark;
  underline 7.2:1 light, 7.8:1 dark; the count pill
  9.3:1 (green) and 5.2:1 (amber) light, 8.3:1 and 7.3:1 dark.
