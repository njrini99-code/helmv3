# R — External reference database: professionally engineered UI implementations

Research input for the Clubhouse premium redesign. Clubhouse context: React 19 / Next.js App Router,
scoped CSS with `--ch-*` custom properties (no Tailwind), Radix primitives (dialog, dropdown-menu,
popover, tabs, toggle-group, tooltip, slot), vaul, `motion` (motion/react), recharts 3 + d3-scale +
hand-drawn SVG, shipped as responsive web and an iOS Capacitor WebView. Look: ivory cards `#faf7ef` on
linen `#e8e3d5`, deep golf green accent, Instrument Sans, nothing pure white, no thick left-border
cards, light + dark.

Compiled 2026-11-27 from public sources only. No project data was sent anywhere.

## How to read this

Evidence types:

- **SOURCE**: the file was fetched and read during this research (raw GitHub, a jsDelivr mirror of the
  repo, or a shadcn-format registry JSON that ships the component source). Exact file URL given. Line
  references are to the file as fetched on 2026-11-27 and will drift.
- **DOCS**: official documentation or guidelines, read via fetch.
- **VISUAL**: publicly observable product behaviour (page text, public demos); no code inspected.
- **INFERRED**: reasoning from the above; not directly verified.

Snippets are quoted verbatim (whitespace trimmed) and kept to 15 lines or fewer. Licences were read from
each repo's LICENSE file unless marked otherwise. "Main" branch snapshots: several repos are mid-refactor
(TanStack Table `main` shows the v9 feature-based API; Radix primitives `main`), so treat code as
technique, not API reference.

Fit vocabulary: **Adopt** (take the technique as is into `--ch-*` CSS / existing deps), **Adapt**
(take the idea, re-express it in Clubhouse tokens or structure), **Avoid** (do not use, with reason).
Default stance: copy techniques, not dependencies.

### Clubhouse doctrine wins over external defaults

Where an external technique conflicts with the live Clubhouse rules (`.claude/rules/clubhouse.md`,
`design/refresh/DESIGN_LANGUAGE.md`), the Clubhouse rule wins. Known conflicts in this database:

- Motion values: use the existing `--ch-dur-*` beats (press 110, quick 180, base 260, release 280, marks 360,
  reveal 520 ms), `--ch-ease-ios` / `--ch-ease-out` and `CH_SPRING`, not the illustrative durations in §11.
- Skeletons are static (no pulse, no shimmer) behind `useBusy` (150 ms delay, 300 ms minimum); §14's Radix
  pulse is reference only.
- No count-ups and no first-paint chart draw-ins (§2 number tickers, §10 recharts animation are reference only).
- Red is for errors only; gains are green, losses amber (§2 delta chips).
- Type uses the nine Clubhouse roles and 12 size steps (§12 role names are illustrative).
- Haptics only through `src/clubhouse/lib/haptics.ts`.

---

## 1. Card / surface system

| Reference | Evidence | URL | License | Key techniques |
| --- | --- | --- | --- | --- |
| Radix Themes `BaseCard` | SOURCE | <https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/components/_internal/base-card.css> | MIT | Background on `::before` (z-index -1), border on `::after` drawn *over* children with inset box-shadow; `contain: paint` to scope the stacking context; nested radius `calc(radius - border-width)`; `--inset-padding-*` so an `<Inset>` child can bleed to the border edge |
| Radix Themes `Card` states | SOURCE | <https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/components/card.css> | MIT | Interactive only when element is `:any-link, button, label`; hover gated by `@media (hover: hover)`; `[data-state='open']` mirrors hover; `:active:not([data-state='open'])`; specificity flattened with `:where()` |
| Radix Themes shadow tokens | SOURCE | <https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/styles/tokens/shadow.css> | MIT | 5-layer shadows whose first layer is a 1px ring (`0 0 0 1px gray-a3`) so the "border" is part of elevation; `color-mix(in oklab, …)` upgrade under `@supports` |
| shadcn/ui `Card` (v4 registry) | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/card.tsx> | MIT | Compound slots identified by `data-slot`; header becomes a 2-col grid only when it *has* an action (`has-data-[slot=card-action]:grid-cols-[1fr_auto]`); header is a container (`@container/card-header`) |
| shadcn/ui `Item` | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/item.tsx> | MIT | List-row "mini card": transparent border reserved so focus/hover never shifts layout; media nudges down only when a description exists (`group-has-[[data-slot=item-description]]/item:translate-y-0.5`); hover styling only when rendered as `<a>` |
| Tremor Raw `Card` | SOURCE | <https://raw.githubusercontent.com/tremorlabs/tremor/main/src/components/Card/Card.tsx> | Apache-2.0 | `asChild` via Radix `Slot` so the card *is* the link/button (no wrapper anchor); single-purpose card with `shadow-xs` + 1px border |
| Untitled UI React theme | SOURCE | <https://raw.githubusercontent.com/untitleduico/react/main/styles/theme.css> | MIT | "Skeuomorphic" inset edge: `0 0 0 1px rgba(0,0,0,.18) inset, 0 -2px 0 0 rgba(0,0,0,.05) inset` stacked on top of `--shadow-xs` |
| Vercel Geist Materials | DOCS | <https://vercel.com/geist/materials> | proprietary docs | Named surface presets bundle radius+fill+stroke+shadow: base/small (6px), medium/large (12px); floating: tooltip (6px), menu (12px), modal (12px), fullscreen (16px) |

Quoted techniques:

```css
/* Radix Themes base-card.css: bg below children, border above children */
&::before,
&::after {
  content: '';
  position: absolute;
  pointer-events: none;
  transition: inherit;
  border-radius: calc(var(--base-card-border-radius) - var(--base-card-border-width));
  inset: var(--base-card-border-width);
}
&::before { z-index: -1; }
& { contain: paint; }
```

```css
/* Radix Themes card.css: hover only for real pointers, open mirrors hover */
&:where(:any-link, button, label) {
  @media (hover: hover) {
    &:where(:hover) { &::after { box-shadow: var(--base-card-surface-hover-box-shadow); } }
  }
  &:where([data-state='open']) { &::after { box-shadow: var(--base-card-surface-hover-box-shadow); } }
  &:where(:active:not([data-state='open'])) { &::after { box-shadow: var(--base-card-surface-active-box-shadow); } }
}
```

Radix Themes also documents why classic-card shadows keep the same number of layers in every state
(base-card.css comment: "Make sure that between all states, the length of the shadow list matches" — so
`box-shadow` interpolates instead of snapping).

### Principles to extract

- Border as a **ring layer inside the shadow list** (or an `::after` overlay), never a CSS `border`. It
  does not take layout space, can be translucent (alpha step) and sits over images that bleed to the edge.
- Keep **shadow lists the same length** across rest/hover/active so transitions interpolate.
- **Nested radius** = outer radius − inset/padding; encode it as a calc on tokens.
- Interactive cards: make the card element itself the `<a>`/`<button>` (Slot/`asChild`) or use a stretched
  link (`a::after { position:absolute; inset:0 }`) with secondary actions raised by `position:relative;
  z-index:1`. Do not nest interactive elements inside an anchor.
- Hover styles only inside `@media (hover: hover)`; mirror `[data-state=open]` to the hover state so a card
  that opened a menu stays visually "held".
- Compound slots tagged with `data-slot` let parents style children (`[data-slot=card] > [data-slot=card-footer]`)
  without prop drilling — works identically in scoped CSS without Tailwind.
- Specificity discipline: wrap library defaults in `:where()` so consumers override with one class.

### Fit for Clubhouse

- **Adopt**: ring-in-shadow borders using a warm alpha ink (e.g. `--ch-ink-a5`) instead of gray; `::after`
  overlay border on ivory cards; `:where()` defaults; `data-slot` anatomy for `ChCard` (header, title,
  description, action, content, footer); hover-in-media-query.
- **Adapt**: Untitled's inset bottom edge (`0 -2px 0 0 inset`) at very low alpha gives ivory cards a
  "pressed paper" edge on linen without a heavy shadow — tune separately for dark theme where shadows read
  poorly and a lighter top ring (`inset 0 1px 0 ink-a3`) does the work instead.
- **Avoid**: thick left-border accent cards (brand rule); pure white `bg-white` from Tremor/shadcn defaults.
- Dependencies: none. Radix Slot is already installed for `asChild`.

---

## 2. KPI / metric display and stat cards (trend + sparkline)

| Reference | Evidence | URL | License | Key techniques |
| --- | --- | --- | --- | --- |
| shadcn dashboard-01 `SectionCards` | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/blocks/dashboard-01/components/section-cards.tsx> | MIT | Label (`CardDescription`) above value; value `tabular-nums`, grows via container query `@[250px]/card:text-3xl`; delta as outline badge in `CardAction` slot; footer = one-line narrative + muted context; grid steps 1→2→4 cols by container (`@xl/main`, `@5xl/main`); subtle vertical gradient `from-primary/5 to-card` in light only |
| Tremor Raw `SparkChart` | SOURCE | <https://raw.githubusercontent.com/tremorlabs/tremor/main/src/components/SparkChart/SparkChart.tsx> | Apache-2.0 | Recharts with hidden Y axis, zero margins, `dot={false}`, `strokeWidth={2}`, `isAnimationActive={false}`, `connectNulls` opt-in, `autoMinValue` domain helper |
| Tremor Raw `BarList` | SOURCE | <https://raw.githubusercontent.com/tremorlabs/tremor/main/src/components/BarList/BarList.tsx> | Apache-2.0 | Ranked horizontal bars, `sortOrder` default descending, renders `button` only when `onValueChange` exists, `aria-sort` set |
| Motion Primitives `AnimatedNumber` | SOURCE | <https://raw.githubusercontent.com/ibelick/motion-primitives/main/components/core/animated-number.tsx> | MIT (per README) | `useSpring` + `useTransform` to a formatted string; `tabular-nums` so digits do not jitter |
| Motion Primitives `SlidingNumber` | SOURCE | <https://raw.githubusercontent.com/ibelick/motion-primitives/main/components/core/sliding-number.tsx> | MIT | Odometer digit columns (`w-[1ch] overflow-y-clip`), spring `{stiffness:280, damping:18, mass:0.3}`, measures digit height before animating |
| Magic UI `NumberTicker` | SOURCE (registry) | <https://magicui.design/r/number-ticker.json> (file `registry/magicui/number-ticker.tsx`) | MIT | Spring `{damping:60, stiffness:100}`, starts only `useInView({once:true})`, writes `textContent` directly in `springValue.on("change")` (no React re-render per frame), `Intl.NumberFormat` for decimals |
| Untitled UI `charts-base` | SOURCE | <https://raw.githubusercontent.com/untitleduico/react/main/components/application/charts/charts-base.tsx> | MIT | Shared tooltip and legend content for every chart; custom `activeDot` drawn as a small rounded rect with brand stroke |

