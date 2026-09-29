# Phone design: Foundation (shell, navigation, sheets)

Status: draft (awaiting owner approval)

Applies below 820px and in the iOS app shell (Capacitor). Every screen spec below builds on this.

## Frame
- No sidebar and no canvas card: the page is edge to edge on ivory (`--ch-bg-page`), with safe areas respected top and bottom.
- Top bar: 48px plus the status-bar inset, glass over content. It holds the screen title (large title that collapses into the bar on scroll, iOS-style), plus at most one trailing action. Settings moves into the More sheet.
- Bottom tab bar (approved, D-3): Augusta green, five slots. Coach: Home, Calendar, Messages (badge), Roster, More. Player: Home, Calendar, Messages (badge), My stats, More. A selection haptic on change; the active tab gets the raised ivory chip.
- More sheet: a bottom sheet with a grab handle and drag to dismiss, listing the remaining destinations as 56px rows, then Settings and Sign out.

## Interaction rules
- Touch targets are at least 44px. Anything hover-only on desktop (message tools, row menus) gets a tap or long-press equivalent.
- Popovers become bottom sheets (Menu, date jump, people picker). Modals become full-height sheets with the primary action pinned above the home indicator.
- Horizontal content (tables, week grids) never scrolls the page sideways: it scrolls inside its own container, with a visible edge fade.
- Pull to refresh on list screens (Home, Roster, Messages rail, Calendar agenda), with a light haptic at the threshold.
- Toasts sit above the tab bar. The keyboard never covers the focused field or the composer.

## Motion
Same doctrine: 90, 150, 220 and 360ms on the Clubhouse ease. Screens push and pop with a 220ms slide (the native-feel transition). Sheets rise in 360ms and follow the finger when dragged. Reduced motion swaps slides for fades.

## Haptics (native in the app shell)
select for tabs, segments, chips and pickers; press for primary buttons; commit, success and error for outcomes; warning before a destructive confirm.
