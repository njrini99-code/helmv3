# The Living Annual — FOUNDATION kit

The reusable component + motion + token kit for BaseballHelm's **"Living Annual"**
redesign. North-star spec: [`docs/baseball/design-system-living-annual.md`](../../../../docs/baseball/design-system-living-annual.md)
(§4 language, §7 kit, §8 motion contract).

Every redesigned baseball surface composes from these atoms — build nothing
bespoke that one of these already does. Components render inside the
`.fairway-ds` redesign scope and consume the Fairway `--fw-*` tokens plus the
baseball-native tokens in `src/styles/baseball-living-annual.css`.

```tsx
import { RuledStatLine, GradeStamp, EditorsLetter } from '@/components/baseball/living-annual';
```

---

## The two-ink rule (memorize this)

The active lane's ink **is** the wayfinding — never mix inks within a lane's chrome.

| Ink | Token | Means | Where |
|---|---|---|---|
| **green** | `--grade-plus` / Fairway accent | team + **development** | Pressbox, Passport |
| **clay** | `--pursuit-ink` (`text-pursuit`) | recruiting + **pursuit** | War Room |
| **oxblood** | `--pursuit-deep` | seals & stamps **only** | `CommitSeal` |
| **sodium** | `--sodium` | one PR / live flash, then rest | `StatReadout pr` |

Pass `ink="team"` (green) or `ink="pursuit"` (clay) to lane-aware components
(`RuledStatLine`, `Masthead`, `SectionMasthead`, `Eyebrow`, `HairlineRule`,
`PositionChip`, `InkBadge`, `ToolRail`, `EditorsLetter`). Clay-only:
`AgingBar`. Trace inks: `team` / `sodium` / `chalk` / `pursuit`.

## Contrast + green law (founder addendum)

Fairway's weak spot was **low-contrast stats** (warm-gray numerals on cream) and
**not enough green**. These OVERRIDE any softer default:

1. **The number carries the contrast.** `StatReadout` / `RuledStatLine` values
   render in near-black `--graphite` (`text-text-primary`, ≥7:1) by default —
   never warm-gray-on-cream — or in lane ink for an `emphasis` / `leader` value.
   Labels stay quiet (`text-text-tertiary` small-caps).
2. **Green does real work.** In team lanes the `RuledStatLine` baseline rule is
   **green** (`--team-ink`, ~1.5px), not a gray hairline — green presence + crisp
   row separation. Clay rule in the War Room only.
3. **Leaders/bests get green.** `RuledStatLine leader` → green numeral + a green
   `LEADS` tick. (Sodium is reserved for a true PR flash via `StatReadout pr`.)
4. **Active/selected/focus = green.** The kit inherits the app's green
   focus-visible ring (globals.css); `Masthead accentRule` hangs a bold green
   (team) / clay (pursuit) section accent.
5. Clay stays **strictly recruiting**; green is used boldly for contrast (green
   rules + high-contrast numerals + whitespace), never a faint gray tint.

## The empty-state doctrine (product-wide)

**No yellow warning boxes. Anywhere.** Every zero / empty / soft-error renders
through either:

- **`<EditorsLetter>`** — a signed editor's-letter voice on Paper stock, or
- **a ghosted `<RuledStatLine ghost>`** — the measurable at 40%, waiting to fill.

Day-one always looks like *an unreleased first issue*, never a broken CRM.

## The clay-canvas quarantine rule

`--clay` (and `<ClayCanvas>`) is the **one** dark surface. It appears **only**
inside a `<ClayCanvas>` viz frame — **never** a page, sidebar, or card
background. A PR reviewer should reject `--clay` used as generic chrome.

## Motion contract (§8)

One signature move per view: **rules draw → ink settles → (if present) a trace
draws.** Numbers are sacred — always `<StatReadout>`, `tabular-nums`, odometer
on change, never a spring. `prefers-reduced-motion` is first-class: rules render
drawn, numbers set, stamps/pulses show without motion. Shared variants live in
`motion.ts` (`rulesDraw`, `inkSettles`, `inkColumn`, `stampPress`, `inkBleed`,
`traceDraw`, `useSettleStagger`).

---

## Components

### `<RuledStatLine>` — THE signature atom
Small-caps hung-left label + serif ink numeral sitting ON a hairline baseline
rule that draws on mount. Value rolls via `<StatReadout>`.

```tsx
<RuledStatLine label="EXIT VELO" value={94} unit="MPH" size="hero" verified ink="team" />
<RuledStatLine label="AVG" value={0.341} decimals={3} leader />   {/* team best → green + LEADS */}
<RuledStatLine label="POP TIME" value={1.94} decimals={2} size="row" />
<RuledStatLine label="60-YARD" value="" ghost />           {/* unfilled measurable */}
```
Props: `label, value, unit?, size?='row'|'hero', verified?, ink?='team'|'pursuit', emphasis?, leader?, ghost?, decimals?, className?`
Baseline rule is green in team lanes / clay in pursuit; `emphasis`/`leader` render the numeral in lane ink.