Quoted techniques:

```tsx
// Magic UI number-ticker.tsx: update the DOM text without re-rendering React
useEffect(
  () =>
    springValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = Intl.NumberFormat("en-US", {
          minimumFractionDigits: decimalPlaces,
          maximumFractionDigits: decimalPlaces,
        }).format(Number(latest.toFixed(decimalPlaces)))
      }
    }),
  [springValue, decimalPlaces]
)
```

```tsx
// shadcn section-cards.tsx: value scales with the card's own width, not the viewport
<CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
  $1,250.00
</CardTitle>
```

### Principles to extract

- Anatomy: **label → value → delta chip → context line → optional sparkline**. Label is small and muted;
  value is the only large element; delta carries sign + direction icon + colour (never colour alone).
- Value typography: tabular figures always; size via **container queries** so the same card works in a
  4-up grid and a phone column.
- Sparklines are **decoration-grade**: no axes, no dots, no animation, 2px stroke, zero margin, domain
  that does not start at 0 when variance is the story (`autoMinValue`). Put the exact number in text.
- Animated numbers: animate only on first reveal (`useInView once`) and when value changes; drive DOM text
  from a motion value, not state. Respect reduced motion by setting the final value instantly.
- Rank lists (BarList) beat pie charts for "share of" KPIs; sort descending by default and expose
  `aria-sort`.

### Fit for Clubhouse

- **Adopt**: container-query sizing (`container-type: inline-size` on `ChStatCard`); tabular nums;
  delta chip with arrow glyph + sign + `--ch-positive`/`--ch-negative`; golf nuance: for strokes/score,
  *lower is better* — the delta colour must come from a `betterWhen: 'lower' | 'higher'` prop, not sign.
- **Adapt**: hand-drawn SVG sparkline (already in stack) following Tremor's rules (no dots, fixed 2px,
  no animation, optional last-point dot) rather than mounting a recharts instance per card — dozens of
  `ResponsiveContainer`s cost ResizeObservers.
- **Adapt**: Magic UI's `textContent` write pattern with the existing `motion` dependency; no new dep.
- **Avoid**: count-up on every render or route change (feels slow on repeat visits; see §11 frequency rule).

---

## 3. Page header / section header / toolbar

| Reference | Evidence | URL | License | Key techniques |
| --- | --- | --- | --- | --- |
| shadcn `CardHeader` + `CardAction` | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/card.tsx> | MIT | Grid `grid-rows-[auto_auto]`, action pinned `col-start-2 row-span-2 row-start-1 self-start justify-self-end`; reusable as a section header pattern |
| shadcn dashboard-01 `ChartAreaInteractive` header | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/blocks/dashboard-01/components/chart-area-interactive.tsx> | MIT | Toolbar swaps control by **container width**: ToggleGroup visible at `@[767px]/card:flex`, a `Select` below it; description has long/short variants (`hidden @[540px]/card:block` vs `@[540px]/card:hidden`) |
| shadcn dashboard-01 `SiteHeader` | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/blocks/dashboard-01/components/site-header.tsx> | MIT | Thin app bar: sidebar trigger, vertical separator, title; height token shared with sidebar |
| Tremor Raw `TabNavigation` | SOURCE | <https://raw.githubusercontent.com/tremorlabs/tremor/main/src/components/TabNavigation/TabNavigation.tsx> | Apache-2.0 | Page-level tabs as **navigation links** (Radix NavigationMenu), horizontal scroll with hidden scrollbar (`[scrollbar-width:none]`), `-mb-px` underline overlapping the list border |
| Vercel Geist typography | DOCS | <https://vercel.com/geist/typography> | proprietary docs | Headings `heading-14…72`, labels for UI chrome, `label-13` "Tabular is used when conveying numbers"; Strong/Subtle modifiers applied via nested `<strong>` |
| Apple HIG Layout | DOCS | <https://developer.apple.com/design/human-interface-guidelines/layout> | proprietary docs | Respect safe areas/margins; adapt layout to size class and Dynamic Type; test largest and smallest layouts first |

### Principles to extract

- Header = **title block (title + one-line description) + action cluster** in a 2-column grid; actions
  top-aligned so multi-line titles do not push buttons down.
- Toolbars degrade by **container width**, not viewport: segmented control → select/menu; long label →
  short label. Each variant is the same state, so no data reset on resize.
- One primary action per header; secondary actions collapse into a "more" menu first.
- Page tabs that change the URL are links (navigation semantics), not `role=tablist`.

### Fit for Clubhouse

- **Adopt**: container-query toolbar swap for the period picker (Round / 30d / Season) — segmented on
  desktop/tablet, Radix dropdown on phone.
- **Adopt**: link-based section tabs for route-level views (e.g. Team / Player / Rounds) with scroll-snap.
- **Adapt**: Geist's "label vs copy vs heading" role split into `--ch-type-*` roles (see §12).
- Dependencies: none.

---

## 4. Segmented control / tabs with animated indicator

| Reference | Evidence | URL | License | Key techniques |
| --- | --- | --- | --- | --- |
| Radix Themes `SegmentedControl` | SOURCE | <https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/components/segmented-control.css> | MIT | **Pure CSS indicator**: sibling `~` selector moves one indicator element with `translateX(N*100%)`, width `calc(100% / count)` via `:nth-child`; 100ms `cubic-bezier(0.445,0.05,0.55,0.95)`; separators fade ease-in/ease-out asymmetrically; **bold-label no-shift trick** (stacked active/inactive labels) |
| Radix Themes typography tokens | SOURCE | <https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/styles/tokens/typography.css> | MIT | `--tab-active-letter-spacing: -0.01em` vs inactive `0em` to compensate the heavier weight |
| Base UI `Tabs.Indicator` | SOURCE | <https://raw.githubusercontent.com/mui/base-ui/master/packages/react/src/tabs/indicator/TabsIndicator.tsx> | MIT | Measures active tab and writes CSS vars (`TabsIndicatorCssVars.activeTabLeft/Width/Height…`); corrects for CSS `scale` on the list and for scroll offset; tolerates 2px `offsetLeft` rounding (`MAX_LAYOUT_ROUNDING_ERROR = 2`). Var strings (`--active-tab-left` etc.) are per Base UI docs, not verified in this file |
| Motion Primitives `AnimatedBackground` | SOURCE | <https://raw.githubusercontent.com/ibelick/motion-primitives/main/components/core/animated-background.tsx> | MIT | Shared `layoutId` highlight inside `AnimatePresence initial={false}`; children get `data-checked` |
| Animate UI Radix Tabs | SOURCE (registry) | <https://animate-ui.com/r/primitives-radix-tabs.json> | **MIT + Commons Clause** | Radix Tabs + `Highlight` (spring `{stiffness:200, damping:25}`), content crossfade with blur 4px, auto-height container spring `{stiffness:200, damping:30}` |
| Animate UI `Highlight` | SOURCE (registry) | <https://animate-ui.com/r/primitives-effects-highlight.json> | **MIT + Commons Clause** | Default spring `{stiffness:350, damping:35}`, `exitDelay: 200` on hover mode, `boundsOffset` to inset the pill |
| Konsta UI `Segmented` | SOURCE | <https://raw.githubusercontent.com/konstaui/konsta/master/src/react/components/Segmented.jsx> | MIT | iOS "strong" segmented: highlight `translateX(calc((i * 100% + i * gap) * var(--k-rtl-reverse)))` — RTL handled with a sign variable |
| Apple HIG Segmented controls | DOCS | <https://developer.apple.com/design/human-interface-guidelines/segmented-controls> | proprietary docs | ≤5 segments on iPhone; equal widths; text *or* icons, not mixed; nouns; use for closely related subviews (Health uses it for chart time ranges); tab bar for separate sections |

Quoted techniques:

```css
/* Radix Themes segmented-control.css: no layout shift when the active label goes bold */
.rt-SegmentedControlItemLabelInactive {
  position: absolute;
  transition: opacity calc(0.8 * var(--segmented-control-transition-duration));
  font-weight: var(--font-weight-regular);
  letter-spacing: var(--tab-inactive-letter-spacing);
  opacity: 1;
  transition-timing-function: ease-out;
  :where(.rt-SegmentedControlItem[data-state='on']) & {
    opacity: 0;
    transition-timing-function: ease-in;
  }
}
```

```tsx
// Motion Primitives animated-background.tsx (excerpt)
<AnimatePresence initial={false}>
  {activeId === id && (
    <motion.div
      layoutId={`background-${uniqueId}`}
      transition={transition}
      initial={{ opacity: defaultValue ? 1 : 0 }}
```

### Principles to extract

- Three indicator strategies, in order of cost: (1) **CSS-only sibling transform** (Radix Themes) for
  equal-width segments; (2) **measured CSS variables** (Base UI) for variable-width tabs, with transition
  in CSS; (3) **`layoutId` shared element** (Motion) when the indicator must travel between containers.
- Prevent width jitter when the selected label gets heavier: render both weights stacked and crossfade,
  plus a small negative letter-spacing on the bold one.
- `AnimatePresence initial={false}` so the indicator does not animate in on first paint.
- Keyboard: Radix Tabs/ToggleGroup supply roving focus and arrow keys; never animate keyboard-driven moves
  slowly (see §11).

### Fit for Clubhouse

- **Adopt**: Radix Themes CSS-only approach for the equal-width period/stat segmented controls on
  Radix `ToggleGroup` (single) — zero JS, works with reduced motion by dropping the transition.
- **Adopt**: stacked-label bold trick in `--ch-*` CSS.
- **Adapt**: Base UI's measured-vars approach (a ~30-line hook with ResizeObserver) for variable-width
  section tabs; avoid adding Base UI as a dependency.
- **Avoid**: copying Animate UI source into the repo verbatim — the Commons Clause permits use in a
  product but forbids redistributing the components; re-implement the idea with `motion` instead.
- Respect HIG: ≤5 segments on phone; time ranges are the canonical use.

---

