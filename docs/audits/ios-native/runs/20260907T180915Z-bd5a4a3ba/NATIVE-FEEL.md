# Native feel — motion, gesture, depth, loading

The earlier passes measured pixels and read screens. Neither answers the actual
question: *does it feel like an iOS app?* This pass tests the things that make
that judgement — gestures, transitions, scroll physics, materials, depth, and
what you look at while you wait.

Method: fire a gesture, then capture screenshots every 70–100ms, so the
**motion** is visible rather than just the endpoint. Contact sheets are in
`native/feel/`. Where a claim can also be checked in source, it was, and both
are cited — the two agree everywhere below.

---

## The five that matter most

### 1. There is no swipe-back gesture. At all. And no back button either.
Edge-swipe from the left on a sub-screen produces **eight identical frames** —
no drag, no peek of the previous screen, no navigation
(`native/feel/sheet-swipeback.png`). `allowsBackForwardNavigationGestures` is
set nowhere in `ios/`.

On iOS, edge-swipe-to-go-back is muscle memory; it is probably the single most
automatic gesture on the platform. Its absence is felt immediately even by
people who could not name it.

It compounds: **no sub-screen has a back button either.** Rounds & Stats,
Operations, Courses, Team Info and Settings all render a header of
*title + notification bell* and nothing else. `AGENTS.md` specifies headers as
"Standard (**nav**, title, at most one trailing action)" — the nav slot is
simply not there. So a sub-screen can be entered but only left via the bottom
tabs, which throws away where you were.

### 2. Scrolling is dead at the edges — no rubber-band, no pull-to-refresh
Dragging down at the top of the dashboard produces **seven identical frames**
(`native/feel/sheet-ptr.png`). Nothing moves. No bounce, no spinner, no
resistance.

Confirmed in source: `src/app/globals.css` sets `overscroll-behavior-y: none`
on the document and `contain` on inner scrollers. That is a deliberate choice —
and a defensible one, since it is the standard fix for a WebView where
overscroll exposes the page ground behind the app (the file's own comments
discuss exactly that leak). But the side effect is that the app loses the
single most characteristic physical behaviour of iOS scrolling.

A `PullToRefresh.tsx` component exists in the tree; it is not reachable from
the dashboard, where a user would reach for it first.

### 3. Switching tabs throws away where you were
Scroll the dashboard down to "Scoring trend", go to Stats, come back: the
dashboard is **reset to the top** (`native/feel/sheet-scrollstate.png`). Native
tab bars preserve each tab's scroll position and navigation stack; that is what
makes a tab bar feel like five apps rather than one page that keeps reloading.

Tapping the already-active tab also does nothing — no scroll-to-top, which is
the other universal iOS tab-bar behaviour. (`FairwayBottomNav.tsx` contains no
`scrollTo`.)

### 4. Every navigation shows you an empty screen first
Frame-by-frame through a tab switch (`native/feel/sheet-tabswitch.png`): the
old screen is replaced instantly — correct, tab bars *should* cut — but what
replaces it is **blank**. The header arrives, then the body stays empty cream
for roughly half a second, then content appears fully formed with no fade or
stagger.

Worse, on the Stats screen a "Showing / All rounds" control appears *after* the
main card has already rendered and **pushes it down**
(`native/feel/sheet-overscroll.png`, frames 4→5). The thing you were about to
tap moves after you have already seen it. That is textbook web layout shift, and
it is the kind of thing that never happens in a native app because the view is
laid out before it is shown.

### 5. There are no iOS materials, so there is no depth
Both bars are flat opaque fills on a phone. The top bar's blur is gated to
`md:` in `FairwayTopBar.tsx` (`md:supports-[backdrop-filter]:backdrop-blur-…`),
i.e. tablet and up only — **phones get no blur at all**. The bottom nav's own
comment records that `backdrop-blur` was deliberately removed as "cheap chrome".

iOS builds its sense of depth almost entirely from translucent materials:
content passing *under* a blurred bar tells you the bar is a layer floating
above a continuous surface. Without it, the bars read as opaque strips that
content disappears behind — which is also why F-NAVCLIP-01 (content guillotined
at the tab bar) reads as broken rather than as content scrolling under glass.
Dark mode (`native/feel/darkmode.png`) makes this plainest: flat grey cards on
near-black, no shadow, no blur, no vibrancy, no layering cue anywhere.

---

## Cold launch, measured

Frames at fixed offsets from launch (`native/feel/sheet-cold.png`):

| t | what is on screen |
|---|---|
| 0.3s | still the home screen |
| **0.8s** | **a fully black frame** |
| 1.3s – 2.8s | cream splash, small static logo, no progress |
| 3.4s | dashboard fading in, bottom nav not yet drawn |
| 4.0s | fully rendered and usable |

Two problems. The **black frame** is the window background showing through
before the web layer paints; a native launch storyboard exists precisely to
prevent that, and it should match the first screen rather than flash black.
And **~4 seconds to usable** is slow — a native app restores its previous state
close to instantly, which is why cold launch is where "this is a website" is
established before the user has touched anything.

## Loading states

The Helm tab shows a real skeleton, but it is **cream-on-cream and nearly
invisible** — at a glance the screen reads as blank rather than as loading
(`native/walkthrough/03-helm.png`).

Everywhere else there is no skeleton at all: the Stats screen renders its
header and then an **empty rounded box** until data arrives. An empty container
is not a loading state; it is indistinguishable from a screen that has finished
loading and has nothing in it.

