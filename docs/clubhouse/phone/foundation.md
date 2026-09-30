# Phone design: Foundation (shell, navigation, sheets)

Status: approved (owner design, design/handoff/mobile/m-shell.jsx, m.css)

The owner's phone shell: `m-shell.jsx` (`MApp`, `MTop`, `MTabs`, `MSheet`, `MSafari`) with `m.css` and
the `qm-*` rules in `qual-mobile.css`, all from the design project (commit 1fd55a79c; `m.css` refreshed
in ccbd33465). So far the shell is drawn only inside the Messages boards (`Messages Mobile.html`), so
this file covers what those boards show. Anything the drawing doesn't show is marked as coming from
`MOBILE.md` or from the desktop behaviour.

Where the design disagrees with D-3 or the old draft of this file, the disagreement is listed at the
end and sent to the owner as Q-40 to Q-47 in `PROGRESS.md`. **None of them is decided here.** Until the
owner answers, the tab bar keeps D-3.

It applies below 820px and in the iOS app: iPhone only, portrait, light theme (D-22). The frames are
drawn at 402 × 874, the `IOSDevice` default. They were captured at 390 × 844, and no rule in the shell
depends on the width.

## Design versus device chrome

- `MSafari`, the address pill and toolbar under every board, is Safari's own chrome and not app UI.
  The iOS app has no such bar (Q-44).
- `ios-frame.jsx` draws three device parts that the app doesn't draw either: the status bar, the
  Dynamic Island and the home indicator. In the design, the status bar's space is the top bar's
  54px top padding.

## App frame (`MApp`, `.qm`)

- The frame is one column: the top bar, one scroll region (`.qm-scroll`), the tab bar on tab-level
  screens, and a layer for sheets. The page background is `--ch-bg-page`. Only the scroll region
  scrolls.
- The scroll region is padded 14px at the top and sides and 24px at the bottom, with 12px between
  blocks. The tab bar sits in the column below the content, not over it, so nothing scrolls under it.
- Section heading (`.qm-sec`): 600 14px, with an 8px top margin.
- Panel (`.qm-panel`):
  - surface, radius 16, `--ch-shadow-sm`
  - header (`.qm-panel__h`): 600 15.5px, padded 14/16/8, with an optional trailing link (500 13px, `--ch-green-700`)
- Row (`.m-row`): at least 60px tall, padded 8/16, with a hairline above. A row that is a button tints
  to `--ch-bg-hover` while pressed.
- A caption or empty line (`.qm-empty`) uses `--ch-type-caption` in `--ch-text-tertiary`.
- Avatars are always one calm neutral on the phone (`.qm .fw-avatar`, added in ccbd33465): background
  #E9E3D3, initials #5A4E36, ring `rgb(90 78 54 / .22)`. Clubhouse's `Avatar` has five tones (Q-45).

## Top bar (`MTop`, `.qm-top`)

`qual-mobile.css` has two `.qm-top` rules, and the later one wins. The earlier rule is a dark-green
bar that never renders. The rendered bar:

- ivory at 90% (`rgb(247 245 239 / .9)`), with a hairline below
- padded 54/8/6/16, where the 54px is the status bar in the frame and is
  `env(safe-area-inset-top)` in the app
- at least 44px tall
- no blur

| Variant | Left | Centre | Right | Drawn on |
| --- | --- | --- | --- | --- |
| Tab root | Screen title, 600 17px, left-aligned | — | Notifications bell: a 44px icon button with a count badge (16px, `--ch-green-600`, white 600 10px) | Not drawn on these boards; it is `MTop`'s default |
| Pushed | Back link: chevron-left 20 plus the parent screen's name, 500 16px `--ch-green-700`, 44px tall | Title, 600 16px, centred | One action, or nothing: a 44px icon button in `--ch-text-secondary`, or a text action (600 16px `--ch-green-700`; `.is-off` is `--ch-text-tertiary` and inert) | Messages inbox ("‹ More", compose); Details ("‹ Chat", Edit); New message ("Cancel", "Next" or "Create group") |
| Conversation | Chevron only | Avatar or group mark with the title (600 15px) and a subline (12px, tertiary). Left-aligned, and the whole block opens Details | Info button | A thread |

- None of the Messages boards has a large title. The `.m-top--lg` class exists but is unused.
- The phone bar has no Settings gear and no breadcrumbs, although the desktop `TopBar` has both
  (Q-43).
- The bell is the desktop `Bell`: same feed, same actions (D-17).

## Tab bar (`MTabs`, `.qm-tabs`)

- Five equal columns. The design draws one set: Home (`house`), Helm (`sparkles`), Rounds (`flag`),
  Stats (`chart-column`), More (`layout-grid`).
  - The boards show a head coach's account, and no player tab bar is drawn.
  - Helm is CoachHelm. Neither CoachHelm nor Rounds is rebuilt (Q-40).