## 5. Bottom sheet / drawer and dialog

| Reference | Evidence | URL | License | Key techniques |
| --- | --- | --- | --- | --- |
| vaul `index.tsx` | SOURCE | <https://raw.githubusercontent.com/emilkowalski/vaul/main/src/index.tsx> | MIT | `shouldDrag()` scroll-vs-drag disambiguation; pointer capture; velocity = distance/time, close if `> 0.4` px/ms or past `closeThreshold` 25%; background scale `(innerWidth - 26)/innerWidth` + `translate3d(0, calc(env(safe-area-inset-top) + 14px), 0)`; drag progress interpolates scale/radius |
| vaul constants | SOURCE | <https://raw.githubusercontent.com/emilkowalski/vaul/main/src/constants.ts> | MIT | `DURATION 0.5`, `EASE [0.32,0.72,0,1]`, `VELOCITY_THRESHOLD 0.4`, `CLOSE_THRESHOLD 0.25`, `SCROLL_LOCK_TIMEOUT 100`, `BORDER_RADIUS 8`, `WINDOW_TOP_OFFSET 26` |
| vaul helpers | SOURCE | <https://raw.githubusercontent.com/emilkowalski/vaul/main/src/helpers.ts> | MIT | Logarithmic overdrag damping `8 * (Math.log(v + 1) - 2)` |
| vaul `use-snap-points` | SOURCE | <https://raw.githubusercontent.com/emilkowalski/vaul/main/src/use-snap-points.ts> | MIT | High velocity (`> 2`) skips to first/last snap; mid velocity with small drag (`< 40%` of dimension) advances one snap; else closest snap; `fadeFromIndex` controls when overlay appears |
| vaul `style.css` | SOURCE | <https://raw.githubusercontent.com/emilkowalski/vaul/main/src/style.css> | MIT | CSS keyframes for open/close when no snap points, transforms via `--snap-point-height`; `::after` extends the sheet background 200% beyond its edge (no gap on overdrag); handle hit-area `max(100%, 2.75rem)` = 44px; `user-select:none` only for fine pointers |
| shadcn `Drawer` | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/drawer.tsx> | MIT | Styles keyed on `data-[vaul-drawer-direction=bottom]`: `max-h-[80vh]`, `mt-24`, `rounded-t-lg` |
| shadcn data-table block | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/blocks/dashboard-01/components/data-table.tsx> | MIT | Same detail view as `Drawer direction={isMobile ? "bottom" : "right"}` — one component, two presentations |
| Konsta UI `Sheet` | SOURCE | <https://raw.githubusercontent.com/konstaui/konsta/master/src/react/components/Sheet.jsx> | MIT | iOS-styled sheet reference (backdrop + translate) |
| Emil Kowalski, "Building a drawer component" | DOCS (author article) | <https://emilkowal.ski/ui/building-a-drawer-component> | article | Curve from Ionic, 500ms mimics iOS sheet; 100ms post-scroll drag lock; visualViewport handling for keyboard; ignore extra touches after the first; theme-color meta interpolated in 50 steps along the same bezier |

Quoted techniques:

```ts
// vaul index.tsx shouldDrag (excerpt)
if (element.hasAttribute('data-vaul-no-drag') || element.closest('[data-vaul-no-drag]')) {
  return false;
}
// Allow scrolling when animating
if (openTime.current && date.getTime() - openTime.current.getTime() < 500) {
  return false;
}
// Don't drag if there's highlighted text
if (highlightedText && highlightedText.length > 0) {
  return false;
}
```

```css
/* vaul style.css: 44px hit area around a 32x5 handle */
[data-vaul-handle-hitarea] {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: max(100%, 2.75rem); /* 44px */
  height: max(100%, 2.75rem); /* 44px */
  touch-action: inherit;
}
```

### Principles to extract

- Drag decision order: explicit opt-out attribute → animating (first 500ms) → already displaced → text
  selected → scrolled within last 100ms → inner scroll not at top. Once a drag is accepted it is never
  revoked mid-gesture.
- Release decision: **velocity first** (flick), then distance threshold (25% of sheet height).
- Overdrag is **damped logarithmically**, not clamped.
- Animate with `transform` via a CSS var/inline style during drag (no React render per pointer move);
  set `transition` back on release.
- The scaled-background illusion only reads well when the page behind has rounded corners and the
  status bar area is dark — it is an iOS idiom, optional on desktop.
- Keyboard: use `visualViewport` to reposition inputs inside sheets.

### Fit for Clubhouse

- **Adopt**: vaul (already a dependency) with its defaults; set `data-vaul-no-drag` on horizontal chart
  scrubbers and sliders inside sheets so scrubbing never drags the sheet.
- **Adopt**: `direction={isPhone ? 'bottom' : 'right'}` for round/player detail.
- **Adapt**: sheet surface uses ivory (`--ch-surface-raised`), handle uses ink alpha; the `::after`
  extension must also be ivory so overdrag shows no linen gap.
- **Adapt**: in Capacitor, `shouldScaleBackground` needs `[data-vaul-drawer-wrapper]` on the app shell and
  the status bar style switched while open; test on device, not just WebKit.
- **Avoid**: second sheet library or Motion-based custom drag; vaul already encodes the iOS physics.

---

## 6. Toast

| Reference | Evidence | URL | License | Key techniques |
| --- | --- | --- | --- | --- |
| sonner `index.tsx` | SOURCE | <https://raw.githubusercontent.com/emilkowalski/sonner/main/src/index.tsx> | MIT | `VISIBLE_TOASTS_AMOUNT 3`, `TOAST_LIFETIME 4000`, `GAP 14`, `SWIPE_THRESHOLD 45`, `TIME_BEFORE_UNMOUNT 200`; timer pauses on `expanded || interacting || isDocumentHidden` and resumes with remaining time; dismiss if swipe ≥45px or velocity > 0.11; swipe dampening `1 / (1.5 + |d|/20)` in disallowed directions; `setPointerCapture` on drag; observer-pattern store (no context) |
| sonner `styles.css` | SOURCE | <https://raw.githubusercontent.com/emilkowalski/sonner/main/src/styles.css> | MIT | Stack via CSS vars: `--toasts-before`, `--lift-amount`, scale `1 - 0.05 * index`, collapsed toasts take `--front-toast-height`; `::after` fills the gap between toasts so hover is continuous; transitions (not keyframes) for interruptibility; `prefers-reduced-motion` kills transitions |
| shadcn `Sonner` wrapper | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/sonner.tsx> | MIT | Theme wiring by mapping sonner's `--normal-bg/--normal-text/--normal-border` to app tokens |
| Emil Kowalski, "Building a toast component" | DOCS (author article) | <https://emilkowal.ski/ui/building-a-toast-component> | article | Keyframes are not interruptible, so enter uses `data-mounted` + transition; `@starting-style` suggested as modern replacement; pause when tab hidden; gap filler; pointer capture; friction rather than hard stop |

Quoted techniques:

```ts
// sonner index.tsx: pause/resume preserving remaining time
const pauseTimer = () => {
  if (lastCloseTimerStartTimeRef.current < closeTimerStartTimeRef.current) {
    const elapsedTime = new Date().getTime() - closeTimerStartTimeRef.current;
    remainingTime.current = remainingTime.current - elapsedTime;
  }
  lastCloseTimerStartTimeRef.current = new Date().getTime();
};
```

```css
/* sonner styles.css: collapsed stack */
[data-sonner-toast][data-expanded='false'][data-front='false'] {
  --scale: var(--toasts-before) * 0.05 + 1;
  --y: translateY(calc(var(--lift-amount) * var(--toasts-before))) scale(calc(-1 * var(--scale)));
  height: var(--front-toast-height);
}
```

### Principles to extract

- Toasts are for **acknowledgement**, max 3 visible, ~4s, pause while hovered/focused/tab hidden.
- Enter/exit with transitions keyed on data attributes so rapid toasts retarget smoothly.
- Swipe to dismiss in the direction it came from; velocity OR distance; resist (dampen) the wrong way.
- Expose theme through a handful of CSS variables rather than restyling internals.

### Fit for Clubhouse

- **Adopt**: sonner (MIT, small) if not already present; otherwise copy only the techniques. Map
  `--normal-bg` → `--ch-surface-raised` (ivory, never white), border → ink alpha ring.
- **Adapt**: in the iOS shell, position bottom-center above the tab bar using
  `calc(env(safe-area-inset-bottom) + tabbar-height)` offset.
- **Avoid**: toasts for errors that need action (use inline error state, §14) or for sync status of
  long tasks.

---

## 7. Menu / popover / tooltip

| Reference | Evidence | URL | License | Key techniques |
| --- | --- | --- | --- | --- |
| Radix `Popper` | SOURCE | <https://raw.githubusercontent.com/radix-ui/primitives/main/packages/react/popper/src/popper.tsx> | MIT | Floating UI middleware; writes `--radix-popper-available-width/height`, `--radix-popper-anchor-width/height`, `--radix-popper-transform-origin` (from a custom transformOrigin middleware that accounts for the arrow); `sticky='partial'` + `limitShift`; `flip`; `hideWhenDetached` → `visibility:hidden; pointer-events:none`; positions off-screen (`translate(0,-200%)`) until measured |
| Radix `Tooltip` | SOURCE | <https://raw.githubusercontent.com/radix-ui/primitives/main/packages/react/tooltip/src/tooltip.tsx> | MIT | `DEFAULT_DELAY_DURATION = 700`, `skipDelayDuration = 300` (provider-level delay group); state attribute `closed | delayed-open | instant-open`; pointer-in-transit grace area for hoverable content; **ignores `pointerType === 'touch'`** on pointer move |
| Radix `DismissableLayer` | SOURCE | <https://raw.githubusercontent.com/radix-ui/primitives/main/packages/react/dismissable-layer/src/dismissable-layer.tsx> | MIT | Layer stack so Escape/outside-click close only the top-most layer |
| shadcn `DropdownMenu`/`Popover`/`Tooltip` | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/dropdown-menu.tsx> | MIT | `origin-(--radix-dropdown-menu-content-transform-origin)`, `max-h-(--radix-dropdown-menu-content-available-height)`; enter `fade-in-0 zoom-in-95` + 2px slide from the side opposite `data-side`; tooltip provider overrides `delayDuration = 0` |
| Base UI `Tooltip.Provider` | SOURCE | <https://raw.githubusercontent.com/mui/base-ui/master/packages/react/src/tooltip/provider/TooltipProvider.tsx> | MIT | `FloatingDelayGroup` with separate open `delay`, `closeDelay`, and group `timeout = 400` ms |
| Emil Kowalski, "You don't need animations" | DOCS (author article) | <https://emilkowal.ski/ui/you-dont-need-animations> | article | Tooltip: slight delay first time; once one is open, neighbours open with no delay and no animation; 180ms dropdown feels faster than 400ms |