### `<StatReadout>` — any number that can change
`font-fw-mono tabular-nums`, wraps the Number Flow odometer. `flashOnChange`
pulses a green rule on change; `pr` fires a single sodium flash. Reduced motion
sets instantly.

```tsx
<StatReadout value={liveVelo} decimals={1} suffix=" mph" flashOnChange />
<StatReadout value={teamLeadAvg} decimals={3} emphasis />   {/* green leader numeral */}
<StatReadout value={seasonBest} pr />
```
Props: `value: number|string, decimals?, prefix?, suffix?, emphasis?, flashOnChange?, pr?, ariaLabel?, className?`
Default numeral is near-black graphite (≥7:1); `emphasis` renders it team-ink green.

### `<Eyebrow>` — small-caps dateline
`POSITION · CLASS · STATE` grammar, `tracking-[0.14em]`, middot-joined.

```tsx
<Eyebrow items={['SS · 2B', "CLASS OF '26", 'RALEIGH, NC']} />
```
Props: `items?, children?, ink?='muted'|'team'|'pursuit', as?, className?`

### `<Masthead>` — two-line editorial name block
`given` (serif regular) over `SURNAME` (serif small-caps), settles on mount.
Optional dateline eyebrow, registration tick, and `scrollShrink` shrink-to-byline.

```tsx
<Masthead given="Marcus" surname="Rodriguez"
  dateline={<Eyebrow items={['SS · 2B', "CLASS OF '26"]} />}
  registrationTick accentRule scrollShrink />
```
Props: `given, surname, dateline?, ink?, registrationTick?, accentRule?, scrollShrink?, className?`