- Surface:
  - ivory at 92% (`rgb(253 252 248 / .92)`) under a 34px blur, saturate 170%
  - a hairline on top
  - padded 6/6/4
- Tab:
  - at least 46px tall
  - a 21px icon over a 500 10.5px label, 3px apart
  - inactive: `--ch-text-tertiary`
  - active: icon and label in `--ch-green-700`, with no chip and no change of weight (Q-41)
- Badge (`.m-tabdot`): at least 15px wide, radius 8, `--ch-green-600`, white 600 9.5px, offset −4px
  from the top and −9px from the right. It is drawn only on More, as 3 (Q-42).
- The bar shows on tab-level screens, including the Messages inbox. It is hidden on New message, on a
  thread and on Details.
- In the drawing the bar sits on Safari's toolbar. In the app it pads by
  `env(safe-area-inset-bottom)`, which is 34px on Face ID iPhones. Capture 90 shows that (Q-44).
- Haptic: `select` on a change of tab, never on the tab already open (as built).

## More

- The Messages inbox has a "‹ More" back link, and the More tab is active under it. So More is a
  screen, the root of its own tab, and Messages is pushed from it. Today More is a sheet (CH-1802),
  and the old draft also made it a sheet (Q-43).
- `m.css` styles two parts of that screen:
  - `.m-me`, a profile card: surface, radius 16, `--ch-shadow-sm`, a 15px name over a caption
  - `.m-more`, rows at least 54px tall with a 32px icon tile (radius 9, `--ch-bg-subtle`) and a 500
    label
- No board draws the More screen itself, so its contents and order are not specified (Q-43).

## Sheets (`MSheet`)

`MSheet` is specified in the shell, but no Messages board uses it, so there is no sheet state to
capture.

| Part | Spec |
| --- | --- |
| Scrim | `rgb(20 18 12 / .34)`, over the whole app. A tap closes the sheet |
| Sheet | Full width, at most 82% tall (the tall variant is exactly 82%). `--ch-sheet-bg`, radius 22 at the top, shadow `0 -10px 40px rgb(0 0 0 / .18)`. `role="dialog"`, labelled by its title |
| Grab | 38 × 5, radius 5, `rgb(28 25 18 / .18)`, 8px from the top |
| Header | Title 600 18px, and an optional caption subline with tabular numbers. Close: a 32px circle on `rgb(28 25 18 / .06)`, with a 44px hit area |
| Body | Scrolls. Padded 0/16/8, with 10px gaps |
| Footer | A hairline above, on `--ch-ivory-100`, padded 12/16/34. The 34px is the home indicator, which is `env(safe-area-inset-bottom)` in the app |

The prototype is static. From `MOBILE.md`:

- a sheet rises in 360ms and follows the finger
- dragging it down dismisses it
- reduced motion fades it instead
- the swipe-back guard stays off while it is open (`data-state="open"`, as built)

## Safe areas and the keyboard

- Top: `env(safe-area-inset-top)` replaces the drawn 54px.
- Bottom: three things pad by `env(safe-area-inset-bottom)`:
  - the tab bar
  - a composer on a screen without a tab bar
  - a sheet footer

  The drawn 30px and 34px come from Safari and the device frame.
- Keyboard: no board draws it. `ios-frame.jsx` has an `IOSKeyboard`, but no board passes
  `keyboard`. From `MOBILE.md`:
  - anything pinned to the bottom (a composer, a sheet footer) lifts by `var(--keyboard-height)`
    and carries `data-fw-keyboard-aware`
  - every drawn composer is on a screen without a tab bar, so the bar never rides the keyboard

## Gestures and haptics

The prototype responds to clicks only. The drawing shows none of these gestures; each comes from
`MOBILE.md` and `src/clubhouse/lib/haptics.ts`.

| Gesture | Where | Haptic |
| --- | --- | --- |
| Tap a tab | Tab bar | `select`, never on the tab already open |
| Tap a row that pushes a screen | Lists | `select`, as desktop does for opening a conversation (CH-7703) |
| Back link, or an edge swipe back | Pushed screens | None. The edge swipe is blocked while a sheet or dialog is open |
| Chip or segmented choice | Filters | `select` |
| Switch | Settings rows | `select` |
| Primary action (Send, Next, Create group) | Top bar, composer | `press`, then `commit` or `error` for the outcome |
| Drag a sheet down past the threshold | Sheets | `press`, as the More sheet does today |
| Long press | A message bubble (Messages) | `press` when the menu opens |
| Destructive confirm | Leave group, Delete message | `warning` on the destructive button, then `commit` |
| Pull to refresh | Lists | Light, at the threshold. Still waits for a drawing (Q-47) |