Quoted technique:

```tsx
// shadcn dropdown-menu.tsx (class excerpt): origin + collision-aware max height
"z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem]
 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto
 data-[side=bottom]:slide-in-from-top-2 data-[state=open]:animate-in data-[state=open]:fade-in-0
 data-[state=open]:zoom-in-95"
```

### Principles to extract

- Scale from the **anchor-derived transform origin**, never from center; small zoom (0.95→1) + fade +
  2px slide toward the content side; ~150–200ms ease-out in, faster out.
- Cap height to **available height** var so menus scroll instead of overflowing the viewport (critical
  in a WebView with the keyboard open).
- Tooltip delay group: first open delayed (Radix 700ms default; many apps use ~300–500ms), subsequent
  opens instant within a skip window; set `instant-open` to skip the animation as well.
- **Touch gets no hover tooltips.** Information in tooltips must exist elsewhere (popover on tap, or
  visible label). Radix tooltip explicitly ignores touch pointer moves.
- Layered dismissal: Escape closes the top layer only.

### Fit for Clubhouse

- **Adopt**: Radix vars in scoped CSS: `transform-origin: var(--radix-dropdown-menu-content-transform-origin)`,
  `max-height: var(--radix-popover-content-available-height)`.
- **Adopt**: one `Tooltip.Provider` at the Clubhouse shell with `delayDuration ~400`, `skipDelayDuration 300`;
  CSS for `[data-state='instant-open'] { animation: none }`.
- **Adapt**: stat-definition tooltips ("SG: Approach") become tap popovers on touch
  (`@media (hover: none)` → render Popover trigger).
- Dependencies: none beyond existing Radix.

---

## 8. Command palette

| Reference | Evidence | URL | License | Key techniques |
| --- | --- | --- | --- | --- |
| cmdk `index.tsx` | SOURCE | <https://raw.githubusercontent.com/pacocoursey/cmdk/main/cmdk/src/index.tsx> | MIT | External store + `useSyncExternalStore`; items register `value` + `keywords`; `shouldFilter={false}` for server search; `loop`; `vimBindings` (ctrl+j/k/n/p); `aria-activedescendant` focus model (focus stays in input); `scrollIntoView({block:'nearest'})` and scrolls group heading for first item; `--cmdk-list-height` set from a ResizeObserver to animate list height |
| cmdk `command-score.ts` | SOURCE | <https://raw.githubusercontent.com/pacocoursey/cmdk/main/cmdk/src/command-score.ts> | MIT | Fuzzy score constants: continue match 1, word jump after space 0.9, non-space word jump 0.8, character jump 0.17, transposition 0.1; penalties for skipped chars (0.999), case mismatch (0.9999), distance from start (0.9) |
| shadcn `Command` | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/command.tsx> | MIT | cmdk inside Radix Dialog; `CommandShortcut` slot; `data-[selected=true]` styling |
| Raycast / Linear palettes | VISUAL | <https://www.raycast.com> , <https://linear.app> | n/a | Publicly observable: type-to-filter, grouped results with section headings, right-aligned shortcut hints, actions on the selected item; no code inspected |

Quoted technique:

```tsx
// cmdk index.tsx: animate list height from measured content
const observer = new ResizeObserver(() => {
  animationFrame = requestAnimationFrame(() => {
    const height = el.offsetHeight
    const wrapper = wrapperRef.current
    wrapper.style.setProperty(`--cmdk-list-height`, height.toFixed(1) + 'px')
  })
})
```
(Excerpt reconstructed around lines 845–848 of the fetched file; the `setProperty` line is verbatim.)

### Principles to extract

- Focus stays in the input; selection moves via `aria-activedescendant`, so typing never loses focus.
- Rank, do not just filter: word-start matches beat mid-word; synonyms via `keywords` ("SG" → "strokes gained").
- Animate container height via a CSS variable, not item enter/exit (keyboard nav must be instant).

### Fit for Clubhouse

- **Adapt**: coach-side quick switch (players, rounds, events) on desktop (⌘K). cmdk is ~small and MIT;
  acceptable dependency if the feature is approved; on phone, the same index powers a full-screen search
  sheet rather than a floating palette.
- **Avoid**: animating highlighted row movement (Emil: never animate keyboard-initiated actions).

---

## 9. Data table

| Reference | Evidence | URL | License | Key techniques |
| --- | --- | --- | --- | --- |
| TanStack Table sticky pinning example | SOURCE | <https://raw.githubusercontent.com/TanStack/table/main/examples/react/column-pinning-sticky/src/main.tsx> | MIT | `position: sticky` + `insetInlineStart: column.getStart('start')`; inset shadow only on the last left-pinned column (`-4px 0 4px -4px gray inset`); pinned `zIndex: 1`; logical properties for RTL |
| TanStack Table virtualized rows | SOURCE | <https://raw.githubusercontent.com/TanStack/table/main/examples/react/virtualized-rows/src/main.tsx> | MIT | `<table style={{display:'grid'}}>`, sticky grid header, `useVirtualizer({estimateSize: () => 33, overscan: 5})`, `measureElement` for dynamic row height |
| shadcn `Table` | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/table.tsx> | MIT | Wrapper `overflow-x-auto` so table scrolls inside card; `whitespace-nowrap` cells; checkbox column alignment `[&>[role=checkbox]]:translate-y-[2px]`; row states `data-[state=selected]`, `has-aria-expanded` |
| shadcn dashboard-01 data-table | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/blocks/dashboard-01/components/data-table.tsx> | MIT | Numeric headers right-aligned (`w-full text-right`); inline editable numeric cells with transparent chrome until focus; row detail opens a Drawer (bottom on mobile); dnd-kit row reorder; column visibility menu |
| Tremor Raw `Table` | SOURCE | <https://raw.githubusercontent.com/tremorlabs/tremor/main/src/components/Table/Table.tsx> | Apache-2.0 | Minimal semantic table, `caption-bottom`, header `font-semibold` with bottom border only |
| Kibo UI `table` | SOURCE | <https://raw.githubusercontent.com/haydenbleasel/kibo/main/packages/table/index.tsx> | MIT (license.md, "shadcnblocks") | TanStack sorting with tri-state header icons (up/down/chevrons-up-down) and a dropdown per column header; jotai atom for sort state |

Quoted technique:

```ts
// TanStack column-pinning-sticky main.tsx
return {
  boxShadow: isLastLeftPinnedColumn
    ? '-4px 0 4px -4px gray inset'
    : isFirstRightPinnedColumn
      ? '4px 0 4px -4px gray inset'
      : undefined,
  insetInlineStart: isPinned === 'start' ? `${column.getStart('start')}px` : undefined,
  insetInlineEnd: isPinned === 'end' ? `${column.getAfter('end')}px` : undefined,
  opacity: isPinned ? 0.95 : 1,
  position: isPinned ? 'sticky' : 'relative',
  width: column.getSize(),
  zIndex: isPinned ? 1 : 0,
}
```

### Principles to extract

- Numbers: right-aligned, tabular figures, same decimals per column, units in the header not the cell.
- Pinned first column (player name) with an edge shadow that appears only at the pin boundary; pinned
  cells need an **opaque** background matching the row (not 0.95 opacity on ivory — the example's
  opacity would show text through).
- Header sticky inside the scroll container, not the page.
- Mobile alternative: keep the table for ≤4 numeric columns with a pinned name column; beyond that use
  a **row-as-card list** with 2–3 key stats and a drawer for the full row.
- Sorting: tri-state icon, `aria-sort` on the `<th>`.

### Fit for Clubhouse

- **Adopt**: CSS-only sticky name column + sticky header for leaderboards and round tables (no library
  needed for < 200 rows).
- **Adapt**: TanStack Table only if sorting/filtering/pinning logic grows beyond a hook; virtualization
  is unnecessary at team scale (≈10–20 players, a season of rounds).
- **Avoid**: dnd-kit row reordering (not a Clubhouse need); grid-display tables for small data (breaks
  native table semantics without benefit).

---

## 10. Charts: anatomy, tooltip/crosshair, touch scrubbing, accessibility

