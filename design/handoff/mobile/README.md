# Mobile designs (iPhone)

Put the iPhone designs for Clubhouse here. A page's design in this folder is
its phone spec: handing it over is the approval to build it, and it replaces
any draft in `docs/clubhouse/phone/`. How it gets built is in
`docs/clubhouse/MOBILE.md`.

## What to hand over, per page

- Screens at **390 × 844** (iPhone 14/15/16) as PNG or JPG, named
  `<page>-NN-<what>.png` in the order a person meets them, for example
  `messages-01-inbox.png`, `messages-02-thread.png`,
  `messages-03-thread-keyboard.png`. A 430-wide version is only needed where
  the layout changes at the larger size.
- Any HTML/JSX prototype and its CSS or data, named `<Page>.html` and
  `<page>.jsx` like the desktop handoff.
- The states that differ from desktop: sheets, the keyboard open, empty,
  loading and failed. Anything not drawn falls back to the desktop behaviour
  in `docs/clubhouse/catalog/<page>.md`, laid out for the phone.
- Notes for anything a picture can't show: gestures (swipe, long press, pull
  to refresh), what a tap opens, and which haptic it should feel like.

## Shared pieces

Put the tab bar, the top bar, sheets and other shared parts in a
`foundation-NN-<what>.png` set. It is built before any page, because every
page sits inside it.

The phone is portrait-only, light theme, and uses the same design system
(`design/handoff/design-system/`) and the same doctrine as desktop. A change
to the system itself goes in the design system, not here.
