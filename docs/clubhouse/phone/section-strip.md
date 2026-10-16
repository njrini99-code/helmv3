# Phone design: Section strip (navigation without a tab bar)

Status: approved by the owner on 2026-10-12, from an interactive prototype (no
owner board). It replaces the
floating tab bar and the More sheet's navigation rows (D-40, D-41) on the phone.
Desktop keeps the sidebar.

## What it is

- **Nothing at the bottom of the screen.** The page runs to the bottom edge. The
  Resume round accessory and a page's
  thumb dock (`PhoneDock`, `ThumbDock`) stay and sit on the bottom safe area.
- **The section name is the switcher.** On a section's own page the top bar's
  title is a button with a small chevron:
  "Roster ⌄". The green Home bar shows "Home ⌄" beside the team mark. The
  bar's title shows on every section page, also where the page draws its own
  large title ("Team stats"), which is the page's heading and opens nothing
  (owner, 2026-10-16: on Stats the switcher seemed gone while the large title
  was in view).
- **The strip.** Tapping the title slides a row of pills out from under the top
  bar: every section the role has,
  in the sidebar's order with the old tabs first, then Settings, then the
  account pill (who you are; it opens the
  account sheet with the team switch, Help and Sign out). The current section is
  centred and filled green. The row
  scrolls sideways to find a section; pills snap. Counts sit on their pill, and
  the closed title carries a dot while
  another section has something new. The page behind does not dim; a tap
  outside, Esc, or tapping the title again
  closes it.
- **Gestures on the top bar (section pages only, never on a pushed page):**
  - pull the bar down to draw the strip out under the finger, release past half
    (or flick) to open;
  - swipe the bar sideways to step to the next or previous section. The title
    follows the finger with resistance,
    commits past 56pt or on a flick, and springs back otherwise. No wrap at
    either end. Swipes that start within
    20pt of the left edge are left to the iOS back gesture.

## Motion (D-64)

- The strip rides the smooth spring (base, no bounce) out from under the bar,
  and reverses from wherever it is when
  tapped again or dragged back. Its pills fade with it as one group: no stagger.
- The green plate glides between pills on the settle spring (`layoutId`).
- The title's chevron turns with the strip. A new section's title enters from
  the side it came from on the settle
  spring; the old one leaves the other way on the quick tween.
- Reduced motion and Animations off: everything swaps at once.

## Haptics (D-70)

`select` when the section changes (a pill, a committed swipe). Opening, closing
and scrolling the strip are silent.

## Accessibility

The title is a button with `aria-expanded` and `aria-controls="ch-strip"`. The
strip is `<nav aria-label="Sections">`
of links, the current one `aria-current="page"`. Closed, it is hidden and inert.
Esc closes it and focus returns to
the title.

## Back links

Sections that used to open from More are now roots: their bars show the
switcher, not "‹ More". Pages below a section
still push and go back to it.