| Reference | Evidence | URL | License | Key techniques |
| --- | --- | --- | --- | --- |
| shadcn `ChartContainer`/`ChartStyle`/`ChartTooltipContent` | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/chart.tsx> | MIT | Config object → generated `<style>` that sets `--color-<key>` per theme under `[data-chart=id]` (and `.dark [data-chart=id]`); recharts internals re-skinned by attribute selectors (grid lines `stroke='#ccc'` → border token, cursor → muted); tooltip indicator `dot | line | dashed`; values `font-mono tabular-nums` |
| shadcn `ChartAreaInteractive` | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/blocks/dashboard-01/components/chart-area-interactive.tsx> | MIT | Area fill via `linearGradient` (stopOpacity 1.0→0.1 / 0.8→0.1); `minTickGap={32}`; `tickFormatter` for dates; `cursor={false}` on tooltip |
| Tremor Raw `LineChart` | SOURCE | <https://raw.githubusercontent.com/tremorlabs/tremor/main/src/components/LineChart/LineChart.tsx> | Apache-2.0 | Legend click focuses a series (others to `opacity-40`, `strokeOpacity`); clickable dots with `activeDot` state; tooltip pinned to top (`position={{ y: 0 }}`) so it never covers the line; legend slider with scroll buttons when overflowing; `intervalType: preserveStartEnd | equidistantPreserveStart`; `tickGap` |
| visx `findNearestDatumSingleDimension` | SOURCE | <https://raw.githubusercontent.com/airbnb/visx/master/packages/visx-xychart/src/utils/findNearestDatumSingleDimension.ts> | MIT | `scale.invert(px)` + `bisector(accessor).left`, compare the two neighbours, band scales inverted manually via `step` |
| visx xychart `Tooltip` | SOURCE | <https://raw.githubusercontent.com/airbnb/visx/master/packages/visx-xychart/src/components/Tooltip.tsx> | MIT | `snapTooltipToDatumX`, `showVerticalCrosshair`, `showDatumGlyph` options |
| visx `useEventEmitters` | SOURCE | <https://raw.githubusercontent.com/airbnb/visx/master/packages/visx-xychart/src/hooks/useEventEmitters.ts> | MIT | Pointer move/out/up/down **and focus/blur** all emit — keyboard focus can drive the tooltip |
| Observable Plot `pointer` | SOURCE | <https://raw.githubusercontent.com/observablehq/plot/main/src/interactions/pointer.js> | ISC | `maxRadius = 40`; `pointerX` squashes the y distance (`kx=1, ky=0.01`) so x dominates; rAF-batched updates; click (mouse only) toggles **sticky** tip; `pointerleave` ignored for non-mouse, so a touch selection persists after lifting the finger |
| Observable Plot `tip` | SOURCE | <https://raw.githubusercontent.com/observablehq/plot/main/src/marks/tip.js> | ISC | Auto-anchoring the tip to the side with room; `lineWidth = 20` (ems) wrap; text overflow modes |
| Apache ECharts `aria` | SOURCE | <https://raw.githubusercontent.com/apache/echarts/master/src/visual/aria.ts> | Apache-2.0 | Generates `role="img"` + `aria-label` summary from title, series count and data with separators; **decal** patterns per series for colour-independent distinction |
| Nivo `Crosshair` | SOURCE | <https://raw.githubusercontent.com/plouc/nivo/master/packages/tooltip/src/Crosshair.tsx> | MIT | Crosshair types (x, y, cross, corners) as a reusable overlay |
| Untitled UI `charts-base` | SOURCE | <https://raw.githubusercontent.com/untitleduico/react/main/components/application/charts/charts-base.tsx> | MIT | Dark solid tooltip (`bg-primary-solid`, white title, supporting text) — high-contrast tooltip on light charts |
| Apple HIG Charting data + Swift Charts selection | DOCS | <https://developer.apple.com/design/human-interface-guidelines/charting-data> ; <https://developer.apple.com/documentation/swiftui/view/chartxselection(value:>) | proprietary docs | Every chart needs accessibility labels and elements; size chart to its interactivity; `chartXSelection(value:)`/`(range:)` = drag across x to select a value or range, typically rendered with a `RuleMark` + annotation |
| LayerChart | DOCS (licence only) | <https://github.com/techniq/layerchart> | MIT | Svelte; licence confirmed; repo too large to list via mirror, no source read. Reference only for its "tooltip modes" concept; not transferable to React directly |

Quoted techniques:

```js
// Observable Plot pointer.js: sticky only for mouse; touch selection persists
function pointerdown(event) {
  if (handledEvents.has(event)) return; // ignore same event on a shared pointer
  handledEvents.add(event);
  if (event.pointerType !== "mouse") return;
  if (i == null) return; // not pointing
  if (state.sticky && state.roots.some((r) => r?.contains(event.target))) return; // stay sticky
  if (state.sticky) (state.sticky = false), state.renders.forEach((r) => r(null)); // clear all pointers
  else (state.sticky = true), render(i);
}
function pointerleave(event) {
  if (event.pointerType !== "mouse") return;
  if (!state.sticky) update(null);
}
```

```ts
// visx findNearestDatumSingleDimension.ts
const bisect = bisector(accessor).left;
const dataValue = Number(coercedScale.invert(scaledValue));
const index = bisect(data, dataValue);
const nearestDatum0 = data[index - 1];
const nearestDatum1 = data[index];
nearestDatum =
  !nearestDatum0 ||
  Math.abs(dataValue - accessor(nearestDatum0)) > Math.abs(dataValue - accessor(nearestDatum1))
    ? nearestDatum1
    : nearestDatum0;
```

```tsx
// shadcn chart.tsx ChartStyle: theme-scoped series colours as CSS vars
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ??
      itemConfig.color
    return color ? `  --color-${key}: ${color};` : null
  })
  .join("\n")}
}
```

### Principles to extract

- **Anatomy**: horizontal gridlines only, low-contrast; no y-axis line; x ticks thinned with a min gap
  and start/end preserved; direct labels or a compact legend; units in the title; area fills fade to ~10%.
- **Series colour as CSS variables** scoped to the chart container and swapped per theme — charts follow
  light/dark without re-rendering.
- **Nearest-datum lookup** by x via bisect (O(log n)); x-dominant distance for time series.
- **Touch scrubbing**: pointer down + move scrubs; on lift, keep the last selection visible (Plot) rather
  than snapping it away; tap outside clears. Tooltip pinned at the top of the plot (Tremor) so the finger
  never covers it. Use `touch-action: pan-y` on the plot so vertical page scroll still works and horizontal
  drags scrub.
- **Keyboard**: focusable plot; arrow keys move the selected datum; same tooltip renders on focus (visx).
- **Accessibility**: `role="img"` + generated summary `aria-label` (ECharts), plus a visually hidden data
  table or "View as table" toggle; never rely on colour alone (dash patterns, decals, direct labels).
- **Series focus**: clicking a legend item dims other series to ~40% opacity (Tremor).

### Fit for Clubhouse

- **Adopt**: shadcn's CSS-variable colour pattern rewritten without Tailwind: `[data-ch-chart] {
  --series-1: var(--ch-green-9) }` with dark overrides; recharts gridline/cursor re-skin via attribute
  selectors in scoped CSS.
- **Adopt**: Plot-style touch behaviour on the hand-drawn SVG charts: `pointermove` → bisect over a
  `d3-scale` (`scaleTime().invert`) → `RuleMark`-like vertical rule + dot + top-pinned readout; selection
  persists after `pointerup` on touch; `touch-action: pan-y`.
- **Adopt**: Swift-Charts-style **range selection** (drag across holes/rounds to compare a stretch) as an
  explicit mode, not the default.
- **Adapt**: ECharts' generated summary sentence for every Clubhouse chart (`aria-label="Scoring average,
  10 rounds, from 74.2 to 71.8, best 69 on Oct 3"`).
- **Avoid**: adding visx, Nivo, ECharts or Plot as dependencies; recharts + d3-scale + SVG already cover
  the needs. Avoid recharts animations on data refresh (`isAnimationActive={false}` for sparklines).

---

## 11. Motion: springs vs easing, durations, interruptibility, press, reduced motion

| Reference | Evidence | URL | License | Key techniques |
| --- | --- | --- | --- | --- |
| Emil Kowalski, "Great animations" | DOCS (author article) | <https://emilkowal.ski/ui/great-animations> | article | `ease-out` for UI response, usually < 300ms; animate `transform`/`opacity` only; interruptible (transitions or Motion, not keyframes); reduced motion swaps movement for fade |
| Emil Kowalski, "You don't need animations" | DOCS (author article) | <https://emilkowal.ski/ui/you-dont-need-animations> | article | Frequency rule: frequent actions get little or no animation; never animate keyboard-initiated actions; 180ms dropdown > 400ms |
| Motion docs: Transitions | DOCS | <https://motion.dev/docs/react-transitions> | Motion docs | Physics springs (`stiffness/damping/mass`) carry gesture velocity; duration springs (`visualDuration`, `bounce`) are easier to coordinate and `visualDuration` still incorporates interrupted velocity; `bounce` default 0.25; `MotionConfig transition` defaults |
| Motion docs: Accessibility | DOCS | <https://motion.dev/docs/react-accessibility> | Motion docs | `<MotionConfig reducedMotion="user">` disables transform and layout animations but keeps opacity/colour |
| Motion docs: Layout animations | DOCS | <https://motion.dev/docs/react-layout-animations> | Motion docs | `layout`/`layoutId` animate via transforms; scale-correct children by giving them `layout`; `layout="position"` for aspect changes; border-radius/box-shadow must be set via `style` for correction; `mass: "auto"` |
| vaul / sonner constants | SOURCE | (see §5, §6 URLs) | MIT | iOS sheet `0.5s cubic-bezier(0.32,0.72,0,1)`; toasts 400ms `ease` |
| Radix Themes segmented control | SOURCE | (see §4) | MIT | 100ms indicator, `cubic-bezier(0.445,0.05,0.55,0.95)` |
| Motion Primitives / Animate UI springs | SOURCE | (see §2, §4) | MIT / MIT+CC | Measured spring presets: `280/18/0.3` (digits), `200/25` (tab highlight), `350/35` (hover highlight), `200/30` (auto height) |
| React Aria `usePress` | SOURCE | <https://raw.githubusercontent.com/adobe/react-spectrum/main/packages/react-aria/src/interactions/usePress.ts> | Apache-2.0 | Press state that works across mouse/touch/keyboard/virtual click; touch hit test grows the pointer by `radiusX/radiusY` (contact size) so slight finger drift does not cancel a press; `shouldCancelOnPointerExit` opt-in |
| Apple HIG Motion | DOCS | <https://developer.apple.com/design/human-interface-guidelines/motion> | proprietary docs | Purposeful motion; make motion optional; never the only carrier of information; supplement with haptics |

Quoted technique:

```css
/* React Aria usePress.ts: injected once per document */
@layer {
  [${PRESSABLE_ATTRIBUTE}] {
    touch-action: pan-x pan-y pinch-zoom;
  }
}
```
Source comment: `touchAction: 'manipulation'` "is supposed to be equivalent, but in Safari it causes
onPointerCancel not to fire on scroll" (WebKit bug 240917). Directly relevant to the iOS WebView.

### Principles to extract

- **Duration budget**: press feedback ≤100ms, menus/popovers 150–200ms, segmented/tab indicator 100–250ms,
  sheets 500ms (iOS parity), page-level content ≤300ms. Exit faster than enter.
- **Easing**: ease-out for things appearing in response to the user; iOS sheet curve
  `cubic-bezier(0.32,0.72,0,1)` for large surfaces; springs for anything a gesture can interrupt.
- **Springs**: prefer `visualDuration` + `bounce: 0`–`0.15` for UI (coordinates with CSS timings);
  physics springs where gesture velocity must carry over (drag release).
- **Interruptibility**: CSS transitions or Motion, never CSS keyframes for state that can toggle quickly.
- **Press**: scale 0.97–0.98 on `:active` (or Motion `whileTap`) with 100ms; no hover-dependent feedback
  on touch; keep presses alive under small finger drift.
- **Reduced motion**: one global `MotionConfig reducedMotion="user"` plus a CSS
  `@media (prefers-reduced-motion: reduce)` block that sets transitions to opacity only.