### `<SectionMasthead>` — THE page header
Replaces the generic `ViewHeader` on baseball routes: `Eyebrow` + Space Grotesk
title (`font-annual`) + a right-aligned `actions` slot + a bold lane-ink accent
rule under the title (**green** in team lanes, clay in the War Room — the
per-page green). Server-safe (the accent's draw-on lives in `<HairlineRule>`).

```tsx
<SectionMasthead eyebrow="THE PRESSBOX · WEEK 6" title="Command Center"
  actions={<CommandK />}>
  <LaneTabs />
</SectionMasthead>
```
Props: `eyebrow?, title, ink?='team'|'pursuit', actions?, children?, className?`

### `<HairlineRule>` — the signature draw-on rule
The `scaleX 0→1` baseline rule as a standalone atom (extracted from `RuledStatLine`)
so any surface can hang a rule anywhere. Green (`team`) / clay (`pursuit`) /
neutral (`hairline`, default). Spans its container unless a width is passed via
`className` (twMerge lets `w-16` win). Reduced motion or `animate={false}` →
already-drawn.

```tsx
<HairlineRule ink="team" />                                {/* green separator */}
<HairlineRule weight={3} className="w-16 rounded-full" />  {/* accent tick */}
```
Props: `ink?='hairline'|'team'|'pursuit', weight?=1.5, animate?=true, className?`

### `<PositionChip>` — small-caps position/role chip
Outline hairline pill for `SS` · `2B` · `RHP`; ink variants tint border + text
green (`team`) / clay (`pursuit`). No fill — structure from a hairline, not a box.

```tsx
<PositionChip label="RHP" />
<PositionChip label="SS" ink="team" size="sm" />
```
Props: `label, ink?='neutral'|'team'|'pursuit', size?='md'|'sm', className?`

### `<InkBadge>` — a status STAMP (the anti-toast)
Small-caps mono status in lane ink on a FAINT tinted ground — **never** a loud
pill, never red/yellow (that violates the empty-state doctrine). `sodium` only
for a genuinely live / PR moment.

```tsx
<InkBadge label="ON THE RECORD" tone="team" />
<InkBadge label="PROJECTED" tone="pursuit" variant="solid" />
<InkBadge label="LIVE" tone="sodium" />
```
Props: `label, tone?='neutral'|'team'|'pursuit'|'sodium', variant?='soft'|'solid', className?`

### `<AgingBar>` — clay "days-since-contact" bar
A thin clay bar that fills to `min(days/max,1)` and **darkens** from `--pursuit-ink`
toward oxblood `--pursuit-deep` as it nears the deadline — urgency as color, not a
red badge. War Room lane only. Carries a `role="meter"` accessible label
(`"7 days since contact"`).

```tsx
<AgingBar days={7} />
<AgingBar days={19} max={21} />
```
Props: `days, max?=21, className?`

### `<LiveDot>` — the breathing LIVE dot
A 2s-pulse dot marking genuinely-live state (live game, incoming sync). Green
(`team`) default; `sodium` for a PR / live moment. Reduced motion → static.
Optional small-caps label beside it.

```tsx
<LiveDot label="LIVE" />
<LiveDot ink="sodium" label="PR" />
```
Props: `ink?='team'|'sodium', label?, className?`

### `<GradeStamp>` — 20-80 evaluation atom
Debossed rounded-square, mono numeral + tool ring label, ramp-colored by value
(`grades.ts`), ±1.5° tilt, stamp-press reveal + ink-bleed. `present` solid vs.
future ghost outline.

```tsx
<GradeStamp value={60} tool="POWER" present />
<GradeStamp value={70} tool="RUN" present={false} size="sm" />   {/* projected */}
```
Props: `value, tool, present?=true, rotate?, size?='md'|'sm', className?`

### `<ToolRail>` — 20-80 horizontal scale
Ticks 20–80 (50 = `MLB AVG`) on a rule that draws; filled present pip + hollow
future pip + ink connector. `compare` stacks a second athlete.

```tsx
<ToolRail label="POWER" value={55} future={65} ink="team"
  compare={{ value: 50, future: 55, ink: 'pursuit' }} />
```
Props: `value, future?, ink?, label?, compare?: {value, future?, ink?}, className?`

### `<PaperCard>` — Paper surface
Flat `--paper`, hairline border, newsprint grain, letterpress inset shadow (not
a drop shadow), optional die-cut registration tick.

```tsx
<PaperCard registrationTick className="p-8"> … </PaperCard>
```
Props: `children, registrationTick?, grain?=true, as?, className?`

### `<ClayCanvas>` — the ONE dark viz frame
`--clay` bg + `--chalk` graticule + scan-line vignette. **Frame only** — children
are the viz (drawn with `<Trace>`). See the quarantine rule above.

```tsx
<ClayCanvas label="THE BREAK ROOM" aspect="aspect-[4/3]">
  <svg viewBox="0 0 100 60" className="h-full w-full">
    <Trace d="M8 52 C 30 48, 60 20, 92 10" ink="chalk" glow />
  </svg>
</ClayCanvas>
```
Props: `children?, label?, grid?=true, aspect?, className?`

### `<Trace>` — the viz stroke primitive
The one stroke language for baseball motion data (pitch break, spray, season
climb). Renders a single SVG `<path>` that DRAWS via `stroke-dashoffset`
(`traceDraw`); `weight` + `glow` encode quality. **SVG-child** — the caller
provides the enclosing `<svg viewBox>`; usable inside `<ClayCanvas>` (chalk/team/
sodium on dark) AND on paper. Reduced motion / `animate={false}` → fully drawn.

```tsx
<svg viewBox="0 0 200 120">
  <Trace d="M10 110 Q 100 10 190 30" ink="team" weight={2.5} glow />
</svg>
```
Props: `d, weight?=2, ink?='team'|'sodium'|'chalk'|'pursuit', glow?=false, animate?=true, className?`

### `<EditorsLetter>` — composed empty / error state
Serif letter voice on Paper + an ink rule that draws + optional `STANDING BY`
live breathing dot. **Replaces yellow warning boxes.**

```tsx
<EditorsLetter
  title="Standing by — awaiting first pitch"
  body="Post your first game and the cover fills itself in."
  signoff="— From the desk of CoachHelm"
  live ink="team" />
```
Props: `title, body?, ink?='team'|'pursuit', live?, liveLabel?, signoff?, action?, className?`

### `<CommitSeal>` / `<PacketSeal>` — ceremony
Oxblood embossed seal, stamp-press ease, ink-bleed. `label` is the ceremony word.
`PacketSeal` is the wax-style Helm monogram seal for minted tear-sheets.

```tsx
<CommitSeal label="COMMITTED" size="lg" />
<CommitSeal label="OFFER" variant="commit" />
<PacketSeal label="ISSUED" size="md" />
```
Props: `label?, variant?='commit'|'packet', size?='md'|'sm'|'lg', rotate?, className?`

---

## Helpers

- **`grades.ts`** — `gradeColor(v) → 'low'|'avg'|'plus'`, `gradeLabel(v)` (scouting
  band), `isPlus(v)` (≥60), plus `GRADE_TEXT_CLASS` / `GRADE_BG_CLASS` / `GRADE_VAR`
  static maps. Pure, tested in `grades.test.ts`.
- **`motion.ts`** — the shared framer-motion variants + `useSettleStagger`. Every
  factory takes a `reduced` flag and returns the final state instantly when true.