## Motion

- Screens push and pop with a 220ms slide, and sheets rise in 360ms. Both use the Clubhouse ease
  (`MOBILE.md`).
- Press scales to 0.985. The design also tints list rows to `--ch-bg-hover` while pressed, so rows do
  both.
- Reduced motion swaps slides and sheet rises for fades.

## Touch targets

The design draws some controls smaller than 44px:

- filter chips, 34 or 36px
- To-field tokens, 28px
- the send button, 34px
- the sheet close, 32px

Each keeps its drawn size and gets a 44px hit area, as `MOBILE.md` requires.

## Colours: raw values in the design and their tokens

| Design | Where | Token |
| --- | --- | --- |
| `var(--ivory-100, #F7F5EF)` | App background | `--ch-bg-page`. The design system's `--ivory-100` is #F4F2EA, the same as `--ch-ivory-100`; the fallback never applies |
| `rgb(247 245 239 / .9)` | Top bar | No exact token. The nearest is `--ch-glass-bg` (`rgb(250 248 241 / .7)`). The phone value goes into the design system first |
| `rgb(253 252 248 / .92)` with a 34px blur | Tab bar | `--ch-ivory-25` at 92%, with `--ch-glass-blur` (34px) |
| `rgb(253 252 248 / .94)` | Composer bar | `--ch-ivory-25` at 94% |
| `#F4F1E8` | Text and icons on green | `--ch-ivory-100` |
| `#EDF4EF` | To tokens, the active quick-action tile | `--ch-green-50` (`--ch-bg-selected`) |
| `rgb(21 90 57 / .18)` | Token edge | `--ch-green-600` at 18% |
| `#fff` | Composer field, badge text | `--ch-ivory-0` or `--ch-text-on-accent` |
| `var(--ink-200, #D9D5CB)` | Send, off | The design system has no `--ink-200`. The nearest is `--ch-ivory-300` (#DCD6C8) |
| `var(--danger-600, #B3261E)` | Leave group, Delete conversation | `--ch-danger-600` (#B03A2E), the same red as `--ch-score-under` (Q-46) |
| `rgb(28 25 18 / .05)` | Search field | No token; `--ch-bg-inset` looks the same |
| `rgb(28 25 18 / .06)`, `/ .18` | Sheet close, grab | Ink at 6% and 18%. No token |
| `rgb(20 18 12 / .34)` | Sheet scrim | The existing `.ch-scrim` (`rgb(20 20 18 / .32)`) |
| `#F4F2EA` | Sheet footer | `--ch-ivory-100` |
| `#E9E3D3`, `#5A4E36` | Phone avatar | No tokens. The nearest are `--ch-ivory-200` and `--ch-champagne-500`. They go into the design system first (Q-45) |

## Where the design contradicts D-3 or the old draft

None of these is resolved here. Each one is an owner question in `PROGRESS.md`.

1. **Tab contents (Q-40).**
   - D-3 and the build:
     - coach: Home, Calendar, Messages, Roster, More
     - player: Home, Calendar, Messages, My stats, More
   - The design: Home, Helm, Rounds, Stats, More, with no player set drawn. Helm and Rounds aren't
     rebuilt, and `rebuiltHref` hides links to screens that aren't.
2. **Tab bar style (Q-41).** D-3 is a green bar with the raised ivory pass on the active tab and a
   champagne badge, and that is what's built. The design is an ivory glass bar with green text on the
   active tab and a green badge.
3. **Where Messages lives (Q-42).** Built, and in the old draft, Messages is a tab with its own badge.
   In the design it opens from More, and the badge sits on More.
4. **More (Q-43).** Built, and in the old draft, More is a sheet with drag to dismiss. The design makes
   it a pushed stack, but doesn't draw it.
5. **Top bar (Q-43).**
   - The old draft: a 48px bar with a large title that collapses on scroll.
   - The build: breadcrumbs, the bell and Settings.
   - The design: a 44px bar with a centred title and a back link on pushed screens, and no Settings.
6. **Safari bar (Q-44).** It is drawn on every board and is not app UI.
7. **Avatars (Q-45).** Clubhouse coins have five tones. On the phone the design uses one neutral.
8. **Red for destructive actions (Q-46).** The doctrine keeps red for under par and the pin flag. The
   design colours Leave group and Delete conversation with the danger red, as desktop Clubhouse
   already does for its danger buttons.
9. **Pull to refresh and the push soft ask (Q-47).** D-22 says both wait for the foundation design.
   The design draws neither.
10. **What the old draft said that the design doesn't show:**
    - Details and New message opening as sheets. The design pushes both as screens.
    - Swipe actions on list rows.
    - A "New messages" pill in a thread.

    These aren't built unless the owner asks for them.