- **Frequency**: no animation on high-frequency actions (period toggles used every visit, keyboard nav).

### Fit for Clubhouse

- **Adopt**: a small motion token set in CSS (`--ch-dur-press: 100ms; --ch-dur-pop: 180ms;
  --ch-dur-sheet: 500ms; --ch-ease-out: cubic-bezier(.23,1,.32,1); --ch-ease-sheet: cubic-bezier(.32,.72,0,1)`)
  and the matching Motion presets in one TS module, so CSS and JS animations agree. (`.23,1,.32,1` is a
  common ease-out-quint approximation — INFERRED value, tune by eye.)
- **Adopt**: `touch-action: pan-x pan-y pinch-zoom` on pressable elements instead of `manipulation`
  (WebKit cancel bug) — high value in Capacitor.
- **Adopt**: `MotionConfig reducedMotion="user"` at the Clubhouse root.
- **Avoid**: blur-in content transitions (Animate UI tabs) on data-heavy views — expensive on older
  iPhones and smears numbers; bouncy springs on data.

---

## 12. Typography systems for dense data UIs

| Reference | Evidence | URL | License | Key techniques |
| --- | --- | --- | --- | --- |
| Radix Themes typography tokens | SOURCE | <https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/styles/tokens/typography.css> | MIT | 9-step scale 12/14/16/18/20/24/28/35/60 × `--scaling`; paired line heights 16/20/24/26/28/30/36/40/60; **letter-spacing tightens with size** (+0.0025em at 12px → −0.025em at 60px); separate heading line heights; leading-trim tokens `0.42em/0.36em`; active-tab letter-spacing |
| Radix Themes `DataList` | SOURCE | <https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/components/data-list.css> | MIT | Key/value list with **subgrid** so all label columns align; negative value trims (−0.25em) to align baselines of label and value; first/last item trims reset |
| Radix Themes `Text` | SOURCE | <https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/components/text.css> | MIT | Size classes map to token triples (size/line-height/letter-spacing) |
| Untitled UI theme | SOURCE | <https://raw.githubusercontent.com/untitleduico/react/main/styles/theme.css> | MIT | Display sizes with explicit negative tracking (display-md −0.72px … 2xl −1.44px, i.e. −2% of size); text colours as 4 semantic levels `text-primary/secondary/tertiary/quaternary` |
| React Spectrum S2 style macro | SOURCE | <https://raw.githubusercontent.com/adobe/react-spectrum/main/packages/@react-spectrum/s2/style/spectrum-theme.ts> | Apache-2.0 | Role-named sizes `ui-xs, ui-sm, ui, ui-lg …` mapped to numeric tokens (`font-size-50…500`); heading weight from a token |
| Vercel Geist typography | DOCS | <https://vercel.com/geist/typography> | proprietary docs | Separate **Label** (single line, UI) vs **Copy** (multi-line, higher line height) families; `label-13` tabular for numbers; mono sizes paired with label sizes; Strong/Subtle as nested modifiers |
| Apple HIG Typography | DOCS | <https://developer.apple.com/design/human-interface-guidelines/typography> | proprietary docs | Custom fonts must implement Dynamic Type and Bold Text behaviours; layouts adapt at AX sizes; fewer columns and minimal truncation at large sizes; emphasized weights per style |

Quoted technique:

```css
/* Radix Themes typography.css: tracking tightens as size grows */
--letter-spacing-1: 0.0025em;
--letter-spacing-2: 0em;
--letter-spacing-3: 0em;
--letter-spacing-4: -0.0025em;
--letter-spacing-5: -0.005em;
--letter-spacing-6: -0.00625em;
--letter-spacing-7: -0.0075em;
--letter-spacing-8: -0.01em;
--letter-spacing-9: -0.025em;
```

### Principles to extract

- Hierarchy in dense UIs is carried by **colour step (primary/secondary/tertiary) and weight**, with a
  small number of sizes (12/13/14/16 for UI, one large size for KPI values). Size jumps are reserved for
  the single most important number per region.
- Tokens are **triples** (size, line-height, tracking), never size alone.
- Two text roles: **label** (single-line, tight leading, UI chrome) and **copy** (paragraphs, looser).
- Numbers: `font-variant-numeric: tabular-nums` in tables, KPIs, tooltips, axes; `lining-nums`; slashed
  zero optional (`"zero"`) for codes. Check that Instrument Sans exposes `tnum` (INFERRED: verify in the
  font file's feature list before relying on it; otherwise fall back to a mono numeral face for tables).
- `text-wrap: balance` for headings/empty-state copy, `text-wrap: pretty` for paragraphs.
- Dynamic Type in a WebView: use `rem` for type, and in Capacitor iOS consider `-apple-system-body`-based
  root sizing (`font: -apple-system-body` then override family) so the OS text-size setting propagates
  — INFERRED technique, verify on device.

### Fit for Clubhouse

- **Adopt**: Radix-style triples as `--ch-type-{role}-size/-leading/-tracking`; roles: `label-sm (12)`,
  `label (13)`, `body (14)`, `body-lg (16)`, `title (18–20)`, `metric (28–36)`, `display (40+)`.
- **Adopt**: 4 ink levels (`--ch-ink-1..4`) instead of more sizes; tabular nums on every numeric role.
- **Adopt**: DataList subgrid pattern for player bio/stat key-value panels.
- **Avoid**: Inter-style default tracking on Instrument Sans display sizes without testing; it is already
  fairly tight — tune tracking visually.

---

## 13. Surface / elevation / colour token systems

| Reference | Evidence | URL | License | Key techniques |
| --- | --- | --- | --- | --- |
| Radix Colors scales | SOURCE | <https://raw.githubusercontent.com/radix-ui/colors/main/src/light.ts> | MIT | 12-step scales incl. warm neutrals: `sand1 #fdfdfc … sand12 #21201c`; `grass1 #fbfefb … grass9 #46a758 … grass12 #203c25`; alpha variants exist for each |
| Radix Colors "Understanding the scale" | DOCS | <https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale> | MIT docs | 1 app bg, 2 subtle bg, 3 element bg, 4 hover, 5 active/selected, 6 subtle border, 7 element border/focus, 8 hover border, 9 solid, 10 hover solid, 11 low-contrast text, 12 high-contrast text; 11/12 guarantee APCA Lc 60/90 on step 2 |
| Radix Themes colour tokens | SOURCE | <https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/styles/tokens/color.css> | MIT | Semantic surfaces: `--color-background`, `--color-panel-solid`, `--color-panel-translucent`, `--color-surface`, `--color-overlay` with dark equivalents (`panel-solid: gray-2`) |
| Radix Themes shadows | SOURCE | (see §1) | MIT | 6 elevation levels, ring + contact + ambient layers, `color-mix(in oklab)` |
| Untitled UI theme | SOURCE | <https://raw.githubusercontent.com/untitleduico/react/main/styles/theme.css> | MIT | Semantic `bg-primary/secondary/tertiary/quaternary`, `_hover`, `_alt`, `-solid`; borders `primary/secondary/tertiary`; multi-layer shadows xs…3xl with low alpha (0.03–0.18) |
| Vercel Geist colours | DOCS | <https://vercel.com/geist/colors> | proprietary docs | 10-step scales 100…1000 with fixed roles (bg/hover/active, border/hover/active, high-contrast bg, text secondary/primary); gray vs gray-alpha: alpha only where background must show through (shadows, overlays); "keep material shadows translucent" |
| Linear UI redesign | DOCS (company blog) | <https://linear.app/now/how-we-redesigned-the-linear-ui> | company blog | Theme generated in LCH from three inputs (base colour, accent, contrast) instead of 98 hand-set variables; contrast variable yields high-contrast themes; reduced chroma for a neutral look |
| Stripe accessible colour systems | DOCS (company blog) | <https://stripe.com/blog/accessible-color-systems> | company blog | Perceptually uniform (CIELAB) scales so each level has the same contrast across hues; rule: 5 levels apart ⇒ small-text contrast, 4 apart ⇒ icons/large text |
| Evil Martians OKLCH | DOCS (article) | <https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl> | article | `oklch(from var(--x) calc(l + 0.1) c h)` relative colours for hover; P3 upgrades under `@media (color-gamut: p3)`; use APCA for contrast checks |

### Principles to extract

- Name tokens by **role**, derive values from a **12-step perceptual scale** per hue (neutral, accent,
  semantic). Steps have fixed jobs (Radix table above) so designers stop picking hexes per component.
- Elevation = surface step + shadow level + ring; dark mode raises surfaces by **lightening** (step 2→3)
  rather than darker shadows.
- Use alpha steps only where the layer below must show through (overlays, rings, shadows).
- Generate scales in OKLCH/LCH from a few inputs (Linear) and check pairs with APCA (Radix guarantees)
  or step distance rules (Stripe).

### Fit for Clubhouse

- **Adapt**: build `--ch-linen-1..12` (warm neutral, hue ≈ Radix sand/olive, but anchored so step 1–2 ≈
  `#faf7ef` ivory and the page `#e8e3d5` ≈ step 4–5; nothing at L=1) and `--ch-green-1..12` (deep golf green
  at step 9–11) in OKLCH; dark theme as a separate 12-step set, not inverted.
- **Adopt**: Radix's step-role table as the contract for `--ch-*` semantic aliases (`--ch-surface-page`,
  `--ch-surface-card`, `--ch-surface-raised`, `--ch-border-subtle`, `--ch-border`, `--ch-ink-1..4`).
- **Adopt**: Geist's rule that shadows are translucent ink, never opaque gray (on linen, gray shadows look
  dirty); tint shadows with the warm neutral hue.
- Dependency: none (`@radix-ui/colors` could be a reference, but the ivory/linen brand needs custom scales).

---

## 14. Skeleton / empty / error states

| Reference | Evidence | URL | License | Key techniques |
| --- | --- | --- | --- | --- |
| Radix Themes `Skeleton` | SOURCE | <https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/components/skeleton.css> | MIT | Skeleton *wraps the real component*: `color: transparent`, `pointer-events:none`, children hidden, `box-decoration-break: clone` for multi-line text; inline text skeleton uses `line-height:0` + Arial metrics so it matches real text size; pulse `1000ms infinite alternate-reverse`; `:empty` fallback height |
| shadcn `Skeleton` | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/skeleton.tsx> | MIT | Minimal `animate-pulse rounded-md bg-accent` block |
| shadcn `Empty` | SOURCE | <https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/empty.tsx> | MIT | Compound `Empty/EmptyHeader/EmptyMedia(icon variant)/EmptyTitle/EmptyDescription/EmptyContent`; centred, `text-balance`, `max-w-sm` header, dashed border option, links in description underlined with offset |
| Untitled UI `EmptyState` | SOURCE | <https://raw.githubusercontent.com/untitleduico/react/main/components/application/empty-state/empty-state.tsx> | MIT | Featured icon + title + description + primary/secondary actions; size variants |