## What is genuinely right, and should be left alone

- **Sheet drag-to-dismiss is good** (`native/feel/sheet-sheetdrag.png`). The
  sheet tracks the finger one-to-one, and the backdrop dim lightens
  progressively as it falls. That is correct iOS behaviour, done properly.
- **Sheets have grab handles** and an explicit close button.
- **Haptics are properly wired** — `@capacitor/haptics` is a real dependency and
  `src/lib/fairway/haptics.ts` maps semantic events onto impact/selection/
  notification primitives with a preference gate. NOT verifiable here: a
  simulator has no Taptic Engine, so whether they *fire* at the right moments is
  a device check.
- **Dark mode is implemented and holds up.**
- **The tab bar is role-aware** and swaps correctly between coach and player.

## Ranked, if only some of this gets done

1. **Swipe-back plus a back button in sub-screen headers.** The largest single
   gap, and the header nav slot is already specified in `AGENTS.md`.
2. **Preserve scroll position per tab**, and scroll-to-top on active-tab tap.
3. **Kill the empty-screen flash**: hold the previous view until the next is
   ready, or show a real skeleton; and lay out the filter control before the
   card so nothing shifts.
4. **Put the translucent material back on both bars on phone**, which also
   makes the nav clipping read as intended rather than broken.
5. **Fix the black launch frame**, then attack the ~4s to usable.

Items 1–3 are what people mean by "it feels like a website". Items 4–5 are what
they mean by "it doesn't feel finished".

---

# Dark mode: what it would take to look premium

Dark mode is implemented, complete, and does one important thing right already.
Every value below was sampled from the rendered screenshot
(`native/feel/darkmode.png`), not guessed.

## Measured palette

| Role | Value | Note |
|---|---|---|
| Page ground | `#101110` | near-black, faintly green-tinted |
| Card, tier 1 | `#272927` | schedule card |
| Card, tier 2 | `#2e302e` | hero card |
| Top bar | `#2b2d2b` | opaque |
| Bottom nav | `#272927` | **byte-identical to the tier-1 card** |
| Heading text | `#f1f3f2` | correctly *not* pure white |
| Link / eyebrow green | `#86d396` | lifted for dark — 7.46:1 on card |
| Button + chip fill green | `#248342` | the light-mode green, unchanged |

## Already right — keep these

- **Text is `#f1f3f2`, not `#ffffff`.** Pure white on near-black causes halation
  (the text appears to glow and vibrate). Somebody already made this call
  correctly, and it is the most commonly botched detail in dark mode.
- **The ground is `#101110`, not `#000000`.** True black is tempting on OLED but
  smears during scrolling and makes elevation impossible to express. Correct.
- **The green is lifted for text.** `#86d396` rather than the brand green is
  exactly the right instinct.

## The four changes, in order of visible effect

### 1. Cards have no border. Add a hairline. (Biggest win per line of CSS.)
A pixel scan straight across a card edge steps from `#101110` to `#2e302e` in
one jump — there is **no intermediate pixel**, so no border and no edge light.

This matters more in dark than anything else, because **shadows do not work on
dark backgrounds.** In light mode a card is separated from the page by a shadow;
remove the shadow and the card falls flat. Dark mode has no equivalent — a
shadow on near-black is invisible. Premium dark interfaces therefore replace the
shadow with a hairline: a 1px `rgba(255,255,255,0.06–0.10)` border, often
brighter on the top edge to imply a light source above.

Without it, cards read as flat patches of slightly different grey. With it, they
read as objects.

### 2. The elevation ladder is a step you cannot see
Measured separation between the two card tiers is **1.10:1** — a luminance
difference of 0.007. That is imperceptible. Page-to-card is 1.29:1, also very
low.

There is a ladder in the code, but visually there is one surface, not three.
Widen the steps so each tier is around 1.25–1.4:1 from the one below, for
example `#0E0F0E` ground → `#1A1C1A` card → `#242724` elevated. Combined with
item 1, this is what makes a dark interface feel architected rather than dim.

### 3. Chrome and content are the same colour
The bottom nav is `#272927`. The schedule card is `#272927`. Identical. The top
bar is `#2b2d2b`, a third value close enough to be indistinguishable.

So the tab bar reads as just another card that happens to be at the bottom.
Chrome should be its own surface — either darker than content, or (better, and
already filed as **F-MATERIAL-01**) a translucent material so content blurs
beneath it. Restoring the material is the single largest depth change available
in either colour scheme, and dark mode is where its absence shows most, because
there is nothing else doing the work.

### 4. Filled greens were never lifted for dark
Text greens are lifted (`#86d396`). Fills are not: the "New round" button and
the selected day chip are both `#248342`, the unmodified light-mode green,
sitting on near-black. A mid-saturation green that reads as confident on cream
reads as muddy and slightly dirty on `#101110`.

Give the brand green a dark-mode variant for fills — lighter and slightly less
saturated — the same treatment the text green already gets. This also helps
`F-CONTRAST-PLAYER-01`, since several of the failing pairs are green-on-dark.

## What this is not

None of this needs a new design system, a new component library, or a redesign.
It is four token changes: a border colour, three surface values, one chrome
surface, and a green variant. The structure underneath is sound — the dark
implementation is complete and consistent, which is the hard part and is already
done.
