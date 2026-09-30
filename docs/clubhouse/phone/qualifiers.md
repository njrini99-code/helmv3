# Phone design: Qualifiers

Status: owner design, mapping open. The design is `design/handoff/mobile/Qualifiers Mobile.html`, `qual-mobile.jsx` and `qual-mobile.css`, and it shares `qual-core.jsx`, `qual-data.js` and `qual.css` with desktop. Under D-22 the owner's design is the phone spec. This mapping stays open until Q-5, Q-15, Q-16 and Q-20 are answered and the foundation spec is approved, so the `phone-spec` gate is `doing`.

The boards are drawn at 402 × 874, an iPhone 16 Pro inside a Safari frame. They were rendered on 2026-09-29 at 390 × 844 without the bezel (`qualifiers-01..11`) and as drawn (`qualifiers-01..05-*-frame`); the captures are not committed. Every board is the coach's view, and there is no player phone design (Q-5).

Only the second half of `qual-mobile.css` renders: the ivory top bar and the white hero. The first half (a green top bar, a green hero with `dl` figures, `.qm-row`, `.qm-chip`, `.qm-toast`, `.qm-entry`) is overridden or unused. Build from what renders.

## Foundation (not specified here)

The phone foundation (tab bar, top bar, More, sheets) is specified by its own spec, which the `messages-mobile` agent owns. It is built from the owner's shell, `m-shell.jsx` and `m.css` (in the Messages mobile handoff). This page sits inside that foundation and uses its pieces as they are approved there. MOBILE.md has it built before any page's phone version.

`qual-mobile.jsx` carries an older inline copy of the same shell. The pieces match by name:

| Qualifiers copy | Shell piece | Difference in the newer shell |
| --- | --- | --- |
| `Top` | `MTop` | adds a `large` title variant |
| the inline `qm-tabs` nav | `MTabs` | badge dots on tabs |
| `SafariBar` | `MSafari` | none |
| `Sheet` | `MSheet` | adds a `tall` variant |
| `Nine` | `MNine` | none |

The page builds on the shell's pieces rather than this copy, and nothing here overrides the foundation.

Two things are page-specific:
- **Which tab owns Qualifiers.** The boards mark Rounds active while in Qualifiers (Q-16).
- **The top bar per screen.** The list has the title "Qualifiers" and the bell. The detail has a "Qualifiers" back link and the title "Qualifier". The create form has Cancel and a trailing Create, and hides the tab bar.

The Safari chrome is prototype framing, since the app is the Capacitor shell. Toasts are styled in `qual-mobile.css` (`.qm-toast`) but never rendered, so their phone placement follows the foundation.

## Screens

| Board | Screen | Maps to |
| --- | --- | --- |
| 01 | List | The desktop list components, with phone CSS under `@media (max-width: 820px)`. |
| 02 | Detail, live | A phone detail component beside the desktop one, chosen with `useChPhone()`. The structure differs: one column, three facts, stacked leaderboard cards. |
| 03 | Player rounds | A new `PlayerRoundsSheet` (phone) on the foundation's sheet. Desktop shows the same data by opening the leaderboard row. |
| 04 | Create | The desktop form components in one column, as a pushed full-height screen. |
| 05 | Completed | Board 02 with the Completed pill and Selected badges. |

**01 List**
- Count line ("2 active · 3 concluded"), a 28px H1 ("Lineup decisions") and the subline.
- A full-width large primary "Create qualifier". Coach only.
- Pills (All, Active, Concluded, with counts), 36px high, not wrapping.
- Search.
- Hero card: status, a 21px name, dates, course · spots, the top three leaders in a soft well with "N of M rounds in", and the call to action.
- Active and Concluded sections of cards: name, status, dates, spots, call to action.
- The search is drawn but not wired in the prototype. It filters the loaded list, as on desktop.

**02 Detail**
- Status pill and dates.
- A 24px name.
- "8 entrants · course".
- An action row: "Manage selections" (secondary, full width) and "Edit" (ghost).
- Three facts: Rounds in "13/24", Spots "4+1", Deadline.
- Leaderboard. Each row is a card:
  - position, a 32px avatar, the name with its state badge, and to-par at 17px/600;
  - underneath, a soft-well grid of Rounds, Avg and Total.
- The cut lines, the unscored entrants, and a caption.
- Course per round.
- Scoring rules.
- Not on phone, compared with desktop: round-by-round, the Selections panel, and Close or Reopen (Q-20).

**03 Player rounds sheet**
- Opened by tapping a leaderboard row.
- Title: the player. Subtitle: "3 · +4 · 2 of 3 rounds".
- Round chips ("R1 · +4"). Unplayed rounds are disabled, and the latest played round is selected.
- The round's course · date and gross.
- Out and In nine tables (the shell's `MNine`): hole, Par, and Score through `ScoreMark` (`src/clubhouse/ui/ScoreMark.tsx`, already built), with nine totals.
- Footer: Message (`/messages` through `rebuiltHref`) and Stats (`/stats?player=`).
- Rounds without hole rows need an empty line ("No hole-by-hole card for this round"). That is 14 of 215 live qualifier rounds, and 19 are not 18 holes.

**04 Create**
- Sections: Basics; Schedule (start and end side by side, then the deadline); Course and rules (rounds and course side by side, then the one-round acknowledgement); Travel squad (squad and picks side by side, with the readout); Players (56px rows with a checkbox, avatar, name and year).
- Cancel and Create sit in the top bar, so the keyboard never covers the submit.
- The board's caption says "Same fields as the web form". The phone form has no scoring rules field, no help text and no error states (Q-20).

**05 Completed**
- As 02, with "Selected" badges in the leaderboard.
- The confirmed squad list and the pick reasoning are not shown (Q-20).

## Gestures and haptics

| Gesture | Where | Haptic (`src/clubhouse/lib/haptics.ts`) |
| --- | --- | --- |
| Tap a pill | List filter | select |
| Tap Create qualifier, Create | List, form top bar | press, then success or error on the result |
| Tap a hero or card | List | none. The detail pushes with the 220ms slide |
| Tap a leaderboard row | Detail | select. The sheet rises in 360ms |
| Tap a round chip | Player sheet | select |
| Drag the sheet down, tap the scrim, tap close | Player sheet | none. The sheet follows the finger and dismisses past the threshold |
| Toggle a player | Form | select |
| Close or Reopen qualifier, if added (Q-20) | Detail | warning before the confirm, commit on success |
| Edge swipe back | Pushed screens | native. Blocked while the sheet is open (`NativeSwipeBackBridge`) |
| Pull to refresh | List | waits for the foundation design (not drawn) |

Reduced motion swaps the slide and the sheet rise for fades.

## Touch targets

These page controls fall short of 44px:
- the round chips (34px);
- the pills (36px).

Each keeps its drawn size and gets a 44px hit area. The player rows (56px) already meet it.

The sheet's 32px close button belongs to the foundation, so its spec settles that one.

## Doctrine and data on phone

The desktop questions also apply on phone: Q-7 to Q-14, the Live pulse (Q-17) and raw colours (Q-18).

Raw colours in `qual-mobile.css` that need tokens:
- `#1C1B18` → `--ch-ink-900`
- `#F4F1E8` → ivory

The sheet footer `#F4F2EA`, the scrim `rgb(20 18 12 / .34)` and the Safari greys belong to the shell, so the foundation spec settles them.