Quoted technique:

```css
/* Radix Themes skeleton.css: dimensions come from the real content */
.rt-Skeleton {
  border-radius: var(--radius-1);
  animation: rt-skeleton-pulse 1000ms infinite alternate-reverse !important;
  background-image: none !important;
  border: none !important;
  box-shadow: none !important;
  box-decoration-break: clone !important;
  color: transparent !important;
  pointer-events: none !important;
  user-select: none !important;
}
```

### Principles to extract

- Skeletons **reuse the real layout** (wrap the component with placeholder text) so there is zero layout
  shift on load; avoid bespoke skeleton layouts that drift from the real one.
- Pulse slowly (≈1s alternate), low contrast (one neutral step above the surface); disable under
  reduced motion (static tint).
- Delay skeletons ~150–300ms so fast loads show nothing (INFERRED common practice).
- Empty state = why it is empty + one next action; error state = what failed + retry, in place of the
  content region, never a toast.

### Fit for Clubhouse

- **Adopt**: `ChSkeleton` wrapper with Radix's rules in scoped CSS; skeleton tint `--ch-linen-3` on ivory.
- **Adopt**: Empty compound anatomy; golf-specific copy ("No rounds logged yet — add your first round").
- **Avoid**: shimmer gradients sweeping across ivory (reads as glare on warm surfaces).

---

## 15. Mobile native-feel on the web (Capacitor iOS WebView)

| Reference | Evidence | URL | License | Key techniques |
| --- | --- | --- | --- | --- |
| Ionic core CSS | SOURCE | <https://raw.githubusercontent.com/ionic-team/ionic-framework/main/core/src/css/core.scss> | MIT | `--ion-safe-area-top: var(--safe-area-inset-top, env(safe-area-inset-top))` — comment: "`--safe-area-inset-*` are set by Capacitor"; padding = `calc(safe-area + 8px)` |
| Ionic structure CSS | SOURCE | <https://raw.githubusercontent.com/ionic-team/ionic-framework/main/core/src/css/structure.scss> | MIT | `-webkit-tap-highlight-color: transparent`, `-webkit-touch-callout: none`, `text-size-adjust: 100%`, `overscroll-behavior-y: none` on the app root |
| Ionic gesture utility | SOURCE | <https://raw.githubusercontent.com/ionic-team/ionic-framework/main/core/src/utils/gesture/index.ts> | MIT | Pan recognizer defaults: `threshold: 10`, `maxAngle: 40`, `passive: true`, gesture priority/capture so only one gesture owns a touch |
| Konsta UI touch ripple | SOURCE | <https://raw.githubusercontent.com/konstaui/konsta/master/src/shared/touch-ripple-class.js> | MIT | Material ripple sized to `max(diagonal, 48)` from touch point (reference for Android; iOS uses highlight instead) |
| vaul | SOURCE | (see §5) | MIT | 44px hit areas; `env(safe-area-inset-top)` in background transform; visualViewport keyboard handling |
| React Aria `usePress` | SOURCE | (see §11) | Apache-2.0 | `touch-action: pan-x pan-y pinch-zoom` (Safari cancel bug); touch contact radius hit-testing |
| Capacitor Keyboard plugin | DOCS | <https://capacitorjs.com/docs/apis/keyboard> | MIT docs | iOS `resize`: `native` (whole WebView resizes; affects `vh`), `body`, `ionic`, `none`; `style` DARK/LIGHT; `setScroll`; `autoBackdropColor` (v8.0.4+) to match the area behind the keyboard to the body background |
| Apple HIG Layout | DOCS | (see §3) | proprietary docs | Respect safe areas; Dynamic Island; test smallest/largest layouts |

Quoted technique:

```scss
// Ionic core.scss
@supports (padding-top: env(safe-area-inset-top)) {
  html {
    // `--safe-area-inset-*` are set by Capacitor
    --ion-safe-area-top: var(--safe-area-inset-top, env(safe-area-inset-top));
    --ion-safe-area-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom));
    --ion-safe-area-left: var(--safe-area-inset-left, env(safe-area-inset-left));
    --ion-safe-area-right: var(--safe-area-inset-right, env(safe-area-inset-right));
  }
}
```
(Selector line `html {` paraphrased from context; the variable lines are verbatim.)

### Principles to extract

- Safe areas through **one token layer** (`--ch-safe-top: var(--safe-area-inset-top, env(safe-area-inset-top))`)
  so Capacitor-provided values win and the web falls back to `env()`.
- Viewport: `100dvh` for full-height shells (with `100vh` fallback); avoid `vh` if Keyboard `resize: native`.
- Kill web tells: tap highlight, long-press callout on non-text, text-size-adjust, rubber-band on the root
  (`overscroll-behavior-y: none` on html/body, `contain` on inner scrollers).
- Press feedback without hover: `:active` styles applied immediately (iOS needs a `touchstart` listener or
  pointer events for `:active` to fire reliably — INFERRED, standard WebKit behaviour); 100ms in, slower out.
- Touch targets ≥ 44×44pt using invisible hit areas (vaul handle pattern) rather than growing visuals.
- Gesture arbitration: a threshold (~10px) and angle (≤40°) before claiming a pan (Ionic).
- Keyboard: pick one resize mode deliberately; match keyboard backdrop to the body colour (linen/dark).

### Fit for Clubhouse

- **Adopt**: Ionic's safe-area var fallback pattern verbatim in `--ch-*` tokens; root CSS resets from
  Ionic structure; vaul hit-area pattern for small icon buttons.
- **Adopt**: Capacitor Keyboard `autoBackdropColor: 'dom'` or `'auto'` with body background = linen /
  dark page token so the keyboard seam disappears (requires plugin ≥ 8.0.4).
- **Borrow from Konsta/Framework7/Ionic**: iOS list-row highlight, large-title collapse, segmented control
  look — **as techniques only**.
