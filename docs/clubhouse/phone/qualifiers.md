# Phone design: Qualifiers

Status: owner design, mapping open. The design is `design/handoff/mobile/Qualifiers Mobile.html`, `qual-mobile.jsx` and `qual-mobile.css`, and it shares `qual-core.jsx`, `qual-data.js` and `qual.css` with desktop. Under D-22 the owner's design is the phone spec. This mapping stays open until Q-5, Q-15, Q-16 and Q-20 are answered, so the `phone-spec` gate is `doing`.

The boards are drawn at 402 × 874, an iPhone 16 Pro inside a Safari frame. They were rendered on 2026-09-29 at 390 × 844 without the bezel (`qualifiers-01..11`) and as drawn (`qualifiers-01..05-*-frame`); the captures are not committed. Every board is the coach's view, and there is no player phone design (Q-5).

Only the second half of `qual-mobile.css` renders: the ivory top bar and the white hero. The first half (a green top bar, a green hero with `dl` figures, `.qm-row`, `.qm-chip`, `.qm-toast`, `.qm-entry`) is overridden or unused. Build from what renders.

## Foundation pieces this design shows

MOBILE.md builds the foundation (tab bar, top bar, sheets) before any page's phone version. That foundation has no approved design yet. This design draws parts of it:

| Piece | What the design draws | Foundation today (`phone/foundation.md`, D-3) |
| --- | --- | --- |
| Top bar | A 44px row under a 54px status-bar inset, on ivory glass (`rgb(247 245 239 / .9)`) with a hairline. The list has a left-aligned 17px title. Pushed screens have a green back link ("Qualifiers"), a centred title and the bell with its count. The form has Cancel on the left and Create on the right. The page's own H1 sits in the content below the bar. | Draft: a large title that collapses into the bar on scroll, with at most one trailing action. The design shows no large title in the bar and no collapse. |
| Bottom tab bar | Ivory glass with a blur. Five tabs: Home, Helm, Rounds, Stats, More. The active tab has green-700 icon and label, with no chip. Rounds is active while in Qualifiers. It is hidden on the create form. | D-3 (approved): Augusta green with a raised ivory chip on the active tab. Draft tabs for coaches: Home, Calendar, Messages, Roster, More; for players: Home, Calendar, Messages, My stats, More. This conflicts (Q-16). |
| Bottom sheet | Scrim `rgb(20 18 12 / .34)`, 22px top radius, `dp-sheet` paper, a 38 × 5 grab handle, a title and subtitle, a 32px round close button, a scrolling body, and a footer with two buttons padded above the home indicator. Maximum height 82%. Tapping the scrim closes it. | Draft: sheets with a grab handle and drag to dismiss. This is the first drawn sheet. Drag to dismiss isn't drawn but follows MOBILE.md. |
| Segmented control | Round chips in a `dp-well` with `dp-chip` raised selection, 34px high. | Clubhouse has `Segmented`. |
| Browser chrome | A Safari address bar (`golfhelm.app`) and toolbar under the tab bar. | Not a foundation piece. The app is the Capacitor shell with no browser chrome, loading `helmsportslabs.com` (Q-16). |

Not shown: the More sheet, pull to refresh, the push soft ask, the keyboard, swipe-back, toasts on phone. Toasts are styled in the CSS (`.qm-toast`) but never rendered.

## Screens

| Board | Screen | Maps to |
| --- | --- | --- |
| 01 | List | The desktop list components, with phone CSS under `@media (max-width: 820px)`. |
| 02 | Detail, live | A phone detail component beside the desktop one, chosen with `useChPhone()`. The structure differs: one column, three facts, stacked leaderboard cards. |
| 03 | Player rounds | A new `PlayerRoundsSheet` (phone). Desktop shows the same data by opening the leaderboard row. |
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
- Out and In nine tables: hole, Par, and Score through `ScoreMark` (`src/clubhouse/ui/ScoreMark.tsx`, already built), with nine totals.
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

These fall short of 44px:
- the sheet's close button (32px);
- the round chips (34px);
- the pills (36px).

Each keeps its drawn size and gets a 44px hit area. The top bar buttons, the tabs (46px) and the player rows (56px) already meet it.

## Doctrine and data on phone

The desktop questions also apply on phone: Q-7 to Q-14, the Live pulse (Q-17) and raw colours (Q-18).

Raw colours in `qual-mobile.css` that need tokens:
- `#1C1B18` → `--ch-ink-900`
- `#F4F1E8` → ivory
- `#F4F2EA` (sheet footer) → ivory-100
- `rgb(20 18 12 / .34)` → a scrim token
- the Safari greys → dropped with the Safari frame