- **Avoid**: adopting Ionic/Konsta/Framework7 component frameworks (they bring their own design language
  and shells, conflicting with Clubhouse's owned shell); Material ripples on iOS.

---

## 16. Design-system governance tooling

| Reference | Evidence | URL | License | Key techniques |
| --- | --- | --- | --- | --- |
| stylelint-declaration-strict-value | SOURCE (README) | <https://raw.githubusercontent.com/AndyOGo/stylelint-declaration-strict-value/master/README.md> | MIT (repo LICENSE) | `scale-unlimited/declaration-strict-value` forces `var()`/functions for chosen properties (`color`, `/color$/`, `z-index`, `font-size`…); `ignoreValues` (`currentColor`, `transparent`, `inherit`), `ignoreFunctions`, `expandShorthand`, autofix hook |
| Stylelint built-ins (`value-type-custom-property-required-list`, `declaration-property-custom-property-allowed-list`, `no-unknown-custom-properties`, `referenceFiles`) | DOCS | <https://stylelint.io/user-guide/customize/> | MIT | Native rules (recent Stylelint) to require custom properties for `<color>`/`<length>` values, restrict which token family a property may use (`/radius$/` → `--radii-*`), and fail on unknown custom properties using a tokens file |
| stylelint-value-no-unknown-custom-properties | DOCS (README) | <https://github.com/csstools/stylelint-value-no-unknown-custom-properties> | CC0-1.0 | Catches `var(--ch-typo)` misspellings via `importFrom` token files |
| Mozilla `use-design-tokens` | DOCS | <https://firefox-source-docs.mozilla.org/code-quality/lint/linters/stylelint-plugin-mozilla/rules/use-design-tokens.html> | MPL (Firefox) | Property-type → allowed token categories; autofix raw value → token by value map (e.g. `12px` → `--size-item-xsmall`) — model for a custom rule |
| Atlassian `ensure-design-token-usage` | DOCS | <https://atlassian.design/components/eslint-plugin-design-system/ensure-design-token-usage> | Apache-2.0 (package) | ESLint for CSS-in-JS/inline styles: domains (color, spacing, shape), autofix to tokens |
| Lost Pixel | SOURCE (README) | <https://raw.githubusercontent.com/lost-pixel/lost-pixel/main/README.md> | MIT | OSS visual regression for Storybook/Ladle/Histoire **and app pages**; thresholds; OSS mode runs in CI without the paid platform (parallelism limited) |
| Playwright `toHaveScreenshot` | DOCS | <https://playwright.dev/docs/test-snapshots> | Apache-2.0 | pixelmatch `threshold` (default 0.2) and `maxDiffPixels`; `stylePath` to hide volatile regions; move mouse to (−1,−1) to avoid hover; WebP snapshots; per-project defaults (run WebKit for iOS parity) |
| @axe-core/playwright | DOCS | <https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright> | MPL-2.0 (axe-core) | `new AxeBuilder({page}).include('.ch-…').withTags(['wcag2a','wcag2aa']).analyze()` |
| Lighthouse CI | DOCS | <https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/getting-started.md> | Apache-2.0 | `lhci autorun`, `assert.preset: 'lighthouse:recommended'` with per-audit opt-outs as a burn-down list; temporary public storage is public — use filesystem/LHCI server for private apps |

### Principles to extract

- Lint is the cheapest enforcement: require `var(--ch-*)` for colour, radius, shadow, font-size, spacing
  in Clubhouse CSS; fail on unknown custom properties against the token file.
- Visual regression on a **lightweight catalogue page** (one route rendering every Clubhouse primitive in
  light and dark) is enough without Storybook; Playwright screenshots in WebKit at phone + desktop widths.
- Accessibility checks scoped to Clubhouse regions with axe in the same Playwright run.
- Performance budgets (Lighthouse CI) asserted, not just reported.

### Fit for Clubhouse

- **Adopt**: Stylelint native rules + `referenceFiles` pointed at the Clubhouse tokens CSS, scoped by
  `overrides` to `src/clubhouse/**/*.css`; fall back to `stylelint-declaration-strict-value` if the
  installed Stylelint lacks the newer rules.
- **Adopt**: Playwright `toHaveScreenshot` over a catalogue route (free; no Chromatic); add Lost Pixel only
  if a review UI is wanted.
- **Adapt**: Mozilla-style value→token autofix map as a small custom Stylelint rule later.
- **Avoid**: Storybook for now (heavy for a scoped-CSS system already served by a catalogue route);
  Lighthouse CI public storage (would publish private app reports).

---

## Professional product references (publicly observable / documented only)

No claims about private code. "Documented" = the company published it; "Observable" = visible to any user
of the public product or marketing site.

| Product | Basis | Transferable trait for a golf analytics app |
| --- | --- | --- |
| Linear | Documented (UI redesign post) | Theme generated from 3 inputs in LCH, contrast as a parameter, reduced chroma for calm neutrals → generate Clubhouse light/dark/high-contrast from linen + green + contrast. |
| Raycast | Observable | Command palette with grouped results, keyboard hints on the right, actions on the focused row → coach quick switcher. |
| Attio | Observable | Dense record tables with sticky first column and inline chips; record detail in a side panel → player/round detail as side sheet on desktop. |
| Stripe | Documented (colour blog) | Perceptual colour scales with step-distance contrast rules; observable: calm dashboards with one KPI + chart per card → KPI card anatomy. |
| Ramp | Observable | Spend tables with right-aligned tabular amounts, muted secondary text, status chips → stats tables. |
| Mercury | Observable | Warm-neutral, low-chroma surfaces with restrained accent and generous whitespace; large single balance number → proof that warm neutrals read premium; one hero metric per screen. |
| Vercel | Documented (Geist) | Material presets (radius+shadow per elevation), label vs copy type roles, 10-step colour roles → `--ch` material and type roles. |
| Arc (browser) | Observable | Soft, colourful-but-calm chrome, motion with springs on panels → spring presets for sheets/panels only. |
| Superhuman | Observable | Keyboard-first speed, instant transitions on frequent actions → no animation on high-frequency toggles. |
| Notion | Observable | Neutral warm page, content-first, minimal borders, empty states with a single clear action → empty states. |
| TradingView | Observable | Crosshair with axis readouts, drag to scrub, range selection, legend values update with crosshair → scrub-to-read on round-by-round trend charts. |
| Datadog | Observable | Synced crosshairs across stacked time-series charts → hover one chart, see the same date on all (round date across SG categories). |
| Grafana | Observable / docs | Shared crosshair/tooltip modes, panel headers with time-range picker → period picker at section level. |
| PostHog | Observable | Insight cards with metric + comparison period + trend line → "vs last season" comparison chips. |
| Amplitude | Observable | Chart + table toggle for the same query; breakdowns via legend → "View as table" accessibility path. |
| Observable | Documented (Plot source) | Pointer interaction with sticky tips and x-dominant targeting (source in §10). |

---

## Licensing summary

| Library / source | Licence (as read) | Copy code? | Notes |
| --- | --- | --- | --- |
| shadcn/ui | MIT | Yes, with notice | Registry code designed to be copied |
| Radix Primitives | MIT | Yes | Already a dependency |
| Radix Themes | MIT | Yes | CSS techniques copied as values |
| Radix Colors | MIT | Yes | Reference scales |
| Base UI | MIT | Yes | |
| vaul | MIT | Yes | Already a dependency |
| sonner | MIT | Yes | |
| cmdk | MIT | Yes | |
| Tremor Raw (tremorlabs/tremor) | Apache-2.0 | Yes, keep NOTICE/attribution, state changes | |
| Motion Primitives | MIT (per README; no LICENSE file found at repo root) | Yes, with notice | Verify LICENSE.md before copying verbatim |
| Magic UI | MIT | Yes | Pro tier is separate commercial |
| Origin UI (coss.com) | MIT | Yes | No component source read in this pass |
| Kibo UI | MIT-style ("shadcnblocks" copyright) | Yes | |
| Untitled UI React (open repo) | MIT | Yes | Untitled UI PRO / Figma kits are commercial and separate |
| TanStack Table / Virtual | MIT | Yes | |
| visx | MIT | Yes | |
| Nivo | MIT | Yes | |
| LayerChart | MIT | n/a (Svelte) | |
| Observable Plot | ISC | Yes | |
| Apache ECharts | Apache-2.0 | Yes, with NOTICE | |
| React Aria / React Spectrum | Apache-2.0 | Yes, with NOTICE | |
| Ionic Framework | MIT | Yes | |
| Konsta UI | MIT | Yes | |
| Mantine | MIT | Yes | Not used as a source here |
| Park UI | MIT | Yes | Not used as a source here |
| Lost Pixel | MIT (OSS core) | Tool | Platform is paid SaaS |
| stylelint-declaration-strict-value | MIT | Tool | |
| stylelint-value-no-unknown-custom-properties | CC0-1.0 | Tool | |
| **Animate UI** | **MIT + Commons Clause** | **Use in product: allowed. Redistribute/sell components in original form: forbidden** | Re-implement ideas with `motion`; do not vendor files into a shared/open design system |
| **Aceternity UI** | **Aceternity License (not open source; no public repo)** | **End-product use allowed; no redistribution of source, no templates for sale; licence text explicitly covers Pro items, free-tier terms less clear** | Avoid copying into Clubhouse; nothing needed from it for a data app |
| React Bits (not researched in depth) | MIT + Commons Clause (per third-party comparison) | Same caveat as Animate UI | Not needed |
| Apple HIG, Vercel Geist docs, Emil Kowalski articles, Linear/Stripe blogs | Proprietary documentation | Techniques only | No code copied |

---

## Source index (SOURCE-level files actually read)

1. vaul `src/index.tsx` · 2. vaul `src/constants.ts` · 3. vaul `src/helpers.ts` · 4. vaul `src/use-snap-points.ts` ·
5. vaul `src/style.css` · 6. sonner `src/index.tsx` · 7. sonner `src/styles.css` · 8. cmdk `cmdk/src/index.tsx` ·
9. cmdk `cmdk/src/command-score.ts` · 10. shadcn `ui/card.tsx` · 11. shadcn `ui/item.tsx` · 12. shadcn `ui/chart.tsx` ·
13. shadcn `ui/table.tsx` · 14. shadcn `ui/empty.tsx` · 15. shadcn `ui/skeleton.tsx` · 16. shadcn `ui/dropdown-menu.tsx` ·
17. shadcn `ui/popover.tsx` · 18. shadcn `ui/tooltip.tsx` · 19. shadcn `ui/drawer.tsx` · 20. shadcn `ui/sonner.tsx` ·
21. shadcn `ui/command.tsx` · 22. shadcn `ui/button.tsx` · 23. shadcn `blocks/dashboard-01/section-cards.tsx` ·
24. shadcn `blocks/dashboard-01/chart-area-interactive.tsx` · 25. shadcn `blocks/dashboard-01/data-table.tsx` ·
26. shadcn `blocks/dashboard-01/site-header.tsx` · 27. Tremor `Card.tsx` · 28. Tremor `SparkChart.tsx` ·
29. Tremor `LineChart.tsx` · 30. Tremor `BarList.tsx` · 31. Tremor `TabNavigation.tsx` · 32. Tremor `Table.tsx` ·
33. Radix Themes `base-card.css` · 34. Radix Themes `card.css` · 35. Radix Themes `shadow.css` ·
36. Radix Themes `typography.css` · 37. Radix Themes `segmented-control.css` · 38. Radix Themes `skeleton.css` ·
39. Radix Themes `data-list.css` · 40. Radix Themes `color.css` · 41. Radix Themes `text.css` ·
42. Radix primitives `popper.tsx` · 43. Radix primitives `tooltip.tsx` · 44. Radix primitives `dismissable-layer.tsx` ·
45. Radix Colors `src/light.ts` · 46. Base UI `TabsIndicator.tsx` · 47. Base UI `TooltipProvider.tsx` ·
48. Motion Primitives `animated-background.tsx` · 49. Motion Primitives `sliding-number.tsx` ·
50. Motion Primitives `animated-number.tsx` · 51. Motion Primitives `transition-panel.tsx` ·
52. Animate UI `primitives/radix/tabs` (registry) · 53. Animate UI `primitives/effects/highlight` (registry) ·
54. Magic UI `number-ticker.tsx` (registry) · 55. Untitled UI `styles/theme.css` · 56. Untitled UI `charts-base.tsx` ·
57. Untitled UI `empty-state.tsx` · 58. Kibo `packages/table/index.tsx` · 59. visx `findNearestDatumSingleDimension.ts` ·
60. visx xychart `Tooltip.tsx` · 61. visx `useEventEmitters.ts` · 62. TanStack `column-pinning-sticky/main.tsx` ·
63. TanStack `virtualized-rows/main.tsx` · 64. Observable Plot `interactions/pointer.js` · 65. Observable Plot `marks/tip.js` ·
66. ECharts `visual/aria.ts` · 67. Nivo `tooltip/Crosshair.tsx` · 68. React Aria `interactions/usePress.ts` ·
69. React Spectrum S2 `style/spectrum-theme.ts` · 70. Ionic `core/src/css/core.scss` · 71. Ionic `core/src/css/structure.scss` ·
72. Ionic `core/src/utils/gesture/index.ts` · 73. Konsta `touch-ripple-class.js` · 74. Konsta `Segmented.jsx` ·
75. Konsta `Sheet.jsx` · 76. stylelint-declaration-strict-value `README.md` · 77. Lost Pixel `README.md`.

Raw URL pattern: `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>` with the paths given in
each section table; registry sources at `https://animate-ui.com/r/<name>.json` and
`https://magicui.design/r/number-ticker.json`. Nivo, Plot, ECharts, React Aria, Ionic paths:
`plouc/nivo/master/packages/tooltip/src/Crosshair.tsx`, `observablehq/plot/main/src/interactions/pointer.js`,
`observablehq/plot/main/src/marks/tip.js`, `apache/echarts/master/src/visual/aria.ts`,
`adobe/react-spectrum/main/packages/react-aria/src/interactions/usePress.ts`,
`ionic-team/ionic-framework/main/core/src/css/{core,structure}.scss`,
`ionic-team/ionic-framework/main/core/src/utils/gesture/index.ts`.
Not read (no source claimed): Origin UI components, Mantine, Park UI/Ark, LayerChart source, Ariakit
(mirror paths 404'd), Aceternity (no public repo).
